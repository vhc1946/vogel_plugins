---
name: vhp-query
description: "Query VHP projects and tickets. Login once (stores 24hr token in context). Schema-aware queries, caches results in session."
allowed-tools: WebFetch
---

<!-- release: v2.0.0 -->

# VHP Dataset Query

Query Projects and Tickets from MongoDB. First login saves a 24-hour token and user context (companies, techs, estimators). Subsequent queries use cached token. Schema-validated query building ensures correct field names and projections.

## Key Principles

- **Login first:** Check context for token. If missing, prompt once and store for session.
- **Required fields:** Company (`coid`) and date range always. Optional fields (dept, people) only if specified.
- **Date fields:** Projects use top-level `opendate`; Tickets use nested `wo.datecomplete`. Always inclusive bounds (`$gte`/`$lte`).
- **Dates as objects:** Build with `new Date("YYYY-MM-DD")`; server converts for MongoDB.
- **Schema-driven:** Use schema to validate fields and resolve ambiguity. No unnecessary questions about field names.
- **Tech/estimator names:** Auto-resolve user names ("Steve") to codes (ENAST) via login context.
- **Be assumptive:** Show the query fast. Let user modify rather than asking upfront.

## Revenue Queries

For all revenue queries, choose collection first (Active vs Complete tickets), then:

| Question | Approach | Fields/Notes |
|----------|----------|--------------|
| "Project revenue" | Add to projection | `info.contracts` (pricing, contract details) |
| "Project revenue breakdown" | JOIN query | Query Replacement/Bid collections for each type |
| "Service revenue" (tickets) | Add to projection | `invoice` field (complete tickets only) |
| "Service revenue breakdown" | JOIN query | Query Household/Repair for each repair type |

**Rule:** "breakdown" / "by type" / "by category" → use separate queries (joins). "total" / "general" → add field to projection.

**Active vs Complete:** Active tickets rarely have revenue; focus revenue queries on `completetickets` collection.

## Implementation Checklist

When invoked, follow this sequence:

- [ ] **Step 0:** Authentication (silent)
- [ ] **Step 1:** Identify collection from user question
- [ ] **Step 2-4:** Build query (silent, no messages)
- [ ] **Step 5:** Show query, ask to execute
- [ ] **Execute:** POST to proxy, show results
- [ ] **Cache:** Store in context for reuse

---

## Workflow

**Step 0: Authentication & Setup (quiet)**
1. Check context for session token + Claude session ID
2. If both exist AND session ID matches:
   - Silently call GET `/session` to verify token on server
   - If valid → skip to Step 1 (no message)
   - If invalid → silently proceed to step 3
3. If token missing, invalid, or session ID mismatch:
   - **Silently** prompt for username/password (one-time only)
   - POST `/login` to proxy, receive token + user context + maps
   - Store in context: token, user context, Claude session ID, maps
   - Maps include all collection configs with embedded schemas
   - No "logging in" or "authenticating" messages
4. Continue to Step 1 silently

**Context storage (at login):**
- **Token** — Session token for all requests (verified via `/session`)
- **Session ID** — Claude conversation ID (detects restarts)
- **User context** — Companies, techs, estimators (from proxy `/login`)
- **Maps** — Database maps (Replacement, Service, HouseHolds) with embedded schemas (from proxy `/login`)
- **FIELDS.md** — Field reference guide (loaded into chat + used for field detection)

**Maps sourced from proxy server:**
- Organized by database name: `maps.Replacement`, `maps.Service`, `maps.HouseHolds`
- Each collection config includes embedded `.schema` field (no separate schemas)
- Loaded once at login from `/login` response
- Can optionally refresh from `/session?refresh=true` if server-side maps change
- Cached in context for all queries in this session
- Server manages map versions; no client-side map files needed

---

**Step 1: Identify collection and detect joins (maps-driven)**

1. **Read all maps** to load all queryable collections (preferred + non-preferred)
2. **Find all matching collections** for user question:
   - Scan all collections' `keywords` fields for matches
   - Keep list of: matched preferred + matched non-preferred
