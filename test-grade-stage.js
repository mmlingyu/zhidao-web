'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const G = require('./grade-profile.js');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) {
  const result = fn();
  const done = (result && typeof result.then === 'function') ? result : Promise.resolve();
  pending.push(done.then(() => {
    passed += 1;
    console.log('  ok ', name);
  }, error => {
    failed += 1;
    console.log('  FAIL', name, error && error.message);
  }));
}

const expected = {
  grade1: '一阶', grade2: '二阶', grade3: '三阶', grade4: '四阶', grade5: '五阶',
  grade6: '六阶', grade7: '七阶', grade8: '八阶', grade9: '九阶',
  senior1: '十阶', senior2: '十一阶', senior3: '十二阶'
};

test('一年级到高三依次对应虚拟阶段', () => {
  for (const [id, label] of Object.entries(expected)) {
    assert.equal(G.virtualStageForGrade(id), label);
  }
});

test('学前、空值和未知年级不编造阶段', () => {
  assert.equal(G.virtualStageForGrade('preschool'), null);
  assert.equal(G.virtualStageForGrade(''), null);
  assert.equal(G.virtualStageForGrade('kindergarten'), null);
  assert.equal(G.virtualStageForGrade('grade0'), null);
});

test('课程仍使用真实年级 id，一年级画像仍是启蒙期', () => {
  assert.equal(G.accountGrade({ user: { role: 'student', grade: 'grade1' } }), 'grade1');
  assert.equal(G.uiProfileForGrade('grade1').id, 'early');
  assert.notEqual(G.virtualStageForGrade('grade1'), 'grade1');
});

test('家长和游客没有学生年级', () => {
  assert.equal(G.accountGrade({ user: { role: 'parent', grade: 'grade3' } }), '');
  assert.equal(G.accountGrade(null), '');
  assert.equal(G.accountGrade({ user: { role: 'student', grade: '' } }), '');
});

test('首页不再放年级下拉，阶段逻辑留在已有脚本里', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.equal(html.includes('id="learner-grade"'), false);
  assert.match(html, /id="learner-stage"/);
  assert.match(html, /grade-profile\.js\?v=20261113stage/);
  assert.match(html, /learner\.js\?v=20261113stage/);
  assert.doesNotMatch(html, /src="\/tts\/grade-stage/);
});

function bootLearner() {
  const listeners = {};
  const elements = {};
  function make(id) {
    const node = {
      id, textContent: '', title: '', hidden: false, dataset: {}, classSet: new Set(),
      setAttribute() {},
      addEventListener(type, fn) { node.onclick = fn; }
    };
    node.classList = {
      toggle(name, on) { if (on) node.classSet.add(name); else node.classSet.delete(name); },
      contains(name) { return node.classSet.has(name); }
    };
    elements[id] = node;
    return node;
  }
  make('learner-stage');
  make('learner-stage-label');
  make('learner-stage-setup');
  make('id-entry');
  let session = null;
  const window = {
    IDENTITY: { current: () => session },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); }
  };
  window.ZHIDAO_GRADE = G;
  const document = {
    getElementById: id => elements[id] || null,
    documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } }
  };
  const localStorage = { getItem: () => null, removeItem() {}, setItem() {} };
  const fetch = async () => ({ json: async () => ({ grades: [] }) });
  class CustomEvent { constructor(type) { this.type = type; } }
  const sandbox = { window, document, localStorage, fetch, CustomEvent };
  vm.runInNewContext(fs.readFileSync('learner.js', 'utf8'), sandbox, { filename: 'learner.js' });
  return {
    window, elements,
    setSession(next) { session = next; },
    init() { return window.LEARNER.init(); },
    identityChanged() { window.dispatchEvent({ type: 'zhidao:identitychange' }); }
  };
}

test('未登录显示未设置年级，学生二年级登录后变成二阶且课程 id 不变', async () => {
  const page = bootLearner();
  await page.init();
  assert.equal(page.elements['learner-stage-label'].textContent, '未设置年级');
  assert.equal(page.elements['learner-stage-setup'].hidden, false);
  assert.equal(page.window.LEARNER.grade(), '');
  page.setSession({ user: { role: 'student', grade: 'grade2', name: '小明' } });
  page.identityChanged();
  assert.equal(page.elements['learner-stage-label'].textContent, '二阶');
  assert.equal(page.elements['learner-stage-setup'].hidden, true);
  assert.equal(page.window.LEARNER.grade(), 'grade2');
  assert.equal(page.window.LEARNER.stage(), 'early');
});

test('学前账号不显示编造阶段，年级 id 仍传给课程', async () => {
  const page = bootLearner();
  page.setSession({ user: { role: 'student', grade: 'preschool' } });
  await page.init();
  assert.equal(page.elements['learner-stage-label'].textContent, '学前不设阶段');
  assert.equal(page.window.LEARNER.grade(), 'preschool');
  assert.equal(page.window.LEARNER.virtualStage(), '');
});

Promise.all(pending).then(() => {
  if (failed) process.exitCode = 1;
  console.log(failed ? `grade stage tests failed (${failed})` : `grade stage tests passed (${passed})`);
});
