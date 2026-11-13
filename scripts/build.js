const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const out = path.join(root,'dist');
// 仅覆盖生成目录，不修改源文件。
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const files = new Set(['index.html','sw.js',...Array.from(html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^\"]*)?"/g),m=>m[1]).filter(n=>!n.includes(':')&&!n.startsWith('#'))]);
for(const file of files) fs.copyFileSync(path.join(root,file),path.join(out,file));
for(const dir of ['model','vendor','tts']) fs.cpSync(path.join(root,'public',dir),path.join(out,dir),{recursive:true,filter:src=>!src.endsWith('.onnx')});
console.log('静态产物已生成：dist/；将其内容部署到站点根路径。');
