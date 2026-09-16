'use strict';

/**
 * The filter language shared by the database and the cache.
 *
 * Everything the plugin can ask the database is expressible in this small
 * subset of MongoDB's query syntax, and — this is the whole point — every one
 * of these operators can also be evaluated in plain JavaScript against rows we
 * already downloaded. That symmetry is what makes "same collection, narrower
 * filter" reusable without another round trip.
 *
 * If you add an operator here, add it to BOTH toMongo() and matches(), or the
 * cache will start disagreeing with the database, which is the worst kind of
 * bug: silently wrong numbers in a manager's report.
 */

const crypto = require('crypto');

const OPERATORS = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex', '$exists'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Normalizes a filter into a canonical shape: every field maps to an operator
 * object, keys sorted, $in/$nin arrays sorted. Two filters that mean the same
 * thing canonicalize identically, which is what makes the cache hash stable
 * regardless of how the request was phrased.
 */
function canonicalizeFilter(filter) {
  if (!filter || !isPlainObject(filter)) return {};
  const out = {};
  for (const field of Object.keys(filter).sort()) {
    const value = filter[field];
    let ops;
    if (isPlainObject(value) && Object.keys(value).some((k) => k.startsWith('$'))) {
      ops = {};
      for (const op of Object.keys(value).sort()) {
        if (!OPERATORS.includes(op)) {
          throw new Error(
            `The filter uses "${op}", which this plugin does not support. ` +
              `Supported: ${OPERATORS.join(', ')}.`
          );
        }
        let v = value[op];
        if ((op === '$in' || op === '$nin') && Array.isArray(v)) {
          v = v.slice().sort((a, b) => String(a).localeCompare(String(b)));
        }
        ops[op] = v;
      }
    } else {
      ops = { $eq: value };
    }
    out[field] = ops;
  }
  return out;
}

/** Stable JSON: object keys sorted at every level. */
function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (isPlainObject(value)) {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * The cache key. Deliberately built from collection + filter + fields only —
 * not from the limit or the sort. Limit and sort change how much of an answer
 * you see, not which records are in it, and folding them in would defeat the
 * dedup the moment someone asked the same question with a different sort.
 */
function requestHash({ collection, filter, fields }) {
  const payload = stableStringify({
    collection,
    filter: canonicalizeFilter(filter),
    fields: (fields || []).slice().sort(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Converts the canonical filter into something the driver understands.
 * `fieldTypes` comes from the schema, and is what lets an ISO date string in a
 * request become a real Date for a field the schema calls a date — a manager
 * saying "since June" should not silently match nothing because the database
 * stores Date objects and we sent it a string.
 */
function toMongo(filter, fieldTypes = {}) {
  const canonical = canonicalizeFilter(filter);
  const out = {};
  for (const [field, ops] of Object.entries(canonical)) {
    const type = fieldTypes[field] && fieldTypes[field].type;
    const converted = {};
    for (const [op, raw] of Object.entries(ops)) {
      converted[op] = coerceForMongo(raw, type, op);
    }
    if (Object.keys(converted).length === 1 && '$eq' in converted) {
      out[field] = converted.$eq;
    } else {
      out[field] = converted;
    }
  }
  return out;
}

function coerceForMongo(value, type, op) {
  if (op === '$regex') return new RegExp(String(value), 'i');
  if (op === '$exists') return Boolean(value);
  if (Array.isArray(value)) return value.map((v) => coerceForMongo(v, type, '$eq'));
  if (type === 'date' && typeof value === 'string' && ISO_DATE.test(value)) {
    const d = new Date(value.length === 10 ? value + 'T00:00:00.000Z' : value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}

// --- In-memory evaluation, for answering from the cache ---------------------

function getPath(row, field) {
  if (row == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  return field.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), row);
}

function comparable(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && ISO_DATE.test(v)) {
    const t = Date.parse(v.length === 10 ? v + 'T00:00:00.000Z' : v);
    if (!Number.isNaN(t)) return t;
  }
  return v;
}

function looseEqual(a, b) {
  const ca = comparable(a);
  const cb = comparable(b);
  if (ca === cb) return true;
  if (ca == null || cb == null) return false;
  return String(ca) === String(cb);
}

/** Evaluates a canonical-or-shorthand filter against one already-downloaded row. */
function matches(row, filter) {
  const canonical = canonicalizeFilter(filter);
  for (const [field, ops] of Object.entries(canonical)) {
    const actual = getPath(row, field);
    for (const [op, expected] of Object.entries(ops)) {
      if (!matchOne(actual, op, expected)) return false;
    }
  }
  return true;
}

function matchOne(actual, op, expected) {
  const a = comparable(actual);
  const e = comparable(expected);
  switch (op) {
    case '$eq':
      return Array.isArray(actual) ? actual.some((x) => looseEqual(x, expected)) : looseEqual(actual, expected);
    case '$ne':
      return !matchOne(actual, '$eq', expected);
    case '$gt':
      return actual != null && a > e;
    case '$gte':
      return actual != null && a >= e;
    case '$lt':
      return actual != null && a < e;
    case '$lte':
      return actual != null && a <= e;
    case '$in':
      return (expected || []).some((x) => matchOne(actual, '$eq', x));
    case '$nin':
      return !(expected || []).some((x) => matchOne(actual, '$eq', x));
    case '$regex':
      try {
        return new RegExp(String(expected), 'i').test(String(actual == null ? '' : actual));
      } catch {
        return false;
      }
    case '$exists':
      return expected ? actual !== undefined && actual !== null : actual === undefined || actual === null;
    default:
      return false;
  }
}

/**
 * Is `candidate` at least as restrictive as `base`?
 *
 * Answering conservatively is the right call here. We only say yes when every
 * condition in `base` appears verbatim in `candidate`, which is exactly the
 * "same question, plus one more filter" case managers actually produce. A
 * cleverer implication check (age > 30 implies age > 20) would buy very little
 * and could quietly hand back an incomplete result set.
 */
function isNarrowerOrEqual(candidate, base) {
  const c = canonicalizeFilter(candidate);
  const b = canonicalizeFilter(base);
  for (const [field, baseOps] of Object.entries(b)) {
    const candOps = c[field];
    if (!candOps) return false;
    for (const [op, val] of Object.entries(baseOps)) {
      if (!(op in candOps)) return false;
      if (stableStringify(candOps[op]) !== stableStringify(val)) return false;
    }
  }
  return true;
}

/** Field names a filter touches — used to check the cache actually holds them. */
function fieldsUsedBy(filter) {
  return Object.keys(canonicalizeFilter(filter));
}

module.exports = {
  OPERATORS,
  canonicalizeFilter,
  stableStringify,
  requestHash,
  toMongo,
  matches,
  isNarrowerOrEqual,
  fieldsUsedBy,
  getPath,
};
