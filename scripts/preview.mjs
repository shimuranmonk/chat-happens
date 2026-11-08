import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const paths = new Map([['/', 'tests/demo.html'], ['/src/version.js', 'src/version.js'], ['/src/core.js', 'src/core.js'], ['/src/adapter.js', 'src/adapter.js'], ['/src/ui.js', 'src/ui.js']]);
createServer(async (req, res) => {
  const file = paths.get(req.url);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(`../${file}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Preview unavailable'); }
}).listen(4173, '127.0.0.1', () => console.log('Simulated chat list: http://127.0.0.1:4173'));
