# VHP Query Browser Plugin

This is a Claude Code skill packaged for browser plugin distribution.

## What This Is

A query skill for VHP MongoDB data. Use within Claude Code as a skill, or package for distribution as a browser-loadable plugin.

**Status:** Browser-compatible (uses WebFetch, no special CLI tools needed)

## For Claude Code Use

1. Place in Claude Code plugins folder
2. Invoke as skill: `/vhp-query`
3. See [SKILL.md](./SKILL.md) for full documentation

## For Browser Plugin Distribution

This folder can be packaged as a browser extension:

### Structure

```
.
├── manifest.json          # Plugin metadata (minimal, just declares it exists)
├── SKILL.md               # Full implementation guide
├── FIELDS.md              # Field reference
├── AUTH_SETUP.md          # Auth guide
├── DATA_RELATIONSHIPS.md  # Schema docs
└── icons/
    └── icon-128.png       # Plugin icon
```

### To Use as Browser Plugin

The skill is already browser-compatible (uses WebFetch). To run:

1. **Option A: Within Claude Code**
   - Add this folder to your Claude Code plugins directory
   - Use as a skill in chat

2. **Option B: Manual Browser Use**
   - Copy the logic from SKILL.md into a web app
   - Bundle with your own UI (popup, sidebar, etc.)
   - Host or use locally

### Packaging for Distribution

To create a distributable `.zip`:

```bash
# From plugins directory
zip -r vhp-query-v0.1.0.zip vhp-query/ \
  --exclude='vhp-query/.git*' \
  --exclude='vhp-query/node_modules/*' \
  --exclude='vhp-query/.env'
```

### Icon

Replace `icons/icon-128.png` with your own 128x128 PNG icon.

For a simple icon, the minimal file is:
- PNG format
- 128x128 pixels (or 16x16, 48x48, 128x128 for various uses)
- Transparent background recommended

## Key Files

- **SKILL.md** — Complete implementation guide (the actual plugin code logic)
- **FIELDS.md** — Field reference for queries
- **AUTH_SETUP.md** — Authentication setup
- **DATA_RELATIONSHIPS.md** — Database schema relationships

All logic is in SKILL.md. The skill is 100% browser-compatible via WebFetch.

## Version

- **0.1.0** — Initial browser-compatible skill
