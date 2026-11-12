/* 拉取「浏览器离线语音合成」所需的大文件（模型 + 音色）
 *
 * 模型来源：onnx-community/Kokoro-82M-v1.1-zh-ONNX（固定 revision，保证可复现）
 * 落地目录：public/tts/models/<model-id>/… 与 public/tts/voices/<voice>.bin
 *
 * 为什么本地放模型：知岛要在没有外网、没有 8880 语音服务时也能朗读；
 * 浏览器首次从本站拉模型，之后由浏览器缓存，之后完全离线。
 *
 * 用法：node fetch-tts-model.js            # 拉模型 + 全部音色
 *      node fetch-tts-model.js --voices    # 只补音色（模型已存在时）
 *      node fetch-tts-model.js --model     # 只拉模型
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const REPO = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
const REVISION = '6cc0f0d2ebe369a68b0df87c2b65c1af8c0ac3e3';
const ROOT = path.join(__dirname, 'public', 'tts');
const MODEL_DIR = path.join(ROOT, 'models', ...REPO.split('/'));
const VOICE_DIR = path.join(ROOT, 'voices');

/* 与 voice.js 的 103 个音色保持一致；离线模式下英文/中文音色都能用。 */
const VOICES = [
  'af_maple', 'af_sol', 'bf_vale',
  'zf_001', 'zf_002', 'zf_003', 'zf_004', 'zf_005', 'zf_006', 'zf_007', 'zf_008', 'zf_017', 'zf_018', 'zf_019',
  'zf_021', 'zf_022', 'zf_023', 'zf_024', 'zf_026', 'zf_027', 'zf_028', 'zf_032', 'zf_036', 'zf_038', 'zf_039',
  'zf_040', 'zf_042', 'zf_043', 'zf_044', 'zf_046', 'zf_047', 'zf_048', 'zf_049', 'zf_051', 'zf_059', 'zf_060',
  'zf_067', 'zf_070', 'zf_071', 'zf_072', 'zf_073', 'zf_074', 'zf_075', 'zf_076', 'zf_077', 'zf_078', 'zf_079',
  'zf_083', 'zf_084', 'zf_085', 'zf_086', 'zf_087', 'zf_088', 'zf_090', 'zf_092', 'zf_093', 'zf_094', 'zf_099',
  'zm_009', 'zm_010', 'zm_011', 'zm_012', 'zm_013', 'zm_014', 'zm_015', 'zm_016', 'zm_020', 'zm_025', 'zm_029',
  'zm_030', 'zm_031', 'zm_033', 'zm_034', 'zm_035', 'zm_037', 'zm_041', 'zm_045', 'zm_050', 'zm_052', 'zm_053',
  'zm_054', 'zm_055', 'zm_056', 'zm_057', 'zm_058', 'zm_061', 'zm_062', 'zm_063', 'zm_064', 'zm_065', 'zm_066',
  'zm_068', 'zm_069', 'zm_080', 'zm_081', 'zm_082', 'zm_089', 'zm_091', 'zm_095', 'zm_096', 'zm_097', 'zm_098', 'zm_100'
];

const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model.onnx'
];

function download(url, target, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(target) && fs.statSync(target).size > 0) {
      console.log(`  已存在 ${path.relative(__dirname, target)}（${(fs.statSync(target).size / 1048576).toFixed(1)} MB）`);
      return resolve(fs.statSync(target).size);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const request = https.get(url, { headers: { 'User-Agent': 'zhidao-build/1.0' } }, response => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects > 5) return reject(new Error('重定向次数过多'));
        // 相对地址要基于当前 URL 解析，否则 https.get 会抛 Invalid URL。
        let next = response.headers.location;
        try { next = new URL(next, url).href; } catch { /* 保持原样 */ }
        return resolve(download(next, target, redirects + 1));
      }
      if (status !== 200) {
        response.resume();
        return reject(new Error(`HTTP ${status} ${url}`));
      }
      const total = Number(response.headers['content-length'] || 0);
      let received = 0;
      let lastPrint = 0;
      const temp = `${target}.part`;
      const file = fs.createWriteStream(temp);
      response.on('data', chunk => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastPrint > 2000) {
          lastPrint = now;
          const pct = total ? ` (${(received / total * 100).toFixed(1)}%)` : '';
          process.stdout.write(`  下载中 ${path.basename(target)}${pct} ${(received / 1048576).toFixed(1)} MB\r`);
        }
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.renameSync(temp, target);
          console.log(`  完成 ${path.relative(__dirname, target)}（${(received / 1048576).toFixed(1)} MB）`);
          resolve(received);
        });
      });
      file.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(120000, () => request.destroy(new Error('下载超时')));
  });
}

(async () => {
  const args = process.argv.slice(2);
  const onlyVoices = args.includes('--voices');
  const onlyModel = args.includes('--model');
  console.log('离线语音资源准备中…');

  if (!onlyVoices) {
    console.log('模型文件：');
    for (const file of FILES) {
      const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${file}`;
      await download(url, path.join(MODEL_DIR, ...file.split('/')));
    }
  }

  if (!onlyModel) {
    console.log('音色文件：');
    for (const voice of VOICES) {
      const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/voices/${voice}.bin`;
      await download(url, path.join(VOICE_DIR, `${voice}.bin`));
    }
  }

  console.log('\n资源就绪：');
  console.log(`  模型目录 ${path.relative(__dirname, MODEL_DIR)}`);
  console.log(`  音色目录 ${path.relative(__dirname, VOICE_DIR)}（${VOICES.length} 个）`);
  console.log('  接着执行 node build-tts.js 生成浏览器引擎包。');
})().catch(error => {
  console.error('准备失败：', error.message);
  process.exitCode = 1;
});
