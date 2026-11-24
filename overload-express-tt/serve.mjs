// 本地横屏浏览器预览服务（端口 4174，已在 project.config.json packOptions.ignore 中排除）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const isDist = process.argv.includes('--dist');
const ROOT = isDist ? path.join(PROJECT_ROOT, 'dist') : PROJECT_ROOT;
const openRequested = process.argv.includes('--open');
const PORT = Number(process.env.PORT || (openRequested ? 0 : 4174));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

const server = http.createServer((req, res) => {
  let rawPath;
  try { rawPath = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch { res.writeHead(400); res.end('Bad Request'); return; }
  const rel = rawPath === '/' ? 'preview.html' : rawPath.replace(/^\/+/, '');
  // 不向预览浏览器暴露工程标识、存档、构建工具或上级目录。
  const allowed = /^(?:preview\.html|game\.js|src\/[a-z_]+\.js|assets\/voice\/[a-z0-9_]+\.mp3)$/.test(rel);
  if (!allowed || (isDist && rel.startsWith('src/'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (isDist && rel === 'preview.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(PROJECT_ROOT, 'preview.html')));
    return;
  }
  const full = path.resolve(ROOT, rel);
  const relative = path.relative(ROOT, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Not Found: ${rel}`);
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`[overload-express-tt] pid=${process.pid} mode=${isDist ? 'dist' : 'source'} preview listening at ${url}`);
  console.log('本地预览已启动，按 Ctrl+C 停止服务。');
  if (openRequested && !process.argv.includes('--no-open')) {
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const browser = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    const fallback = () => console.error(`无法自动打开浏览器，请访问：${url}`);
    browser.once('error', fallback);
    browser.once('exit', (code) => { if (code) fallback(); });
  }
});

server.once('error', (error) => {
  console.error(`本地预览启动失败：${error.message}`);
  process.exitCode = 1;
});

process.once('SIGINT', () => server.close());
