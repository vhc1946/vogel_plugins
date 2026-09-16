'use strict';

/**
 * Loads every collection definition in schemas/ at run time.
 *
 * The point of this file is that adding a new data set to the plugin is a
 * drop-in: someone writes schemas/<something>.js and it appears everywhere —
 * in the catalog, in ambiguity resolution, in the named queries. Nothing in
 * SKILL.md or in these scripts mentions any specific collection by name.
 *
 * Because the people adding those files are not necessarily the people who
 * maintain this code, validation is strict and the error messages name the
 * file and the exact key that is wrong. A half-valid definition is skipped
 * rather than allowed to fail later in the middle of a query.
 *
 * The contract itself is documented for humans in schemas/README.md.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, '..', '..', 'schemas');

const VALID_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'objectId',
  'array',
  'object',
];

function schemaDir() {
  return SCHEMA_DIR;
}

function schemaFiles() {
  if (!fs.existsSync(SCHEMA_DIR)) return [];
  return fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.'))
    .sort()
    .map((f) => path.join(SCHEMA_DIR, f));
}

function validate(def, file) {
  const problems = [];
  const base = path.basename(file);
  const req = (cond, msg) => {
    if (!cond) problems.push(msg);
  };

  if (!def || typeof def !== 'object') {
    return [`${base}: the file does not export an object. It must end with module.exports = { ... }.`];
  }

  req(
    typeof def.collection === 'string' && def.collection.trim() !== '',
    `${base}: "collection" is missing. It must be the exact collection name in MongoDB.`
  );
  req(
    typeof def.label === 'string' && def.label.trim() !== '',
    `${base}: "label" is missing. It is the plain-English name managers will say, e.g. "Technicians".`
  );
  req(
    typeof def.description === 'string' && def.description.trim() !== '',
    `${base}: "description" is missing. One sentence saying what one record represents.`
  );
  req(
    def.fields && typeof def.fields === 'object' && Object.keys(def.fields).length > 0,
    `${base}: "fields" is missing or empty. List every field you want anyone to be able to ask for.`
  );

  const fieldNames = def.fields && typeof def.fields === 'object' ? Object.keys(def.fields) : [];

  for (const name of fieldNames) {
    const f = def.fields[name];
    if (!f || typeof f !== 'object') {
      problems.push(`${base}: field "${name}" must be an object like { type: 'string', description: '...' }.`);
      continue;
    }
    if (!VALID_TYPES.includes(f.type)) {
      problems.push(
        `${base}: field "${name}" has type "${f.type}". Use one of: ${VALID_TYPES.join(', ')}.`
      );
    }
    if (typeof f.description !== 'string' || f.description.trim() === '') {
      problems.push(
        `${base}: field "${name}" has no description. One short line — this is what tells me ` +
          'whether it is the field a manager meant.'
      );
    }
  }

  if (!Array.isArray(def.defaultProjection) || def.defaultProjection.length === 0) {
    problems.push(`${base}: "defaultProjection" must be a non-empty array of field names.`);
  } else {
    for (const f of def.defaultProjection) {
      if (!fieldNames.includes(f)) {
        problems.push(`${base}: "defaultProjection" lists "${f}", which is not in "fields".`);
      }
    }
  }

  if (!def.defaultSort || typeof def.defaultSort !== 'object' || Array.isArray(def.defaultSort)) {
    problems.push(`${base}: "defaultSort" must be an object like { createdAt: -1 }.`);
  } else {
    for (const [f, dir] of Object.entries(def.defaultSort)) {
      if (!fieldNames.includes(f)) {
        problems.push(`${base}: "defaultSort" sorts on "${f}", which is not in "fields".`);
      }
      if (dir !== 1 && dir !== -1) {
        problems.push(`${base}: "defaultSort" on "${f}" must be 1 (ascending) or -1 (descending).`);
      }
    }
  }

  if (!Number.isInteger(def.defaultLimit) || def.defaultLimit <= 0) {
    problems.push(`${base}: "defaultLimit" must be a whole number greater than zero (500 is the house default).`);
  }

  if (def.dateField != null && !fieldNames.includes(def.dateField)) {
    problems.push(`${base}: "dateField" is "${def.dateField}", which is not in "fields".`);
  }

  if (def.queries != null) {
    if (typeof def.queries !== 'object' || Array.isArray(def.queries)) {
      problems.push(`${base}: "queries" must be an object whose keys are the query names.`);
    } else {
      for (const [qname, q] of Object.entries(def.queries)) {
        if (!q || typeof q !== 'object') {
          problems.push(`${base}: query "${qname}" must be an object.`);
          continue;
        }
        if (typeof q.description !== 'string' || q.description.trim() === '') {
          problems.push(`${base}: query "${qname}" needs a "description" saying what it answers.`);
        }
        if (typeof q.build !== 'function') {
          problems.push(
            `${base}: query "${qname}" needs a "build" function that takes the parameters and ` +
              'returns { filter, fields?, sort?, limit? }.'
          );
        }
        if (q.params != null && (typeof q.params !== 'object' || Array.isArray(q.params))) {
          problems.push(`${base}: query "${qname}" has a "params" that is not an object.`);
        }
      }
    }
  }

  return problems;
}

/**
 * @returns {{schemas: Object[], problems: string[]}}
 *   schemas — every definition that validated, each with a `_file` property.
 *   problems — human-readable complaints about the ones that did not.
 */
function loadAll() {
  const schemas = [];
  const problems = [];

  for (const file of schemaFiles()) {
    let def;
    try {
      // Cleared first so a long-running process picks up edits to a schema file.
      delete require.cache[require.resolve(file)];
      def = require(file);
    } catch (err) {
      problems.push(
        `${path.basename(file)}: could not be loaded (${err.message}). ` +
          'There is most likely a typo in the file — a missing comma or bracket.'
      );
      continue;
    }

    const fileProblems = validate(def, file);
    if (fileProblems.length) {
      problems.push(...fileProblems);
      continue;
    }

    schemas.push(Object.assign({}, def, { _file: path.basename(file) }));
  }

  const seen = new Map();
  for (const s of schemas) {
    if (seen.has(s.collection)) {
      problems.push(
        `Two files define the collection "${s.collection}": ${seen.get(s.collection)} and ${s._file}. ` +
          'Only one definition per collection — delete or rename one of them.'
      );
    } else {
      seen.set(s.collection, s._file);
    }
  }

  return { schemas, problems };
}

/** Finds a definition by collection name or label, case-insensitively. */
function find(schemas, wanted) {
  if (!wanted) return null;
  const needle = String(wanted).trim().toLowerCase();
  return (
    schemas.find((s) => s.collection.toLowerCase() === needle) ||
    schemas.find((s) => s.label.toLowerCase() === needle) ||
    null
  );
}

module.exports = { loadAll, find, schemaDir, schemaFiles, validate, VALID_TYPES };
