/* Single-flight synthesis queue. ONNX cannot be aborted mid-call; cancelled ids
 * are dropped before start and discarded when a running call returns. */
export function createSynthQueue(run) {
  const cancelled = new Set();
  const queue = [];
  let running = false;
  let activeId = 0;

  function cancel(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    for (const id of list) {
      if (id != null) cancelled.add(id);
    }
  }

  function enqueue(job) {
    queue.push(job);
    pump();
  }

  function pump() {
    if (running) return;
    running = true;
    const step = () => {
      while (queue.length && cancelled.has(queue[0].requestId)) {
        const skipped = queue.shift();
        try { skipped.onCancel?.(); } catch { /* listener */ }
      }
      const job = queue.shift();
      if (!job) {
        running = false;
        activeId = 0;
        return;
      }
      activeId = job.requestId;
      Promise.resolve()
        .then(() => {
          if (cancelled.has(job.requestId)) {
            const error = new Error('cancelled');
            error.cancelled = true;
            throw error;
          }
          return run(job);
        })
        .then(result => {
          if (cancelled.has(job.requestId)) job.onCancel?.();
          else job.onResult?.(result);
        })
        .catch(error => {
          if (cancelled.has(job.requestId) || error?.cancelled) job.onCancel?.();
          else job.onError?.(error);
        })
        .then(() => {
          if (activeId === job.requestId) activeId = 0;
          step();
        });
    };
    step();
  }

  return {
    enqueue,
    cancel,
    get activeId() { return activeId; },
    get queued() { return queue.length; }
  };
}
