/**
 * memory-tiers.test.ts — F3+F4 acceptance for T1/T2/T3.
 * In-memory SQLite only; no network, no shared DB, no .env writes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  deleteMemory,
  ensureSchema,
  listAudit,
  listMemory,
  noopOperatorNotes,
  readMemory,
  resolveOperatorNotes,
  writeMemory,
} from '../src/services/memoryTiers.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('T1 product memory', () => {
  it('round-trips a write and read, and lists rows', () => {
    expect(readMemory(db, 'missing')).toBeNull();
    const result = writeMemory(db, 'company.name', 'SABIC', 'alice');
    expect(result.ok).toBe(true);
    expect(result.before).toBeNull();
    expect(result.after).toBe('SABIC');
    expect(readMemory(db, 'company.name')).toBe('SABIC');
    expect(listMemory(db)).toEqual([
      { key: 'company.name', value: 'SABIC', updated_at: result.at },
    ]);
  });

  it('overwrites on conflict and refuses an empty key', () => {
    writeMemory(db, 'k', 'v1', 'alice');
    const second = writeMemory(db, 'k', 'v2', 'bob');
    expect(second.before).toBe('v1');
    expect(readMemory(db, 'k')).toBe('v2');
    expect(() => writeMemory(db, '  ', 'x')).toThrow(TypeError);
  });

  it('creates its schema idempotently on repeated use', () => {
    expect(() => {
      ensureSchema(db);
      ensureSchema(db);
      writeMemory(db, 'a', 'b');
      listMemory(db);
      listAudit(db);
    }).not.toThrow();
  });
});

describe('T2 memory audit', () => {
  it('writes exactly one audit row per T1 write, with actor/before/after', () => {
    expect(listAudit(db)).toHaveLength(0);
    const first = writeMemory(db, 'k', 'v1', 'alice');
    const rows = listAudit(db, 'k');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'k',
      actor: 'alice',
      at: first.at,
      before: null,
      after: 'v1',
    });

    const second = writeMemory(db, 'k', 'v2', 'bob');
    const rows2 = listAudit(db, 'k');
    expect(rows2).toHaveLength(2);
    expect(rows2[1]).toMatchObject({ actor: 'bob', before: 'v1', after: 'v2', at: second.at });
    expect(rows2[1].id).toBeGreaterThan(rows2[0].id);
  });

  it('audits deletes with after = null and removes the T1 row', () => {
    writeMemory(db, 'k', 'v', 'alice');
    const deleted = deleteMemory(db, 'k', 'carol');
    expect(deleted.after).toBeNull();
    expect(deleted.before).toBe('v');
    expect(readMemory(db, 'k')).toBeNull();
    expect(listAudit(db, 'k')).toHaveLength(2);
    expect(listAudit(db, 'k')[1]).toMatchObject({ actor: 'carol', after: null });
  });
});

describe('T3 operator notes', () => {
  it('no-op adapter stores nothing and returns an empty list', async () => {
    const notes = resolveOperatorNotes();
    expect(notes).toBe(noopOperatorNotes);
    await notes.put('a note that must not be stored');
    await notes.put('another note');
    expect(await notes.search('note')).toEqual([]);
    expect(await notes.search('')).toEqual([]);
  });

  it('uses an injected operator store when one is present', async () => {
    const calls: string[] = [];
    const store = {
      async put(note: string) {
        calls.push(note);
      },
      async search(q: string) {
        return [`match:${q}`];
      },
    };
    const notes = resolveOperatorNotes(store);
    expect(notes).toBe(store);
    await notes.put('hello');
    expect(calls).toEqual(['hello']);
    expect(await notes.search('world')).toEqual(['match:world']);
  });
});
