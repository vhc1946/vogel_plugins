# Vogel Data Gather

Ask Claude for company data in plain English and get it into your session as a
spreadsheet you can work from.

> "Pull the active techs in South County."
> "Run a report on March sales."
> "How many install techs did we hire this year?"

Claude reads the Vogel database, saves the full results to a file, and shows you
the column names, the row count and a few sample rows. You then ask questions
against that file, or have Claude build a report from it.

**This plugin gathers data. It does not write reports** — that is the next thing
you ask for, once the data is in hand.

---

## Part 1 — For managers

### What you need

- **Windows, with Claude Cowork installed.** This plugin only works there. It
  cannot run in the Claude website chat, because that runs in Anthropic's cloud
  and cannot reach our database.
- **Node.js.** A free tool this plugin runs on. If it is not installed, Claude
  will tell you; download the **LTS** version from https://nodejs.org and click
  through the installer. Restart Claude afterwards.
- **A connection string** from the VHP Dev Team — the username and password that
  let this computer read the database. It is read-only: nothing you or Claude
  does here can change company data.

### Installing the plugin

```
/plugin marketplace add https://github.com/YOUR-ORG/vogel-claude-marketplace.git
/plugin install vogel-data-gather@vogel
```

Type those in Claude. The first line tells Claude where Vogel's plugins live;
you only ever do it once. The second installs this one.

Then, once, in a terminal in the plugin folder:

```
npm install
```

That downloads the database library. It takes a few seconds and you never repeat
it unless the dev team says so.

### Setting up your credentials (once, about two minutes)

Your connection string is a password. It does not go in the plugin, it does not
go in chat, and Claude will never ask you to paste it into a conversation. It
lives in one file on your own computer.

1. Press **Windows + R**, type `%USERPROFILE%`, press Enter. A folder opens —
   this is your home folder.
2. Create a new folder there named `.vogel` — **including the dot at the front**.
   Windows may warn you about the leading dot; that is fine, click through it.
3. Open `.vogel`, right-click → **New** → **Text Document**, and name it
   `mongo.env`.
4. Windows likes to save this as `mongo.env.txt`. To check: View → turn on
   **File name extensions**. If it shows `mongo.env.txt`, rename it to
   `mongo.env`.
5. Open it in Notepad and put in **one line**, with the real connection string
   from the dev team:

   ```
   VOGEL_MONGO_URI=mongodb+srv://username:password@cluster.example.mongodb.net/vogel
   ```

   No quotes around it, no spaces around the `=`, nothing on a second line.
6. Save and close.

That is it. Claude picks it up automatically from then on. If you ever change
laptops, you do this again on the new one.

### Getting your computer allowed through (Atlas IP allowlisting)

The database only accepts connections from approved internet addresses. This is
a security feature, and it is the single most common reason a pull fails.

**What to do the first time:**

1. Visit https://whatismyipaddress.com and copy the **IPv4** address.
2. Send it to the VHP Dev Team and ask them to add it to Atlas Network Access.
3. Wait for them to confirm, then ask Claude for data again.

**Your address changes.** Working from home, tethering to your phone, connecting
to hotel Wi-Fi, or switching VPN all give you a different one, and the database
will stop answering until that one is added too. If a pull that worked yesterday
times out today, that is almost certainly why — send the dev team your current
address again.

If you are always on the Vogel office network or VPN, the dev team can allowlist
that address once and you will not have to think about this again.

### Checking everything works

Ask Claude:

> Check whether I can reach the Vogel database.

It runs a readiness check and reports each piece — Node, the database library,
the data definitions, your credentials file, and the connection itself. Anything
that fails comes with the fix. If you cannot make sense of the fix, forward the
whole block to the VHP Dev Team; it was written so that they can act on it
without a back-and-forth.

### Using it

Just ask. Claude works out which data set you mean and pulls it.

A few things worth knowing:

**Results go to a file, not into the chat.** You will see the columns, the row
count, and a handful of sample rows. The full results are in a CSV you can open
in Excel and a JSON file Claude reads for follow-up questions. This keeps the
conversation fast and readable.

**500 rows is the default cap.** If your pull hits it, Claude will say so.
That matters: a capped file is not the whole picture, so do not total it up and
treat the number as final. Narrow it by date or branch instead.

**Asking again is cheap.** Claude remembers what it already pulled during your
conversation. Ask for the same thing twice and it reuses the file. Ask a
narrower version — same data, one more filter — and it filters what it already
has. It tells you which of these happened in one line, so you always know
whether you are looking at something fresh.

**The data disappears when you are done.** Everything lives in a temporary
folder for the length of your conversation and is deleted afterwards. Nothing
carries over to tomorrow. This is on purpose — company records should not pile
up on laptops. If you want to keep something, ask Claude to build you a report
or save the spreadsheet somewhere you choose.

### When something goes wrong

Claude will explain it in plain language and tell you what to do. The common
ones:

| What you see | What it means |
| --- | --- |
| "I could not find your database credentials" | The `mongo.env` file is missing, or Windows saved it as `mongo.env.txt`. |
| "The database rejected the username and password" | Your connection string is out of date. Ask the dev team for a new one. |
| "I could not reach the database" | Almost always the IP allowlist. Send the dev team your current IP address. |
| "This plugin needs Node.js" | Install it from https://nodejs.org and restart Claude. |
| "No records matched" | The query worked; there is genuinely nothing there. Try a wider date range. |

