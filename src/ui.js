import { BatchRunner } from './core.js';
import { ChatGPTAdapter } from './adapter.js';
import { SCRIPT_VERSION } from './version.js';

export function mountChatHappens(doc) {
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
