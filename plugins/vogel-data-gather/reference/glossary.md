# Vogel terms, and what they mean in the data

A manager's words and the database's field names are not the same vocabulary.
This file maps one to the other. Read it when a request uses a term that is not
a field name in the catalog.

> **Status: needs review by the VHP Dev Team.** The mappings below are the
> working assumptions this plugin ships with. Correct anything that is wrong —
> a wrong mapping here does not produce an error, it produces a plausible number
> that is quietly incorrect, which is worse.

## People

**Tech / technician** — a field employee who runs service or install calls.
Covers Service Techs, Install Techs, BEE Techs and Leads unless the manager
narrows it.

**BEE Tech** — Building Energy Efficiency technician. A distinct role, not a
seniority level. "Techs" includes them; "service techs" does not.

**Comfort consultant** — the sales role. They write sales orders. A request
about "reps" or "salespeople" means comfort consultants, and lives in sales
orders, not technicians.

**Active** — currently employed. In the technicians data this is
`status: 'active'`, not "has a termination date that is empty" — those can
disagree, and status is the one the office maintains.

**Headcount** — how many active people, usually broken out by branch or role.
Gather the active records and count from the file.

## Places

**Branch** — the physical location a person or job belongs to. Managers use the
short name ("South County"); the database stores the full string. Check the
field's `values` in the catalog before filtering, because a near-miss spelling
returns zero rows rather than an error.

**In the field** — not a data concept. Someone asking "who's in the field today"
wants dispatch, which this plugin does not read. Say so rather than substituting
a list of active techs.

## Work

**Call / service call** — one dispatched visit. Not the same as an invoice: one
call can produce several, and warranty calls produce none.

**Open** — not yet closed out by the technician. Usually means both `open` and
`dispatched` statuses; a call that has been assigned is still open from a
manager's point of view. When counting "open calls", include both unless they
say otherwise.

**Closed / completed** — the tech finished and closed the call out. Filter on
the completion date, not the opened date. "Calls we closed last week" and "calls
that came in last week" are different sets and managers move between the two
phrasings without noticing.

**Callback** — a return visit for the same problem. If the data does not mark
these explicitly, say that rather than approximating it from customer name and
date; an approximate callback rate is the kind of number that ends up in a
performance conversation.

## Money and sales

**Sold** — the customer signed. In sales orders this is the `sold` status and
the `soldAt` date. A quote is not a sale.

**Sales for March** — orders signed in March, by sign date, regardless of when
the equipment gets installed. If a manager means installs, they will say
"installed". Worth confirming when the number is going somewhere consequential,
because the two can differ by a lot in a busy month.

**Backlog** — sold or scheduled but not yet installed.

**Revenue** — this plugin returns order and invoice amounts as they are stored.
It does not know about adjustments, financing, or recognition rules. Hand back
the rows; let Finance turn them into revenue.

## Time

**This month / last month** — calendar months, not trailing 30 days.

**This quarter** — calendar quarter. Confirm if it matters; some reporting at
Vogel runs on a fiscal year that does not start in January. *(Unverified — the
dev team should settle this.)*

**Season** — heating season and cooling season are real distinctions in this
business but have no fixed dates in the data. Ask which months they mean.

## Things this plugin does not know about

Dispatch board and technician schedules, timesheets and payroll, inventory and
truck stock, customer communications, anything in the VHP portal that is not in
this database, and anything in AWS. If a request needs one of these, say it is
not in the data this plugin reads rather than finding the nearest available
substitute.