3. **Resolve join conflicts** (avoid redundant queries):
   - For each matched non-preferred collection:
     - Check if it appears as a join in any matched preferred collection
     - If yes → drop direct query, let preferred collection fetch it as join
     - If no → keep as independent query
4. **Display selected collection(s)**:
   - Primary collection: matched preferred (or non-preferred if no conflicts)
   - Available joins: non-preferred collections in primary's config that match keywords
   - Let user confirm/modify selections
5. **Build query** with:
   - Selected collection
   - Selected filters (coid, date, optional fields)
   - Selected joins (if any)

**Example:**
- User: "Show me projects and bids"
- Matches: `Replacement/projects` (preferred), `Replacement/bid` (non-preferred)
- Conflict: `Replacement/bid` is join of `Replacement/projects`
- Result: Query `projects` + include `Replacement/bid` join (not separate query)

**Rules:**
- All collections are queryable if matched
- Non-preferred collections are skipped if they're already joins of matched preferred collections
- Joins are nested in collection config, named `<database>/<collection>`

**Step 2-4: Build query silently (schema-driven)**

**How it builds the query from the question:**

1. **Extract filters (from question + context):**
   - **coid**: Required. Ask if missing. Auto-resolve company names via user context.
   - **Date range**: Required. Default: past 30 days. Parse natural language: "this week" → last 7 days, "last month" → 30 days back.
   - **dept**: Optional. Include only if user mentioned. Validate against schema.
   - **people (techs/estimators)**: Optional. Auto-resolve names ("Show Steve's tickets") → codes (ENAST) via login context.
   - **Other fields**: Scan question for any field names matching schema, include if valid.

2. **Validate against collection schema:**
   - Use collection's embedded `.schema` field (loaded at login)
   - Verify field names, nesting, and data types
   - Correct ambiguous field names: "completion date" → schema has `wo.datecomplete` → use it
   - If field doesn't exist in schema, suggest closest match or skip

3. **Select projection fields from map + FIELDS.md:**
   - Load FIELDS.md into chat context (user can reference field descriptions)
   - Start with `defaultProjection` from the map file
   - Enhance with user-requested fields:
     - Extract keywords from question (remove stop words: "show", "the", "me", etc.)
     - Match keywords against FIELDS.md descriptions + schema field names
     - Use FIELDS.md "When to include" rules for keyword matching
     - Add matches if not already in default projection
   - Example: "Show tickets with technicians and completion date"
     - Keyword "technicians" → `techs` (from FIELDS.md)
     - Keyword "completion" → `wo.datecomplete` (from FIELDS.md)
     - Default: [id, custid, coid, dept, techs, timelog, status, wo]
     - Enhanced: [id, custid, coid, dept, techs, timelog, status, wo, wo.datecomplete]
   - Never project entire nested objects; only specific fields

4. **Build MongoDB query:**
   - Construct object with validated field names
   - Dates: `{ $gte: new Date("start"), $lte: new Date("end") }`
   - Arrays: `{ $in: [val1, val2] }`
   - Omit optional fields if no value; never send null/[]
   - Example result:
     ```javascript
     {
       coid: "01",
       dept: "350",
       techs: { $in: ["ENAST", "GRIAL"] },
       "wo.datecomplete": { $gte: new Date("2026-09-09"), $lte: new Date("2026-09-16") }
     }
     ```

**Step 5: Show final query (one confirmation)**
Display:
```
Query:
{
  coid: "01",
  dept: "350",
  techs: { $in: ["ENAST", "GRIAL"] },
  "wo.datecomplete": { $gte: new Date("2026-09-09"), $lte: new Date("2026-09-16") }
}

Fields: ["id", "wonum", "custid", "techs", "wo.datecomplete", "wo.status"]
```

Ask: **"Execute? (yes/no/modify)"**
- **yes** → Run query immediately
- **no** → Cancel
- **modify** → User describes changes, rebuild and re-show

