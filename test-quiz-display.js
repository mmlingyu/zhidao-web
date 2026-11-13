const assert = require('node:assert/strict');
const { normalizeQuiz, normalizeQuizzes, highlightBlanks, resolveAnswer, isCorrectChoice } = require('./quiz-display');

// Canonical fill-in-the-blank still works
const blank = normalizeQuiz({
  sentence: 'Please ___ your homework.',
  cn: '请做你的作业。',
  choices: ['make', 'do', 'have'],
  answer: 'do',
  explain: 'do homework 是固定搭配。'
});
assert.equal(blank.sentence, 'Please ___ your homework.');
assert.equal(blank.cn, '请做你的作业。');
assert.deepEqual(blank.choices, ['make', 'do', 'have']);
assert.equal(blank.hasBlank, true);
assert.equal(highlightBlanks('Please ___ your homework.'), 'Please <span>___</span> your homework.');
assert.equal(highlightBlanks('A ____ and ＿＿ b'), 'A <span>___</span> and <span>___</span> b');

// The dining-scene shape: question + options, no sentence/cn — this is what left the stem blank
const dining = normalizeQuiz({
  question: '在点餐时，哪一句是更礼貌的表达？',
  options: ['A. I would like water.', 'B. Can I get a drink?', 'C. I want to eat.'],
  answer: 'A. I would like water.'
});
assert.equal(dining.sentence, '在点餐时，哪一句是更礼貌的表达？');
assert.equal(dining.cn, '');
assert.equal(dining.choices.length, 3);
assert.equal(dining.choices[1], 'B. Can I get a drink?');
assert.equal(dining.answer, 'A. I would like water.');

// Nested option objects and prompt alias
const nested = normalizeQuiz({
  prompt: 'Which greeting is polite in a restaurant?',
  options: [{ text: 'Give me food.' }, { label: 'Could I have a menu, please?' }, 'I want.'],
  correct: 'Could I have a menu, please?',
  explanation: 'Could I 更礼貌。'
});
assert.equal(nested.sentence, 'Which greeting is polite in a restaurant?');
assert.deepEqual(nested.choices, ['Give me food.', 'Could I have a menu, please?', 'I want.']);
assert.equal(nested.answer, 'Could I have a menu, please?');
assert.equal(nested.explain, 'Could I 更礼貌。');

// Only choices: still show a readable fallback stem, never an empty h4
const fallback = normalizeQuiz({ choices: ['hello', 'hi'] });
assert.equal(fallback.sentence, '请选择更合适的表达');
assert.deepEqual(fallback.choices, ['hello', 'hi']);

// Long stem is kept in full (wrapping is CSS); do not truncate
const long = '在西餐厅点餐时，如果想礼貌地要一杯水，下面哪一句更合适？请结合场合和语气判断。'.repeat(3);
assert.equal(normalizeQuiz({ stem: long }).sentence, long);

// Chinese lesson shape from cache: question + options
const chinese = normalizeQuizzes([
  { question: '这首诗中哪句最能描绘孤独？', options: ['床前明月光', '举头望明月'], answer: '床前明月光' }
]);
assert.equal(chinese[0].sentence, '这首诗中哪句最能描绘孤独？');
assert.deepEqual(chinese[0].choices, ['床前明月光', '举头望明月']);

// Escape safety: highlightBlanks must not undo escaping
assert.equal(highlightBlanks('1 &lt; 2 ___ 3'), '1 &lt; 2 <span>___</span> 3');

// cn that merely repeats the stem is dropped so the UI does not show a duplicate line
const dup = normalizeQuiz({ sentence: '选一选', cn: '选一选' });
assert.equal(dup.sentence, '选一选');
assert.equal(dup.cn, '');


// 坐公交真实课：答案只给字母「B」，选项是「B. 看公交牌」——旧逻辑会把每一个选项都判错
const bus = normalizeQuiz({
  question: '在公交车上，你应该先做什么？',
  choices: ['A. 找座位', 'B. 看公交牌', 'C. 买票'],
  answer: 'B'
});
assert.equal(bus.answer, 'B. 看公交牌');
assert.equal(bus.answerResolved, true);
assert.equal(bus.answerMethod, 'label');
assert.equal(isCorrectChoice('B. 看公交牌', 'B', bus.choices), true);
assert.equal(isCorrectChoice('A. 找座位', 'B', bus.choices), false);
assert.equal(isCorrectChoice('C. 买票', 'B', bus.choices), false);

// 字母带点和全角标点
assert.equal(resolveAnswer(['A. 找座位', 'B. 看公交牌', 'C. 买票'], 'B.').choice, 'B. 看公交牌');
assert.equal(resolveAnswer(['A. 找座位', 'B. 看公交牌', 'C. 买票'], 'Ｂ、').choice, 'B. 看公交牌');
assert.equal(resolveAnswer(['A. 找座位', 'B. 看公交牌', 'C. 买票'], '(B)').choice, 'B. 看公交牌');

// 答案是不带标号的选项正文
assert.equal(resolveAnswer(['A. 找座位', 'B. 看公交牌', 'C. 买票'], '看公交牌').choice, 'B. 看公交牌');
assert.equal(resolveAnswer(['A. 找座位', 'B. 看公交牌', 'C. 买票'], 'A.找座位').choice, 'A. 找座位');

// 纯字母对没有标号的选项：B → 第二项
assert.equal(resolveAnswer(['The table is empty.', 'The table is full.', 'We are sitting on the floor.'], 'B').choice, 'The table is full.');
assert.equal(resolveAnswer(['The table is empty.', 'The table is full.', 'We are sitting on the floor.'], '2').choice, 'The table is full.');

// 答案是选项的唯一子串（金色 vs 金色的皮肤）
assert.equal(resolveAnswer(['金子', '金色的皮肤', '财富', '他是金子'], '金色').choice, '金色的皮肤');

// 对不上任何选项：不要假装某一项是对的
const miss = resolveAnswer(['焦虑', '平静', '热情', '懒散'], '精益求精');
assert.equal(miss.index, -1);
assert.equal(miss.method, 'unresolved');
assert.equal(isCorrectChoice('焦虑', '精益求精', ['焦虑', '平静', '热情', '懒散']), false);
assert.equal(normalizeQuiz({ options: ['焦虑', '平静'], answer: '精益求精' }).answerResolved, false);

// 已经对齐的选项保持不变
assert.equal(normalizeQuiz({
  choices: ['金钱', '美丽和魅力', '石头'],
  answer: '美丽和魅力'
}).answer, '美丽和魅力');

console.log('quiz-display tests passed');

