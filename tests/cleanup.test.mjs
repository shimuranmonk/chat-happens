import test from 'node:test';
import assert from 'node:assert/strict';
import { BatchRunner, CleanupError } from '../src/core.js';
import { ChatGPTAdapter } from '../src/adapter.js';
import { fixture, ids } from './fixture.mjs';

function setup(options) {
  const f = fixture(options);
  const adapter = new ChatGPTAdapter(f.doc, { timeout: 40, interval: 2, isVisible: f.visible });
  return { ...f, adapter, selection: adapter.discover().map(({ id, title }) => ({ id, title })) };
}

test('duplicate titles retain distinct stable identities', () => {
  const f = setup();
  assert.equal(f.selection.length, 3);
  assert.equal(new Set(f.selection.map(x => x.id)).size, 3);
  f.dom.window.close();
});

test('project links, spoofed origins and owner mismatch are excluded', () => {
  const f = setup();
  f.items[0].link.href = `/g/project/c/${ids[0]}`;
  f.items[1].link.href = `https://example.com/c/${ids[1]}`;
  f.items[2].owner.dataset.sidebarChatgptConversationKey = 'wrong';
  assert.equal(f.adapter.discover().length, 0);
  f.dom.window.close();
});

test('duplicate rendered identity is rejected', () => {
  const f = setup(); f.add(ids[0]);
  assert.equal(f.adapter.discover().some(x => x.id === ids[0]), false);
  f.dom.window.close();
});

test('hidden rows are not selected', () => {
  const f = setup(); f.items[0].row.hidden = true;
  assert.equal(f.adapter.discover().length, 2);
  f.dom.window.close();
});

test('archive targets only selected ID after rows reorder', async () => {
  const f = setup(); f.root.prepend(f.items[2].owner);
  const result = await new BatchRunner().run([f.selection[1]], 'archive', f.adapter);
  assert.deepEqual(f.calls, [{ id: ids[1], action: 'archive' }]);
  assert.equal(result[0].status, 'succeeded');
  assert.equal(f.items[0].owner.isConnected, true);
  f.dom.window.close();
});

test('missing selection is skipped without acting on replacement row', async () => {
  const f = setup(); f.items[0].owner.remove();
  const result = await new BatchRunner().run([f.selection[0]], 'archive', f.adapter);
  assert.equal(result[0].status, 'skipped'); assert.equal(f.calls.length, 0);
  f.dom.window.close();
});

test('changed title pauses entire batch', async () => {
  const f = setup(); f.items[0].link.setAttribute('aria-label', 'Renamed');
  const result = await new BatchRunner().run(f.selection, 'archive', f.adapter);
  assert.equal(result[0].status, 'failed');
  assert.equal(result[1].status, 'stopped before processing');
  assert.equal(f.calls.length, 0); f.dom.window.close();
});

test('unowned menu is never used', async () => {
  const f = setup({ mismatch: true });
  const result = await new BatchRunner().run(f.selection, 'archive', f.adapter);
  assert.equal(result[0].status, 'failed'); assert.equal(f.calls.length, 0);
  f.dom.window.close();
});

test('silent row disappearance is unknown and stops without retry', async () => {
  const f = setup({ outcome: 'silent' });
  const result = await new BatchRunner().run(f.selection, 'archive', f.adapter);
  assert.equal(result[0].status, 'outcome unknown');
  assert.equal(result[1].status, 'stopped before processing');
  assert.equal(f.calls.length, 1); f.dom.window.close();
});

test('an old success toast cannot verify a later silent action', async () => {
  const f = setup({ outcome: 'silent' });
  const old = f.doc.createElement('div'); old.setAttribute('role', 'status'); old.textContent = 'Chat archived'; f.doc.body.append(old);
  const result = await new BatchRunner().run(f.selection, 'archive', f.adapter);
  assert.equal(result[0].status, 'outcome unknown'); assert.equal(f.calls.length, 1);
  f.dom.window.close();
});

test('service error pauses after a single submission', async () => {
  const f = setup({ outcome: 'failure' });
  const result = await new BatchRunner().run(f.selection, 'archive', f.adapter);
  assert.equal(result[0].status, 'outcome unknown');
  assert.equal(f.calls.length, 1); f.dom.window.close();
});

test('delete requires native title match before confirmation', async () => {
  const f = setup({ nativeMismatch: true });
  const result = await new BatchRunner().run(f.selection, 'delete', f.adapter);
  assert.equal(result[0].status, 'failed'); assert.equal(f.calls.length, 0);
  f.dom.window.close();
});

test('matching fixture delete dialog is confirmed once', async () => {
  const f = setup();
  const result = await new BatchRunner().run([f.selection[0]], 'delete', f.adapter);
  assert.equal(result[0].status, 'succeeded');
  assert.deepEqual(f.calls, [{ id: ids[0], action: 'delete' }]); f.dom.window.close();
});

