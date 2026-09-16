'use strict';

/**
 * Writes results to disk as JSON and CSV, and builds the small summary that is
 * the only thing allowed into the conversation.
 *
 * Both formats are written every time because they get used differently: CSV
 * opens in Excel, which is where a manager will actually look at 400 rows, and
 * JSON keeps types intact for follow-up analysis.
 */

const fs = require('fs');
const path = require('path');
const { getPath } = require('./filters');

function serializeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvEscape(text) {
  const s = serializeCell(text);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows, fields) {
  const lines = [fields.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(fields.map((f) => csvEscape(getPath(row, f))).join(','));
  }
  // A trailing newline keeps Excel and text editors from complaining.
  return lines.join('\r\n') + '\r\n';
}

function jsonReplacer(_key, value) {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Sample rows are what the manager and the model actually see, so they are
 * truncated hard: a single field holding a 4 KB note would otherwise blow up
 * the conversation for no benefit.
 */
function sampleRows(rows, fields, count = 5, maxCellChars = 120) {
  return rows.slice(0, count).map((row) => {
    const out = {};
    for (const f of fields) {
      let v = serializeCell(getPath(row, f));
      if (v.length > maxCellChars) v = v.slice(0, maxCellChars) + '…';
      out[f] = v;
    }
    return out;
  });
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function writeResult({ dir, collection, hash, rows, fields }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `${slug(collection)}-${stamp}-${hash}`;
  const jsonPath = path.join(dir, base + '.json');
  const csvPath = path.join(dir, base + '.csv');

  fs.writeFileSync(jsonPath, JSON.stringify(rows, jsonReplacer, 2), 'utf8');
  fs.writeFileSync(csvPath, toCsv(rows, fields), 'utf8');

  return { jsonPath, csvPath };
}

module.exports = { writeResult, toCsv, sampleRows, serializeCell, slug };
