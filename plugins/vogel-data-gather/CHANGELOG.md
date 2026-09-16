# Changelog

All notable changes to this plugin. Versions follow
[semantic versioning](https://semver.org): bump the patch for fixes, the minor
for new collections or capabilities, the major when an existing schema file or
request shape stops working.

## [0.1.0] — 2026-09-16

First internal release. Not yet validated against the real database.

### Added

- **`gather-company-data` skill** — turns a plain-English request into a query,
  saves the results, and reports the field list, row count and sample rows.
  Never prints a full result set into the conversation.
- **Drop-in collection definitions** (`schemas/`). Every data set is defined by
  one file, loaded at run time. Adding a collection is adding a file — no
  changes to the skill or scripts. Contract and worked example in
  `schemas/README.md`.
- **Two example definitions**, `technicians.js` and `sales-orders.js`.
  Placeholders — the field names are educated guesses and need replacing with
  the real schema.
- **Session cache with deduplication.** Pulls are keyed by collection, filters
  and fields. An identical request reuses the previous file; a narrower request
  over the same fields is filtered in memory; anything else queries. A pull that
  hit its row limit is never narrowed in memory, because filtering an incomplete
  set produces a confident wrong number. Every pull states which path it took.
- **Session-scoped, ephemeral storage.** Results live in a temp folder for the
  length of a session and are deleted by `scripts/cleanup.js`. Sessions left
  behind by an interrupted run are swept after 18 hours.
- **JSON and CSV output** for every pull — CSV for Excel, JSON for follow-up
  questions.
- **`scripts/preflight.js`** — one command that checks Node, the driver, the
  definition files, credentials, connectivity, and that every configured
  collection exists. Each failure prints its own fix.
- **`scripts/catalog.js`** — lists the available data sets, with a per-collection
  detail view. This is how the skill discovers collections rather than having
  them hardcoded.
- **Credentials from `~/.vogel/mongo.env`**, falling back to `VOGEL_MONGO_URI`.
  Nothing is ever written, logged, or requested in chat.
- **Plain-English error handling** for a missing credentials file, a malformed
  connection string, authentication failure, an IP that is not allowlisted, a
  missing collection, and an empty result. Connections always close; credentials
  are never retried.
- **Reference material** — `reference/glossary.md` (Vogel terms to fields) and
  `reference/query-recipes.md` (worked request files).
- **`scripts/selftest.js`** — exercises the filter, hashing, cache-reuse and CSV
  logic offline, with no database.

### Known gaps

- Example schemas are guesses and must be replaced before anyone builds a real
  report from this.
- `reference/glossary.md` needs a review pass — particularly whether the fiscal
  year starts in January.
- No aggregation. Named queries return rows; grouping and totals happen
  afterwards against the saved file, by design.
- No joins across collections. Pull each separately and match on the file.
- Tested against Node 18+ on Windows only, which is the only supported target.
