// Local-only static + Function adapter. No default keys, no request/credential logging.
// For the actual Vercel runtime use `vercel dev`; this adapter needs no dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const checkout = require('../api/bold/checkout.js');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.mp4': 'video/mp4' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/bold/checkout') {
    let body = ''; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024) { res.writeHead(413); return res.end(); }
      body += chunk;
    }
    req.body = body;
    return checkout(req, res);
  }
  let name;
  try { name = decodeURIComponent(url.pathname); } catch (_) { res.writeHead(400); return res.end(); }
  if (name.split('/').some(part => part.startsWith('.')) || /^\/(api|tests|scripts)(\/|$)/.test(name) || /\.(md|cjs)$/.test(name)) {
    res.writeHead(404); return res.end();
  }
  if (name === '/pagos/resultado') name += '.html';
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(404); return res.end(); }
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (_) { res.writeHead(404); res.end(); }
}).listen(Number(process.env.PORT || 8001), '127.0.0.1', () => console.log('KAEMENTO preview: http://localhost:' + (process.env.PORT || 8001)));
