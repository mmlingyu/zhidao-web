// 仅用于本地预览。生产环境使用 Nginx/CDN 托管 npm run build 的 dist/。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const assets = ['model', 'vendor', 'tts'];
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.wasm':'application/wasm'};
http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  const isAsset = assets.some(p => pathname.startsWith('/'+p+'/'));
  const base = isAsset ? path.join(ROOT,'public') : ROOT;
  const rel = pathname === '/' ? '/index.html' : pathname;
  // 根目录只公开页面资源；不公开 npm 配置、源码工具或隐藏文件。
  if (!isAsset && (rel.slice(1).includes('/') || !/\.(html|js|css|svg|webmanifest)$/.test(rel) || /^(test-|build-|fetch-)/.test(rel.slice(1)))) { res.writeHead(404); return res.end(); }
  const file = path.resolve(base,'.'+rel);
  if (!file.startsWith(base+path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file,(err,stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
    if(req.method==='HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}).listen(Number(process.env.PORT||8080),process.env.HOST||'127.0.0.1',()=>console.log('知岛前端：http://127.0.0.1:'+(process.env.PORT||8080)));
