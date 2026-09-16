#!/usr/bin/env node
'use strict';

/**
 * Pulls one data set into the session and reports a summary.
 *
 * Usage:
 *   node scripts/gather.js --request-file <path-to-request.json> [--session <id>] [--json]
 *   node scripts/gather.js --request '<json>' [--session <id>]
 *   echo '<json>' | node scripts/gather.js --session <id>
 *
 * A request file is the reliable way to call this — Windows shells mangle
 * inline JSON, and a manager watching the screen should never see a quoting
 * error from a tool that is supposed to be invisible.
 *
 * Request shape (every key except "collection" is optional):
 *   {
 *     "collection": "serviceCalls",
 *     "query":      "open calls by branch",
 *     "params":     { "branch": "South" },
 *     "filter":     { "status": "open", "total": { "$gte": 500 } },
 *     "fields":     ["callNumber", "status", "total"],
 *     "timeRange":  { "from": "2026-01-01", "to": "2026-03-31" },
 *     "sort":       { "openedAt": -1 },
 *     "limit":      500
 *   }
 *
 * What this prints is deliberately small: field list, row count, and a few
 * sample rows. The full result goes to a file. Pouring thousands of records
 * into a conversation costs a fortune, pushes out the context that makes the
 * follow-up questions good, and helps nobody — the manager cannot read them
 * either.
 */

const fs = require('fs');

const schemas = require('./lib/schemas');
const session = require('./lib/session');
const filters = require('./lib/filters');
const output = require('./lib/output');
const { withDatabase } = require('./lib/mongo');
const {
  collectionNotFoundMessage,
  collectionMissingInDatabaseMessage,
  emptyResultMessage,
} = require('./lib/errors');

const DEFAULT_LIMIT = 500;

// ---------------------------------------------------------------------------
// Argument handling
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--session') args.session = argv[++i];
    else if (a === '--request-file') args.requestFile = argv[++i];
    else if (a === '--request') args.requestInline = argv[++i];
  }
  return args;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadRequest(args) {
  let raw = null;
  let origin = '';
  if (args.requestFile) {
    origin = args.requestFile;
    if (!fs.existsSync(args.requestFile)) {
      fail('REQUEST_FILE_MISSING', `I could not find the request file at ${args.requestFile}.`, args);
    }
    raw = fs.readFileSync(args.requestFile, 'utf8');
  } else if (args.requestInline) {
    origin = '--request';
    raw = args.requestInline;
  } else {
    origin = 'standard input';
    raw = readStdin();
  }

  if (!raw || !raw.trim()) {
    fail(
      'REQUEST_EMPTY',
      'No request was provided. Pass --request-file with a path to a JSON file describing what to pull.',
      args
    );
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    fail('REQUEST_INVALID_JSON', `The request from ${origin} is not valid JSON: ${err.message}`, args);
  }
}

// ---------------------------------------------------------------------------
// Failure reporting — one shape, whatever went wrong
// ---------------------------------------------------------------------------