**Complete example (what user sees + actual query):**

User asks: "Show me tickets from Steve and Alex in dept 350 completed last week"

Display to user:
```
REQUIRED:
coid      | 01 / company
dateField | wo.datecomplete / ticket completion date
start     | 2026-09-09 / range start
end       | 2026-09-16 / range end

OPTIONAL:
dept      | 350 / department
techs     | ENAST, GRIAL / technicians
```

Actual query executed:
```javascript
{
  coid: "01",
  dept: "350",
  techs: { $in: ["ENAST", "GRIAL"] },
  "wo.datecomplete": { $gte: new Date("2026-09-09"), $lte: new Date("2026-09-16") }
}
```

Projection: `["id", "wonum", "custid", "techs", "wo.datecomplete", "wo.status"]`

### Query Structure Examples

**Minimal query (only required fields):**
```javascript
{
  coid: "01",
  opendate: { $gte: new Date("2026-08-17"), $lte: new Date("2026-09-16") }
}
```

**Query with optional dept:**
```javascript
{
  coid: "01",
  dept: "350",
  opendate: { $gte: new Date("2026-08-17"), $lte: new Date("2026-09-16") }
}
```

**Query with optional techs (Tickets — techs at top level, dates nested in wo):**
```javascript
{
  coid: "01",
  techs: { $in: ["ENAST", "GRIAL"] },
  "wo.datecomplete": { $gte: new Date("2026-08-17"), $lte: new Date("2026-09-16") }
}
```

**Key rules:** 
- If a field has no value, omit it entirely. Never send `null`, `[]`, or empty strings.
- **Dates MUST be built with `new Date("YYYY-MM-DD")`** in the query object. When JSON stringifies, they become ISO strings; server converts them back to Date objects before MongoDB query.

## Query Optimization

**Always check cache before querying:**
- Before executing any query, scan cache for matching filters/date ranges
- If data already cached, reuse it (optionally merge new fields)
- Only query MongoDB for data not already in context

**Skip redundant messages:**
- If only date range changes (same coid, dept, people), ask once: "Change dates to [start] - [end]?" then proceed
- Don't re-show the full filter list

**Merge intelligently:**
- Date range extension: fetch only missing dates, merge with existing
- New fields on same range: query only new fields for cached IDs, merge
- Subset of cached range: filter cache in-memory, no query needed

## Result Caching (Session Context)

Cache stores query metadata + results in conversation context. Before executing, check cache for existing data.

**Cache structure (per collection):**
```javascript
{
  "Replacement/projects": [
    {
      filters: { coid: "01", opendate: { $gte, $lte } },
      projection: ["id", "name", "custid", ...],
      results: [{id, name, custid, ...}, ...],
      dateRange: { start: Date, end: Date },
      fetchedAt: timestamp
    }
  ]
}
```

**Cache logic:**

| Scenario | Action |
|----------|--------|
| **New query** | Execute, cache results + metadata |
| **Same filters, same fields** | Return cached results (no query) |
| **Extended date range** | Check if cached range covers new range. If partial overlap, fetch missing dates, merge results |
| **Same date range, new fields** | Merge new fields into existing cached records (incremental query for missing fields only) |
| **Different filters** | Execute new query, add to cache |
| **Subset of cached range** | Return filtered results from cache (no query) |

**Examples:**
1. User: "Projects from last month" → Cache 1 month of projects
2. User: "Make that last 2 months" → Detect cached 1-month, fetch additional month, merge
3. User: "Show revenue too" → Merge `info.contracts` into cached records
4. User: "What about 6 months?" → Extend cache backward to cover full 6 months
5. User: "Just show me July projects" → Return July subset from existing 6-month cache (no query)

**Transparency:** Note when using cached data vs executing fresh query

## Collections (Map-Driven)

Collections are queryable ONLY if defined in the maps. Maps declare:
- Database name (`db`)
- Collection name (`collect`)
- `defaultProjection` — fields returned
- `queryFields` — allowed filters
- `joins` (optional) — nested as `<database>/<collection>`

