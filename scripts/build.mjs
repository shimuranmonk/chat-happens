import { readFile, writeFile } from 'node:fs/promises';
const parts = await Promise.all(['core', 'adapter', 'ui'].map(name => readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8')));
const header = `// ==UserScript==
// @name         Chat Happens (experimental)
// @namespace    https://alapaap.net/
// @version      0.1.0-alpha.1
// @description  Selectively archive or delete displayed ChatGPT conversations. Experimental; validate with disposable chats first.
// @author       Alapaap.net
// @homepageURL  https://github.com/shimuranmonk/chat-happens
// @supportURL   https://github.com/shimuranmonk/chat-happens/issues
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;
await writeFile(new URL('../chat-happens.user.js', import.meta.url), header + '\n(() => {\n\'use strict\';\n' + parts.map(x => x.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n') + '\nmountChatHappens(document);\n})();\n');
