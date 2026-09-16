#!/usr/bin/env node
'use strict';

/**
 * Offline checks for the parts that are easy to get subtly wrong: the filter
 * language, the cache hash, the narrowing rule, and CSV escaping.
 *
 * No database, no credentials — this runs anywhere, which is the point. It is
 * how you confirm a change to lib/filters.js did not quietly make the cache
 * disagree with MongoDB.
 *
 *   node scripts/selftest.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const filters = require('./lib/filters');
const output = require('./lib/output');
const schemas = require('./lib/schemas');
const session = require('./lib/session');

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${err.message}`);
  }
}

// --- filter language --------------------------------------------------------

check('bare value is shorthand for $eq', () => {
  assert.deepStrictEqual(filters.canonicalizeFilter({ status: 'open' }), { status: { $eq: 'open' } });
});

check('canonical form is order-independent', () => {
  const a = filters.requestHash({ collection: 'c', filter: { b: 1, a: 2 }, fields: ['y', 'x'] });
  const b = filters.requestHash({ collection: 'c', filter: { a: 2, b: 1 }, fields: ['x', 'y'] });
  assert.strictEqual(a, b);
});

check('$in member order does not change the hash', () => {
  const a = filters.requestHash({ collection: 'c', filter: { s: { $in: ['a', 'b'] } }, fields: ['x'] });
  const b = filters.requestHash({ collection: 'c', filter: { s: { $in: ['b', 'a'] } }, fields: ['x'] });
  assert.strictEqual(a, b);
});

check('different filters hash differently', () => {
  const a = filters.requestHash({ collection: 'c', filter: { s: 'open' }, fields: ['x'] });
  const b = filters.requestHash({ collection: 'c', filter: { s: 'closed' }, fields: ['x'] });
  assert.notStrictEqual(a, b);
});

check('unsupported operators are rejected rather than passed through', () => {
  assert.throws(() => filters.canonicalizeFilter({ x: { $where: '1' } }), /does not support/);
});

check('comparison operators evaluate in memory', () => {
  const row = { amount: 500, status: 'sold', tags: ['a', 'b'], note: 'Henderson job' };
  assert.ok(filters.matches(row, { amount: { $gte: 500 } }));
  assert.ok(!filters.matches(row, { amount: { $gt: 500 } }));
  assert.ok(filters.matches(row, { status: { $in: ['sold', 'quoted'] } }));
  assert.ok(filters.matches(row, { status: { $nin: ['cancelled'] } }));
  assert.ok(filters.matches(row, { tags: 'b' }), 'array membership should match a bare value');
  assert.ok(filters.matches(row, { note: { $regex: 'henderson' } }), 'regex should be case-insensitive');
  assert.ok(filters.matches(row, { missing: { $exists: false } }));
  assert.ok(!filters.matches(row, { amount: { $exists: false } }));
});

check('ISO date strings compare as dates, not as text', () => {
  const row = { soldAt: '2026-03-15T00:00:00.000Z' };
  assert.ok(filters.matches(row, { soldAt: { $gte: '2026-03-01', $lt: '2026-04-01' } }));
  assert.ok(!filters.matches(row, { soldAt: { $gte: '2026-04-01' } }));
});

check('date fields are converted to Date objects for the driver', () => {
  const mongo = filters.toMongo({ soldAt: { $gte: '2026-03-01' } }, { soldAt: { type: 'date' } });
  assert.ok(mongo.soldAt.$gte instanceof Date);
  const asText = filters.toMongo({ name: { $gte: '2026-03-01' } }, { name: { type: 'string' } });
  assert.strictEqual(typeof asText.name.$gte, 'string');
});

check('$regex becomes a case-insensitive RegExp for the driver', () => {
  const mongo = filters.toMongo({ name: { $regex: 'smith' } }, {});
  assert.ok(mongo.name.$regex instanceof RegExp);
  assert.ok(mongo.name.$regex.test('SMITH & Sons'));
});

// --- the narrowing rule -----------------------------------------------------

check('adding a condition counts as narrower', () => {
  assert.ok(filters.isNarrowerOrEqual({ status: 'sold', branch: 'South' }, { status: 'sold' }));
});

check('an identical filter counts as narrower-or-equal', () => {
  assert.ok(filters.isNarrowerOrEqual({ status: 'sold' }, { status: 'sold' }));
});

check('dropping a condition is not narrower', () => {
  assert.ok(!filters.isNarrowerOrEqual({ status: 'sold' }, { status: 'sold', branch: 'South' }));
});

check('a changed value is not narrower', () => {
  assert.ok(!filters.isNarrowerOrEqual({ status: 'quoted' }, { status: 'sold' }));
});

check('implication is deliberately not inferred', () => {
  // $gte 500 really does imply $gte 100, but claiming so would mean trusting a
  // comparison the cache cannot verify per row. Conservative is correct here.
  assert.ok(!filters.isNarrowerOrEqual({ amount: { $gte: 500 } }, { amount: { $gte: 100 } }));
});

// --- CSV --------------------------------------------------------------------

check('CSV escapes commas, quotes and newlines', () => {
  const csv = output.toCsv(
    [{ name: 'Smith, John', note: 'said "yes"', extra: 'line1\nline2' }],
    ['name', 'note', 'extra']
  );
  assert.ok(csv.includes('"Smith, John"'));
  assert.ok(csv.includes('"said ""yes"""'));
  assert.ok(csv.includes('"line1\nline2"'));
});

check('CSV renders empty, nested and date values predictably', () => {
  const csv = output.toCsv(
    [{ a: null, b: { x: 1 }, c: new Date('2026-03-01T00:00:00.000Z') }],
    ['a', 'b', 'c']
  );
  const dataRow = csv.split('\r\n')[1];
  assert.ok(dataRow.startsWith(','), 'null should render as an empty cell');
  assert.ok(dataRow.includes('2026-03-01T00:00:00.000Z'));
});

check('sample rows are capped in both count and cell size', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: i, blob: 'x'.repeat(500) }));
  const samples = output.sampleRows(rows, ['id', 'blob'], 5);
  assert.strictEqual(samples.length, 5);
  assert.ok(samples[0].blob.length <= 121);
});

// --- schema loading ---------------------------------------------------------

check('the shipped example schemas are valid', () => {
  const { schemas: defs, problems } = schemas.loadAll();
  assert.deepStrictEqual(problems, [], 'expected no problems: ' + problems.join(' | '));
  assert.ok(defs.length >= 2, 'expected at least the two example definitions');
});

check('every named query in every schema builds with its own example params', () => {
  const { schemas: defs } = schemas.loadAll();
  const examples = {
    branch: 'South County',
    role: 'BEE Tech',
    since: '2026-01-01',
    month: '2026-03',
    salesRep: 'Example Rep',
    from: '2026-03-01',
    to: '2026-03-31',
  };
  for (const def of defs) {
    for (const [name, q] of Object.entries(def.queries || {})) {
      const params = {};
      for (const key of Object.keys(q.params || {})) {
        if (key in examples) params[key] = examples[key];
      }
      const built = q.build(params);
      assert.ok(built && typeof built === 'object', `${def.collection} / ${name} returned nothing`);
      // A built filter must survive canonicalization, or it uses an operator
      // the cache cannot evaluate.
      filters.canonicalizeFilter(built.filter || {});
      for (const f of filters.fieldsUsedBy(built.filter || {})) {
        assert.ok(def.fields[f], `${def.collection} / ${name} filters on unknown field "${f}"`);
      }
      for (const f of built.fields || []) {
        assert.ok(def.fields[f], `${def.collection} / ${name} returns unknown field "${f}"`);
      }
    }
  }
});

check('a malformed definition file is reported, not crashed on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-schema-'));
  const file = path.join(dir, 'broken.js');
  fs.writeFileSync(file, "module.exports = { collection: 'x' };");
  const problems = schemas.validate(require(file), file);
  assert.ok(problems.length >= 4, 'expected complaints about every missing key');
  assert.ok(problems.every((p) => p.startsWith('broken.js:')), 'every problem should name the file');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- session manifest -------------------------------------------------------

check('the manifest records and returns entries', () => {
  const id = 'selftest-' + Date.now();
  const dir = session.ensureSession(id);
  session.recordEntry(dir, 'abc123', {
    collection: 'salesOrders',
    filter: filters.canonicalizeFilter({ status: 'sold' }),
    fields: ['orderNumber'],
    storedFields: ['orderNumber', 'status'],
    rowCount: 10,
    truncated: false,
    jsonPath: path.join(dir, 'x.json'),
    csvPath: path.join(dir, 'x.csv'),
  });
  const entries = session.entries(dir);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].rowCount, 10);
  session.cleanupSession(id);
  assert.ok(!fs.existsSync(dir), 'cleanup should remove the session folder');
});

// --- report -----------------------------------------------------------------

const lines = [`${passed} check(s) passed`];
if (failures.length) {
  lines.push(`${failures.length} FAILED:`);
  for (const f of failures) lines.push(`  - ${f}`);
}
process.stdout.write(lines.join('\n') + '\n');
process.exit(failures.length ? 1 : 0);
