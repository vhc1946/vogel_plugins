'use strict';

/**
 * EXAMPLE DEFINITION — field names here are placeholders, not the real schema.
 *
 * This file exists to show the contract (see schemas/README.md) and to give the
 * plugin something to load on day one. Before anyone relies on it, replace the
 * collection name and every field below with what is actually in Atlas.
 * Everything in this file is data, so that is an edit-and-save job — no code
 * changes anywhere else.
 */

module.exports = {
  collection: 'technicians',

  label: 'Technicians',

  description:
    'One record per field technician employed by Vogel, including their branch, role, and employment status.',

  // Used when someone asks for a time range without naming a field
  // ("techs hired this year").
  dateField: 'hireDate',

  fields: {
    employeeId: {
      type: 'string',
      description: 'Payroll employee number. The identifier managers recognize.',
    },
    firstName: { type: 'string', description: 'Technician first name.' },
    lastName: { type: 'string', description: 'Technician last name.' },
    status: {
      type: 'string',
      description: 'Employment status.',
      // `values` is optional but worth filling in: it is how the skill knows
      // "active techs" means status "active" without guessing.
      values: ['active', 'inactive', 'onLeave'],
    },
    role: {
      type: 'string',
      description: 'Job title, e.g. Service Tech, Install Tech, BEE Tech, Lead.',
      values: ['Service Tech', 'Install Tech', 'BEE Tech', 'Lead'],
    },
    branch: {
      type: 'string',
      description: 'Branch the technician reports to.',
      values: ['St. Louis', 'South County', 'St. Charles'],
    },
    hireDate: { type: 'date', description: 'Date the technician was hired.' },
    terminationDate: {
      type: 'date',
      description: 'Date employment ended. Empty for current employees.',
    },
    certifications: {
      type: 'array',
      description: 'Certifications held, e.g. EPA 608, NATE.',
    },
    phone: { type: 'string', description: 'Work mobile number.' },
    email: { type: 'string', description: 'Vogel email address.' },
    truckNumber: { type: 'string', description: 'Assigned service vehicle number.' },
  },

  // The columns to return when the manager did not name any.
  defaultProjection: ['employeeId', 'firstName', 'lastName', 'role', 'branch', 'status'],

  defaultSort: { lastName: 1 },

  defaultLimit: 500,

  queries: {
    'active techs': {
      description: 'Every technician currently employed, optionally limited to one branch.',
      params: { branch: 'optional — branch name, e.g. "South County"' },
      build: (p) => ({
        filter: Object.assign({ status: 'active' }, p.branch ? { branch: p.branch } : {}),
        sort: { branch: 1, lastName: 1 },
      }),
    },

    'techs by role': {
      description: 'Technicians holding a particular job title.',
      params: { role: 'required — e.g. "BEE Tech"', includeInactive: 'optional — true to include former employees' },
      build: (p) => {
        if (!p.role) throw new Error('This query needs a "role" parameter.');
        return {
          filter: Object.assign({ role: p.role }, p.includeInactive ? {} : { status: 'active' }),
          sort: { lastName: 1 },
        };
      },
    },

    'techs hired since': {
      description: 'Technicians hired on or after a given date — useful for onboarding and headcount checks.',
      params: { since: 'required — a date like "2026-01-01"' },
      build: (p) => {
        if (!p.since) throw new Error('This query needs a "since" parameter, e.g. "2026-01-01".');
        return {
          filter: { hireDate: { $gte: p.since } },
          fields: ['employeeId', 'firstName', 'lastName', 'role', 'branch', 'hireDate', 'status'],
          sort: { hireDate: -1 },
        };
      },
    },
  },
};
