/* 构建「浏览器离线语音合成」引擎
 *
 * 产物（都不手改，重新跑本脚本即可）：
 *   public/tts/kokoro-tts.js   —— esbuild 打包的浏览器引擎（无界面，只暴露 API）
 *   public/tts/ort/*.wasm|mjs  —— ONNX Runtime 运行时
 *
 * 依赖来源按顺序找：TTS_DEPS_DIR 环境变量 → 本项目 node_modules →
 * D:\aispace\chickadee\extension\node_modules（@uzen/kokoro-js 与 esbuild 装在那里）。
 *
 * 用法：node build-tts.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, 'public', 'tts');
const ENTRY = path.join(__dirname, 'tts', 'engine.entry.js');
const CANDIDATES = [
  process.env.TTS_DEPS_DIR,
  path.join(__dirname, 'node_modules'),
  'D:/aispace/chickadee/extension/node_modules'
].filter(Boolean);

function findDeps() {
  for (const dir of CANDIDATES) {
    const kokoro = path.join(dir, '@uzen', 'kokoro-js');
    const esbuild = path.join(dir, 'esbuild');
    if (fs.existsSync(kokoro) && fs.existsSync(esbuild)) return { dir, kokoro, esbuild };
  }
  return null;
}

(async () => {
  const deps = findDeps();
  if (!deps) {
    console.error('找不到依赖：需要 esbuild 与 @uzen/kokoro-js。');
    console.error('已尝试：', CANDIDATES.join('\n           '));
    console.error('可用 TTS_DEPS_DIR 环境变量指定依赖目录。');
    process.exitCode = 1;
    return;
  }
  console.log('依赖目录：', deps.dir);

  const esbuild = require(deps.esbuild);
  fs.mkdirSync(OUT, { recursive: true });

  await esbuild.build({
    entryPoints: [ENTRY],
    outfile: path.join(OUT, 'kokoro-tts.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    nodePaths: [path.join(deps.kokoro, 'node_modules'), deps.dir],
    minify: false,
    sourcemap: false,
    logLevel: 'info',
    define: { 'process.env.NODE_ENV': '"production"' }
  });

  // ONNX Runtime 运行时：与参考工程一致，整套复制，避免运行期缺文件。
  const dist = path.join(deps.kokoro, 'node_modules', 'onnxruntime-web', 'dist');
  if (!fs.existsSync(dist)) {
    console.error('找不到 onnxruntime-web：', dist);
    process.exitCode = 1;
    return;
  }
  const ortOut = path.join(OUT, 'ort');
  fs.mkdirSync(ortOut, { recursive: true });
  const assets = fs.readdirSync(dist).filter(name => /^ort-wasm.*\.(wasm|mjs)$/.test(name));
  for (const name of assets) fs.copyFileSync(path.join(dist, name), path.join(ortOut, name));
  if (!assets.some(name => name.includes('asyncify.wasm'))) {
    console.error('缺少 asyncify WASM，离线合成会失败。');
    process.exitCode = 1;
    return;
  }

  const size = fs.statSync(path.join(OUT, 'kokoro-tts.js')).size;
  console.log(`\n引擎已生成：public/tts/kokoro-tts.js（${(size / 1048576).toFixed(1)} MB）`);
  console.log(`运行时已复制：public/tts/ort/（${assets.length} 个文件）`);
  console.log('提示：模型与音色还需执行 node fetch-tts-model.js 准备。');
})().catch(error => {
  console.error('构建失败：', error);
  process.exitCode = 1;
});