test('stop during in-flight action allows settlement and stops later items', async () => {
  const runner = new BatchRunner(); let finish; let calls = 0;
  const task = runner.run(ids.map(id => ({ id, title: 'x' })), 'archive', { perform: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  runner.stop(); finish({ status: 'succeeded', detail: 'ok' });
  const result = await task;
  assert.equal(calls, 1); assert.equal(result[0].status, 'succeeded');
  assert.equal(result[1].status, 'stopped before processing');
});

test('cannot launch a second batch while one is running', async () => {
  const runner = new BatchRunner(); let finish;
  const adapter = { perform: () => new Promise(resolve => { finish = resolve; }) };
  const task = runner.run([{ id: ids[0], title: 'x' }], 'archive', adapter);
  await assert.rejects(runner.run([{ id: ids[1], title: 'y' }], 'archive', adapter), /already running/);
  finish({ status: 'succeeded', detail: 'ok' }); await task;
});

test('batch freezes selection against later caller changes', async () => {
  const runner = new BatchRunner(); let finish; const calls = [];
  const items = ids.slice(0, 2).map(id => ({ id, title: 'x' }));
  const task = runner.run(items, 'archive', { perform: item => {
    calls.push(item.id);
    if (calls.length === 1) return new Promise(resolve => { finish = resolve; });
    return { status: 'succeeded', detail: 'ok' };
  } });
  items[1].id = ids[2]; items.push({ id: 'extra', title: 'x' });
  finish({ status: 'succeeded', detail: 'ok' }); await task;
  assert.deepEqual(calls, ids.slice(0, 2));
});

test('unexpected exception is unknown and halts; no retries', async () => {
  let calls = 0;
  const result = await new BatchRunner().run(ids.map(id => ({ id, title: 'x' })), 'delete', { perform: () => { calls++; throw new Error('lost connection'); } });
  assert.equal(result[0].status, 'outcome unknown'); assert.equal(calls, 1);
});

test('empty, duplicate, and unsupported inputs are rejected', async () => {
  const runner = new BatchRunner();
  await assert.rejects(runner.run([], 'archive', {}));
  await assert.rejects(runner.run([{ id: 'x' }, { id: 'x' }], 'archive', {}));
  await assert.rejects(runner.run([{ id: 'x' }], 'export', {}));
});

test('stop between menu opening and action prevents mutation', async () => {
  const f = setup(); let stopped = false;
  const original = f.items[0].button.onclick;
  f.items[0].button.onclick = () => { original(); stopped = true; };
  await assert.rejects(f.adapter.perform(f.selection[0], 'archive', () => stopped), CleanupError);
  assert.equal(f.calls.length, 0); f.dom.window.close();
});

test('hidden and closed dialog remnants do not block selected deletion', async () => {
  const f = setup();
  const remnants = [
    '<div role="dialog" hidden></div>',
    '<div aria-hidden="true"><div role="alertdialog"></div></div>',
    '<div role="dialog" data-state="closed"></div>',
    '<div role="dialog" style="display:none"></div>',
    '<div role="dialog" style="visibility:hidden"></div>',
    '<div role="dialog" style="opacity:0"></div>',
    '<div inert><div role="dialog"></div></div>',
    '<dialog role="dialog"></dialog>',
    '<div role="menu" data-state="closed"></div>',
    '<div data-ch-owned><div role="dialog"></div></div>'
  ];
  const container = f.doc.createElement('div'); container.innerHTML = remnants.join(''); f.doc.body.append(container);
  const result = await new BatchRunner().run([f.selection[0]], 'delete', f.adapter);
  assert.equal(result[0].status, 'succeeded');
  assert.deepEqual(f.calls, [{ id: ids[0], action: 'delete' }]);
  f.dom.window.close();
});

for (const role of ['dialog', 'alertdialog', 'menu']) {
  test(`a genuinely open ${role} still blocks all cleanup actions`, async () => {
    const f = setup();
    const overlay = f.doc.createElement('div'); overlay.setAttribute('role', role); overlay.setAttribute('data-state', 'open'); f.doc.body.append(overlay);
    const result = await new BatchRunner().run(f.selection, 'delete', f.adapter);
    assert.equal(result[0].status, 'failed');
    assert.match(result[0].detail, /blocking cleanup/);
    assert.equal(result[1].status, 'stopped before processing');
    assert.equal(f.calls.length, 0);
    f.dom.window.close();
  });
}

test('sidebar presented as a dialog remains an eligible operating surface', async () => {
  const f = setup(); f.root.setAttribute('role', 'dialog');
  const result = await new BatchRunner().run([f.selection[0]], 'archive', f.adapter);
  assert.equal(result[0].status, 'succeeded'); assert.equal(f.calls.length, 1);
  f.dom.window.close();
});

test('native delete modal may hide the sidebar without losing target identity', async () => {
  const f = setup();
  f.adapter.isVisible = el => f.visible(el) && !el.closest('[aria-hidden="true"]');
  const originalWait = f.adapter.waitFor.bind(f.adapter);
  f.adapter.waitFor = check => originalWait(() => {
    const dialog = f.doc.querySelector('[role="dialog"]');
    if (dialog) f.root.setAttribute('aria-hidden', 'true');
    else f.root.removeAttribute('aria-hidden');
    return check();
  });
  const result = await new BatchRunner().run([f.selection[0]], 'delete', f.adapter);
  assert.equal(result[0].status, 'succeeded');
  assert.deepEqual(f.calls, [{ id: ids[0], action: 'delete' }]);
  f.dom.window.close();
});
