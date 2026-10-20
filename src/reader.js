import { open } from 'node:fs/promises';
import { parseLine } from './parser.js';

export async function readSnapshot(path, maxBytes = 16 * 1024 * 1024, maxEvents = 50000) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('NOT_REGULAR_FILE');

    const start = Math.max(0, stat.size - maxBytes);
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, start + offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }

    let text = buffer.subarray(0, offset).toString('utf8');
    if (start > 0) {
      // The byte limit may cut through a line. Discard that first fragment.
      const firstNewline = text.indexOf('\n');
      text = firstNewline < 0 ? '' : text.slice(firstNewline + 1);
    }
    const lines = text.split('\n');
    const partial = lines.pop(); // Retry the unfinished last line on the next poll.
    const events = [];
    let invalid = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseLine(line);
      if (event) events.push(event);
      else invalid++;
    }

    return {
      events: events.slice(-maxEvents),
      invalid,
      truncated: start > 0 || events.length > maxEvents,
      partial: Boolean(partial),
      size: stat.size,
      readAt: new Date().toISOString(),
    };
  } finally {
    await file.close();
  }
}

export function createStore(path, maxBytes, maxEvents) {
  let state = { events: [], invalid: 0, error: 'WAITING', readAt: null };
  let pending;

  function refresh() {
    if (pending) return pending;

    pending = readSnapshot(path, maxBytes, maxEvents)
      .then(snapshot => {
        state = { ...snapshot, error: null };
      })
      .catch(error => {
        const code = ['ENOENT', 'EACCES', 'EPERM'].includes(error.code) ? error.code : 'READ_ERROR';
        // Keep the last successful snapshot while the journal is unavailable.
        state = { ...state, error: code };
      })
      .finally(() => {
        pending = null;
      });

    return pending;
  }

  return { get: () => state, refresh };
}
