import { CleanupError } from './core.js';
// UI contract inspected on ChatGPT's English web interface, 2026-11-08.
// No internal endpoints, auth tokens, or network interception are used.
export class ChatGPTAdapter {
  constructor(doc, { timeout = 7000, interval = 100, settle = 750, isVisible } = {}) {
    this.doc = doc;
    this.timeout = timeout;
    this.interval = interval;
    this.settle = settle;
    this.isVisible = isVisible || (el => {
      if (!el?.isConnected || el.closest('[hidden], [aria-hidden="true"]') || !el.getClientRects().length) return false;
      const box = el.getBoundingClientRect();
      const view = this.doc.defaultView;
      if (box.bottom <= 0 || box.right <= 0 || box.top >= view.innerHeight || box.left >= view.innerWidth) return false;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const style = view.getComputedStyle(parent);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY + style.overflowX)) {
          const clip = parent.getBoundingClientRect();
          if (box.bottom <= clip.top || box.top >= clip.bottom || box.right <= clip.left || box.left >= clip.right) return false;
        }
      }
      return true;
    });
  }

  history() {
    return this.doc.querySelector('#browser-sidebar-popover, #history, nav[aria-label="Chat history"]');
  }

  discover({ visibleOnly = true } = {}) {
    const root = this.history();
    if (!root) return [];
    const found = new Map();
    for (const link of root.querySelectorAll('a[data-interactive-row-link][href]')) {
      let url;
      try { url = new URL(link.getAttribute('href'), this.doc.location.href); } catch { continue; }
      const match = /^\/c\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i.exec(url.pathname);
      if (url.origin !== this.doc.location.origin || !match || url.search || url.hash) continue;
      const row = link.closest('[data-sidebar-cycle-item][role="group"]');
      const owner = row?.closest('[data-sidebar-chatgpt-conversation-key]');
      const id = match[1].toLowerCase();
      if (!row || owner?.getAttribute('data-sidebar-chatgpt-conversation-key') !== `chatgpt:conversation:${id}`) continue;
      if (row.querySelectorAll('a[data-interactive-row-link]').length !== 1) continue;
      if (visibleOnly && !this.isVisible(row)) continue;
      const buttons = row.querySelectorAll('button[aria-label="Chat actions"][aria-haspopup="menu"]');
      if (buttons.length !== 1) continue;
      const title = (link.getAttribute('aria-label') || link.textContent).trim();
      const item = { id, title, row, link, button: buttons[0] };
      // Ambiguous duplicate renderings are ineligible, never arbitrarily pick one.
      found.set(id, found.has(id) ? null : item);
    }
    return [...found.values()].filter(Boolean);
  }

  async waitFor(check) {
    const deadline = Date.now() + this.timeout;
    do {
      const value = check();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, this.interval));
    } while (Date.now() < deadline);
    return null;
  }

  activate(button) {
    const view = this.doc.defaultView;
    button.dispatchEvent(new view.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    button.dispatchEvent(new view.PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }));
    button.click();
  }

  activeOverlays() {
    const view = this.doc.defaultView;
    return [...this.doc.querySelectorAll('[role="menu"], [role="dialog"], [role="alertdialog"], dialog[open]')].filter(el => {
      if (el.closest('[data-ch-owned], [hidden], [aria-hidden="true"], [inert]')) return false;
      if (el.getAttribute('data-state') === 'closed') return false;
      if (el.tagName === 'DIALOG' && !el.open) return false;
      const style = view.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
      // ChatGPT's narrow-screen sidebar can itself be a dialog. Its chat rows
      // are the operating surface, not a separate confirmation to dismiss.
      if (el === this.history()) return false;
      return this.isVisible(el);
    });
  }

  async perform(item, action, stopped) {
    if (!['archive', 'delete'].includes(action)) throw new CleanupError('Unsupported action.');
    const target = this.discover().find(x => x.id === item.id);
    if (!target) throw new CleanupError('Conversation is no longer displayed or its identity is ambiguous.', { status: 'skipped', halt: false });
    if (target.title !== item.title) throw new CleanupError('Conversation title changed. Review the selection again.');
    const initialHistory = this.history();
    const initialUrl = this.doc.location.href;
    const initialPath = this.doc.location.pathname;
    const neighbors = this.discover({ visibleOnly: false }).filter(x => x.id !== item.id).map(x => x.id);
    const blocking = this.activeOverlays()[0];
    if (blocking) {
      const kind = blocking.getAttribute('role') === 'menu' ? 'menu' : 'dialog';
      const labelledBy = blocking.getAttribute('aria-labelledby')?.split(/\s+/).map(id => this.doc.getElementById(id)?.textContent || '').join(' ').trim();
      const label = (blocking.getAttribute('aria-label') || labelledBy || blocking.querySelector('h1, h2, [role="heading"]')?.textContent || '').trim().slice(0, 80);
      throw new CleanupError(`An open ChatGPT ${kind}${label ? ` (${label})` : ''} is blocking cleanup. Close it and try again. No cleanup action was submitted.`);
    }
    if (!target.button.id || target.button.disabled || target.button.getAttribute('aria-disabled') === 'true') {
      throw new CleanupError('Conversation action control is unavailable.');
    }
    if (stopped()) throw new CleanupError('Stopped before action.', { status: 'stopped before processing' });
    this.activate(target.button);
    let dispatched = false;
    let menu;
    let confirmationDialog;
    try {
      menu = await this.waitFor(() => {
        const control = this.doc.getElementById(target.button.getAttribute('aria-controls'));
        return control?.getAttribute('role') === 'menu' && control.getAttribute('aria-labelledby') === target.button.id && this.isVisible(control) ? control : null;
      });
      if (!menu) throw new CleanupError('Could not verify which chat owns the action menu.');
      const revalidate = () => {
        const fresh = this.discover().find(x => x.id === item.id);
        if (!fresh || fresh.button !== target.button || fresh.title !== item.title || stopped()) {
          throw new CleanupError('Selection or page changed before action; stopped safely.');
        }
      };
      revalidate();
      const label = action === 'archive' ? 'Archive' : 'Delete';
      const choices = [...menu.querySelectorAll('[role="menuitem"]')].filter(x => x.textContent.trim() === label && this.isVisible(x) && x.getAttribute('aria-disabled') !== 'true');
      if (choices.length !== 1) throw new CleanupError(`The ${label} menu action is missing or ambiguous. English interface required.`);
      const signals = [];
      const seen = new WeakMap([...this.doc.querySelectorAll('[role="status"], [role="alert"]')].map(el => [el, el.textContent.trim()]));
      const record = el => {
        if (!el || el.closest('[data-ch-owned]')) return;
        const text = el.textContent.trim();
        if (seen.get(el) !== text) signals.push(text);
        seen.set(el, text);
      };
      const capture = nodes => {
        for (const node of nodes) {
          if (node.nodeType !== 1) continue;
          const candidates = [node, ...node.querySelectorAll('[role="status"], [role="alert"]')];
          for (const el of candidates) if (el.matches('[role="status"], [role="alert"]')) record(el);
        }
      };
      const observer = new this.doc.defaultView.MutationObserver(records => {
        for (const r of records) {
          capture(r.addedNodes);
          const target = r.target.nodeType === 3 ? r.target.parentElement : r.target;
          record(target.closest('[role="status"], [role="alert"]'));
        }
      });
      observer.observe(this.doc.body, { childList: true, subtree: true, characterData: true });
      try {
        revalidate();
        // Archive executes immediately in the native UI. Delete opens a native confirmation.
        dispatched = action === 'archive';
        choices[0].click();
        if (action === 'delete') {
          const dialog = await this.waitFor(() => {
            const dialogs = this.activeOverlays().filter(x => x.getAttribute('role') !== 'menu');
            return dialogs.length === 1 ? dialogs[0] : null;
          });
          // Support the live-tested plain-text confirmation as well as the
          // earlier title-emphasis layout. Never match a title by substring.
          const heading = dialog?.querySelector('h1, h2, [role="heading"]')?.textContent.trim();
          const quote = dialog?.querySelector('strong, b')?.textContent.trim();
          const normalize = text => text.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
          const expected = normalize(`This will permanently delete ${item.title}. This can't be undone.`);
          const descriptions = dialog ? [...dialog.querySelectorAll('p, div, span')].filter(el => !el.querySelector('button, h1, h2, [role="heading"]')).map(el => normalize(el.textContent)) : [];
          const titleMatches = quote === item.title || descriptions.includes(expected);
          const confirm = dialog && [...dialog.querySelectorAll('button')].filter(x => ['Delete', 'Delete chat'].includes(x.textContent.trim()) && !x.disabled && x.getAttribute('aria-disabled') !== 'true' && this.isVisible(x));
          if (!dialog || !/^Delete (chat|conversation)\?$/i.test(heading || '') || !titleMatches || confirm.length !== 1) {
            throw new CleanupError('Native delete confirmation could not be verified. No confirmation was submitted. Close it manually.');
          }
          // Native modal dialogs may hide/inert the underlying sidebar for
          // accessibility. Revalidate its identity without requiring visibility.
          if (stopped() || !this.discover({ visibleOnly: false }).some(x => x.id === item.id && x.button === target.button && x.title === item.title)) {
            throw new CleanupError('Stopped before native delete confirmation. Close it manually.');
          }
          dispatched = true;
          confirmationDialog = dialog;
          confirm[0].click();
        }
        let settledSince = null;
        const success = await this.waitFor(() => {
          const failure = signals.find(x => /failed|error|try again|sign in|log in|too many|rate limit/i.test(x));
          if (failure) throw new CleanupError(`ChatGPT reported: ${failure}`, { status: 'outcome unknown' });
          const expected = action === 'archive' ? /^(Chat|Conversation) archived[.!]?$/i : /^(Chat|Conversation) deleted[.!]?$/i;
          const receipt = signals.find(x => expected.test(x));
          // Row disappearance by itself is insufficient (sidebar closure / virtualization).
          const history = this.history();
          const currentIds = new Set(this.discover({ visibleOnly: false }).map(x => x.id));
          const removed = !currentIds.has(item.id);
          const historyVisible = history && this.isVisible(history);
          if (receipt && historyVisible && removed) return receipt;
          // Some ChatGPT layouts complete deletion without a status toast.
          // Require the exact dialog we submitted to close, the same visible
          // history root, every neighboring ID to remain, and a stable interval.
          const locationExpected = this.doc.location.href === initialUrl ||
            (initialPath.replace(/\/$/, '') === `/c/${item.id}` && this.doc.location.pathname === '/');
          const overlays = this.activeOverlays();
          const completedInPage = action === 'delete' && confirmationDialog &&
            (!confirmationDialog.isConnected || !overlays.includes(confirmationDialog)) &&
            overlays.length === 0 && history === initialHistory && historyVisible &&
            removed && neighbors.length > 0 && neighbors.every(id => currentIds.has(id)) && locationExpected;
          if (!completedInPage) { settledSince = null; return null; }
          if (settledSince === null) settledSince = Date.now();
          return Date.now() - settledSince >= this.settle
            ? 'ChatGPT closed the delete confirmation and removed this chat from the sidebar; neighboring chats stayed in place.'
            : null;
        });
        if (!success) throw new CleanupError('Action was submitted, but success could not be verified. Check ChatGPT manually; do not blindly retry.', { status: 'outcome unknown' });
        return { status: 'succeeded', detail: success };
      } finally { observer.disconnect(); }
    } catch (error) {
      if (dispatched) throw new CleanupError(error.message, { status: 'outcome unknown' });
      throw error;
    } finally {
      // Only close the menu opened by this adapter; never submit or dismiss an unknown dialog.
      if (menu?.isConnected && target.button.isConnected && target.button.getAttribute('aria-expanded') === 'true') this.activate(target.button);
    }
  }
}
