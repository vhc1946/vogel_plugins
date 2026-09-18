# Vogel Claude Plugins

Internal Claude plugins for Vogel Heating and Cooling. The team receives this
plugin through the org library; the dev team publishes a release when a change is
ready to go out.

## Repository layout

```
.claude-plugin/
  marketplace.json               the catalog Claude reads
plugins/
  vogel-tools/                   the one plugin managers install
    .claude-plugin/plugin.json
    skills/
      vhp-query/SKILL.md         one folder per skill
      vogel-theme/
        SKILL.md
        assets/                  stylesheet, skeletons, logo PNGs
        references/              palette, docx and Artifact guidance
        scripts/                 build and verify (.pysrc, run inline)
```

A skill folder may carry `assets/`, `references/` and `scripts/` alongside its
`SKILL.md`. `claude plugin validate` checks the manifest, paths and component
locations; it does not object to extra folders or to binary files.

One plugin, many skills. Adding a skill later does not make managers install
anything new.

## How the plugin reaches people

There are two distribution paths and **they behave differently**. Knowing which
one you are on explains everything about when you see a change.

### Org library - everyone

An org owner publishes the plugin through
**claude.ai > Organization settings > Plugins**. Managers run no commands; it
simply appears, in Claude Code and in the browser alike.

This path ships a **snapshot** taken at publish time. It does not follow `main`.
Pushing a commit does not reach anyone until someone publishes a release - see
*Shipping a release* below.

### Local marketplace - dev/author only

For fast iteration while building a skill:

```
/plugin marketplace add vhc1946/vogel_plugins
/plugin install vogel-tools@vogel_plugins
```

This path clones the repo and resolves the version from the manifest. Force a
refresh with:

```
/plugin marketplace update vogel_plugins
```

Managers do not need this. Keep it to the dev team so there is only one story
about what "current" means.

## Configuration

Claude asks once for the **VHP query proxy URL**. Enter the address of the
`vapi-pluginrp` server (`http://localhost:8000` if you run it yourself). It is
stored and never asked again.

Then use it by asking for data normally, or invoke it directly:

```
/vogel-tools:vhp-query show me tickets from Steve in dept 350 last week
```

## For the dev team - shipping a release

```
1. Edit under plugins/vogel-tools/.
2. Bump "version" in BOTH manifests:
     plugins/vogel-tools/.claude-plugin/plugin.json
     .claude-plugin/marketplace.json      (the vogel-tools entry)
3. Update the canary in plugins/vogel-tools/skills/vhp-query/SKILL.md
     <!-- release: vX.Y.Z -->
4. claude plugin validate ./plugins/vogel-tools --strict
   claude plugin validate .
5. git commit -am "Release vX.Y.Z: <what changed>" && git push
6. cd plugins/vogel-tools && claude plugin tag --push
7. claude.ai > Organization settings > Plugins > vogel_plugins > refresh
8. Verify (below).
```

**Step 7 is the step that reaches your team.** Steps 1-6 alone change nothing for
them. A push to `main` is not a publish.

### Versioning - read before changing it

The `version` field is what makes a release visible and what tells Claude an
update exists. Two rules, and they pull in opposite directions:

- **Bump it on every release.** If you edit a skill and push without bumping,
  local-marketplace consumers keep the old copy **forever, with no error and no
  log line**. That silent freeze is what broke this repo before.
- **Never leave it stale.** Step 6 is the guard: `claude plugin tag` refuses when
  the two manifests disagree on the version, when the tree is dirty, or when the
  tag already exists. Forgetting to bump therefore produces a loud
  *"tag already exists"* rather than silence.

While iterating, do not test through the installed copy - use
`claude --plugin-dir ./plugins/vogel-tools` so you are not waiting on a release.

### Verifying a release actually landed

Check delivered **content**, never a status message. A sync can report success
and a download can report "1 downloaded" while shipping the identical stale
bundle - that has happened here. Do not clear caches before verifying; the stale
cache is the evidence.

In `AppData\Roaming\Claude\local-agent-mode-sessions\<session>\<sub>\rpm\`:

1. The delivered `.claude-plugin/plugin.json` shows the new `version`.
2. `grep -r 'release: vX.Y.Z'` on the delivered plugin directory hits.
3. `manifest.json` shows an `updatedAt` newer than the previous release.

Then have one teammate confirm the change in a fresh session. Nothing short of a
second machine proves distribution.

### Adding a new skill

```
mkdir -p plugins/vogel-tools/skills/<skill-name>
```

Write a `SKILL.md` in it with YAML frontmatter (`name`, `description`, and
`allowed-tools` if it needs restricting). It ships with the next release as
`/vogel-tools:<skill-name>` - managers install nothing new.

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
