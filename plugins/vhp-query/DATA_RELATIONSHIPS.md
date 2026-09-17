# VHP Data Relationships

This guide describes how the different data sets relate to each other.

## Core Collections

### Replacement (Projects Database)
**Table: projects** - Job estimates, contracts, leads
- **id** - Project ID (e.g., "RRQ-1767802909090")
- **custid** - Links to customer ID
- **hhid** - Links to household/property
- **dept** - Department (350=Residential Replacement, 450=Commercial Replacement)
- **stage** - quote | job | pvmaint
- **status** - lead|submitted|approved|scheduled|closed
- **techs** - Array of technician IDs
- **opendate** - Project creation date
- **closedate** - Project completion date
- **price** - Contract/estimate value
- **info** - Object containing contract details, pricing breakdown

**Linked Collections (via id):**
- `replacement` - Revenue breakdown by individual replacement line items
- `bid` - Revenue breakdown by bid line items

---

### Service (Tickets Database)
**Table: tickets** - Field service work orders, maintenance calls
- **id** - Ticket ID (e.g., "SVC-1767802909090")
- **custid** - Links to customer ID
- **coid** - Company ID (01=Vogel, 02=BEE, 05=Mechanical)
- **dept** - Department (300=Residential Service, 400=Commercial Service)
- **techs** - Array of technician IDs assigned
- **status** - complete|pending|cancelled
- **wo** - Work order number
- **completedate** - When ticket was closed
- **invoice** - Invoice/billing information
- **hhid** - Links to household/property

**Linked Collections (via id):**
- `Repair` - Breakdown by individual repair line items
- `Household` - Repair service type breakdown

---

### Households (Customer Database)
**Table: homes** - Properties/locations served
- **id** - House/property ID
- **custid** - Links to customer
- **address** - Property location
- **street, city, state, zip** - Address components
- **serviceitem** - Array of installed equipment/systems (HVAC, plumbing, etc.)

**Table: clients** - Customer contact info
- **id** - Customer ID (custid)
- **name** - Customer name
- **email, phone** - Contact information
- **service_items** - Types of services used

---

### Company (Organization Database)
**Table: employees** - Technicians and staff
- **id** - Technician/employee ID
- **name** - Full name
- **dept** - Department assigned
- **status** - active|inactive

---

## Common Query Patterns

### "Show me projects for [department]"
- Query: `projects` with `dept: "350"` (or other dept code)
- Gives: All projects in that department with dates, status, price
- Follow-up: Can join with `replacement` table for line-item breakdown

### "How many tickets did [technician] complete"
- Query: `tickets` with `techs: [tech_id]` and `status: "complete"`
- Count results grouped by tech
- Follow-up: Join with `Repair` for breakdown by repair type

### "What's the revenue for [department] in [date range]"
- Query: `projects` with `dept` and `opendate` range, get `price` + `info.contracts`
- OR `tickets` with `dept` and `completedate` range, get `invoice`
- Follow-up: Join with `replacement`/`Repair` for breakdown by type

### "Show me all work for [customer]"
- Query: Both `projects` and `tickets` with `custid: [customer_id]`
- Gives: All projects and service calls for that customer
- Follow-up: Can drill down by date, technician, or type

---

## Field Mappings by Department

**Projects (Replacement)**
- 350 = Residential Replacement
- 450 = Commercial Replacement

**Service (Tickets)**
- 300 = Residential Service
- 400 = Commercial Service
- RES.RM = Residential Maintenance
- COM.SRV = Commercial Maintenance

**Companies**
- 01 = Vogel Heating and Cooling
- 02 = Building Envelope Experts (BEE)
- 05 = Vogel Mechanical

---

## Date Fields to Use

When filtering by date:
- **Projects**: Use `opendate` (creation) or `closedate` (completion)
- **Service**: Use `completedate` (when work was finished)
- **Default**: Last 30 days if not specified

---

## Required Filters

For any query, you typically need:
1. **Company** (coid) - Which company (01, 02, 05)
2. **Department** (dept) - Which department/service line
3. **Date range** - start/end dates
4. Optional: **Technician** (techs), **Customer** (custid), **Status**

---

## Cached Data

Once queried, results are cached in memory for the conversation. Follow-up questions can:
- Filter the cached results further
- Aggregate (sum revenue, count tickets, etc.)
- Break down by department, technician, status, or date
- Without needing a fresh query
