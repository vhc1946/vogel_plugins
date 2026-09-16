---
name: gather-company-data
description: >-
  Pulls records out of the Vogel company database (MongoDB Atlas) into the
  current session as JSON and CSV files, so the manager can then ask questions
  or build a report from them. Use this whenever someone asks for Vogel
  operational data by any phrasing — "gather info on techs", "run a report on
  sales", "pull up service call data", "how many active technicians do we have",
  "who sold the most last month", "list the open calls in South County", "export
  the orders from March", "I need headcount by branch" — and also when they ask
  a question that can only be answered from that data even if they never say
  pull, gather, export, or report. The database holds technicians (field techs,
  roles, branches, hire dates, employment status) and salesOrders (equipment
  sales, reps, amounts, status, install dates); treat a request about any of
  those subjects as a request for this skill. Do NOT use it for anything that is
  not in that database — AWS or cloud cost reports, VHP portal infrastructure,
  vendor or competitor research, web lookups, spreadsheets the user attaches,
  writing or formatting a report from data already gathered, or general HVAC
  questions.
---

# Gather company data

Get Vogel records out of MongoDB Atlas and onto disk, then hand back a small,
honest summary of what landed there. This skill ends at the data. Analysis,
charts and reports are the next thing the manager asks for, against the file
this produced.

Everyone using this is a manager, not an engineer. They will not read a stack
trace and they cannot fix a connection problem themselves. Every message they
see should say what happened in ordinary words and what to do next.

## First, is this computer ready?

The scripts need Node.js. Once per session, before the first pull:

```bash
node --version
```

If that fails — "command not found", "not recognized as an internal or external
command" — stop. Do not try to work around it, and do not attempt the pull. Say:

> This plugin needs Node.js installed on your computer, and I can't find it.
> Install the LTS version from https://nodejs.org, restart Claude, and ask me
> again. It's a normal installer — next, next, finish.

If Node is there, run the readiness check from the plugin folder:

```bash
node scripts/preflight.js
```

It checks Node, the database library, the collection definitions, the
credentials file, and whether the database actually answers. When a check fails
it prints the fix. Relay that text — it is already written for a manager. Do not
paraphrase it into something vaguer, and do not ask them to paste a connection
string into the chat. Credentials live in `~/.vogel/mongo.env` and nowhere else;
if that file is missing, the readiness check prints the setup steps and the work
stops there until they are done.

If `npm install` has never been run in the plugin folder, the check says so. Run
it once, then re-run the check.

## Then, what are they actually asking for?

```bash
node scripts/catalog.js
```

This lists every data set the plugin can pull, with field names and saved query
names. **Read it before deciding anything.** The available collections come from
drop-in definition files, so this list changes without the skill changing —
never assume you know what is there.

For a request that touches specific fields or values, get the detail:

```bash
node scripts/catalog.js --collection <name>
```

Each field carries a one-line description, and fields with a fixed set of values
list them. That is usually enough to resolve "closed calls" to the right field
and the right spelling on its own.

Work out four things from the request and the catalog:

- **Collection** — which data set.
- **Filters** — the conditions.
- **Fields** — which columns. Default to the data set's own default projection
  unless they named columns; it exists so nobody has to.
- **Time range** — resolve relative dates yourself. "Last month", "this quarter",
  "since June" become real dates. Today's date is in your context; use it rather
  than asking.

### Ambiguity

If the catalog resolves it, do not ask. A manager who says "pull the active
techs" and gets a question back has been made to do the work they delegated.

Ask **one** question, and only when the answer changes which records come back
and nothing in the catalog decides it. Two collections could plausibly be meant,
or a value they named is not in the field's value list. Offer the likely options
rather than an open question:

> Sales orders can mean signed contracts or everything including quotes — which
> did you want?

Then proceed on the answer. Do not chain a second question onto the first. If
the request is merely broad rather than ambiguous — no date range on something
that has years of history — do not ask; pull with the default limit and say what
you did.

## Pull it

Write the request to a JSON file and run the gather script. A file rather than
inline JSON, because Windows shells mangle quoted JSON and the manager should
never see a quoting error.

```bash
cat > /tmp/req.json <<'JSON'
{
  "collection": "salesOrders",
  "query": "sales by month",
  "params": { "month": "2026-03" }
}
JSON

node scripts/gather.js --request-file /tmp/req.json --session <session-id>
```

Request keys, all optional except `collection`:

