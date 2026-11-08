// ==UserScript==
// @name         Chat Happens (experimental)
// @namespace    https://alapaap.net/
// @version      0.1.0-alpha.5
// @description  Selectively archive or delete displayed ChatGPT conversations. Experimental; validate with disposable chats first.
// @author       Alapaap.net
// @homepageURL  https://github.com/shimuranmonk/chat-happens
// @supportURL   https://github.com/shimuranmonk/chat-happens/issues
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
'use strict';
const SCRIPT_VERSION = '0.1.0-alpha.5';

class CleanupError extends Error {
  constructor(message, { status = 'failed', halt = true } = {}) {
    super(message);
    this.status = status;
    this.halt = halt;
  }
}

class BatchRunner {
  running = false;
  stopped = false;
  results = [];
  constructor({ delay = 0 } = {}) { this.delay = delay; }

  stop() { this.stopped = true; }

  async run(items, action, adapter, onProgress = () => {}) {
    if (this.running) throw new Error('A batch is already running.');
    if (!['archive', 'delete'].includes(action)) throw new Error('Unsupported action.');
    if (!items.length || new Set(items.map(x => x.id)).size !== items.length) {
      throw new Error('Select a nonempty set of distinct conversations.');
    }
    const snapshot = Object.freeze(items.map(x => Object.freeze({ id: x.id, title: x.title })));
    this.running = true;
    this.stopped = false;
    this.results = snapshot.map(item => ({ ...item, status: 'pending', detail: '' }));
    const publish = () => onProgress(this.results.map(x => ({ ...x })));
    try {
      publish();
      for (const result of this.results) {
        if (this.stopped) {
          result.status = 'stopped before processing';
          publish();
          continue;
        }
        result.status = 'processing';
        publish();
        try {
          const outcome = await adapter.perform(result, action, () => this.stopped);
          if (!outcome || outcome.status !== 'succeeded') {
            throw new CleanupError('The action outcome could not be verified.', { status: 'outcome unknown' });
          }
          result.status = 'succeeded';
          result.detail = outcome.detail;
        } catch (error) {
          result.status = error instanceof CleanupError ? error.status : 'outcome unknown';
          result.detail = error.message || String(error);
          if (!(error instanceof CleanupError) || error.halt) this.stopped = true;
        }
        publish();
        if (!this.stopped && this.delay > 0) await new Promise(resolve => setTimeout(resolve, this.delay));
      }
      return this.results.map(x => ({ ...x }));
    } finally {
      this.running = false;
    }
  }
}

