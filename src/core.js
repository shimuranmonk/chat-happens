export class CleanupError extends Error {
  constructor(message, { status = 'failed', halt = true } = {}) {
    super(message);
    this.status = status;
    this.halt = halt;
  }
}

export class BatchRunner {
  running = false;
  stopped = false;
  results = [];
  constructor({ delay = 0 } = {}) { this.delay = delay; }

  stop() { this.stopped = true; }

  async run(items, action, adapter, onProgress = () => {}) {
    if (this.running) throw new Error('A batch is already running.');
    if (!['archive', 'delete'].includes(action)) throw new Error('Unsupported action.');
    if (!items.length || new Set(items.map(x => x.id)).size !== items.length) {
      throw new Error('Select a nonempty set of distinct conversations.');
    }
    const snapshot = Object.freeze(items.map(x => Object.freeze({ id: x.id, title: x.title })));
    this.running = true;
    this.stopped = false;
    this.results = snapshot.map(item => ({ ...item, status: 'pending', detail: '' }));
    const publish = () => onProgress(this.results.map(x => ({ ...x })));
    try {
      publish();
      for (const result of this.results) {
        if (this.stopped) {
          result.status = 'stopped before processing';
          publish();
          continue;
        }
        result.status = 'processing';
        publish();
        try {
          const outcome = await adapter.perform(result, action, () => this.stopped);
          if (!outcome || outcome.status !== 'succeeded') {
            throw new CleanupError('The action outcome could not be verified.', { status: 'outcome unknown' });
          }
          result.status = 'succeeded';
          result.detail = outcome.detail;
        } catch (error) {
          result.status = error instanceof CleanupError ? error.status : 'outcome unknown';
          result.detail = error.message || String(error);
          if (!(error instanceof CleanupError) || error.halt) this.stopped = true;
        }
        publish();
        if (!this.stopped && this.delay > 0) await new Promise(resolve => setTimeout(resolve, this.delay));
      }
      return this.results.map(x => ({ ...x }));
    } finally {
      this.running = false;
    }
  }
}
