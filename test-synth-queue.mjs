import assert from 'node:assert/strict';
import { createSynthQueue } from './public/tts/synth-queue.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let active = 0;
let maxActive = 0;
const results = [];
const cancels = [];
let releaseFirst;
const queue = createSynthQueue(job => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  const done = job.requestId === 1
    ? new Promise(resolve => { releaseFirst = () => resolve(`audio-${job.requestId}`); })
    : wait(5).then(() => `audio-${job.requestId}`);
  return done.finally(() => { active -= 1; });
});

queue.enqueue({
  requestId: 1,
  onResult: value => results.push(value),
  onCancel: () => cancels.push(1)
});
queue.enqueue({
  requestId: 2,
  onResult: value => results.push(value),
  onCancel: () => cancels.push(2)
});
queue.enqueue({
  requestId: 3,
  onResult: value => results.push(value),
  onCancel: () => cancels.push(3)
});
await wait(10);
assert.equal(active, 1, 'only one synthesis runs at a time');
queue.cancel([1, 3]);
releaseFirst();
await wait(30);
assert.deepEqual(results, ['audio-2']);
assert.deepEqual(cancels.sort(), [1, 3]);
assert.equal(maxActive, 1);
assert.equal(queue.activeId, 0);
console.log('synth queue tests passed');