// UI contract inspected on ChatGPT's English web interface, 2026-11-08.
// No internal endpoints, auth tokens, or network interception are used.
class ChatGPTAdapter {
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


function mountChatHappens(doc) {
  if (doc.getElementById('chat-happens')) return;
  const host = doc.createElement('div');
  host.id = 'chat-happens';
  host.dataset.chOwned = '';
  const rowStyles = doc.createElement('style');
  rowStyles.dataset.chOwned = '';
  rowStyles.textContent = `
    [data-ch-row] > input[data-ch-owned]{appearance:auto!important;-webkit-appearance:checkbox!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;position:absolute!important;inset-inline-start:7px!important;top:50%!important;transform:translateY(-50%)!important;z-index:50!important;width:18px!important;height:18px!important;margin:0!important;accent-color:#16704a!important;color-scheme:light!important}
    [data-ch-row][data-ch-selected="true"]{background:#cfeadb!important;box-shadow:inset 4px 0 0 #16704a!important;outline:2px solid #16704a!important;outline-offset:-2px!important}
    [data-ch-row][data-ch-selected="true"] a{color:#102c20!important}
  `;
  doc.head.append(rowStyles);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host{position:fixed;bottom:18px;right:18px;z-index:2147483000;font:14px/1.5 system-ui,sans-serif;color:#edf4f2;color-scheme:dark}
    *{box-sizing:border-box}section{width:min(350px,calc(100vw - 36px));max-height:calc(100dvh - 36px);overflow:auto;padding:16px;background:#172623;border:1px solid #58766b;border-radius:16px;box-shadow:0 10px 35px #0005}
    h2{font-size:18px;margin:0 0 4px}p{margin:8px 0}.sub{font-size:12px;color:#bdcec6}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    button{font:inherit;border:1px solid #7c9a8e;border-radius:8px;padding:7px 10px;color:inherit;background:#263e36;cursor:pointer}
    button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #f3ce66;outline-offset:3px}.danger{background:#8b2828;border-color:#f4a4a4}
    [hidden]{display:none!important}dialog{color:inherit;background:#172623;border:1px solid #7c9a8e;border-radius:16px;padding:22px;width:min(560px,calc(100vw - 32px));max-height:85vh;overflow:auto}
    dialog::backdrop{background:#0009}ol{max-height:32vh;overflow:auto;padding-left:24px}li{overflow-wrap:anywhere;margin:8px 0}small{display:block;color:#bdcec6}
    details{margin-top:10px}#results{max-height:200px;overflow:auto}label{display:block;margin:14px 0}
    #selected-list{list-style:none;max-height:160px;overflow:auto;margin:8px 0 0;padding:0}#selected-list li{padding:7px 9px;margin:5px 0;border-left:3px solid #81d5ac;border-radius:4px;background:#263e36;overflow-wrap:anywhere}#selected-list small{font-size:11px}
  </style>
  <section aria-label="Chat Happens cleanup">
    <h2>Chat Happens</h2><div class="sub">Alapaap.net · Experimental preview · <span id="version"></span></div>
    <p id="message" role="status" aria-live="polite">Open the ChatGPT sidebar, then enter cleanup mode.</p>
    <div id="selection" hidden><strong id="count">0 selected</strong><ul id="selected-list" aria-label="Selected conversations" hidden></ul><div class="actions"><button id="all">Select displayed</button><button id="clear">Clear selection</button><button id="review">Review selection</button></div></div>
    <div class="actions"><button id="toggle">Enter cleanup mode</button><button id="stop" hidden>Stop processing</button></div>
    <details id="result-wrap" hidden><summary>Batch results</summary><ol id="results"></ol></details>
  </section>
  <dialog data-ch-owned aria-labelledby="review-heading"><h2 id="review-heading">Review selection</h2><p id="review-copy"></p><ol id="review-list"></ol><label id="ack-wrap" hidden><input id="ack" type="checkbox"> I understand that deletion is permanent and cannot be undone.</label><div class="actions"><button id="archive">Archive selected</button><button id="delete" class="danger">Delete selected</button><button id="confirm" hidden>Confirm</button><button id="cancel">Cancel</button></div></dialog>`;
  doc.body.append(host);
  const $ = id => shadow.getElementById(id);
  $('version').textContent = `v${SCRIPT_VERSION}`;
  const adapter = new ChatGPTAdapter(doc);
  const runner = new BatchRunner({ delay: 750 });
  const selected = new Map();
  const uncertain = new Set();
  const controls = new Map();
  let active = false;
  let reviewing = [];
  let pendingAction = null;
  let timer;
  let selectionSignature = '';
  const dialog = shadow.querySelector('dialog');
  const say = text => { $('message').textContent = text; };
  const update = () => {
    $('selection').hidden = !active;
    $('count').textContent = `${selected.size} selected`;
    $('selected-list').hidden = selected.size === 0;
    const signature = JSON.stringify([...selected.values()]);
    if (signature !== selectionSignature) {
      selectionSignature = signature;
      $('selected-list').replaceChildren(...[...selected.values()].map(item => {
        const li = doc.createElement('li');
        li.textContent = item.title;
        const id = doc.createElement('small');
        id.textContent = item.id;
        li.append(id);
        return li;
      }));
    }
    $('review').disabled = !selected.size || runner.running;
    $('all').disabled = runner.running;
    $('clear').disabled = runner.running;
    $('toggle').disabled = runner.running;
    $('toggle').textContent = active ? 'Exit cleanup mode' : 'Enter cleanup mode';
    $('stop').hidden = !runner.running;
    for (const [row, record] of controls) {
      record.input.checked = selected.has(record.id);
      record.input.disabled = runner.running || uncertain.has(record.id);
      const marked = selected.has(record.id) ? 'true' : 'false';
      if (row.getAttribute('data-ch-row') !== '') row.setAttribute('data-ch-row', '');
      if (row.getAttribute('data-ch-selected') !== marked) row.setAttribute('data-ch-selected', marked);
      if (row.style.paddingInlineStart !== '32px') row.style.paddingInlineStart = '32px';
    }
  };
  const removeControl = (row, record) => {
    record.input.remove();
    row.style.paddingInlineStart = record.padding;
    row.removeAttribute('data-ch-row');
    row.removeAttribute('data-ch-selected');
    controls.delete(row);
  };
  const scan = () => {
    const displayed = active ? adapter.discover() : [];
    const rows = new Set(displayed.map(x => x.row));
    for (const [row, record] of controls) if (!rows.has(row) || displayed.find(x => x.row === row)?.id !== record.id || record.input.parentElement !== row) removeControl(row, record);
    for (const item of displayed) {
      if (controls.has(item.row)) continue;
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.dataset.chOwned = '';
      input.setAttribute('aria-label', `Select ${item.title} (${item.id})`);
      input.style.cssText = 'position:absolute;inset-inline-start:7px;top:50%;transform:translateY(-50%);z-index:20;pointer-events:auto;width:18px;height:18px;accent-color:#238463;';
      input.addEventListener('click', event => event.stopPropagation());
      input.addEventListener('change', () => {
        if (runner.running) return update();
        const fresh = adapter.discover().find(x => x.row === item.row && x.id === item.id);
        if (!fresh || uncertain.has(item.id)) return scan();
        if (input.checked) selected.set(item.id, { id: item.id, title: fresh.title });
        else selected.delete(item.id);
        update();
      });
      const padding = item.row.style.paddingInlineStart;
      item.row.style.paddingInlineStart = '32px';
      item.row.prepend(input);
      controls.set(item.row, { id: item.id, input, padding });
    }
    update();
  };
  const observer = new doc.defaultView.MutationObserver(records => {
    if (!records.some(r => !host.contains(r.target))) return;
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 150);
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ch-row', 'data-ch-selected', 'style'] });
  $('toggle').onclick = () => {
    active = !active;
    if (!active) selected.clear();
    scan();
    say(active ? 'Select ordinary chats in the displayed sidebar. English interface required. Project chats are excluded.' : 'Cleanup mode is off.');
  };
  $('all').onclick = () => {
    for (const item of adapter.discover()) if (!uncertain.has(item.id)) selected.set(item.id, { id: item.id, title: item.title });
    update();
  };
  $('clear').onclick = () => { selected.clear(); update(); };
  $('review').onclick = () => {
    reviewing = [...selected.values()].map(x => ({ ...x }));
    pendingAction = null;
    $('review-heading').textContent = `Review ${reviewing.length} selected conversations`;
    $('review-copy').textContent = 'Check every conversation below, then choose an action. Stay on this page and avoid interacting with ChatGPT while processing.';
    $('review-list').replaceChildren(...reviewing.map(item => {
      const li = doc.createElement('li');
      li.textContent = item.title;
      const small = doc.createElement('small');
      small.textContent = item.id;
      li.append(small);
      return li;
    }));
    $('archive').hidden = $('delete').hidden = false;
    $('confirm').hidden = $('ack-wrap').hidden = true;
    $('ack').checked = false;
    dialog.showModal();
  };
  const choose = action => {
    pendingAction = action;
    $('review-heading').textContent = `${action === 'delete' ? 'Delete' : 'Archive'} ${reviewing.length} conversations?`;
    $('review-copy').textContent = action === 'delete'
      ? 'Deletion is permanent. Chat Happens cannot undo it. The batch will stop if a result cannot be verified.'
      : 'Archiving removes these chats from the regular sidebar and keeps them in your account. The batch will stop if a result cannot be verified.';
    $('archive').hidden = $('delete').hidden = true;
    $('ack-wrap').hidden = action !== 'delete';
    $('confirm').hidden = false;
    $('confirm').disabled = action === 'delete';
    $('confirm').className = action === 'delete' ? 'danger' : '';
    $('confirm').textContent = `Confirm ${action} of ${reviewing.length} conversations`;
  };
  $('archive').onclick = () => choose('archive');
  $('delete').onclick = () => choose('delete');
  $('ack').onchange = () => { $('confirm').disabled = pendingAction === 'delete' && !$('ack').checked; };
  $('cancel').onclick = () => dialog.close();
  const progress = results => {
    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
    say(Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(' · '));
    $('result-wrap').hidden = false;
    $('results').replaceChildren(...results.map(r => {
      const li = doc.createElement('li');
      li.textContent = `${r.title} — ${r.status}`;
      const detail = doc.createElement('small');
      detail.textContent = `${r.id}${r.detail ? ': ' + r.detail : ''}`;
      li.append(detail);
      return li;
    }));
    update();
  };
  $('confirm').onclick = async () => {
    if (runner.running || !pendingAction || (pendingAction === 'delete' && !$('ack').checked)) return;
    const action = pendingAction;
    pendingAction = null;
    dialog.close();
    // Trusted interaction outside our UI invalidates the batch's operating context.
    const interrupt = event => {
      if (event.isTrusted && !event.composedPath().includes(host)) runner.stop();
    };
    const hidden = () => { if (doc.hidden) runner.stop(); };
    const navigated = () => runner.stop();
    doc.addEventListener('pointerdown', interrupt, true);
    doc.addEventListener('keydown', interrupt, true);
    doc.addEventListener('visibilitychange', hidden);
    doc.defaultView.addEventListener('popstate', navigated);
    doc.defaultView.addEventListener('hashchange', navigated);
    try {
      const results = await runner.run(reviewing, action, adapter, progress);
      for (const r of results) {
        if (r.status === 'succeeded' || r.status === 'outcome unknown') selected.delete(r.id);
        if (r.status === 'outcome unknown') uncertain.add(r.id);
      }
      progress(results);
      $('result-wrap').open = true;
    } catch (error) { say(error.message); }
    finally {
      doc.removeEventListener('pointerdown', interrupt, true);
      doc.removeEventListener('keydown', interrupt, true);
      doc.removeEventListener('visibilitychange', hidden);
      doc.defaultView.removeEventListener('popstate', navigated);
      doc.defaultView.removeEventListener('hashchange', navigated);
      update();
    }
  };
  $('stop').onclick = () => { runner.stop(); say('Stopping. An action already submitted may finish.'); };
  update();
  return { host, adapter, runner, destroy() { observer.disconnect(); clearTimeout(timer); for (const [row, record] of controls) removeControl(row, record); rowStyles.remove(); host.remove(); } };
}

mountChatHappens(document);
})();
