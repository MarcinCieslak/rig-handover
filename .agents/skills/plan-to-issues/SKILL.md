---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Ask the human what every issue here must carry (fields, labels, wording), unless it is
   already written down in this session or in the repo. It is: see "Issue shape" below.
5. Create each issue in dependency order, so blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --body-file <tmp.md>
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

Closing one, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

## Issue shape

What every issue here carries. Decided by the human (MarcinCieslak) on 2026-10-29, for plan
morning-digest; change it only when they say so.

- Label `plan:<plan>` (the `plan:` value in `plan.md`'s frontmatter, e.g. `plan:morning-digest`).
  Create the label first if the repo lacks it.
- Body, in this order:

  ```md
  Source: plan.md § <n>

  ## Scope
  <what to change, from the plan's section; files and rules that bind it>

  ## Done when
  <the plan's "Done when", checkable>

  ## Blocked by
  <#n, and what of it is needed (e.g. "#1 (src/digest/types.ts only)"); "—" if nothing>
  <if starting needs less than the done check: "the done check also needs #n">

  ## Suggested worker
  <harness> · <model> · <effort>   (strongest model for logic, a cheaper one for views and tests)
  ```

- A step that waits on someone outside the lane (a review, a reply) stays open until they
  confirm it; "sent" is not "done". Its blocked-by names that wait.

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.