function fail(code, message, args) {
  if (args && args.json) {
    process.stdout.write(JSON.stringify({ ok: false, code, message }, null, 2) + '\n');
  } else {
    process.stdout.write(message + '\n');
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Request → query plan
// ---------------------------------------------------------------------------

function mergeFilters(base, extra) {
  const merged = Object.assign({}, base || {});
  for (const [field, condition] of Object.entries(extra || {})) {
    if (
      merged[field] &&
      typeof merged[field] === 'object' &&
      !Array.isArray(merged[field]) &&
      typeof condition === 'object' &&
      condition !== null &&
      !Array.isArray(condition)
    ) {
      merged[field] = Object.assign({}, merged[field], condition);
    } else {
      merged[field] = condition;
    }
  }
  return merged;
}

function applyTimeRange(filter, def, timeRange, args) {
  if (!timeRange) return filter;
  const field = timeRange.field || def.dateField;
  if (!field) {
    fail(
      'NO_DATE_FIELD',
      `You asked for a time range, but the "${def.label}" data set does not have a date field ` +
        'set up for that.\n\nNext step: tell me which field to filter on, or ask the VHP Dev Team ' +
        `to add a "dateField" to the definition for ${def.collection}.`,
      args
    );
  }
  if (!def.fields[field]) {
    fail(
      'UNKNOWN_DATE_FIELD',
      `I cannot filter "${def.label}" on a field called "${field}" — it is not in that data set.`,
      args
    );
  }
  const condition = {};
  if (timeRange.from) condition.$gte = timeRange.from;
  if (timeRange.to) condition.$lte = timeRange.to;
  if (!Object.keys(condition).length) return filter;
  return mergeFilters(filter, { [field]: condition });
}

function suggestField(name, available) {
  const needle = String(name).toLowerCase();
  const near = available.filter(
    (f) => f.toLowerCase().includes(needle) || needle.includes(f.toLowerCase())
  );
  return near.length ? ` Did you mean: ${near.join(', ')}?` : ` Available fields: ${available.join(', ')}`;
}

function buildPlan(request, defs, args) {
  if (!request.collection) {
    fail(
      'NO_COLLECTION',
      'The request did not say which data set to pull.\n\nNext step: include a "collection" value. ' +
        `Available: ${defs.map((d) => d.collection).join(', ')}`,
      args
    );
  }

  const def = schemas.find(defs, request.collection);
  if (!def) {
    const problem = collectionNotFoundMessage(request.collection, defs.map((d) => `${d.collection} (${d.label})`));
    fail(problem.code, problem.message, args);
  }

  let filter = {};
  let fields = null;
  let sort = null;
  let limit = null;
  let namedQuery = null;

  if (request.query) {
    const q = (def.queries || {})[request.query];
    if (!q) {
      const names = Object.keys(def.queries || {});
      fail(
        'UNKNOWN_QUERY',
        `"${def.label}" has no saved query called "${request.query}".\n\n` +
          (names.length
            ? `Saved queries: ${names.map((n) => `"${n}"`).join(', ')}`
            : 'That data set has no saved queries — describe the filter instead.'),
        args
      );
    }
    let built;
    try {
      built = q.build(request.params || {}) || {};
    } catch (err) {
      fail(
        'QUERY_BUILD_FAILED',
        `The saved query "${request.query}" could not be built: ${err.message}\n\n` +
          'Next step: send that line to the VHP Dev Team — the definition file needs a fix.',
        args
      );
    }
    namedQuery = request.query;
    filter = built.filter || {};
    fields = built.fields || null;
    sort = built.sort || null;
    limit = built.limit || null;
  }

  if (request.filter) filter = mergeFilters(filter, request.filter);
  filter = applyTimeRange(filter, def, request.timeRange, args);

  if (request.fields) fields = request.fields;
  if (request.sort) sort = request.sort;
  if (request.limit) limit = request.limit;

  fields = fields && fields.length ? fields.slice() : def.defaultProjection.slice();
  sort = sort || def.defaultSort;
  limit = Number(limit || def.defaultLimit || DEFAULT_LIMIT);

  const known = Object.keys(def.fields);
  for (const f of fields) {
    if (!known.includes(f)) {
      fail('UNKNOWN_FIELD', `"${def.label}" has no field called "${f}".${suggestField(f, known)}`, args);
    }
  }
  for (const f of filters.fieldsUsedBy(filter)) {
    if (!known.includes(f)) {
      fail('UNKNOWN_FILTER_FIELD', `I cannot filter "${def.label}" on "${f}".${suggestField(f, known)}`, args);
    }
  }
  for (const f of Object.keys(sort)) {
    if (!known.includes(f)) {
      fail('UNKNOWN_SORT_FIELD', `I cannot sort "${def.label}" by "${f}".${suggestField(f, known)}`, args);
    }
  }

  // Any field a filter touches has to be in the saved file too, or a later
  // narrower request could not be answered from the cache and we would go back
  // to the database for something already on disk.
  const filterFields = filters.fieldsUsedBy(filter);
  const storedFields = fields.slice();
  for (const f of filterFields) if (!storedFields.includes(f)) storedFields.push(f);

  return { def, filter, fields, storedFields, sort, limit, namedQuery };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function readCachedRows(entry) {
  try {
    return JSON.parse(fs.readFileSync(entry.jsonPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Finds a previous pull that already contains everything this request needs.
 *
 * A truncated pull is never reused for narrowing. It is only the first N rows
 * the database happened to return, so filtering it would produce a number that
 * looks like an answer and is not — the single most expensive kind of mistake
 * this plugin could make.
 */
function findReusable(entriesList, plan, hash) {
  const exact = entriesList.find((e) => e.hash === hash && fs.existsSync(e.jsonPath));
  if (exact) return { kind: 'exact', entry: exact };

  const needed = new Set(plan.storedFields);
  const candidates = entriesList
    .filter((e) => e.collection === plan.def.collection)
    .filter((e) => !e.truncated)
    .filter((e) => fs.existsSync(e.jsonPath))
    .filter((e) => [...needed].every((f) => (e.storedFields || e.fields || []).includes(f)))
    .filter((e) => filters.isNarrowerOrEqual(plan.filter, e.filter))
    // Prefer the smallest superset — less to scan, and it is the closest question.
    .sort((a, b) => a.rowCount - b.rowCount);

  return candidates.length ? { kind: 'subset', entry: candidates[0] } : { kind: 'none' };
}

function sortRows(rows, sortSpec) {
  const keys = Object.entries(sortSpec || {});
  if (!keys.length) return rows;
  return rows.slice().sort((a, b) => {
    for (const [field, dir] of keys) {
      const av = filters.getPath(a, field);
      const bv = filters.getPath(b, field);
      if (av === bv) continue;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return dir === -1 ? -cmp : cmp;
    }
    return 0;
  });
}

function project(rows, fields) {
  return rows.map((row) => {
    const out = {};
    for (const f of fields) out[f] = filters.getPath(row, f);
    return out;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const request = loadRequest(args);

  session.sweepStale();
  const sessionId = session.resolveSessionId(args.session || request.session);
  const dir = session.ensureSession(sessionId);

  const { schemas: defs, problems } = schemas.loadAll();
  if (!defs.length) {
    fail(
      'NO_SCHEMAS',
      'This plugin has no usable data-set definitions, so there is nothing I can pull.\n\n' +
        (problems.length ? 'Problems found:\n  - ' + problems.join('\n  - ') + '\n\n' : '') +
        'Next step: ask the VHP Dev Team to check the schemas folder.',
      args
    );
  }

  const plan = buildPlan(request, defs, args);
  const hash = filters.requestHash({
    collection: plan.def.collection,
    filter: plan.filter,
    fields: plan.storedFields,
  });

  const reuse = findReusable(session.entries(dir), plan, hash);

  let rows;
  let truncated = false;
  let route;
  let routeNote;
  let existingPaths = null;

  if (reuse.kind === 'exact') {
    rows = readCachedRows(reuse.entry);
    if (rows) {
      truncated = Boolean(reuse.entry.truncated);
      route = 'cache-exact';
      routeNote = 'Reused the identical pull already in this session — no new database query.';
      // Same question, same answer: point at the file that already exists
      // rather than littering the session folder with duplicates.
      existingPaths = { jsonPath: reuse.entry.jsonPath, csvPath: reuse.entry.csvPath };
    }
  } else if (reuse.kind === 'subset') {
    const cached = readCachedRows(reuse.entry);
    if (cached) {
      rows = cached.filter((r) => filters.matches(r, plan.filter));
      route = 'cache-narrowed';
      routeNote =
        `Narrowed the ${reuse.entry.rowCount}-row pull already in this session down to these — ` +
        'no new database query.';
    }
  }

  if (!rows) {
    const result = await withDatabase(async (db) => {
      const names = (await db.listCollections({ name: plan.def.collection }, { nameOnly: true }).toArray()).map(
        (c) => c.name
      );
      if (!names.includes(plan.def.collection)) {
        return { missingCollection: true };
      }

      const projection = {};
      for (const f of plan.storedFields) projection[f] = 1;
      if (!plan.storedFields.includes('_id')) projection._id = 0;

      const mongoFilter = filters.toMongo(plan.filter, plan.def.fields);

      // One extra row is a cheap, reliable truncation detector: if it comes
      // back, there was more behind the limit.
      const found = await db
        .collection(plan.def.collection)
        .find(mongoFilter, { projection })
        .sort(plan.sort)
        .limit(plan.limit + 1)
        .toArray();

      return { found };
    });

    if (!result.ok) fail(result.code, result.message, args);

    if (result.value.missingCollection) {
      const problem = collectionMissingInDatabaseMessage(plan.def.collection);
      fail(problem.code, problem.message, args);
    }

    const found = result.value.found;
    truncated = found.length > plan.limit;
    rows = truncated ? found.slice(0, plan.limit) : found;
    route = 'fresh-query';
    routeNote = 'Queried the database.';
  }

  let finalRows = project(sortRows(rows, plan.sort), plan.storedFields);

  // A cache-narrowed result can still be larger than the requested limit. The
  // rows came from a complete pull, so "there are more" is true and accurate
  // here rather than an artifact of the database's own cut-off.
  if (route !== 'fresh-query' && finalRows.length > plan.limit) {
    truncated = true;
    finalRows = finalRows.slice(0, plan.limit);
    existingPaths = null;
  }

  const paths =
    existingPaths && fs.existsSync(existingPaths.jsonPath) && fs.existsSync(existingPaths.csvPath)
      ? existingPaths
      : output.writeResult({
          dir,
          collection: plan.def.collection,
          hash,
          rows: finalRows,
          fields: plan.storedFields,
        });

  session.recordEntry(dir, hash, {
    collection: plan.def.collection,
    label: plan.def.label,
    filter: filters.canonicalizeFilter(plan.filter),
    fields: plan.fields,
    storedFields: plan.storedFields,
    sort: plan.sort,
    limit: plan.limit,
    rowCount: finalRows.length,
    truncated,
    route,
    namedQuery: plan.namedQuery,
    jsonPath: paths.jsonPath,
    csvPath: paths.csvPath,
  });

  const samples = output.sampleRows(finalRows, plan.fields, 5);
  const payload = {
    ok: true,
    sessionId,
    sessionDir: dir,
    route,
    routeNote,
    collection: plan.def.collection,
    label: plan.def.label,
    namedQuery: plan.namedQuery,
    filter: filters.canonicalizeFilter(plan.filter),
    fields: plan.fields,
    storedFields: plan.storedFields,
    sort: plan.sort,
    limit: plan.limit,
    rowCount: finalRows.length,
    truncated,
    jsonPath: paths.jsonPath,
    csvPath: paths.csvPath,
    sampleRows: samples,
    emptyNote: finalRows.length === 0 ? emptyResultMessage(plan.def.label, describeFilter(plan.filter)) : null,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    process.stdout.write(renderText(payload) + '\n');
  }
}

function describeFilter(filter) {
  const parts = Object.entries(filters.canonicalizeFilter(filter)).map(([field, ops]) => {
    const bits = Object.entries(ops).map(([op, v]) => {
      const word =
        { $eq: 'is', $ne: 'is not', $gt: 'is over', $gte: 'is at least', $lt: 'is under', $lte: 'is at most', $in: 'is one of', $nin: 'is not one of', $regex: 'contains', $exists: 'exists' }[op] || op;
      return `${word} ${Array.isArray(v) ? v.join('/') : v}`;
    });
    return `${field} ${bits.join(' and ')}`;
  });
  return parts.length ? `where ${parts.join(', ')}` : '';
}

function renderText(p) {
  const lines = [];
  lines.push(`${p.label}${p.namedQuery ? ` — saved query "${p.namedQuery}"` : ''}`);
  const described = describeFilter(p.filter);
  if (described) lines.push(`Filter: ${described}`);
  lines.push(`Route: ${p.routeNote}`);
  lines.push(`Rows: ${p.rowCount}${p.truncated ? ` (stopped at the ${p.limit}-row limit — there are more)` : ''}`);
  lines.push(`Columns: ${p.fields.join(', ')}`);
  lines.push(`Saved to: ${p.jsonPath}`);
  lines.push(`           ${p.csvPath}`);
  lines.push(`Session id: ${p.sessionId}`);

  if (p.emptyNote) {
    lines.push('');
    lines.push(p.emptyNote);
  } else {
    lines.push('');
    lines.push(`Sample rows (first ${p.sampleRows.length} of ${p.rowCount}):`);
    for (const row of p.sampleRows) {
      lines.push('  ' + p.fields.map((f) => `${f}=${row[f]}`).join(' | '));
    }
  }
  return lines.join('\n');
}

main().catch((err) => {
  process.stdout.write(
    'Something went wrong while gathering the data and I do not recognize the problem.\n\n' +
      `Technical detail to pass along: ${err && err.stack ? err.stack : err}\n\n` +
      'Next step: send that to the VHP Dev Team.\n'
  );
  process.exit(1);
});
