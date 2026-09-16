# Adding a collection

Everything this plugin can pull is defined by the files in this folder. Adding a
new data set means writing one file here and saving it. Nothing else changes —
not `SKILL.md`, not any script. The skill reads this folder fresh on every
request, so a new file is live the next time someone asks a question.

You do not need to understand the plugin's code to write one of these. If you can
edit a JavaScript object, you can add a collection.

- **File name:** anything ending in `.js`, lowercase with hyphens, named after
  the data set (`service-calls.js`, `invoices.js`). Files starting with `_` or
  `.` are ignored.
- **One file per collection.** Two files claiming the same collection is an
  error, and both get skipped.
- **The file must end in `module.exports = { ... }`.**

If a file has a problem, the plugin skips that one data set and reports exactly
what is wrong — it does not fail the whole session. Run
`node scripts/preflight.js` after adding a file to see the verdict.

---

## The contract

| Key                 | Required | What it is |
| ------------------- | -------- | ---------- |
| `collection`        | yes      | The exact collection name in MongoDB. Case-sensitive. |
| `label`             | yes      | The plain-English name a manager would say: `"Service Calls"`. |
| `description`       | yes      | One sentence describing what a single record represents. |
| `fields`            | yes      | Every field anyone is allowed to ask for. See below. |
| `defaultProjection` | yes      | The columns to return when nobody named any. |
| `defaultSort`       | yes      | An object like `{ createdAt: -1 }`. `1` ascending, `-1` descending. |
| `defaultLimit`      | yes      | Row cap for this data set. `500` unless there is a reason. |
| `dateField`         | no       | The field time ranges apply to when the manager did not name one. |
| `queries`           | no       | Named, parameterized queries. See below. |

### `fields`

An object whose keys are field names. Each entry needs a `type` and a
`description`, and may have `values`.

```js
fields: {
  status: {
    type: 'string',
    description: 'Where the call stands right now.',
    values: ['open', 'dispatched', 'complete', 'cancelled'],
  },
  completedAt: { type: 'date', description: 'When the tech closed the call.' },
}
```

Valid types: `string`, `number`, `boolean`, `date`, `objectId`, `array`, `object`.

Two things are worth more care than they look:

**The description is not documentation — it is how the request gets routed.**
When a manager says "pull the calls that got closed last week," the skill picks
the field by reading these lines. `'Date the call was closed out by the tech'`
resolves that request. `'completedAt timestamp'` does not, and the manager gets
asked a clarifying question they should not have needed.

**`values` prevents a whole class of silent wrong answers.** With it, "open
calls" becomes `status: 'open'`. Without it, the skill has to guess whether the
database says `open`, `Open`, or `OPEN`, and a wrong guess returns zero rows
rather than an error. List the real values whenever a field has a fixed set.

Only list fields you are willing to have pulled. A field that is not in `fields`
cannot be requested, filtered on, or sorted by — which is the intended way to
keep sensitive columns out of reach.

### `queries`

Named shortcuts for the questions people actually ask. The key is the name a
manager would say.

```js
queries: {
  'open calls by branch': {
    description: 'Calls that have not been closed out, for one branch.',
    params: { branch: 'required — branch name, e.g. "South County"' },
    build: (p) => {
      if (!p.branch) throw new Error('This query needs a "branch" parameter.');
      return {
        filter: { status: { $in: ['open', 'dispatched'] }, branch: p.branch },
        sort: { openedAt: 1 },
      };
    },
  },
}
```

`build` receives the parameters and returns `{ filter, fields?, sort?, limit? }`.
Anything you leave out falls back to the defaults above. Throw an `Error` with a
plain sentence when a required parameter is missing — that sentence is shown to
the manager, so write it for them, not for yourself.

`params` is a description of each parameter for a human reader. It is not
enforced; `build` does the checking.

### The filter language

Filters use a small subset of MongoDB's syntax:

`$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` `$regex` `$exists`

