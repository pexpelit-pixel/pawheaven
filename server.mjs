import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST_ROOT = path.resolve(APP_ROOT, 'dist');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.gif', 'image/gif'], ['.ico', 'image/x-icon'],
  ['.ogg', 'audio/ogg'], ['.wav', 'audio/wav'], ['.mp3', 'audio/mpeg'], ['.mp4', 'video/mp4'], ['.ktx2', 'image/ktx2'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'], ['.wasm', 'application/wasm'], ['.bin', 'application/octet-stream']
]);

function commonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}

function send(res, status, message, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(message);
}

async function serve(req, res) {
  commonHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let decoded;
  try { decoded = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { send(res, 400, 'Bad Request'); return; }
  if (decoded.includes('\\') || decoded.split('/').some((part) => part.startsWith('.') && part.length > 1)) {
    send(res, 404, 'Not Found');
    return;
  }
  if (decoded === '/world-editor' || decoded === '/world-editor/') {
    const search = new URL(req.url, 'http://localhost').search;
    res.writeHead(302, { Location: '/world-editor.html' + search, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  const requested = decoded === '/' ? '/index.html' : decoded;
  const absolute = path.resolve(DIST_ROOT, `.${requested}`);
  if (absolute !== DIST_ROOT && !absolute.startsWith(`${DIST_ROOT}${path.sep}`)) {
    send(res, 403, 'Forbidden');
    return;
  }

  let fileStat;
  try {
    await access(absolute);
    fileStat = await stat(absolute);
    if (!fileStat.isFile()) { send(res, 404, 'Not Found'); return; }
  } catch {
    send(res, 404, 'Not Found');
    return;
  }

  const ext = path.extname(absolute).toLowerCase();
  const isHashedAsset = requested.startsWith('/assets/') && /-[A-Za-z0-9_-]{6,}\./.test(path.basename(requested));
  const cache = ext === '.html' ? 'no-cache' : isHashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  const etag = `W/"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}"`;
  res.setHeader('Content-Type', MIME.get(ext) || 'application/octet-stream');
  res.setHeader('Content-Length', String(fileStat.size));
  res.setHeader('Last-Modified', fileStat.mtime.toUTCString());
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', cache);
  if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
  res.writeHead(200);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(absolute);
  stream.on('error', () => { if (!res.headersSent) send(res, 500, 'Internal Server Error'); else res.destroy(); });
  stream.pipe(res);
}

try {
  await access(path.join(DIST_ROOT, 'index.html'));
} catch {
  console.error(`Production build missing at ${DIST_ROOT}. Run "npm run build" before starting the production server.`);
  process.exit(1);
}
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  serve(req, res).catch((error) => {
    console.error('Request handler failure:', error);
    if (!res.headersSent) send(res, 500, 'Internal Server Error'); else res.destroy();
  });
});
server.maxConnections = 1000;
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, HOST, () => console.log(`Robotic Dog Shelter listening on http://${HOST}:${PORT}`));

function shutdown(signal) {
  console.log(`${signal} received; closing HTTP server…`);
  server.close((error) => { if (error) { console.error(error); process.exitCode = 1; } process.exit(); });
  setTimeout(() => process.exit(1), 8_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
