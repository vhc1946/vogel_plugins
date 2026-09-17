/**
 * VHP Query Skill - Entry point for Claude Code plugin discovery
 * Skill implementation details are fully documented in SKILL.md
 */

module.exports = {
  name: 'vhp-query',
  version: '0.1.11',
  description: 'Query VHP projects and tickets. Login once (stores 24hr token in context). Schema-aware queries, caches results in session.',
  author: 'VHP Dev Team',
  type: 'skill',
  allowedTools: ['WebFetch'],
  browserCompatible: true,
  documentation: 'SKILL.md',
  invoke: {
    description: 'Query VHP projects and tickets from MongoDB',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query about projects or tickets (e.g., "Show me tickets from Steve in dept 350 completed last week")'
        }
      },
      required: ['query']
    }
  }
};
