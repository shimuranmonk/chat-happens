import { readFile, writeFile } from 'node:fs/promises';
import { SCRIPT_VERSION } from '../src/version.js';
const parts = await Promise.all(['version', 'core', 'adapter', 'ui'].map(name => readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8')));
const header = `// ==UserScript==
// @name         Chat Happens
// @namespace    https://alapaap.net/
// @version      ${SCRIPT_VERSION}
// @description  Selectively archive or delete displayed ChatGPT conversations, with selection review and per-chat results.
// @author       Alapaap.net
// @homepageURL  https://github.com/shimuranmonk/chat-happens
// @supportURL   https://github.com/shimuranmonk/chat-happens/issues
// @updateURL    https://raw.githubusercontent.com/shimuranmonk/chat-happens/main/chat-happens.user.js
// @downloadURL  https://raw.githubusercontent.com/shimuranmonk/chat-happens/main/chat-happens.user.js
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;
await writeFile(new URL('../chat-happens.user.js', import.meta.url), header + '\n(() => {\n\'use strict\';\n' + parts.map(x => x.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n') + '\nmountChatHappens(document);\n})();\n');
