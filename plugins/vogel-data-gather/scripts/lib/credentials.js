'use strict';

/**
 * Finds the MongoDB connection string.
 *
 * Order:
 *   1. ~/.vogel/mongo.env   (the supported way — one KEY=VALUE per line)
 *   2. VOGEL_MONGO_URI      (environment variable fallback)
 *
 * The connection string is never logged, never echoed back, and never written
 * anywhere. Everything here returns either the URI or a plain-English problem
 * description that the skill can read out loud to a manager.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_FILE_KEY = 'VOGEL_MONGO_URI';

function credentialFilePath() {
  return path.join(os.homedir(), '.vogel', 'mongo.env');
}

/**
 * Parses a .env-style file. Tolerates blank lines, # comments, `export ` prefixes,
 * and values wrapped in single or double quotes — managers copy these by hand and
 * quoting mistakes should not turn into a cryptic failure.
 */
function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const SETUP_INSTRUCTIONS = [
  'How to set it up (one time, takes about two minutes):',
  '',
  '  1. Open File Explorer and type this in the address bar, then press Enter:',
  '         %USERPROFILE%',
  '  2. Create a new folder there called   .vogel   (include the leading dot).',
  '  3. Inside that folder create a file called   mongo.env',
  '     (make sure Windows does not save it as mongo.env.txt).',
  '  4. Put exactly one line in it:',
  '         VOGEL_MONGO_URI=mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/DATABASE',
  '  5. Ask the VHP Dev Team for the real connection string to paste in.',
  '',
  'Then ask me again and I will pick it up automatically.',
].join('\n');

/**
 * @returns {{ok: true, uri: string, source: string} | {ok: false, code: string, message: string}}
 */
function loadConnectionString() {
  const file = credentialFilePath();

  if (fs.existsSync(file)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      return {
        ok: false,
        code: 'CREDENTIALS_UNREADABLE',
        message:
          `Your credentials file exists at ${file} but Windows would not let me read it ` +
          `(${err.code || err.message}).\n\n` +
          'Next step: make sure the file is not open in another program, then try again. ' +
          'If it keeps failing, ask the VHP Dev Team to check the file permissions.',
      };
    }

    const parsed = parseEnvFile(text);
    const uri = parsed[ENV_FILE_KEY];

    if (!uri) {
      const foundKeys = Object.keys(parsed);
      return {
        ok: false,
        code: 'CREDENTIALS_MISSING_KEY',
        message:
          `I found your credentials file at ${file}, but it does not contain a line ` +
          `starting with ${ENV_FILE_KEY}=.\n` +
          (foundKeys.length
            ? `What it does contain: ${foundKeys.join(', ')}\n`
            : 'The file looks empty.\n') +
          '\nNext step: open that file and make sure it has one line that looks like this:\n' +
          `    ${ENV_FILE_KEY}=mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/DATABASE`,
      };
    }

    const shapeProblem = describeUriShapeProblem(uri);
    if (shapeProblem) {
      return {
        ok: false,
        code: 'CREDENTIALS_MALFORMED',
        message:
          `I found your credentials file at ${file}, but the connection string in it ` +
          `does not look right: ${shapeProblem}\n\n` +
          'Next step: ask the VHP Dev Team to send you the connection string again and ' +
          'paste it in without adding quotes, spaces, or line breaks.',
      };
    }

    return { ok: true, uri, source: file };
  }

  const fromEnv = process.env[ENV_FILE_KEY];
  if (fromEnv) {
    const shapeProblem = describeUriShapeProblem(fromEnv);
    if (shapeProblem) {
      return {
        ok: false,
        code: 'CREDENTIALS_MALFORMED',
        message:
          `The ${ENV_FILE_KEY} environment variable on this computer does not look like a ` +
          `MongoDB connection string: ${shapeProblem}\n\n` +
          'Next step: ask the VHP Dev Team for the correct connection string.',
      };
    }
    return { ok: true, uri: fromEnv, source: `${ENV_FILE_KEY} environment variable` };
  }

  return {
    ok: false,
    code: 'CREDENTIALS_NOT_FOUND',
    message:
      'I could not find your database credentials, so I cannot pull company data yet.\n\n' +
      `I looked for a file at:\n    ${file}\n` +
      `and for an environment variable named ${ENV_FILE_KEY}. Neither is set up on this computer.\n\n` +
      SETUP_INSTRUCTIONS,
  };
}

function describeUriShapeProblem(uri) {
  if (typeof uri !== 'string' || uri.trim() === '') return 'it is empty.';
  const trimmed = uri.trim();
  if (!/^mongodb(\+srv)?:\/\//i.test(trimmed)) {
    return 'it does not start with mongodb:// or mongodb+srv://.';
  }
  if (/\s/.test(trimmed)) {
    return 'it contains a space or a line break.';
  }
  if (trimmed.includes('USER:PASSWORD') || trimmed.includes('<password>')) {
    return 'it still has the placeholder text in it instead of the real username and password.';
  }
  return null;
}

/** Removes the password from a URI so it is safe to mention in a message. */
function redact(uri) {
  try {
    return String(uri).replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:*****@');
  } catch {
    return '(connection string)';
  }
}

module.exports = {
  ENV_FILE_KEY,
  SETUP_INSTRUCTIONS,
  credentialFilePath,
  loadConnectionString,
  parseEnvFile,
  redact,
};
