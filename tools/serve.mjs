// ============================================================================
// 极简静态服务器：开发/预览关卡。`node tools/serve.mjs [port]`
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2]) || 8000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    let url;
    try {
      url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end('bad request');
      return;
    }
    let fp = path.join(ROOT, url === '/' ? 'levels/example.html' : url);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404);
      res.end('404');
      return;
    }
    // no-store：开发期浏览器绝不缓存，避免缓存旧版 HTML/JS（根治"改了没生效"）
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(fp).pipe(res);
  })
  .listen(PORT, () => console.log(`Chezzle dev server → http://localhost:${PORT}`));
