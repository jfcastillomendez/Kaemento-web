// Local-only static + Function adapter. No default keys, no request/credential logging.
// For the actual Vercel runtime use `vercel dev`; this adapter needs no dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const checkout = require('../api/bold/checkout.js');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.mp4': 'video/mp4' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/index.html') {
    res.writeHead(308, {'Location':'/' + url.search}); return res.end();
  }
  if (['/api/bold/webhook','/api/bold/retry-emails'].includes(url.pathname)) {
    const {default:webhook} = await import('../api/bold/'+url.pathname.split('/').at(-1)+'.mjs');
    const init = {method:req.method,headers:req.headers};
    if (!['GET','HEAD'].includes(req.method)) { init.body = req; init.duplex = 'half'; }
    const response = await webhook.fetch(new Request(url,init));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    return res.end(Buffer.from(await response.arrayBuffer()));
  }
  if (url.pathname === '/api/bold/promotion') return require('../api/bold/promotion.js')(req,res);
  if (['/api/bold/checkout','/api/bold/status','/api/red-kaemento'].includes(url.pathname)) {
    let body = ''; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) { res.writeHead(413); return res.end(); }
      body += chunk;
    }
    req.body = body;
    const handler=url.pathname === '/api/red-kaemento' ? require('../api/red-kaemento.js') : url.pathname === '/api/bold/status' ? require('../api/bold/status.js') : checkout;
    return handler(req, res);
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