| Key | Meaning |
| --- | --- |
| `collection` | Collection name or label from the catalog. |
| `query` | Name of a saved query from the catalog. |
| `params` | Parameters for that saved query. |
| `filter` | Conditions, as `{ field: value }` or `{ field: { $gte: ... } }`. |
| `fields` | Columns to return. Omit for the data set's default. |
| `timeRange` | `{ "from": "2026-03-01", "to": "2026-03-31" }`. Uses the data set's date field unless you add `"field"`. |
| `sort` | `{ "soldAt": -1 }`. |
| `limit` | Row cap. Leave it out — the default is 500. |

Filters accept `$eq $ne $gt $gte $lt $lte $in $nin $regex $exists` and nothing
else. A bare value means equals.

**The session id ties every pull in one conversation to one cache.** The first
call prints one; pass that same id on every later call with `--session`. Get it
wrong and the cache is empty, so you re-query for data already sitting on disk.

Prefer a saved query when one fits the request. They were written by someone who
knows the data and they encode the right field spellings and status values.

## Say what happened

The script prints a short block: the route it took, the row count, the columns,
the file paths, and up to five sample rows. Relay that. Specifically:

- **One line on the route.** The script gives you the sentence — "Queried the
  database", "Reused the identical pull already in this session", "Narrowed the
  1,200-row pull already in this session". Managers should be able to tell at a
  glance whether they are looking at something fresh.
- **The row count, and the truncation warning if there is one.** When results hit
  the limit there are more records behind it. Say so plainly and offer to
  narrow: "That's the first 500 of more — want me to filter it down by branch or
  by date?" Never let a truncated pull be mistaken for the whole picture; a
  manager summing a capped file gets a wrong number and no warning.
- **The file paths, and what they are for.** "The full results are in
  `<path>.csv` — I can answer questions against it, or open it in Excel."
- **The sample rows**, so they can see the shape is right.

**Never print the full result set into the conversation.** Not as a table, not
"just this once" because it is only 300 rows. The file is the deliverable; the
conversation gets the summary. Dumping records costs a great deal, crowds out the
context that makes the follow-up questions good, and nobody reads them anyway.

When a pull comes back empty, say so directly and suggest the likeliest cause —
a date range with no activity, or a value that does not exist in that field.
Zero rows is an answer, not a failure.

## Follow-up questions

Once the file exists, answer questions against it — read it, filter it, count
it. That is what it is for, and it does not touch the database.

When a follow-up needs different records, run the gather script again with the
same session id. The cache handles the rest:

- **Identical request** — the previous file is reused, no query.
- **Same collection, narrower filter, same or fewer columns** — filtered in
  memory from the previous pull, no query.
- **Different collection, or columns that were not in the previous pull** — fresh
  query.

One exception worth knowing: a pull that hit its row limit is never narrowed in
memory. It is only the first slice of what matched, so filtering it would
produce a confident wrong number. Those go back to the database.

## When something goes wrong

The scripts already produce manager-ready messages for missing credentials,
authentication failure, an IP that is not allowlisted, a collection that does not
exist, and an empty result. Pass them through.

Two things not to do. **Do not retry with different credentials** — there is one
read-only account, and if it is rejected that is news for the dev team, not a
problem to route around. **Do not fall back to another source** when the database
is unreachable. Guessing at numbers, or answering from something you read
earlier, is worse than saying the data is not available right now.

The most common failure by far is the Atlas IP allowlist: the database only
accepts connections from approved addresses, and a manager's changes when they
work from home or switch networks. The timeout message says this and tells them
what to send the dev team.

## At the end

Gathered data is temporary by design. Everything lives in a session folder and
is deleted with the session — nothing carries over to tomorrow, which is
deliberate: company records should not accumulate on five laptops. If a manager
wants something durable, they build a report from it, which is a visible act
they chose.

When the conversation is done with the data:

```bash
node scripts/cleanup.js --session <session-id>
```

Anything left behind by an interrupted session is swept automatically on the
next pull.

## More detail

- `../../reference/glossary.md` — what Vogel's terms mean in the data:
  branches, call types, order statuses, who counts as active. Read it when a
  request uses a word that is not a field name.
- `../../reference/query-recipes.md` — worked request files for the shapes that
  come up repeatedly: a date range, a top-N by amount, a status breakdown, a
  cross-collection pull. Read it when composing something beyond a saved query.
- `../../schemas/README.md` — the definition-file contract. Read it when
  someone asks to add a new collection.
