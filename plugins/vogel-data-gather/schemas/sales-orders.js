'use strict';

/**
 * EXAMPLE DEFINITION — field names here are placeholders, not the real schema.
 *
 * Second example, shown alongside technicians.js because it exercises the parts
 * of the contract that one file alone does not: a money field, a date field used
 * for month ranges, and a parameterized query that computes its own boundaries.
 * Replace with the real collection before anyone uses it for a report.
 */

/** Turns "2026-03" into the first instant of that month and of the next one. */
function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
    throw new Error('The "month" parameter should look like "2026-03".');
  }
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(mon === 12 ? year + 1 : year, mon === 12 ? 0 : mon, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

module.exports = {
  collection: 'salesOrders',

  label: 'Sales Orders',

  description:
    'One record per equipment sale written by a comfort consultant, including the amount, the rep, and where it stands.',

  dateField: 'soldAt',

  fields: {
    orderNumber: { type: 'string', description: 'Sales order number shown to the customer.' },
    customerName: { type: 'string', description: 'Customer the order was written for.' },
    branch: {
      type: 'string',
      description: 'Branch credited with the sale.',
      values: ['St. Louis', 'South County', 'St. Charles'],
    },
    salesRep: { type: 'string', description: 'Comfort consultant who wrote the order.' },
    status: {
      type: 'string',
      description: 'Where the order stands.',
      values: ['quoted', 'sold', 'scheduled', 'installed', 'cancelled'],
    },
    totalAmount: { type: 'number', description: 'Total contract amount in dollars.' },
    equipmentType: {
      type: 'string',
      description: 'Primary equipment category on the order.',
      values: ['furnace', 'ac', 'heat pump', 'water heater', 'IAQ', 'other'],
    },
    soldAt: { type: 'date', description: 'Date the order was signed.' },
    installedAt: { type: 'date', description: 'Date the equipment was installed. Empty until then.' },
    leadSource: { type: 'string', description: 'Where the lead came from, e.g. referral, web, repeat.' },
  },

  defaultProjection: ['orderNumber', 'soldAt', 'customerName', 'salesRep', 'branch', 'status', 'totalAmount'],

  defaultSort: { soldAt: -1 },

  defaultLimit: 500,

  queries: {
    'sales by month': {
      description:
        'Every signed order in one calendar month. Returns the individual orders — totals and ' +
        'breakdowns are something to work out from the file afterwards.',
      params: { month: 'required — "YYYY-MM", e.g. "2026-03"', branch: 'optional — branch name' },
      build: (p) => {
        const { start, end } = monthBounds(p.month);
        return {
          filter: Object.assign(
            { status: { $in: ['sold', 'scheduled', 'installed'] }, soldAt: { $gte: start, $lt: end } },
            p.branch ? { branch: p.branch } : {}
          ),
          sort: { soldAt: 1 },
        };
      },
    },

    'sales by rep': {
      description: 'Orders written by one comfort consultant, newest first.',
      params: { salesRep: 'required — the rep name as it appears on orders', since: 'optional — a date like "2026-01-01"' },
      build: (p) => {
        if (!p.salesRep) throw new Error('This query needs a "salesRep" parameter.');
        return {
          filter: Object.assign({ salesRep: p.salesRep }, p.since ? { soldAt: { $gte: p.since } } : {}),
          sort: { soldAt: -1 },
        };
      },
    },

    'open orders': {
      description: 'Orders that are sold or scheduled but not yet installed — the current backlog.',
      params: {},
      build: () => ({
        filter: { status: { $in: ['sold', 'scheduled'] } },
        fields: ['orderNumber', 'soldAt', 'customerName', 'branch', 'salesRep', 'equipmentType', 'totalAmount', 'status'],
        sort: { soldAt: 1 },
      }),
    },
  },
};
