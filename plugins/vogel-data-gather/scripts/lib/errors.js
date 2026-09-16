'use strict';

/**
 * Turns MongoDB driver errors into something a non-technical manager can act on.
 *
 * The rule here: every message says what went wrong in ordinary words and then
 * gives exactly one concrete next action. Managers cannot debug a stack trace,
 * and a message with three possible causes and no instruction is the same as no
 * message at all.
 *
 * We never retry with different credentials. There is one read-only user; if it
 * is rejected, that is a fact to report, not a thing to work around.
 */

const { credentialFilePath } = require('./credentials');

function describeConnectionError(err) {
  const name = err && err.name ? String(err.name) : '';
  const message = err && err.message ? String(err.message) : String(err);
  const lower = message.toLowerCase();
  const codeName = (err && (err.codeName || err.code)) || '';

  // --- Authentication -----------------------------------------------------
  if (
    name === 'MongoServerError' &&
    (codeName === 'AuthenticationFailed' || err.code === 18 || lower.includes('authentication failed'))
  ) {
    return {
      code: 'AUTH_FAILED',
      message:
        'The database rejected the username and password in your credentials file.\n\n' +
        'Next step: ask the VHP Dev Team for a fresh connection string and replace the ' +
        `line in ${credentialFilePath()}. I will not try other credentials on my own.`,
    };
  }

  if (lower.includes('not authorized') || codeName === 'Unauthorized' || err.code === 13) {
    return {
      code: 'NOT_AUTHORIZED',
      message:
        'The database accepted your login but will not let that account read this data.\n\n' +
        'Next step: ask the VHP Dev Team to confirm your read-only account has access to ' +
        'this collection.',
    };
  }

  // --- Network / allowlist ------------------------------------------------
  if (
    name === 'MongoServerSelectionError' ||
    name === 'MongoNetworkTimeoutError' ||
    name === 'MongoNetworkError' ||
    lower.includes('server selection timed out') ||
    lower.includes('connection timed out') ||
    lower.includes('etimedout') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset')
  ) {
    return {
      code: 'NETWORK_OR_IP',
      message:
        'I could not reach the database. Nine times out of ten this is the Atlas IP ' +
        'allowlist: the database only accepts connections from approved internet addresses, ' +
        'and the one this computer is using right now is not on the list. It changes when you ' +
        'work from home, use a hotspot, or switch VPN.\n\n' +
        'Next step: send the VHP Dev Team the address shown at https://whatismyipaddress.com ' +
        'and ask them to add it to Atlas Network Access. If you are on the office network and ' +
        'this still happens, tell them the office IP stopped working.',
    };
  }

  if (
    lower.includes('enotfound') ||
    lower.includes('getaddrinfo') ||
    lower.includes('querysrv') ||
    lower.includes('eai_again')
  ) {
    return {
      code: 'HOST_NOT_FOUND',
      message:
        'This computer could not look up the database address. That usually means the ' +
        'internet connection is down, or the server name in your credentials file has a typo.\n\n' +
        'Next step: check that you can load a normal website. If the internet is fine, ask the ' +
        'VHP Dev Team to re-send the connection string.',
    };
  }

  if (name === 'MongoParseError' || lower.includes('invalid connection string')) {
    return {
      code: 'URI_INVALID',
      message:
        'The connection string in your credentials file is not formatted correctly, so I ' +
        'could not even attempt to connect.\n\n' +
        `Next step: ask the VHP Dev Team to re-send it, and paste it into ${credentialFilePath()} ` +
        'on a single line with no quotes around it.',
    };
  }

  if (lower.includes('ssl') || lower.includes('tls') || lower.includes('certificate')) {
    return {
      code: 'TLS_FAILED',
      message:
        'The secure connection to the database could not be established. On a company laptop ' +
        'this is usually security software inspecting network traffic.\n\n' +
        'Next step: tell the VHP Dev Team you are getting a TLS/certificate error connecting to ' +
        'Atlas, and mention whether you are on VPN.',
    };
  }

  // --- Anything else ------------------------------------------------------
  return {
    code: 'UNKNOWN',
    message:
      'Something went wrong talking to the database and I do not recognize the problem.\n\n' +
      `Technical detail to pass along: ${name ? name + ': ' : ''}${message}\n\n` +
      'Next step: send that line to the VHP Dev Team.',
  };
}

function collectionNotFoundMessage(requested, available) {
  const list = available && available.length ? available.join(', ') : '(none configured yet)';
  return {
    code: 'COLLECTION_NOT_FOUND',
    message:
      `There is no "${requested}" data set set up in this plugin, so I do not know how to ` +
      'pull it.\n\n' +
      `What I can pull right now: ${list}\n\n` +
      'Next step: if the data you want lives somewhere else in the database, ask the VHP Dev ' +
      'Team to add a definition file for it — no changes to this plugin are needed, they just ' +
      'drop in a new file.',
  };
}

function collectionMissingInDatabaseMessage(collection) {
  return {
    code: 'COLLECTION_MISSING_IN_DB',
    message:
      `This plugin is set up to read a collection called "${collection}", but the database ` +
      'does not have one by that name.\n\n' +
      'Next step: tell the VHP Dev Team that the definition file for ' +
      `"${collection}" points at a collection that no longer exists.`,
  };
}

function emptyResultMessage(collection, describedFilter) {
  return (
    `No ${collection} records matched${describedFilter ? ` ${describedFilter}` : ''}. ` +
    'The query ran fine — there is just nothing there.\n\n' +
    'Next step: try a wider date range or fewer conditions, or tell me what you expected to ' +
    'see and I will check whether I filtered on the wrong field.'
  );
}

module.exports = {
  describeConnectionError,
  collectionNotFoundMessage,
  collectionMissingInDatabaseMessage,
  emptyResultMessage,
};
