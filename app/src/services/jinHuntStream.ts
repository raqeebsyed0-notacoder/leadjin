/**
 * jinHuntStream.ts — SSE mount for the LeadJin hunt stream (dag: leadjin-prod2/be-stream)
 *
 * Exposes `createJinHuntStreamRouter(db, getUser)` which serves
 *   GET /hunt/stream        (mounted on the host's `/api/jin` router)
 * as a `text/event-stream` feed backed by the already-written
 * `createSSEFeed` helper in ./stream.js.
 *
 * A hunt/Jin run publishes progress onto the shared `huntBus` (via
 * `emitHuntEvent` / `getHuntBus`); each connected pane subscribes for the
 * life of its request and receives `start`/`step`/`progress`/`done`/`error`
 * events until the run finishes (or the client disconnects).
 */

import { Router, type Request, type Response } from 'express';
import Database from 'better-sqlite3';
import {
  createSSEFeed,
  EventBus,
  type StreamEvent,
} from './stream.js';

// One in-process bus shared by every hunt run and every connected pane.
const huntBus = new EventBus();

/** Publish a hunt progress event to every connected live pane. */
export function emitHuntEvent(event: StreamEvent): void {
  huntBus.emit(event);
}

/** The shared hunt event bus (for run orchestration to emit into). */
export function getHuntBus(): EventBus {
  return huntBus;
}

/**
 * Build an AsyncIterable whose `[Symbol.asyncIterator]()` always returns the
 * SAME iterator.  createSSEFeed calls that method on every `pull()`, so a
 * stable iterator is required for the feed to advance instead of replaying
 * the first event.  The generator unsubscribes from the bus when it ends.
 */
function makeHuntSource(bus: EventBus): AsyncIterable<StreamEvent> {
  const iterator = (async function* (): AsyncGenerator<StreamEvent> {
    for await (const event of bus) {
      yield event;
      if (event.kind === 'done' || event.kind === 'error') break;
    }
  })();
  return { [Symbol.asyncIterator]: () => iterator };
}

/**
 * Router for the live hunt feed.  Mounted by server.ts on `/api/jin`, so the
 * public endpoint is `GET /api/jin/hunt/stream`.
 */
export function createJinHuntStreamRouter(
  db: Database.Database,
  getUser: (req: Request) => any | null
): Router {
  const router = Router();

  router.get('/hunt/stream', (req: Request, res: Response) => {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ error: 'authentication required' });
      return;
    }

    const feed = createSSEFeed(makeHuntSource(huntBus));

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Drain the DOM ReadableStream into the Express response chunk by chunk.
    const reader = feed.getReader();
    const pump = async (): Promise<void> => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value !== undefined) res.write(value);
        }
      } catch {
        // Client disconnected or the source errored — close quietly.
      } finally {
        try { reader.releaseLock(); } catch { /* no-op */ }
        res.end();
      }
    };
    void pump();

    req.on('close', () => {
      try { void reader.cancel(); } catch { /* no-op */ }
    });
  });

  return router;
}