Claude will not retry with different credentials, and it will not substitute
data from somewhere else when the database is unreachable. If it cannot get the
real answer it says so.

---

## Part 2 — For the VHP Dev Team

### Layout

```
vogel-data-gather/
  .claude-plugin/plugin.json      manifest
  skills/gather-company-data/     the skill Claude loads
  scripts/                        Node: preflight, catalog, gather, cleanup
    lib/                          credentials, mongo, schemas, filters, session, output
  schemas/                        drop-in collection definitions  ← the part that changes
  reference/                      glossary, query recipes
  package.json                    mongodb driver
```

### Adding a collection

Drop a file in `schemas/`. That is the whole procedure. No change to `SKILL.md`,
no change to any script — the loader reads the folder at run time, so a new file
is live on the next request.

The contract and a full worked example are in **`schemas/README.md`**. Two
example definitions ship in the folder: `technicians.js` and `sales-orders.js`.

**Both examples are placeholders.** The field names are plausible guesses, not
the real schema. Replace them before anyone uses this for a real number.

After editing:

```
node scripts/preflight.js                      validates files, checks the collections exist
node scripts/catalog.js --collection <name>    shows the data set as the skill sees it
node scripts/selftest.js                       exercises the cache and filter logic offline
```

### Update the skill description when the collections change

`skills/gather-company-data/SKILL.md` names the collections in its frontmatter
description. That is deliberate — it is what makes the skill fire on "pull the
tech list" and not on "get me the AWS cost report". It is also the one place
outside `schemas/` that needs a human edit when the real collections land.
Adding a third collection does not require it; replacing the example ones does.

### How the caching works

Each pull is keyed by a hash of collection + filters + fields, recorded in a
manifest in the session folder.

| Situation | What happens |
| --- | --- |
| Identical request | Previous file reused. No query. |
| Same collection, narrower filter, same or fewer fields | Filtered in memory. No query. |
| Different collection, or fields not in the cached pull | Fresh query. |
| Previous pull was truncated at the limit | Fresh query, always. |

That last row is the one to keep. A truncated pull is the first N rows the
database happened to return; narrowing it produces a number that looks
authoritative and is wrong. The manifest records `truncated` per entry and
`findReusable()` filters on it.

"Narrower" is checked conservatively: every condition in the cached filter must
appear verbatim in the new one. No implication reasoning — `$gt: 30` is not
treated as implying `$gt: 20`. The failure mode of being too clever here is a
silently incomplete result set.

The filter language (`$eq $ne $gt $gte $lt $lte $in $nin $regex $exists`) is
small because every operator has to be evaluable **both** in MongoDB and in
JavaScript against downloaded rows. If you add one, implement it in both
`toMongo()` and `matches()` in `scripts/lib/filters.js`, or the cache and the
database will start disagreeing.

### Security notes

- Credentials are read from `~/.vogel/mongo.env`, falling back to
  `VOGEL_MONGO_URI`. Nothing writes them anywhere, and they are never logged.
  `redact()` in `lib/credentials.js` is there for any future logging.
- The connection uses `readPreference: secondaryPreferred` and the account is
  read-only. There is no write path in this plugin.
- Connections are closed in a `finally` block regardless of outcome.
- A field that is not declared in a schema file cannot be requested, filtered
  on, or sorted by. That is the mechanism for keeping sensitive columns out of
  reach — omit them from `fields`.
- Results live in `%TEMP%/vogel-data-gather/session-<id>/` and are removed by
  `scripts/cleanup.js`. Sessions older than 18 hours are swept on the next pull,
  which covers sessions that ended abruptly.

---

## Part 3 — Distribution

Updates go out by `git pull`, not by re-sending folders. The plugin lives in an
internal marketplace repo; Claude updates from it.

### The marketplace repo

One private GitHub repo, `vogel-claude-marketplace`:

```
vogel-claude-marketplace/
  .claude-plugin/
    marketplace.json
  plugins/
    vogel-data-gather/        this plugin, in full
  README.md
```

`marketplace.json`:

```json
{
  "name": "vogel",
  "owner": { "name": "VHP Dev Team", "email": "johnw@vogelheating.com" },
  "plugins": [
    {
      "name": "vogel-data-gather",
      "source": "./plugins/vogel-data-gather",
      "description": "Pulls company data out of the Vogel MongoDB database into a Cowork session."
    }
  ]
}
```

Managers add it once:

```
/plugin marketplace add https://github.com/YOUR-ORG/vogel-claude-marketplace.git
/plugin install vogel-data-gather@vogel
```

and later update with:

```
/plugin marketplace update vogel
```

Because the repo is private, each manager needs read access — either a GitHub
account added to the repo, or Git Credential Manager already signed in on their
machine. Sorting that out once at install time is what buys you never hand-
delivering files again.

### Shipping a change

1. Edit in `plugins/vogel-data-gather/`.
2. Bump `version` in `.claude-plugin/plugin.json`.
3. Add a `CHANGELOG.md` entry.
4. Commit and push.
5. Tell managers to run `/plugin marketplace update vogel`.

Adding a new collection is steps 1–4 with a single new file in `schemas/`.
Nobody's setup changes; they pull and the new data set is there.
