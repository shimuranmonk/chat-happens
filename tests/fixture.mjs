import { JSDOM } from 'jsdom';
export const ids = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);

export function fixture({ outcome = 'success', mismatch = false, nativeMismatch = false } = {}) {
  const dom = new JSDOM('<body><aside id="browser-sidebar-popover"></aside></body>', { url: 'https://chatgpt.com/', pretendToBeVisual: true });
  const doc = dom.window.document;
  dom.window.PointerEvent ||= dom.window.MouseEvent;
  const root = doc.querySelector('aside');
  const calls = [];
  const add = (id, title = 'Same title') => {
    const owner = doc.createElement('div');
    owner.dataset.sidebarChatgptConversationKey = `chatgpt:conversation:${id}`;
    const row = doc.createElement('div');
    row.dataset.sidebarCycleItem = '';
    row.setAttribute('role', 'group');
    const link = doc.createElement('a');
    link.dataset.interactiveRowLink = 'true';
    link.href = `/c/${id}`;
    link.setAttribute('aria-label', title);
    link.textContent = title;
    const button = doc.createElement('button');
    button.id = `action-${id}`;
    button.setAttribute('aria-label', 'Chat actions');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = '…';
    row.append(link, button); owner.append(row); root.append(owner);
    const complete = action => {
      calls.push({ id, action });
      [...doc.querySelectorAll('[role="dialog"]')].find(el => el !== root)?.remove();
      if (outcome === 'throw') throw new Error('Disconnected');
      if (outcome !== 'failure') owner.remove();
      if (outcome !== 'silent') {
        const toast = doc.createElement('div');
        toast.setAttribute('role', 'status');
        toast.textContent = outcome === 'failure' ? 'Error: please try again' : `Chat ${action === 'archive' ? 'archived' : 'deleted'}`;
        doc.body.append(toast);
      }
    };
    button.onclick = () => {
      const existing = doc.getElementById(`menu-${id}`);
      if (existing) { existing.remove(); button.setAttribute('aria-expanded', 'false'); return; }
      const menu = doc.createElement('div');
      menu.id = `menu-${id}`;
      menu.setAttribute('role', 'menu');
      menu.setAttribute('data-state', 'open');
      menu.setAttribute('aria-labelledby', mismatch ? 'wrong-button' : button.id);
      button.setAttribute('aria-controls', menu.id);
      button.setAttribute('aria-expanded', 'true');
      for (const action of ['archive', 'delete']) {
        const choice = doc.createElement('div');
        choice.setAttribute('role', 'menuitem');
        choice.textContent = action === 'archive' ? 'Archive' : 'Delete';
        choice.onclick = () => {
          menu.remove(); button.setAttribute('aria-expanded', 'false');
          if (action === 'archive') return complete(action);
          const dialog = doc.createElement('div');
          dialog.setAttribute('role', 'dialog');
          const heading = doc.createElement('h2'); heading.textContent = 'Delete chat?';
          const quote = doc.createElement('strong'); quote.textContent = nativeMismatch ? 'Another conversation' : title;
          const confirm = doc.createElement('button'); confirm.textContent = 'Delete'; confirm.onclick = () => complete(action);
          dialog.append(heading, quote, confirm); doc.body.append(dialog);
        };
        menu.append(choice);
      }
      doc.body.append(menu);
    };
    return { owner, row, link, button };
  };
  const items = ids.map(id => add(id));
  return { dom, doc, root, calls, items, add, visible: el => !!el?.isConnected && !el.hidden };
}