**Maps = Single Source of Truth**

| Map File | DB | Collection | Queryable | Joins |
|----------|-----|---------|----------|-------|
| `maps/projects.json` | `Replacement` | `projects` | ✅ | `Replacement/replacement`, `Replacement/bid` |
| `maps/service.json` | `Service` | `activetickets` | ✅ | `Service/repair` |
| `maps/service.json` | `Service` | `completetickets` | ✅ | `Service/repair` |

**Join naming:** `<database>/<collection>` maps directly to map config.
**Rule:** No hardcoded collections. Query builder reads maps for valid queries.

Query format: `{"db": "<Replacement|Service>", "collect": "<collection>", "method": "QUERY", "options": {"query": {...}, "projection": [...]}}`

- **Projects:** `db: "Replacement"`, `collect: "projects"`
- **Active Tickets:** `db: "Service"`, `collect: "activetickets"`
- **Complete Tickets:** `db: "Service"`, `collect: "completetickets"`

### Joins (Nested in Collection Config)

Joins are declared in the collection config, named `<database>/<collection>`:

```json
{
  "db": "Replacement",
  "collect": "projects",
  "joins": {
    "Replacement/replacement": {
      "via": "id",
      "desc": "Revenue breakdown by Replacement items"
    },
    "Replacement/bid": {
      "via": "id",
      "desc": "Revenue breakdown by Bid items"
    }
  }
}
```

**Two-pass query pattern (user asks for breakdown):**

1. **Main query:** Get projects with filters → collect IDs
   - Query: `{dept: "350", coid: "01"}` on `Replacement/projects`
   - Result: `[id_1, id_2, ...]`

2. **Join query:** Use IDs to fetch related records
   - Query: `{projectId: {$in: [id_1, id_2, ...]}}` on `Replacement/replacement`
   - Result: Breakdown items

Display both: summary + detail.

**Join resolution:** Map file declares where join data lives (`<database>/<collection>`), query builder knows exact config to load.

## Authentication & Session

**Initial login:** Full messaging allowed. **Returning with stored token:** Completely silent.

### First Query - Initial Login

1. Check context for token + Claude session ID
2. If token missing or session ID mismatch:
   - Prompt for username/password (messages OK on first login)
   - POST `/login`, receive token + user context
   - Load schemas, store in context
   - Message: "Ready to query"
3. Continue to Step 1 for query

### Returning to Chat (Token Stored)

1. Check context for token + Claude session ID (silent)
2. If token exists AND session ID matches:
   - **Silently verify** via `/session` endpoint
   - If valid → proceed to Step 1 (no message, no prompt)
   - If invalid → silently re-auth (if possible) or gracefully handle
3. User sees no credential prompt, no status messages

### Storage (Context Variables)

- **Token** — Session token (24hr validity, verified via `/session`)
- **Session ID** — Claude conversation ID (detects restarts)
- **User context** — Companies, techs, estimators
- **Schemas** — Field definitions (all queries, no re-read)
- **Query cache** — Results in this conversation

### Subsequent Queries

- Silently verify token via `/session`
- If valid → query immediately (no message)
- Use cached results when applicable

**Rule:** 
- **First time:** Full auth messaging OK
- **Every time after:** Completely silent, no credential re-prompt

## User Context (Auto-Loaded at Login)

After successful login, context is saved with:
- **Companies & Departments** — Dynamic list available to user
- **Technicians & Estimators** — Employee codes and names

Used for:
- Resolving tech/estimator names to codes: "Show Steve's tickets" → finds code ENAST
- Pre-populating available companies/departments
- Auto-filtering based on user's role

Example: User says "tickets from Steve" → Context has Steve → resolved to tech code ENAST automatically

## Error Handling

| Error | Action |
|-------|--------|
| "Invalid or expired session token" | Call `login.js` to re-authenticate |
| Field not found in schema | Suggest correct field name from schema |
| Query returns no results | Verify filters (coid, date range) are correct |
| Server error (500) | Check proxy server is running; report to user |

