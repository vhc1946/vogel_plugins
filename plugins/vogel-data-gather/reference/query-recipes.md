# Query recipes

Worked request files for the shapes that come up repeatedly. Each one is a
complete file to write and pass to `node scripts/gather.js --request-file`.

Collection and field names below come from the example definitions that ship
with the plugin. Check `node scripts/catalog.js` for what is actually available
before copying one.

---

## Everything, default columns

The simplest possible request. Uses the data set's default projection, sort and
limit.

```json
{ "collection": "technicians" }
```

## A saved query

Always prefer this when one fits. Saved queries were written by someone who
knows the data, so the status values and field spellings are already right.

```json
{
  "collection": "salesOrders",
  "query": "sales by month",
  "params": { "month": "2026-03" }
}
```

## A date range

Omit `field` and the data set's own date field is used. Name it when the
manager means a different one — "orders installed in March" is `installedAt`,
not `soldAt`, and picking the wrong one produces a believable wrong answer.

```json
{
  "collection": "salesOrders",
  "timeRange": { "from": "2026-03-01", "to": "2026-03-31" }
}
```

```json
{
  "collection": "salesOrders",
  "timeRange": { "from": "2026-03-01", "to": "2026-03-31", "field": "installedAt" }
}
```

Resolve relative dates before writing the file. "Last month" becomes real dates;
the script does not parse English.

## Several conditions

Keys combine with AND.

```json
{
  "collection": "salesOrders",
  "filter": {
    "branch": "South County",
    "status": { "$in": ["sold", "scheduled"] },
    "totalAmount": { "$gte": 5000 }
  }
}
```

## A saved query, narrowed

`filter` merges on top of whatever the saved query produced, so you can reuse a
good starting point instead of rebuilding it.

```json
{
  "collection": "salesOrders",
  "query": "sales by month",
  "params": { "month": "2026-03" },
  "filter": { "equipmentType": "heat pump" }
}
```

## Specific columns

Ask for fewer columns when the manager named what they want. Note that the
plugin always stores any field a filter touches, so a later narrower question
can be answered from this file rather than another query.

```json
{
  "collection": "technicians",
  "fields": ["employeeId", "firstName", "lastName", "branch", "hireDate"],
  "filter": { "status": "active" }
}
```

## Top N by amount

There is no aggregation in this plugin, and that is on purpose — sorting and
limiting gets you the same answer with the working visible.

```json
{
  "collection": "salesOrders",
  "filter": { "status": { "$in": ["sold", "scheduled", "installed"] } },
  "timeRange": { "from": "2026-01-01", "to": "2026-03-31" },
  "sort": { "totalAmount": -1 },
  "limit": 25
}
```

Watch the limit here. A `limit: 25` sorted descending is a genuine top 25. The
same request with the default 500 and thousands of matching orders is *not* the
top 500 of the year unless the sort is on the thing being ranked — check that
the sort field and the ranking question agree before reporting a number.

## A breakdown, for counting afterwards

When someone wants "sales by rep" or "calls by branch", pull the rows with the
grouping field included and count from the file. The plugin's job ends at the
records.

```json
{
  "collection": "salesOrders",
  "fields": ["orderNumber", "salesRep", "branch", "totalAmount", "soldAt"],
  "timeRange": { "from": "2026-01-01", "to": "2026-03-31" },
  "filter": { "status": { "$in": ["sold", "scheduled", "installed"] } }
}
```

Then read the CSV and total it. Say how many rows the totals are based on, and
if the pull was truncated, say the totals are partial — a capped file summed
without comment is a wrong number delivered with confidence.

## Text search

`$regex` is a case-insensitive contains. Useful when a manager remembers part of
a name.

```json
{
  "collection": "salesOrders",
  "filter": { "customerName": { "$regex": "henderson" } }
}
```

## Missing or present

```json
{
  "collection": "salesOrders",
  "filter": { "installedAt": { "$exists": false }, "status": "sold" }
}
```

## Two collections

There is no join. Pull each separately with the same session id, then match them
up from the two files.

```json
{ "collection": "technicians", "query": "active techs" }
```

```json
{
  "collection": "salesOrders",
  "timeRange": { "from": "2026-03-01", "to": "2026-03-31" }
}
```

Names are the usual link, and names are a weak key — spelling and nicknames
differ between systems. Say how many records matched up and how many did not,
rather than presenting a clean total that quietly dropped the ones that failed
to match.

---

## Getting the most out of the cache

The cache keys on collection, filters and columns. Two habits keep it working:

**Reuse the session id.** Every call after the first takes `--session <id>` with
the id the first call printed. Without it each pull starts a fresh cache and
re-queries data already on disk.

**Go broad, then narrow.** A wide pull followed by narrower questions is
answered from memory. The reverse — several narrow pulls — hits the database
every time.

```json
{ "collection": "salesOrders", "timeRange": { "from": "2026-01-01", "to": "2026-03-31" } }
```

then

```json
{
  "collection": "salesOrders",
  "timeRange": { "from": "2026-01-01", "to": "2026-03-31" },
  "filter": { "branch": "South County" }
}
```

The second is answered from the first: same collection, every original condition
still present, no new columns. Change a column list or drop one of the original
conditions and it is a fresh query, which is correct — the previous file simply
does not contain the answer.

The one case where a narrower filter still re-queries is a first pull that hit
its row limit. Those are only the first slice of what matched, so narrowing them
would produce a confident wrong number. If you expect follow-up questions, make
the first pull one that fits under the limit.
