'use strict';
const assert = require('assert');
const V = require('./voice.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok ', name); }
  catch (err) { failed += 1; console.log('  FAIL', name, err.message); }
}

test('containsChinese 逐字检测基本汉字与扩展 A', () => {
  assert.equal(V.containsChinese('Look at the bus sign first.'), false);
  assert.equal(V.containsChinese('play / do / go'), false);
  assert.equal(V.containsChinese('123 ...'), false);
  assert.equal(V.containsChinese(''), false);
  assert.equal(V.containsChinese('春眠不觉晓'), true);
  assert.equal(V.containsChinese('这个 play 怎么用'), true);
  assert.equal(V.containsChinese('Look at the bus. 先看公交牌。'), true);
  // U+3400 扩展 A 起点、U+9FA5 基本汉字终点
  assert.equal(V.containsChinese('\u3400'), true);
  assert.equal(V.containsChinese('\u9FA5'), true);
  assert.equal(V.containsChinese('\u9FA6'), false);
  assert.equal(V.containsChinese('\u33FF'), false);
});

test('纯英文走英语', () => {
  assert.equal(V.detectLang('Look at the bus sign first.'), 'en');
  assert.equal(V.isAllEnglish('Let us play football'), true);
  assert.equal(V.detectLang('play / do / go'), 'en');
});

test('纯中文走语文', () => {
  assert.equal(V.detectLang('春眠不觉晓'), 'zh');
  assert.equal(V.isAllEnglish('春眠不觉晓'), false);
});

test('中英混合一律走语文，不再按字母数量多数决', () => {
  assert.equal(V.detectLang('这个 play 怎么用'), 'zh');
  // 英文远多于中文，旧逻辑会误判成 en
  const mixed = 'Look at the bus sign first. Please show your pass. 先看公交牌。';
  assert.equal(V.detectLang(mixed), 'zh');
  assert.equal(V.isAllEnglish(mixed), false);
  const intro = '先来看：坐公交车的英语。在公交车上，你应该先看站牌，再上车找座位。Look at the bus sign first.';
  assert.equal(V.detectLang(intro), 'zh');
});

test('只有数字标点按中文配置，避免误用英文音色', () => {
  assert.equal(V.detectLang('123 ...'), 'zh');
  assert.equal(V.detectLang(''), 'zh');
});

V.configure({ mode: 'browser', voice: 'zf_042', subjectVoices: { english: 'af_maple', chinese: 'zm_009', math: 'auto' } });

test('英语课全部英文才用 Phonon（af_maple）', () => {
  assert.equal(V.resolveVoice('Look at the bus sign first.', 'english'), 'af_maple');
});

test('英语课中英混合改走语文学科音色', () => {
  assert.equal(V.resolveVoice('Look at the bus sign first. 先看公交牌。', 'english'), 'zm_009');
  assert.equal(V.resolveVoice('先来看：坐公交。Look at the bus sign first.', 'english'), 'zm_009');
  assert.equal(V.resolveVoice('我们今天学英语', 'english'), 'zm_009');
});

test('语文槽位为 auto 时，混合文本跟随默认中文音色', () => {
  V.configure({ voice: 'zf_042', subjectVoices: { english: 'af_maple', chinese: 'auto' } });
  assert.equal(V.resolveVoice('Look at the bus. 先看公交牌。', 'english'), 'zf_042');
});

test('开读硬门槛：中英混合绝不用英文音色，即使被强制指定 Phonon', () => {
  V.configure({ voice: 'zf_042', subjectVoices: { english: 'af_maple', chinese: 'zm_009' } });
  const intro = '先来看：坐公交车的英语。Look at the bus sign first.';
  assert.equal(V.voiceForSpeech(intro, 'english'), 'zm_009');
  assert.equal(V.voiceForSpeech(intro, 'english', 'af_maple'), 'zm_009');
  assert.notEqual(V.voiceLang(V.voiceForSpeech(intro, 'english', 'af_maple')), 'en');
  assert.equal(V.voiceForSpeech('Look at the bus sign first.', 'english'), 'af_maple');
  assert.equal(V.voiceForSpeech('Look at the bus sign first.', 'english', 'af_maple'), 'af_maple');
});


test('朗读去掉填空符，保留数字和运算符号', () => {
  assert.equal(V.prepareSpeakText('3 + 5 = 8'), '3 + 5 = 8');
  assert.equal(V.prepareSpeakText('12-3=9'), '12-3=9');
  assert.equal(V.prepareSpeakText('x × y ÷ 2 = 6'), 'x × y ÷ 2 = 6');
  assert.equal(V.prepareSpeakText('三角形内角和是 180°'), '三角形内角和是 180°');
  assert.equal(V.prepareSpeakText('填空：3 + ____ = 8'), '填空：3 + = 8');
  assert.equal(V.prepareSpeakText('请填空：□ + 5 = 8'), '请填空： + 5 = 8');
  assert.equal(V.prepareSpeakText('1. 春眠不觉晓 ______。'), '1. 春眠不觉晓 。');
  assert.equal(V.prepareSpeakText('完成句子：I would like _______ a cup of tea.'), '完成句子：I would like a cup of tea.');
  assert.equal(V.prepareSpeakText('6 —— 2 = 4'), '6 2 = 4'); // 连续破折号当填空去掉，单个减号保留
  assert.equal(V.prepareSpeakText('6 - 2 = 4'), '6 - 2 = 4');
  assert.equal(V.prepareSpeakText('先看公交牌。Look at the bus sign first.'), '先看公交牌。Look at the bus sign first.');
  assert.equal(V.prepareSpeakText(''), '');
});

test('清洗后语种判定不变：混合仍走语文，纯英文仍走英语', () => {
  assert.equal(V.detectLang(V.prepareSpeakText('Look at the bus. 先看公交牌。____')), 'zh');
  assert.equal(V.detectLang(V.prepareSpeakText('Look at the bus sign first. ______')), 'en');
  assert.equal(V.detectLang(V.prepareSpeakText('3 + ____ = 8')), 'zh');
});

console.log(`\n语种判定：${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