On any error: **Stop, explain the issue to user, suggest fix.**

## Schemas

Schemas are embedded in each collection config in the maps. Access via collection's `.schema` field:

```javascript
// From loaded maps
const replacement = maps.Replacement;
const projectCollection = replacement.collections.find(c => c.collect === "projects");
const projectSchema = projectCollection.schema;
```

Schema structure organized by database:
- `Replacement` — Project, Bid, Setting, Replacement schemas
- `Service` — ActiveTicket, CompleteTicket, Repair schemas
- `HouseHolds` — Home, Client, ServiceItem schemas
- `Company` — Employee, Device, Account, Profile schemas

No separate schema files needed—everything is embedded in the map collections.


## Proxy Server Endpoints

### GET/POST `/login`
**GET Request:**
```
GET /login?user=username&pswrd=password
```

**POST Request:**
```json
{ "user": "username", "pswrd": "password" }
```

**Response:**
```json
{
  "success": true,
  "token": "session-token-here",
  "expiresIn": 86400,
  "user": {
    "companies": [...],
    "users": [...]
  },
  "maps": {
    "Replacement": { "route": "...", "collections": [...] },
    "Service": { "route": "...", "collections": [...] },
    "HouseHolds": { "route": "...", "collections": [...] }
  }
}
```

Each collection in maps includes embedded `.schema` field.

### GET `/session` (with X-Session-Token header)
**Response:**
```json
{
  "success": true,
  "expiresIn": 86000,
  "user": "username"
}
```

### GET `/PROJECTS/ROUTEmart` (or any query route)
**Request:**
```
GET /PROJECTS/ROUTEmart?db=Replacement&collect=projects&method=QUERY&options=<url-encoded-json>
Headers: X-Session-Token: <token>
```

**Options parameter (URL-encoded JSON):**
```json
{
  "query": {
    "coid": "01",
    "opendate": { "$gte": "2026-09-01T00:00:00.000Z", "$lte": "2026-09-30T23:59:59.999Z" }
  },
  "projection": ["id", "name", "custid", "stage", "status"]
}
```

**Response:**
```json
{
  "success": true,
  "result": [
    { "id": "RRQ-1788277081452", "name": "Project 1", ... },
    { "id": "RRQ-1788351957852", "name": "Project 2", ... }
  ]
}
```

Endpoints support both GET (query params, browser-compatible) and POST (body, for CLI/server).

## Implementation Procedures

### Procedure: Get or Create Session

```
1. Load from context: vhpSession = {token, sessionId, userData, maps, queryCache}
2. If token missing:
   → Prompt user for username and password (silent, no intro)
   → POST /login with {user, pswrd}
   → Parse response: {token, user, maps, expiresIn}
   → Get current session ID: sessionId = getCurrentSessionId()
   → Store in context: vhpSession = {token, sessionId, userData: user, maps, queryCache: {}}
3. If token exists and sessionId matches:
   → Call GET /session with X-Session-Token: token
   → Parse response: fresh {user, maps, expiresIn}
   → Update in context: vhpSession.userData = user, vhpSession.maps = maps
4. Return vhpSession (ready for queries)
```

### Procedure: Match Collection

```
Input: user question, maps
1. Extract keywords from question (remove "show", "me", "the", etc.)
2. For each database in maps (Replacement, Service, HouseHolds):
   For each collection in database.collections:
     Calculate match score = keyword overlap with collection.keywords + collection.desc
3. Find collection with highest match score (preferred first)
4. If multiple matches with same score, ask user to clarify
5. Return: matched collection config (including .schema)
```

### Procedure: Extract Filters

