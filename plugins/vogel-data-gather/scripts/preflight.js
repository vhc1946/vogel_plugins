#!/usr/bin/env node
'use strict';

/**
 * One command that answers "is this computer able to pull company data?"
 *
 * Run it before the first gather of a session. Each check prints a verdict and,
 * when it fails, exactly what to do next — so a manager can forward one block of
 * text to the dev team instead of describing a symptom.
 *
 *   node scripts/preflight.js           human-readable
 *   node scripts/preflight.js --json    machine-readable, same checks
 */

const fs = require('fs');
const path = require('path');
const { loadConnectionString, credentialFilePath, ENV_FILE_KEY, SETUP_INSTRUCTIONS } = require('./lib/credentials');
const { requireDriver, withDatabase } = require('./lib/mongo');
const schemas = require('./lib/schemas');

const asJson = process.argv.includes('--json');
const checks = [];

function record(name, ok, detail, nextStep) {
  checks.push({ name, ok, detail, nextStep: ok ? null : nextStep || null });
}

async function main() {
  // 1. Node ---------------------------------------------------------------
  const major = Number(process.versions.node.split('.')[0]);
  record(
    'Node.js installed',
    major >= 18,
    `Node ${process.versions.node}`,
    'Node.js 18 or newer is required. Install the LTS version from https://nodejs.org, ' +
      'restart Claude, and try again.'
  );

  // 2. Driver -------------------------------------------------------------
  const driver = requireDriver();
  record(
    'Database library installed',
    Boolean(driver),
    driver ? 'mongodb driver found' : 'mongodb driver not found',
    'Open a terminal in the plugin folder and run   npm install   once.'
  );

  // 3. Collection definitions --------------------------------------------
  const { schemas: defs, problems } = schemas.loadAll();
  record(
    'Collection definitions load',
    problems.length === 0 && defs.length > 0,
    defs.length
      ? `${defs.length} definition file(s): ${defs.map((d) => d.collection).join(', ')}`
      : 'No usable definition files found in schemas/.',
    problems.length
      ? 'Send these to the VHP Dev Team:\n  - ' + problems.join('\n  - ')
      : 'Add at least one collection definition to the schemas folder. See schemas/README.md.'
  );

  // 4. Credentials --------------------------------------------------------
  const creds = loadConnectionString();
  record(
    'Credentials found',
    creds.ok,
    creds.ok ? `Read from ${creds.source}` : creds.message.split('\n')[0],
    creds.ok ? null : creds.message
  );

  // 5. Connection ---------------------------------------------------------
  if (creds.ok && driver) {
    const result = await withDatabase(async (db) => {
      await db.command({ ping: 1 });
      const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
      return { database: db.databaseName, collections: names };
    });

    if (result.ok) {
      record('Database reachable', true, `Connected to "${result.value.database}"`);

      const present = new Set(result.value.collections);
      const missing = defs.filter((d) => !present.has(d.collection)).map((d) => d.collection);
      record(
        'Configured collections exist',
        missing.length === 0,
        missing.length
          ? `Not found in the database: ${missing.join(', ')}`
          : 'Every configured collection is present.',
        `Tell the VHP Dev Team that these definition files point at collections that are not ` +
          `in the database: ${missing.join(', ')}.`
      );
    } else {
      record('Database reachable', false, result.message.split('\n')[0], result.message);
    }
  } else {
    record('Database reachable', false, 'Skipped — fix the checks above first.', 'Fix the checks above first.');
  }

  report();
}

function report() {
  const allOk = checks.every((c) => c.ok);

  if (asJson) {
    process.stdout.write(JSON.stringify({ ok: allOk, checks }, null, 2) + '\n');
  } else {
    const lines = ['Vogel data gathering — readiness check', ''];
    for (const c of checks) {
      lines.push(`${c.ok ? '[ ok ]' : '[FAIL]'} ${c.name}`);
      if (c.detail) lines.push(`        ${c.detail}`);
      if (!c.ok && c.nextStep) {
        lines.push('');
        for (const l of c.nextStep.split('\n')) lines.push(`        ${l}`);
        lines.push('');
      }
    }
    lines.push('');
    lines.push(allOk ? 'Everything is ready. You can ask for company data now.' : 'Not ready yet — see the failed check above.');
    process.stdout.write(lines.join('\n') + '\n');
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  const message =
    'The readiness check itself crashed, which should not happen.\n\n' +
    `Technical detail to pass along: ${err && err.stack ? err.stack : err}\n\n` +
    'Next step: send that to the VHP Dev Team.';
  if (asJson) {
    process.stdout.write(JSON.stringify({ ok: false, checks, fatal: message }, null, 2) + '\n');
  } else {
    process.stdout.write(message + '\n');
  }
  process.exit(1);
});
