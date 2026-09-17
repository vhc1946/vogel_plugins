# VHP Query Fields Reference

This document describes key queryable fields for each collection. Use to understand what data is available and when fields are needed to answer questions.

---

## Replacement/projects

**Key identifier fields:**
- `id` — Unique project ID
- `custid` — Customer ID
- `name` — Project name/address

**Status & stage:**
- `status` — Project status (lead, submitted, approved, scheduled, closed, cancelled, removed, inprogress)
- `stage` — Project type (quote, job, pvmaint)
- `sold` — Whether sold/approved (boolean)

**Organizational:**
- `dept` — Department code (e.g., "350")
- `estimator` — Estimator code
- `techs` — Array of technician codes assigned

**Dates:**
- `opendate` — Project created/opened date
- `closedate` — Project closed/completed date
- `scheddate` — Scheduled date
- `lastdate` — Last activity date

**Financial/Contractual:**
- `price` — Base price/quote amount
- `info.contracts` — Contract details and pricing (use for revenue queries)

**When to include:**
- Filtering by dept, estimator, techs → include those fields
- Analyzing by status/stage → include `status`, `stage`
- Revenue queries → include `price`, `info.contracts`
- Timeline analysis → include date fields

---

## Service/completetickets

**Key identifier fields:**
- `id` — Unique ticket ID
- `custid` — Customer ID
- `wonum` — Work order number

**Status & categorization:**
- `status` — Ticket status (complete, submitted, etc.)
- `cat` — Category/type of service

**People:**
- `techs` — Array of technician codes who worked ticket
- `dept` — Department code

**Dates:**
- `wo.datecomplete` — Completion date
- `wo.dateschedule` — Scheduled date
- `timelog` — Array of activity logs with timestamps

**Financial:**
- `final.invoice` — Invoice information/amount
- `final.ticketTime` — Total time spent
- `final.conform` — Conformance/completion flag

**When to include:**
- Filtering by tech, dept → include `techs`, `dept`
- Analyzing completion → include `wo.datecomplete`, `final.ticketTime`
- Revenue queries → include `final.invoice`
- Timeline analysis → include `wo.datecomplete`, `timelog`

---

## Service/activetickets

**Key identifier fields:**
- `id` — Unique ticket ID
- `custid` — Customer ID
- `wonum` — Work order number

**Status & assignment:**
- `status` — Current status (open, assigned, in-progress, pending)
- `dept` — Department code

**People:**
- `techs` — Array of technician codes assigned

**Dates:**
- `wo.datearrival` — Expected arrival/scheduled date
- `timelog` — Activity logs

**When to include:**
- Filtering by tech, dept → include `techs`, `dept`
- Current workload analysis → include `status`, `wo.datearrival`
- Timeline analysis → include `timelog`, `wo.datearrival`

---

## Replacement/replacement (Join from projects)

**Key fields:**
- `projectId` — Links to projects.id
- `description` — What was replaced/repaired
- `cost` — Material/labor cost
- `date` — Replacement date

**When needed:**
- User asks for "breakdown by type", "costs by item", "what was replaced"
- Use as join: projects → replacements (two-pass query)

---

## Service/repair (Join from tickets)

**Key fields:**
- `ticketId` — Links to completetickets.id
- `description` — Repair type/description
- `cost` — Labor/parts cost
- `date` — Repair date

**When needed:**
- User asks for "breakdown by repair type", "repair costs", "what repairs were done"
- Use as join: tickets → repairs (two-pass query)

---

## Field Detection Rules

When user asks a question, check if they mention:

| Keyword | Likely needs | Add to projection |
|---------|-------------|-------------------|
| "technician", "tech", "who" | People tracking | `techs` |
| "department", "dept" | Org filtering | `dept` |
| "complete", "done", "finished" | Completion info | `wo.datecomplete`, `status`, `final.invoice` |
| "cost", "price", "revenue", "breakdown" | Financial data | `price`, `info.contracts`, `final.invoice` |
| "when", "date", "timeline", "schedule" | Time-based analysis | date fields (varies by collection) |
| "status", "state", "what's the status" | Current state | `status` |
| "assigned", "who's working", "workload" | Assignment tracking | `techs`, `status` |

Always start with `defaultProjection` from the map, then enhance based on detected keywords.
