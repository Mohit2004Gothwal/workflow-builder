# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps — built with nhost (Postgres + Hasura + Auth + Functions), Hasura Actions, and Next.js.

**Live app:** https://workflow-builder-pink-mu.vercel.app/
**Repo:** https://github.com/Mohit2004Gothwal/workflow-builder

## What's implemented

- Full schema: `organizations`, `org_members`, `workflows`, `workflow_steps`, `workflow_triggers`, `workflow_runs`, `step_runs`
- **Layer 1 permissions** — org + role scoping via `org_members`, enforced on every table for Hasura role `user` (the only role real logged-in requests use; fine-grained owner/editor/viewer distinctions are enforced inside row-level checks and inside Action handler code, not via separate Hasura roles)
- **Layer 2 permissions** — declarative: `editor` role blocked from inserting `db_write`/`notify` steps and `webhook` triggers at the Hasura permission level; procedural: `approveStep`'s handler code re-checks the caller's `org_members.role` before resuming a paused run
- **`triggerWorkflowRun`** Hasura Action — checks membership + quota, creates a run, executes steps in order (`llm_call`/`http_request` are stubbed — see note below — with retry logic wired in), pauses on `approval_gate`, increments quota on completion
- **`approveStep`** Hasura Action — validates the step is actually paused, re-checks the approver's role fresh from `org_members`, resumes execution of remaining steps
- **Webhook trigger** — a separate plain HTTP function (`trigger-workflow-run-webhook.js`), authenticated via a per-workflow secret stored in `workflow_triggers.config`, not a Hasura Action
- **Frontend** — Next.js + nhost auth, workflow list, Run button, live `step_runs` subscription showing per-step status including the paused state, an Approve button, and a quota display

## Stack

- nhost (Postgres, Hasura, Auth, Functions)
- Hasura GraphQL Engine, Actions, subscriptions
- Next.js (App Router) + Apollo Client v3 + `@nhost/react` / `@nhost/nextjs`
- Deployed: nhost Cloud (backend, auto-deploys on push via git integration) + Vercel (frontend)

## Known gaps / honest status

- **`llm_call` and `http_request` are stubbed**, not calling a real external API. This is explicitly permitted by the assignment ("a stubbed call with a disclosed artificial delay is fine"). Retry logic is wired around these calls and would engage on real failures.
- **Cross-org isolation was not re-verified after final deployment.** Layer 1/2 permissions are designed to enforce it (every table's row filter traces back to `org_members.user_id`), and this pattern was the intentional design throughout, but a live pass — logging in as an Org B user and confirming Org A's workflows/runs/steps are invisible and unreachable even by direct ID — was not completed as a final check.
- **No UI-level role gating.** The Run button is visible to every signed-in user regardless of their org role. The backend correctly rejects unauthorized triggers/approvals regardless (verified: a `viewer` role gets a 403 from `approveStep`), but the frontend doesn't hide the button pre-emptively.
- Only one trigger type beyond manual is implemented (webhook) — satisfies "at least one," scheduled/db-event triggers are not built.
- `@nhost/nextjs` / `@nhost/react-apollo` are deprecated packages (Nhost recommends migrating to `@nhost/nhost-js@^4`), kept here for development speed under time pressure. Required `@apollo/client@^3` (not v4) and `--legacy-peer-deps` for compatibility with Next.js 16.

## Local setup

### Prerequisites
- **Windows users: WSL2 is required** — the nhost CLI has no native Windows binary
- Node.js 18+, Docker Desktop (with WSL2 integration enabled if on Windows)

### Backend
```bash
git clone https://github.com/Mohit2004Gothwal/workflow-builder.git
cd workflow-builder
npm install -g @nhost/cli   # or curl -sSL https://raw.githubusercontent.com/nhost/nhost/main/cli/get.sh | bash
nhost up
```
Wait for "Nhost development environment started." This starts Postgres, Hasura, Auth, Storage, and Functions locally via Docker. Hasura console: `https://local.hasura.local.nhost.run` (admin secret in `.secrets`, gitignored — see `.secrets.example` or ask for it).

Apply schema/metadata if starting fresh:
```bash
nhost hasura migrate apply --database-name default --endpoint https://local.hasura.local.nhost.run --admin-secret <secret>
nhost hasura metadata apply --endpoint https://local.hasura.local.nhost.run --admin-secret <secret>
```

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
# create .env.local with:
#   NEXT_PUBLIC_NHOST_SUBDOMAIN=local
#   NEXT_PUBLIC_NHOST_REGION=local
npm run dev
```
App runs at `http://localhost:3000`.

### Seeding test data
Via the Hasura console's Data tab, insert:
1. Two rows in `organizations` (e.g. "Org A", "Org B")
2. An `org_members` row linking your signed-up user's ID to Org A with `role: owner`
3. A `workflows` row under Org A
4. `workflow_steps` rows (e.g. `llm_call`, `conditional_branch`, `http_request`, `approval_gate`, in `step_order` 1–4)

## Environment variable naming — a note for anyone extending this

Locally, nhost injects `HASURA_GRAPHQL_GRAPHQL_URL` and `HASURA_GRAPHQL_ADMIN_SECRET` into function containers (via Docker Compose). **In nhost Cloud, the equivalent variables are named `NHOST_GRAPHQL_URL` and `NHOST_ADMIN_SECRET`** — this naming difference cost significant debugging time and is easy to miss. All three functions in `functions/` read the cloud names with a fallback URL, for portability.

## Deployment

- **Backend:** nhost Cloud project, connected to this GitHub repo — auto-deploys migrations, metadata, and functions on every push to `main` (see `nhost deployments list` / `nhost deployments logs <id>`).

## OutCome
<img width="1507" height="680" alt="image" src="https://github.com/user-attachments/assets/92894990-19d1-4829-afc8-56ccd70375ad" />

- **Frontend:** Vercel, root directory set to `frontend/`, deployed via `npx vercel --prod` from within that folder. Requires `NEXT_PUBLIC_NHOST_SUBDOMAIN` / `NEXT_PUBLIC_NHOST_REGION` set as production environment variables pointing at the cloud project, and Vercel's Deployment Protection disabled (or public reviewers can't open the link).

## Write-up

See `WRITEUP.md` for schema reasoning, how the two permission layers differ, and how the approval-gate pause/resume is implemented.