```
Input: user question, matched collection, maps (for joins)
1. REQUIRED: coid (company)
   → Check userData.companies for matches from question
   → If multiple matches, ask which company
   → If none mentioned, use first/default company
2. REQUIRED: date range
   → Parse natural language ("this week" → 7 days, "last month" → 30 days)
   → Default: past 30 days if not specified
   → Determine date field from collection (opendate vs wo.datecomplete)
3. OPTIONAL: dept, techs, estimators
   → Extract if mentioned in question
   → Auto-resolve names via userData: "Steve" → find code in userData.users
4. OPTIONAL: status, stage, other fields
   → Scan question for field names matching schema
   → Include if found and valid
5. Return: {coid, dateField, startDate, endDate, ...optionals}
```

### Procedure: Select Projections

```
Input: collection.defaultProjection, question, collection.schema, FIELDS.md
1. Start with: projection = collection.defaultProjection
2. Extract keywords from question
3. Use FIELDS.md to map keywords to field names:
   - "technician" → add "techs"
   - "completion" → add "wo.datecomplete"
   - "cost" → add "final.invoice" or "price"
   - etc.
4. Add matching fields to projection (no duplicates)
5. Never project entire nested objects (only specific fields like wo.datecomplete, not wo)
6. Return: projection array with all fields
```

### Procedure: Build Query

```
Input: filters, collection.schema, projection
1. Initialize: query = {}
2. For each filter:
   - If date range: query[dateField] = {$gte: new Date(start), $lte: new Date(end)}
   - If array (techs): query[field] = {$in: [values]}
   - If string: query[field] = value
   - Skip fields with no value
3. Validate all field names against collection.schema
4. Build final query object:
   {
     db: collection.db,
     collect: collection.collect,
     method: "QUERY",
     options: {
       query: query,
       projection: projection
     }
   }
5. Return: query object ready for POST
```

### Procedure: Execute Query (Browser-Compatible via GET)

```
Input: query object, token, proxy base URL = `${user_config.proxy_url}` (set per user at plugin install)
   options = {query: {...}, projection: [...]}
   encodedOptions = encodeURIComponent(JSON.stringify(options))
2. Build GET URL:
   url = "${user_config.proxy_url}" + collection.route + "?db=" + collection.db + 
         "&collect=" + collection.collect + "&method=QUERY&options=" + encodedOptions +
         "&token=" + token
3. Fetch using WebFetch (browser-compatible):
   WebFetch(url, "Extract result data from {success, result}")
4. Parse response JSON: {success, result}
5. On success:
   → Cache in context: vhpSession.queryCache[queryKey] = {query, result, timestamp}
   → Display results
6. On error (401):
   → Token expired, recurse to Get or Create Session
7. On error (other):
   → Display error to user, suggest checking proxy server
```

**Note:** GET requests work in browser (WebFetch-compatible). POST also supported on proxy for CLI/Node.js.

### Procedure: Detect Joins

```
Input: user question, matched collection, maps
1. Extract keywords: "breakdown", "by type", "by category", "revenue", "costs", "detail"
2. For each join in collection.joins:
   - Score = keyword overlap with join.desc
   - If score > 0, mark as candidate
3. If candidates found:
   → Ask user: "Include breakdown by [join name]?" or auto-include top match
   → Return list of selected joins
4. If no candidates, return empty (no joins)
```

### Procedure: Cache Management

```
Maintain in context: vhpSession.queryCache = {
  "Replacement/projects_dept350": {
    query: {db, collect, query, projection},
    result: [{id, name, ...}, ...],
    dateRange: {start, end},
    timestamp: Date.now()
  }
}

Before executing query:
1. Generate cache key from {db, collect, dept, coid, dateRange}
2. Check if key exists in queryCache
3. If exists and date range covers requested range:
   → Return cached.result (filtered if subset requested)
   → Display: "Using cached results from [time ago]"
4. If date range partially overlaps:
   → Fetch only missing dates
   → Merge results by ID
5. If new fields requested for cached records:
   → Fetch only new fields for cached IDs
   → Merge into cached records
```

## Requirements

- **Proxy server:** Must be running and reachable at `${user_config.proxy_url}` — the URL each user entered when installing the plugin
- **Skill stores:** Token, user context, maps, and query cache in conversation context (no file I/O)
