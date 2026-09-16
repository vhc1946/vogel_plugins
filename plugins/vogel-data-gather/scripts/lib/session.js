'use strict';

/**
 * Session-scoped storage and the cache manifest.
 *
 * Everything this plugin downloads is temporary on purpose. Company data
 * sitting in a folder on five managers' laptops indefinitely is a liability
 * nobody asked for, so results live in one directory keyed to the session and
 * are deleted when the session ends. If a manager wants something durable they
 * produce a report from it — that is a deliberate, visible act.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT_NAME = 'vogel-data-gather';
const MANIFEST_NAME = 'manifest.json';
/** Stale sessions are swept after this long, in case a session ended abruptly. */
const STALE_AFTER_MS = 18 * 60 * 60 * 1000;

function root() {
  return path.join(os.tmpdir(), ROOT_NAME);
}

function newSessionId() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Resolves the session id in this order: an explicit --session value, the
 * host's own session id if it exposes one, otherwise a fresh id. The skill
 * passes the id it got back from the first call, which keeps every pull in one
 * conversation sharing one cache.
 */
function resolveSessionId(explicit) {
  if (explicit) return String(explicit);
  if (process.env.VOGEL_GATHER_SESSION_ID) return process.env.VOGEL_GATHER_SESSION_ID;
  if (process.env.CLAUDE_SESSION_ID) return String(process.env.CLAUDE_SESSION_ID).slice(0, 32);
  return newSessionId();
}

function sessionDir(sessionId) {
  return path.join(root(), `session-${sessionId}`);
}

function ensureSession(sessionId) {
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    writeManifest(dir, { sessionId, createdAt: new Date().toISOString(), entries: {} });
  }
  return dir;
}

function readManifest(dir) {
  const p = path.join(dir, MANIFEST_NAME);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { sessionId: path.basename(dir).replace(/^session-/, ''), createdAt: new Date().toISOString(), entries: {} };
  }
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Records a completed pull. `truncated` is stored because it governs reuse:
 * a pull that hit its limit is an incomplete picture of the database, so
 * narrowing it in memory would produce an answer that looks authoritative and
 * is not. gather.js refuses to reuse truncated entries for that reason.
 */
function recordEntry(dir, hash, entry) {
  const manifest = readManifest(dir);
  manifest.entries[hash] = Object.assign({ hash, gatheredAt: new Date().toISOString() }, entry);
  writeManifest(dir, manifest);
  return manifest.entries[hash];
}

function entries(dir) {
  return Object.values(readManifest(dir).entries || {});
}

/** Deletes one session's directory. */
function cleanupSession(sessionId) {
  const dir = sessionDir(sessionId);
  if (!fs.existsSync(dir)) return { removed: false, dir };
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: true, dir };
}

/** Best-effort sweep of sessions left behind by a crash or a hard shutdown. */
function sweepStale(now = Date.now()) {
  const base = root();
  if (!fs.existsSync(base)) return [];
  const removed = [];
  for (const name of fs.readdirSync(base)) {
    if (!name.startsWith('session-')) continue;
    const dir = path.join(base, name);
    try {
      const stat = fs.statSync(dir);
      if (now - stat.mtimeMs > STALE_AFTER_MS) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed.push(dir);
      }
    } catch {
      /* another process may have removed it; nothing to do */
    }
  }
  return removed;
}

module.exports = {
  ROOT_NAME,
  STALE_AFTER_MS,
  root,
  newSessionId,
  resolveSessionId,
  sessionDir,
  ensureSession,
  readManifest,
  writeManifest,
  recordEntry,
  entries,
  cleanupSession,
  sweepStale,
};
