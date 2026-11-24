#!/usr/bin/env node
// The demo site's front door on this machine (live-demo-site skill): what nginx
// is on the server. ONE origin serves the built site at /, the app at its path
// and the seat picker at its own - the player frames the app and drives it,
// which a browser allows only on the same origin.
//
// Static files are served with the HTTP range requests a <video> needs to seek
// - python's http.server has none, and a chapter jump then silently restarts
// the video from 0:00.
//
//   node front-door.mjs DIR [--port=4292] --proxy=/app/=http://127.0.0.1:4290 --proxy=/idp/=http://127.0.0.1:9910,strip
//
// Each --proxy hands a path prefix to a local server: kept as is (the app is
// mounted at its prefix), or with `,strip` cut off (the seat picker serves at
// its root). The app's public URL and the issuer's must name THIS origin.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `=${dflt}`).split('=').slice(1).join('=');
const root = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const port = Number(opt('port', 4292));
// --proxy=/prefix/=http://host:port[,strip]
const proxies = args.filter((a) => a.startsWith('--proxy=')).map((a) => {
  const [prefix, rest] = a.slice('--proxy='.length).split(/=(.*)/s);
  const [target, mode] = rest.split(',');
  return { prefix, target, strip: mode === 'strip' };
});
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** Hand the request to `target`, the path rewritten by `path`; the browser's
 *  Host is kept, as nginx's `proxy_set_header Host $host` does. */
function proxy(req, res, target, path) {
  const t = new URL(target);
  const up = request({ host: t.hostname, port: t.port, method: req.method, path, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' }).end(`front door: ${target} is not answering (${e.code})`);
  });
  req.pipe(up);
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  for (const p of proxies) {
    if (url.pathname.startsWith(p.prefix) || url.pathname === p.prefix.replace(/\/$/, '')) {
      return proxy(req, res, p.target, p.strip ? req.url.slice(p.prefix.length - 1) || '/' : req.url);
    }
  }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size, 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`demo front door: http://localhost:${port}/  (${root}${proxies.map((p) => `, ${p.prefix} -> ${p.target}${p.strip ? ' (stripped)' : ''}`).join('')})`));
