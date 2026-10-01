# Project Hub (portfolio-cms)

A public portfolio of everything you've deployed. Each project is a card with an **icon thumbnail**, a **short description** and a **direct link**. Private / ongoing projects are **password protected**.

## How it works

```
GitHub ─┐
Netlify ─┼─► scripts/sync.mjs ─► content/catalog.json ─► scripts/build.mjs ─► data/catalog.json (public)
Vercel ─┘     (every 6h, GitHub Action)   (source, full URLs)                  private/links.json (locked URLs → unlock function only)
```

* **Auto-sync** – `.github/workflows/sync.yml` runs every 6 hours (or press *Run workflow*). It lists your GitHub repos, Netlify sites and Vercel projects, merges the same project across platforms (matched by repo or domain), and commits `content/catalog.json` if anything changed → Netlify rebuilds the hub.
* **Your edits are safe** – the sync only refreshes `url`, `repo`, `platforms`, `updated`. Title, description, group, icon, colour, locked… are filled in once for new projects and never overwritten. A project that disappears from a platform is *faded*, not deleted.
* **Public by default** – visitors land straight on the grid. Click the **N** logo to log in as admin.

## One-time setup

**GitHub → Settings → Secrets and variables → Actions**

| Secret | Needed for |
|---|---|
| `NETLIFY_TOKEN` | Netlify personal access token (User settings → Applications) |
| `VERCEL_TOKEN` | Vercel token (Account settings → Tokens). Teams: put the team id in `content/sync.config.json → vercel.teamId` |
| `HUB_GITHUB_TOKEN` | *optional* – only for private repos; public repos work with the built-in token |

## Hosting (Netlify **or** Vercel — both are configured)

Only `dist/` is published (built by `node scripts/build.mjs`), so `content/`, `scripts/`, `private/` can never be served. The password check is `/api/unlock` on either host.

* **Vercel**: nothing to set; `vercel.json` has the build command, `dist` output and the function. Deploys the branch you connected (merge the PR into it).
* **Netlify**: leave *Base directory* and *Publish directory* blank in the UI (the old `portfolio-cms` value breaks the deploy); `netlify.toml` supplies them.

**Environment variables (Netlify: Site settings → Environment variables · Vercel: Project → Settings → Environment Variables)**

| Variable | Meaning |
|---|---|
| `ACCESS_KEY` | **The password** for every protected card. Use a long passphrase. |
| `ACCESS_KEYS` | *optional* JSON of per-card passwords, e.g. `{"p_my-secret-app":"another passphrase"}` |

Then edit `content/sync.config.json` (GitHub username, ignore list, auto-group rules).

## Day-to-day

| I want to… | Do this |
|---|---|
| Add a new deployed project | Nothing. Deploy it; it appears within 6h (or run the *Sync deployed projects* workflow). |
| Mark one private | Admin → edit card → *Protected*, or give the GitHub repo the topic `portfolio-locked`, or add a rule in `sync.config.json`. |
| Hide one completely | Add its name to `ignore` in `sync.config.json`, or give the repo the topic `portfolio-hidden`. |
| Put a repo in a group | GitHub topic `group-<id>` (e.g. `group-fin`) or a `rules` entry. |
| Change title / description / icon | Admin → edit card → **Publish** (commits `content/catalog.json`), or edit that file on GitHub. |
| Change the password | Change `ACCESS_KEY` in your host's env vars and redeploy. No code change. |

Icons are [Tabler icon](https://tabler.io/icons) names (`rocket`, `brand-react`, `chart-bar` …). If blank, the sync guesses from framework/language, then falls back to the group icon. Screenshots are optional (`thumbUrl`) and are never used for protected cards.

## Security notes (please read)

* Protected cards: the real link is **not** in the public `data/catalog.json`. The browser asks `/api/unlock`, which checks the password server-side and only then returns the link. Wrong guesses are delayed ~0.7s.
* This hides the *link*; it does not protect the destination. Anyone who learns the URL can open it. For sensitive projects also enable **Netlify password protection / Vercel Deployment Protection** on that site itself.
* `content/catalog.json` contains the real URLs of locked projects. If this GitHub repo is **public**, those URLs are public too — keep the repo private if that matters. Only `dist/` is published, so it isn't served by the site.
* The admin key in the browser (`admin123` by default) only unlocks the edit UI; publishing still needs your GitHub token. **Change it** (Admin → Change admin key).
* Legacy Google Sheet sync (`appscript.gs`) is optional and its URL is public — no passwords there.
