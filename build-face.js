/* 构建脚本：把浏览器端人脸资源从 node_modules 复制到 public/。
 *
 * 为什么要复制而不是直接引用 node_modules：
 * 服务端只放行固定路径的静态文件，public/ 下的 /model 与 /vendor 才是对外可访问的。
 * 部署时先跑一次 npm run build:face，确保资源就位。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const FACE_API = path.join(ROOT, 'node_modules', '@vladmandic', 'face-api');
const TFJS = path.join(ROOT, 'node_modules', '@tensorflow', 'tfjs-backend-wasm');
const OUT = path.join(ROOT, 'public');

const FILES = [
  { from: path.join(FACE_API, 'dist', 'face-api.esm.js'), to: path.join(OUT, 'vendor', 'face-api.esm.js') },
  { from: path.join(TFJS, 'dist', 'tfjs-backend-wasm.wasm'), to: path.join(OUT, 'vendor', 'tfjs-backend-wasm.wasm') },
  { from: path.join(TFJS, 'dist', 'tfjs-backend-wasm-simd.wasm'), to: path.join(OUT, 'vendor', 'tfjs-backend-wasm-simd.wasm') },
  { from: path.join(TFJS, 'dist', 'tfjs-backend-wasm-threaded-simd.wasm'), to: path.join(OUT, 'vendor', 'tfjs-backend-wasm-threaded-simd.wasm') },
  // 部分浏览器/工具链会额外取 gluescript，一并复制保证 public/vendor 可独立部署。
  { from: path.join(TFJS, 'dist', 'tf-backend-wasm.es2017.js'), to: path.join(OUT, 'vendor', 'tf-backend-wasm.es2017.js') },
  { from: path.join(FACE_API, 'model', 'tiny_face_detector_model-weights_manifest.json'), to: path.join(OUT, 'model', 'tiny_face_detector_model-weights_manifest.json') },
  { from: path.join(FACE_API, 'model', 'tiny_face_detector_model.bin'), to: path.join(OUT, 'model', 'tiny_face_detector_model.bin') },
  { from: path.join(FACE_API, 'model', 'face_recognition_model-weights_manifest.json'), to: path.join(OUT, 'model', 'face_recognition_model-weights_manifest.json') },
  { from: path.join(FACE_API, 'model', 'face_recognition_model.bin'), to: path.join(OUT, 'model', 'face_recognition_model.bin') }
];

let missing = 0;
for (const file of FILES) {
  if (!fs.existsSync(file.from)) {
    console.warn(`⚠ 缺少源文件：${path.relative(ROOT, file.from)}（请先 npm install）`);
    missing += 1;
    continue;
  }
  fs.mkdirSync(path.dirname(file.to), { recursive: true });
  fs.copyFileSync(file.from, file.to);
  const size = (fs.statSync(file.to).size / 1024).toFixed(0);
  console.log(`✓ ${path.relative(ROOT, file.to)} (${size} KB)`);
}

if (missing) {
  console.error(`\n有 ${missing} 个文件缺失，请先执行 npm install`);
  process.exit(1);
}
console.log('\n浏览器端人脸资源已就绪。');
