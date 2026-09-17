# Vogel Claude Plugins

Internal Claude plugins for Vogel Heating and Cooling. Managers add this
marketplace once; after that, every change the dev team pushes to `main` reaches
them automatically.

## Repository layout

```
.claude-plugin/
  marketplace.json               the catalog Claude reads
plugins/
  vogel-tools/                   the one plugin managers install
    .claude-plugin/plugin.json
    skills/
      vhp-query/SKILL.md         one folder per skill
```

One plugin, many skills. Adding a skill later does not make managers install
anything new.

## For managers - one-time setup

In Claude Code:

```
/plugin marketplace add vhc1946/vogel_plugins
/plugin install vogel-tools@vogel
```

Claude will ask once for the **VHP query proxy URL**. Enter the address of the
`vapi-pluginrp` server (`http://localhost:8000` if you run it yourself). It is
stored for you and never asked again.

Then use it by asking for data normally, or invoke it directly:

```
/vogel-tools:vhp-query show me tickets from Steve in dept 350 last week
```

If you use Claude in the browser (claude.ai / Cowork) rather than Claude Code,
you do not run these commands - an org owner pushes the plugin to you through
**claude.ai > Organization settings > Plugins**.

## Getting updates

Nothing to do. Claude checks the marketplace in the background and picks up new
commits at session start. To force a refresh:

```
/plugin marketplace update vogel
```

## For the dev team - shipping a change

1. Edit under `plugins/vogel-tools/`.
2. Commit and push to `main`.

That is the whole procedure. Every manager gets it on their next session.

> **Do not add a `version` field** to `marketplace.json` or `plugin.json`.
> With no version set, Claude resolves the version from the commit SHA, so each
> push is an update. The moment a `version` string is pinned, Claude caches that
> version and **silently ignores every later commit** until someone bumps it.
> That is exactly what broke this repo before.

### Adding a new skill

```
mkdir -p plugins/vogel-tools/skills/<skill-name>
```

Write a `SKILL.md` in it with YAML frontmatter (`name`, `description`, and
`allowed-tools` if it needs restricting), commit, push. Managers pick it up as
`/vogel-tools:<skill-name>` with no install step.

Check your work before pushing:

```bash
claude plugin validate ./plugins/vogel-tools --strict
claude plugin validate .
claude --plugin-dir ./plugins/vogel-tools       # try the skill in a live session
```

### Never commit

- Connection strings, passwords, tokens, or `.env` files of any kind. This repo
  is public.
- `node_modules/`.
- Any gathered data, CSV, or JSON export.

A `.gitignore` covering these is in the repo root.
