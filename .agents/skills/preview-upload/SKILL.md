---
name: preview-upload
description: Put one static HTML preview of a rig page on a public Cloudflare Pages link, upload over it, and take it down again (ADR 0003). Use for a plan's "Preview for review" and "Clean up" steps.
---

# preview-upload

One HTML file on a public HTTPS link we can upload over and take down. Cloudflare Pages via
`npx wrangler@4` (no install). Ask the human before every put, re-upload and take-down: say what
goes up, where, who can see it, and how to undo it.

## Rules

- Work in a folder **outside the repo** (previews never go in the repo, ADR 0003), with no
  `wrangler.json`, `wrangler.jsonc` or `wrangler.toml` in it or above it. Upload a sub-folder that
  holds **only** `index.html`: wrangler uploads everything in the folder, including any config a
  failed command left behind.
- Set `WRANGLER_SEND_METRICS=false`. Read `--help` of each command before using a flag.
- Save the page with a command, not a browser: `curl -s -f http://localhost:8787/<path> -o site/index.html`.

## Once: sign in and create the project

```sh
npx -y wrangler@4 login --browser=false --no-use-keyring --scopes account:read user:read pages:write
npx -y wrangler@4 pages project create <project> --production-branch main --force
```

- `--scopes`: only what Pages needs; `offline_access` is added by wrangler (listing it fails).
- `--browser=false` prints the link; the human approves it in their browser. `--use-keyring` needs
  `@napi-rs/keyring` on Windows; without it the token sits in wrangler's config file.
- `--force` only on create: without it wrangler 4 delegates to Workers and fails ("No access to the
  specified resource"). Never on later commands. The reply names the link
  (`https://<project>-<suffix>.pages.dev/`).

## Put / upload over

```sh
npx -y wrangler@4 pages deploy site --project-name <project> --branch main --commit-dirty=true --commit-message "<what>"
```

Same command uploads over the same production link. Each deploy also gets its own
`https://<hash>.<project>-<suffix>.pages.dev` link, which keeps the old content.

Check: `curl -s https://<link>/ | diff - site/index.html`. Add `?x=<random>` to dodge the edge
cache; an unknown path answers 200 with the page itself (fallback), not a 404.

## Take down

- Old deploys (they keep the old content, e.g. the lane marker):
  `npx -y wrangler@4 pages deployment list --project-name <project>`, then
  `npx -y wrangler@4 pages deployment delete <id> --project-name <project>`. It asks to confirm and
  answers "no" when stdin is not a terminal: run it in a terminal the human can answer, or delete in
  the dashboard (Workers & Pages > project > Deployments).
- Whole link: `npx -y wrangler@4 pages project delete <project> -y`.
