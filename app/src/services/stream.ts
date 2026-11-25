/**
 * stream.ts — LeadJin live-stream layer (dag: leadjin-wave2b / w2-stream)
 *
 * Self-contained SSE (text/event-stream) helper + tiny in-process event bus.
 *
 * A hunt/Jin run pushes progress events onto the `EventBus`; the SSE helper
 * turns a filtered feed of those events into a `text/event-stream` byte
 * stream that the "everything-live" pane subscribes to.  No runtime
 * dependencies — pure TypeScript, DOM lib only (`ReadableStream`) — so it
 * runs in Node (server.ts) and in the browser alike.
 *
 * Event vocabulary (what a run pushes through the bus):
 *   start   run started           { kind: 'start',  runId, name }
 *   step    phase completed       { kind: 'step',   runId, step, total?, label? }
 *   progress   tick               { kind: 'progress', runId, progress, detail? }
 *   done    run finished          { kind: 'done',   runId, ok, result? }
 *   error   run failed            { kind: 'error',  runId, error, message? }
 *
 * Imported by server.ts later as `'./src/services/stream.js'` (repo
 * `.js`-import convention; see server.ts entry-point imports).
 */

// Canonical event kinds, in delivery order.
export const STREAM_KINDS = ['start', 'step', 'progress', 'done', 'error'] as const;

export type StreamKind = (typeof STREAM_KINDS)[number];

/**
 * A single event pushed by a run through the bus.
 *
 * Every member is known statically; the `event:` line of the SSE feed
 * repeats `kind` so a listener can branch without inspecting the payload.
 */
export type StreamEvent =
  | { kind: 'start'; runId: string; name: string }
  | { kind: 'step'; runId: string; step: number; total?: number; label?: string }
  | { kind: 'progress'; runId: string; progress: number; detail?: string }
  | { kind: 'done'; runId: string; ok: boolean; result?: unknown }
  | { kind: 'error'; runId: string; error: string; message?: string };

/**
 * Escape a string so it is safe inside a single `data:` line.  SSE data
 * lines are strict; carriage returns and lone backslashes would otherwise
 * corrupt the framing.
 */
export function sseEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

/**
 * Format one StreamEvent as an SSE block:
 *
 *   event: <kind>\n
 *   data: <json>\n
 *   \n
 *
 * The trailing blank line terminates the event (mandatory per the SSE
 * spec).  A reader can parse `data:` with JSON.parse and branch on the
 * leading `event:` line.
 */