A bare value is shorthand for `$eq`: `{ status: 'open' }` and
`{ status: { $eq: 'open' } }` are the same filter.

The subset is deliberate. Every one of these operators can also be evaluated
against rows already downloaded, which is what lets the plugin answer a narrower
follow-up question from the previous pull instead of going back to the database.
Anything outside this list is rejected rather than silently sent to the database,
because a filter the cache cannot evaluate would make the two disagree.

Dates go in as ISO strings — `'2026-03-01'` or a full timestamp. Any field you
declared as `type: 'date'` gets converted to a real date before the query runs,
so a string is the right thing to write in `build`.

**Named queries return rows, not totals.** There is no aggregation in this
contract on purpose: this plugin's job ends at getting the records into the
session. Grouping, summing and averaging happen afterwards, against the saved
file, where the manager can see the working.

---

## Worked example

`schemas/service-calls.js`, start to finish:

```js
'use strict';

module.exports = {
  collection: 'serviceCalls',
  label: 'Service Calls',
  description: 'One record per service call dispatched to a technician.',
  dateField: 'openedAt',

  fields: {
    callNumber:   { type: 'string', description: 'Call number customers and dispatch refer to.' },
    customerName: { type: 'string', description: 'Customer the call was opened for.' },
    branch:       { type: 'string', description: 'Branch that owns the call.',
                    values: ['St. Louis', 'South County', 'St. Charles'] },
    technician:   { type: 'string', description: 'Technician assigned to the call.' },
    status:       { type: 'string', description: 'Where the call stands right now.',
                    values: ['open', 'dispatched', 'complete', 'cancelled'] },
    callType:     { type: 'string', description: 'Nature of the call, e.g. no heat, maintenance, warranty.' },
    openedAt:     { type: 'date',   description: 'When the call was created by dispatch.' },
    completedAt:  { type: 'date',   description: 'When the tech closed the call out. Empty while open.' },
    invoiceTotal: { type: 'number', description: 'Amount invoiced in dollars. Zero on warranty work.' },
  },

  defaultProjection: ['callNumber', 'openedAt', 'customerName', 'branch', 'technician', 'status'],
  defaultSort:  { openedAt: -1 },
  defaultLimit: 500,

  queries: {
    'open calls': {
      description: 'Calls that have not been closed out yet.',
      params: { branch: 'optional — branch name' },
      build: (p) => ({
        filter: Object.assign(
          { status: { $in: ['open', 'dispatched'] } },
          p.branch ? { branch: p.branch } : {}
        ),
        sort: { openedAt: 1 },
      }),
    },

    'calls completed between': {
      description: 'Calls closed out within a date range.',
      params: { from: 'required — "2026-03-01"', to: 'required — "2026-03-31"' },
      build: (p) => {
        if (!p.from || !p.to) throw new Error('This query needs a "from" and a "to" date.');
        return {
          filter: { status: 'complete', completedAt: { $gte: p.from, $lte: p.to } },
          fields: ['callNumber', 'completedAt', 'customerName', 'technician', 'callType', 'invoiceTotal'],
          sort: { completedAt: 1 },
        };
      },
    },
  },
};
```

Save it, then check it:

```
node scripts/preflight.js
node scripts/catalog.js --collection serviceCalls
```

The first confirms the file is valid and the collection exists in the database.
The second shows the data set exactly as the skill will see it — if a field
description reads badly there, it will route badly too.

---

## Checklist before you commit a new file

- [ ] `collection` matches the name in Atlas exactly, including capitals.
- [ ] Every field has a description a manager would understand.
- [ ] Fields with a fixed set of values list them in `values`.
- [ ] `defaultProjection` is the handful of columns someone would want first, not everything.
- [ ] `dateField` is set if anyone will ask about this data by time.
- [ ] Every named query has been run once with real parameters.
- [ ] `node scripts/preflight.js` passes.
- [ ] Nothing sensitive is exposed that should not be.
