import test from 'node:test';
import assert from 'node:assert/strict';
import { mountChatHappens } from '../src/ui.js';
import { fixture, ids } from './fixture.mjs';
import { SCRIPT_VERSION } from '../src/version.js';
import { readFileSync } from 'node:fs';

function setup() {
  const f = fixture();
  f.dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  f.dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const app = mountChatHappens(f.doc);
  app.adapter.isVisible = f.visible;
  const $ = id => app.host.shadowRoot.getElementById(id);
  return { ...f, app, $, close() { app.destroy(); f.dom.window.close(); } };
}

test('cleanup mode, selection count, clear and exit never mutate conversations', () => {
  const f = setup(); f.$('toggle').click();
  assert.equal(f.doc.querySelectorAll('input[type="checkbox"]').length, 3);
  f.$('all').click(); assert.equal(f.$('count').textContent, '3 selected');
  f.$('clear').click(); assert.equal(f.$('count').textContent, '0 selected');
  f.$('toggle').click(); assert.equal(f.doc.querySelectorAll('input').length, 0);
  assert.equal(f.calls.length, 0); f.close();
});

test('review lists duplicate titles with IDs and deletion requires acknowledgement', () => {
  const f = setup(); f.$('toggle').click(); f.$('all').click(); f.$('review').click();
  assert.match(f.$('review-list').textContent, new RegExp(ids[0]));
  f.$('delete').click(); assert.equal(f.$('confirm').disabled, true);
  f.$('ack').click(); assert.equal(f.$('confirm').disabled, false);
  f.$('cancel').click(); assert.equal(f.calls.length, 0); f.close();
});

test('untrusted titles render as text and never markup', () => {
  const f = setup(); f.items[0].link.setAttribute('aria-label', '<img src=x onerror=alert(1)>');
  f.$('toggle').click(); f.$('all').click(); f.$('review').click();
  assert.equal(f.$('review-list').querySelector('img'), null);
  assert.match(f.$('review-list').textContent, /<img/); f.close();
});

test('mount is idempotent and cleanup restores row padding', () => {
  const f = setup(); f.items[0].row.style.paddingInlineStart = '9px';
  f.$('toggle').click(); assert.equal(f.items[0].row.style.paddingInlineStart, '32px');
  assert.equal(mountChatHappens(f.doc), undefined);
  f.$('toggle').click(); assert.equal(f.items[0].row.style.paddingInlineStart, '9px'); f.close();
});

test('selected titles and IDs appear immediately and rows remain marked', () => {
  const f = setup(); f.$('toggle').click();
  f.items[0].row.querySelector('input').click();
  assert.equal(f.$('count').textContent, '1 selected');
  assert.equal(f.$('selected-list').hidden, false);
  assert.match(f.$('selected-list').textContent, /Same title/);
  assert.match(f.$('selected-list').textContent, new RegExp(ids[0]));
  assert.equal(f.items[0].row.dataset.chSelected, 'true');
  assert.equal(f.items[1].row.dataset.chSelected, 'false');
  f.$('clear').click();
  assert.equal(f.$('selected-list').hidden, true);
  assert.equal(f.items[0].row.dataset.chSelected, 'false');
  f.$('toggle').click();
  assert.equal(f.items[0].row.hasAttribute('data-ch-selected'), false);
  f.close();
});

test('checkbox and highlight recover after the page redraws a selected row', async () => {
  const f = setup(); f.$('toggle').click();
  f.items[0].row.querySelector('input').click();
  f.items[0].row.querySelector('input').remove();
  f.items[0].row.removeAttribute('data-ch-row');
  f.items[0].row.removeAttribute('data-ch-selected');
  f.items[0].row.style.paddingInlineStart = '';
  await new Promise(resolve => setTimeout(resolve, 400));
  const input = f.items[0].row.querySelector('input');
  assert.ok(input); assert.equal(input.checked, true);
  assert.equal(f.items[0].row.dataset.chSelected, 'true');
  assert.equal(f.$('count').textContent, '1 selected');
  assert.match(f.$('selected-list').textContent, new RegExp(ids[0]));
  assert.equal(f.calls.length, 0);
  f.close();
});

test('selection list renders untrusted titles as text', () => {
  const f = setup(); f.items[0].link.setAttribute('aria-label', '<img src=x onerror=alert(1)>');
  f.$('toggle').click(); f.items[0].row.querySelector('input').click();
  assert.equal(f.$('selected-list').querySelector('img'), null);
  assert.match(f.$('selected-list').textContent, /<img/);
  f.close();
});

test('panel version matches the installable script and package version', () => {
  const f = setup();
  assert.equal(f.$('version').textContent, `v${SCRIPT_VERSION}`);
  const built = readFileSync(new URL('../chat-happens.user.js', import.meta.url), 'utf8');
  assert.equal(built.match(/^\/\/ @version\s+(\S+)/m)[1], SCRIPT_VERSION);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, SCRIPT_VERSION);
  f.close();
});
