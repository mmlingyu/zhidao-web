'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const V = require('./voice.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('  ok ', name);
}

test('第一句先出，后面的句子再排队', () => {
  const chunks = V.splitSpeakChunks('Hello world. This is the longer second sentence about sprinting.');
  assert.equal(chunks[0], 'Hello world.');
  assert.ok(chunks.length >= 2);
  assert.match(chunks.slice(1).join(' '), /second sentence/);
});

test('中文第一句单独成段', () => {
  const chunks = V.splitSpeakChunks('先来看跑步。然后我们再讲冲刺。');
  assert.equal(chunks[0], '先来看跑步。');
  assert.equal(chunks[1], '然后我们再讲冲刺。');
});

test('小数点和短缩写不被当成句号', () => {
  const chunks = V.splitSpeakChunks('3.14 is pi. Mr. Smith runs next.');
  assert.equal(chunks[0], '3.14 is pi.');
  assert.equal(chunks[1], 'Mr. Smith runs next.');
});

test('算式留在同一小段里', () => {
  const head = 'The answer is 3 + 5 = 8 and then we compare it with 12 - 3 = 9 ';
  const tail = 'while the class keeps talking about running and sprinting without another stop';
  const chunks = V.splitSpeakChunks(head + tail);
  assert.ok(chunks.length >= 2, '长句要切开才能先出声');
  assert.ok(chunks[0].length <= 80, chunks[0]);
  const joined = chunks.join(' | ');
  assert.match(joined, /3 \+ 5 = 8/);
  assert.match(joined, /12 - 3 = 9/);
  for (const chunk of chunks) {
    assert.ok(!/^[+＋\-−×÷*=＝]/.test(chunk), chunk);
    assert.ok(!/[+＋\-−×÷*=＝]$/.test(chunk.trim()), chunk);
  }
});

test('很短的算式整段保留', () => {
  assert.deepEqual(V.splitSpeakChunks('3 + 5 = 8'), ['3 + 5 = 8']);
});

test('空文本没有分段', () => {
  assert.deepEqual(V.splitSpeakChunks('   '), []);
});

test('默认仍是离线，引擎走页面外的客户端', () => {
  const source = fs.readFileSync('voice.js', 'utf8');
  assert.match(source, /mode: 'offline'/);
  assert.match(source, /offline-client\.js\?v=20261113resp/);
  assert.match(source, /af_maple/);
  assert.match(source, /zf_001/);
  assert.equal(V.status().mode, 'offline');
});

console.log(`speech chunk tests passed (${passed})`);
