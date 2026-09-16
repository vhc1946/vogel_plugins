#!/usr/bin/env node
'use strict';

/**
 * Prints what this plugin currently knows how to pull.
 *
 * This is how the skill learns the available data sets without any collection
 * name being written into SKILL.md. Two levels on purpose: the overview is
 * cheap enough to read on every request, and the per-collection detail (with
 * every field description) is only pulled up when a request is ambiguous.
 *
 *   node scripts/catalog.js                       overview of every data set
 *   node scripts/catalog.js --collection techs    full field list for one
 *   node scripts/catalog.js --json                same content, as JSON
 */

const schemas = require('./lib/schemas');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const cIdx = argv.findIndex((a) => a === '--collection' || a === '-c');
const wanted = cIdx !== -1 ? argv[cIdx + 1] : null;

const { schemas: defs, problems } = schemas.loadAll();

function describeQueries(def) {
  return Object.entries(def.queries || {}).map(([name, q]) => ({
    name,
    description: q.description,
    params: q.params || {},
  }));
}

function detail(def) {
  return {
    collection: def.collection,
    label: def.label,
    description: def.description,
    file: def._file,
    dateField: def.dateField || null,
    defaultProjection: def.defaultProjection,
    defaultSort: def.defaultSort,
    defaultLimit: def.defaultLimit,
    fields: Object.entries(def.fields).map(([name, f]) => ({
      name,
      type: f.type,
      description: f.description,
      values: f.values || null,
    })),
    queries: describeQueries(def),
  };
}

function overview(def) {
  return {
    collection: def.collection,
    label: def.label,
    description: def.description,
    dateField: def.dateField || null,
    defaultLimit: def.defaultLimit,
    fieldNames: Object.keys(def.fields),
    queries: describeQueries(def).map((q) => q.name),
  };
}

if (asJson) {
  const payload = wanted
    ? (() => {
        const def = schemas.find(defs, wanted);
        return def ? { ok: true, collection: detail(def), problems } : { ok: false, error: `No data set called "${wanted}".`, available: defs.map((d) => d.collection), problems };
      })()
    : { ok: true, collections: defs.map(overview), problems };
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(payload.ok === false ? 1 : 0);
}

const out = [];

if (wanted) {
  const def = schemas.find(defs, wanted);
  if (!def) {
    out.push(`There is no data set called "${wanted}".`);
    out.push(`Available: ${defs.map((d) => `${d.collection} (${d.label})`).join(', ') || 'none'}`);
  } else {
    const d = detail(def);
    out.push(`${d.label}  —  collection "${d.collection}"  [${d.file}]`);
    out.push(d.description);
    out.push('');
    out.push('Fields:');
    for (const f of d.fields) {
      const values = f.values ? `  (values: ${f.values.join(', ')})` : '';
      out.push(`  ${f.name} [${f.type}] — ${f.description}${values}`);
    }
    out.push('');
    out.push(`Default columns: ${d.defaultProjection.join(', ')}`);
    out.push(`Default sort: ${JSON.stringify(d.defaultSort)}`);
    out.push(`Default row limit: ${d.defaultLimit}`);
    if (d.dateField) out.push(`Date field used for time ranges: ${d.dateField}`);
    if (d.queries.length) {
      out.push('');
      out.push('Named queries:');
      for (const q of d.queries) {
        const params = Object.keys(q.params).length
          ? `  parameters: ${Object.entries(q.params).map(([k, v]) => `${k} (${v})`).join(', ')}`
          : '  no parameters';
        out.push(`  "${q.name}" — ${q.description}`);
        out.push(`   ${params}`);
      }
    }
  }
} else {
  out.push('Data sets this plugin can pull:');
  out.push('');
  for (const def of defs) {
    const o = overview(def);
    out.push(`${o.label}  (collection: ${o.collection})`);
    out.push(`  ${o.description}`);
    out.push(`  Fields: ${o.fieldNames.join(', ')}`);
    if (o.queries.length) out.push(`  Named queries: ${o.queries.map((q) => `"${q}"`).join(', ')}`);
    out.push('');
  }
  if (!defs.length) {
    out.push('  (none — the schemas folder has no usable definition files)');
    out.push('');
  }
  out.push('Run with --collection <name> for the full field list and query parameters.');
}

if (problems.length) {
  out.push('');
  out.push('Problems with definition files (these data sets were skipped):');
  for (const p of problems) out.push(`  - ${p}`);
}

process.stdout.write(out.join('\n') + '\n');