export function sseSerialize(event: StreamEvent): string {
  return `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
}

// -------------------------------------------------------------------------
// In-process event bus
// -------------------------------------------------------------------------

/**
 * Tiny in-memory publish/subscribe channel shared by runs and server.ts.
 *
 * Runs call `emit()`; server.ts subscribes per-connection (or per-run) and
 * forwards matching events to the live pane.  The bus keeps a bounded
 * ring so nothing grows without limit if a pane is slow.
 */
export class EventBus {
  private readonly handlers = new Map<StreamKind, Set<(event: StreamEvent) => void>>();
  private readonly queue: StreamEvent[] = [];
  private readonly MAX_QUEUE = 8192;
  private waiting: (() => void) | null = null;

  /**
   * Subscribe to one event kind.  Returns an unsubscribe function.
   * Subscribing to a kind with no existing set creates the set.
   */
  subscribe(kind: StreamKind, fn: (event: StreamEvent) => void): () => void {
    const existing = this.handlers.get(kind);
    const set = existing ?? new Set<(event: StreamEvent) => void>();
    if (!existing) this.handlers.set(kind, set);
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.handlers.delete(kind);
    };
  }

  /**
   * Push one event: synchronously notify all subscribers of its kind and
   * enqueue it for any async iterator over this bus.
   */
  emit(event: StreamEvent): void {
    if (this.queue.length < this.MAX_QUEUE) this.queue.push(event);
    const set = this.handlers.get(event.kind);
    if (set) set.forEach((fn) => fn(event));
    this.wake();
  }

  private wake(): void {
    const w = this.waiting;
    if (w !== null) {
      this.waiting = null;
      w();
    }
  }

  /**
   * Async iterable over events of a single kind.  Each item the consumer
   * asks for advances the queue, so a slow consumer naturally backpressures
   * subsequent events (bounded by the queue's limit).
   */
  pull(kind: StreamKind): AsyncIterable<StreamEvent> {
    return {
      [Symbol.asyncIterator]: () => {
        const queue = new AsyncQueue<StreamEvent>();
        const unsub = this.subscribe(kind, (event) => queue.enqueue(event));
        return queue[Symbol.asyncIterator]();
      },
    };
  }

  /**
   * Async iterator over EVERY event this bus has seen (live + buffered).
   * Backpressure-aware via the same queue as the per-kind pull.
   *
   * `for await (const e of bus)` drains the ring first and then blocks
   * in `next()` until the next event arrives, so a slow consumer back-
   * pressures upstream emitters.
   */
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    const queue = new AsyncQueue<StreamEvent>();
    const unsubs: (() => void)[] = [];
    for (const kind of STREAM_KINDS) {
      unsubs.push(this.subscribe(kind, (event: StreamEvent) => queue.enqueue(event)));
    }
    const iter = queue[Symbol.asyncIterator]();
    if (!iter) {
      return {
        next: () => Promise.resolve({ done: true, value: undefined as any }),
        return: () => Promise.resolve({ done: true, value: undefined as any }),
        throw: (_err: unknown) => Promise.resolve({ done: true, value: undefined as any }),
      };
    }
    return {
      next(): Promise<IteratorResult<StreamEvent>> {
        return iter.next();
      },
      return(): Promise<IteratorResult<StreamEvent>> {
        for (const unsub of unsubs) { try { unsub(); } catch { /* no-op */ } }
        return iter.return!();
      },
      throw(err: unknown): Promise<IteratorResult<StreamEvent>> {
        return iter.throw!(err);
      },
    };
  }
}

// -------------------------------------------------------------------------
// Async queue (backpressure-aware)
// -------------------------------------------------------------------------

/**
 * A bounded, backpressure-aware async iterable.  Consumers block on
 * `next()` until an item arrives (or the queue closes), so a slow consumer
 * stops upstream producers from running away.
 */
class AsyncQueue<T> {
  private items: T[] = [];
  private waiting: (() => void) | null = null;
  private closed = false;

  enqueue(item: T): void {
    if (this.items.length >= 4096) return; // bounded
    this.items.push(item);
    this.wake();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.wake();
  }

  private take(): T | undefined {
    return this.items.shift();
  }

  private wake(): void {
    const w = this.waiting;
    if (w !== null) {
      this.waiting = null;
      w();
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    const q = this;
    return {
      async next(): Promise<IteratorResult<T>> {
        const item = q.take();
        if (item !== undefined) return { value: item, done: false };
        if (q.closed) return { value: undefined as unknown as T, done: true };
        await new Promise<void>((resolve) => {
          q.waiting = () => {
            resolve();
          };
        });
        const nextItem = q.take();
        if (nextItem !== undefined) return { value: nextItem, done: false };
        if (q.closed) return { value: undefined as unknown as T, done: true };
        // Should not be reachable: a waiter is only set when an item is
        // pending or the queue is closing.
        return { value: undefined as unknown as T, done: true };
      },
      return(): Promise<IteratorResult<T>> {
        q.closed = true;
        if (q.waiting !== null) {
          const w = q.waiting;
          q.waiting = null;
          w();
        }
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      },
      throw(err: unknown): Promise<IteratorResult<T>> {
        q.closed = true;
        if (q.waiting !== null) {
          const w = q.waiting;
          q.waiting = null;
          w();
        }
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      },
    };
  }
}

// -------------------------------------------------------------------------
// SSE feed
// -------------------------------------------------------------------------

/**
 * Turn an async iterable of StreamEvents into a `ReadableStream<string>` of
 * SSE text.  Suitable for `new Response(stream, { headers: ... })` or for
 * a later Node wiring step to pipe into an HTTP response.
 *
 * The source is drained lazily: the stream only asks for the next event
 * once the previous chunk was consumed, so a slow consumer applies
 * backpressure.
 */
export function createSSEFeed(source: AsyncIterable<StreamEvent>): ReadableStream<string> {
  return new ReadableStream<string>(
    {
      async pull(controller): Promise<void> {
        const iterator = source[Symbol.asyncIterator]();
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(sseSerialize(next.value));
      },
      cancel(): void {
        // The source owns its iterator; nothing to tear down here.  If the
        // source allocates resources (e.g. open handles), they should be
        // cleaned up by the source itself.
      },
    },
    { highWaterMark: 4096 }
  );
}

/**
 * Convenience: subscribe an `EventBus` to one or more kinds and stream the
 * matching events as SSE text.  The returned stream stays open while the
 * connection is alive; it closes when the source is cancelled.
 *
 * Usage (later node, in server.ts):
 *
 *   const feed = createBusSSEFeed(bus, ['start', 'step', 'progress', 'done', 'error']);
 *   const es = new Response(feed, { headers: { 'Content-Type': 'text/event-stream' } });
 */
export function createBusSSEFeed(
  bus: EventBus,
  kinds: readonly StreamKind[] = STREAM_KINDS
): ReadableStream<string> {
  return createSSEFeed({
    async *[Symbol.asyncIterator]() {
      const unsubs: (() => void)[] = [];
      const queue = new AsyncQueue<StreamEvent>();
      try {
        // Subscribe to each kind; every emitted event is queued, and a final
        // `done`/`error` event ends the stream (a run's completion closes it).
        for (const kind of kinds) {
          unsubs.push(
            bus.subscribe(kind, (event: StreamEvent) => {
              queue.enqueue(event);
              if (event.kind === 'done' || event.kind === 'error') {
                queue.close();
              }
            })
          );
        }
        for await (const event of queue) {
          yield event;
          if (event.kind === 'done' || event.kind === 'error') {
            break;
          }
        }
      } finally {
        for (const unsub of unsubs) {
          try {
            unsub();
          } catch {
            // no-op
          }
        }
      }
    },
  });
}
