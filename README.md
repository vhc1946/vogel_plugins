# Vogel Claude Marketplace

Internal Claude plugins for Vogel Heating & Cooling. Managers add this
marketplace once; after that, updates arrive with one command instead of a
folder over email.

## Repository layout

```
vogel-claude-marketplace/
  .claude-plugin/
    marketplace.json          the catalog Claude reads
  plugins/
    vogel-data-gather/        one folder per plugin, each with its own
                              .claude-plugin/plugin.json
  README.md
```

`marketplace.json` lists each plugin and where it lives in this repo. Adding a
plugin means adding its folder under `plugins/` and adding one entry to that
list.

## For managers — one-time setup

In Claude:

```
/plugin marketplace add https://github.com/YOUR-ORG/vogel-claude-marketplace.git
/plugin install vogel-data-gather@vogel
```

Then follow the plugin's own README for anything it needs — the data gathering
plugin needs Node.js and a credentials file.

## Getting updates

```
/plugin marketplace update vogel
```

That pulls the latest version of every Vogel plugin. Run it when the dev team
says there is an update, or any time something is not behaving.

## Access

This repo is private, so each person needs read access to it: either their
GitHub account added to the repo, or Git Credential Manager already signed in on
their machine (which it usually is on a Vogel laptop). Sort this out once at
install time — it is the thing that buys you never hand-delivering plugin files
again.

## For the dev team — shipping a change

1. Edit the plugin under `plugins/<plugin-name>/`.
2. Bump `version` in that plugin's `.claude-plugin/plugin.json`, and in its entry
   in `marketplace.json` — they should match.
3. Add a `CHANGELOG.md` entry in the plugin folder.
4. Commit and push to `main`.
5. Tell managers to run `/plugin marketplace update vogel`.

Nobody re-runs setup and nobody re-enters credentials. Credentials live outside
the plugin in each person's own `~/.vogel/` folder, so an update never touches
them.

### Adding a new collection to vogel-data-gather

Drop a file in `plugins/vogel-data-gather/schemas/`, bump the version, push.
That is the whole procedure — the contract is in that folder's `README.md`. No
change to the skill, no change to any script.

### Never commit

- Connection strings, passwords, or `.env` files of any kind.
- `node_modules/` (managers run `npm install` locally).
- Any gathered data, CSV, or JSON export.

A `.gitignore` covering these is in the repo root.
