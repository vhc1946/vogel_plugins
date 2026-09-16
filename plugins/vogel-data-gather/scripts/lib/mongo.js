'use strict';

/**
 * The only place that talks to MongoDB.
 *
 * Two rules are enforced here rather than left to callers:
 *   - the connection is always closed, including on failure, because a leaked
 *     client keeps an Atlas connection slot busy for everyone else;
 *   - a failed connection is never retried with different credentials. There is
 *     one read-only account; if it is rejected, that is news to report, not a
 *     condition to work around.
 */

const { loadConnectionString } = require('./credentials');
const { describeConnectionError } = require('./errors');

/** Short enough that a manager on a bad network gets an answer, not a hang. */
const CONNECT_TIMEOUT_MS = 15000;
const SERVER_SELECTION_TIMEOUT_MS = 15000;

function requireDriver() {
  try {
    return require('mongodb');
  } catch {
    return null;
  }
}

/**
 * Opens a connection, hands it to `fn`, and closes it no matter what.
 * @returns {Promise<{ok: true, value: any} | {ok: false, code: string, message: string}>}
 */
async function withDatabase(fn) {
  const driver = requireDriver();
  if (!driver) {
    return {
      ok: false,
      code: 'DRIVER_MISSING',
      message:
        'The database library this plugin needs is not installed yet.\n\n' +
        'Next step: open a terminal in the plugin folder and run   npm install   once. ' +
        'If that fails, send the error to the VHP Dev Team.',
    };
  }

  const creds = loadConnectionString();
  if (!creds.ok) return creds;

  const client = new driver.MongoClient(creds.uri, {
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    readPreference: 'secondaryPreferred',
    appName: 'vogel-data-gather',
  });

  try {
    await client.connect();
    const db = client.db(); // database comes from the connection string
    const value = await fn(db, driver);
    return { ok: true, value };
  } catch (err) {
    return Object.assign({ ok: false }, describeConnectionError(err));
  } finally {
    try {
      await client.close();
    } catch {
      /* closing a half-open client can throw; nothing useful to do about it */
    }
  }
}

module.exports = { withDatabase, requireDriver, CONNECT_TIMEOUT_MS, SERVER_SELECTION_TIMEOUT_MS };
