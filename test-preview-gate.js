'use strict';
const assert = require('node:assert/strict');
const gate = require('./lesson-preview-gate.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('  ok ', name);
}

test('标题或导语没闭合时不提前出卡', () => {
  assert.equal(gate.bannerFieldsClosed({ bannerTitle: 'Run', description: '' }), false);
  assert.equal(gate.bannerFieldsClosed({ bannerTitle: '', description: 'A runner moves fast.' }), false);
  assert.equal(gate.previewReady({ subject: 'english', data: { bannerTitle: 'Run', description: '' } }), false);
});

test('英语导语成句后才通过预览门', () => {
  const partial = { subject: 'english', data: { bannerTitle: 'Sprint', description: 'Run' } };
  assert.equal(gate.englishPreviewReady(partial), false);
  const ready = { subject: 'english', data: { bannerTitle: 'Sprint', description: 'Sprint means to run very fast.' } };
  assert.equal(gate.previewReady(ready), true);
});

test('英语导语没收句时，即使有词条或凑满字数也不出卡', () => {
  const withItem = {
    subject: 'english',
    data: { bannerTitle: 'Run', description: 'short text', items: [{ word: 'sprint' }] }
  };
  const longFragment = {
    subject: 'english',
    data: { bannerTitle: 'Sprint', description: 'Sprint means to run very fast today' }
  };
  assert.equal(gate.previewReady(withItem), false);
  assert.equal(gate.previewReady(longFragment), false);
});

test('显式 bannerFieldsClosed:false 或 fullEnglishPreview:false 挡住出卡', () => {
  const data = { bannerTitle: 'Sprint', description: 'Sprint means to run very fast.' };
  assert.equal(gate.previewReady({ subject: 'english', bannerFieldsClosed: false, data }), false);
  assert.equal(gate.previewReady({ subject: 'english', fullEnglishPreview: false, data }), false);
  assert.equal(gate.bannerFieldsClosed(data), true);
});

test('英语第一部分加上收句导语可以出卡', () => {
  const payload = {
    subject: 'english',
    data: {
      bannerTitle: 'Run',
      description: 'A sprint is a short run.',
      items: [{ word: 'sprint' }]
    }
  };
  assert.equal(gate.previewReady(payload), true);
});

test('语文只要横幅字段闭合就可以出卡', () => {
  const payload = { subject: 'chinese', data: { bannerTitle: '跑步', description: '先看这个词' } };
  assert.equal(gate.bannerFieldsClosed(payload.data), true);
  assert.equal(gate.previewReady(payload), true);
});

console.log(`preview gate tests passed (${passed})`);
