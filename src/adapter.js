import { CleanupError } from './core.js';
// UI contract inspected on ChatGPT's English web interface, 2026-11-08.
// No internal endpoints, auth tokens, or network interception are used.
export class ChatGPTAdapter {
  constructor(doc, { timeout = 7000, interval = 100, isVisible } = {}) {
    this.doc = doc;
    this.timeout = timeout;
    this.interval = interval;
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

  async perform(item, action, stopped) {
    if (!['archive', 'delete'].includes(action)) throw new CleanupError('Unsupported action.');
    const target = this.discover().find(x => x.id === item.id);
    if (!target) throw new CleanupError('Conversation is no longer displayed or its identity is ambiguous.', { status: 'skipped', halt: false });
    if (target.title !== item.title) throw new CleanupError('Conversation title changed. Review the selection again.');
    if (this.doc.querySelector('[role="menu"][data-state="open"], [role="dialog"]:not([data-ch-owned]), [role="alertdialog"]')) {
      throw new CleanupError('Close other menus or dialogs before running cleanup.');
    }
    if (!target.button.id || target.button.disabled || target.button.getAttribute('aria-disabled') === 'true') {
      throw new CleanupError('Conversation action control is unavailable.');
    }
    if (stopped()) throw new CleanupError('Stopped before action.', { status: 'stopped before processing' });
    this.activate(target.button);
    let dispatched = false;
    let menu;
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
            const dialogs = [...this.doc.querySelectorAll('[role="alertdialog"], [role="dialog"]:not([data-ch-owned])')].filter(x => this.isVisible(x));
            return dialogs.length === 1 ? dialogs[0] : null;
          });
          // Native delete-dialog shape is deliberately strict until verified live.
          const heading = dialog?.querySelector('h1, h2, [role="heading"]')?.textContent.trim();
          const quote = dialog?.querySelector('strong, b')?.textContent.trim();
          const confirm = dialog && [...dialog.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Delete' && !x.disabled);
          if (!dialog || !/^Delete (chat|conversation)\?$/i.test(heading || '') || quote !== item.title || confirm.length !== 1) {
            throw new CleanupError('Native delete confirmation could not be verified. No confirmation was submitted. Close it manually.');
          }
          if (stopped() || !this.discover().some(x => x.id === item.id && x.button === target.button && x.title === item.title)) {
            throw new CleanupError('Stopped before native delete confirmation. Close it manually.');
          }
          dispatched = true;
          confirm[0].click();
        }
        const success = await this.waitFor(() => {
          const failure = signals.find(x => /failed|error|try again|sign in|log in|too many|rate limit/i.test(x));
          if (failure) throw new CleanupError(`ChatGPT reported: ${failure}`, { status: 'outcome unknown' });
          const expected = action === 'archive' ? /^(Chat|Conversation) archived[.!]?$/i : /^(Chat|Conversation) deleted[.!]?$/i;
          const receipt = signals.find(x => expected.test(x));
          // Row disappearance by itself is insufficient (sidebar closure / virtualization).
          return receipt && this.isVisible(this.history()) && !this.discover({ visibleOnly: false }).some(x => x.id === item.id) ? receipt : null;
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
