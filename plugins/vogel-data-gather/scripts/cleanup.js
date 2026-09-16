#!/usr/bin/env node
'use strict';

/**
 * Deletes gathered data.
 *
 *   node scripts/cleanup.js --session <id>   remove one session's files
 *   node scripts/cleanup.js --all            remove every session's files
 *   node scripts/cleanup.js --stale          remove only sessions left behind
 *
 * Run --session at the end of a conversation. The data was only ever meant to
 * live as long as the questions being asked about it.
 */

const fs = require('fs');
const session = require('./lib/session');

const argv = process.argv.slice(2);
const idx = argv.indexOf('--session');
const sessionId = idx !== -1 ? argv[idx + 1] : null;

if (argv.includes('--all')) {
  const base = session.root();
  if (fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
    process.stdout.write('Removed all gathered data from this computer.\n');
  } else {
    process.stdout.write('There was no gathered data to remove.\n');
  }
} else if (argv.includes('--stale')) {
  const removed = session.sweepStale();
  process.stdout.write(
    removed.length ? `Removed ${removed.length} leftover session folder(s).\n` : 'No leftover session folders.\n'
  );
} else if (sessionId) {
  const result = session.cleanupSession(sessionId);
  process.stdout.write(
    result.removed
      ? `Removed the gathered data for session ${sessionId}.\n`
      : `Nothing to remove — session ${sessionId} has no files.\n`
  );
} else {
  process.stdout.write('Usage: node scripts/cleanup.js --session <id> | --all | --stale\n');
  process.exit(1);
}
