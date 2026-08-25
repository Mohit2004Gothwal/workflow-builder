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
- **Frontend** — Next.js + nhost auth (including forgot-password / reset-password), a dynamic org lookup that queries `org_members` for whichever org(s) the signed-in user belongs to (with a switcher if more than one), a workflow list, Run button, live `step_runs` subscription showing per-step status including the paused state, an Approve button, and a quota display
- **Viewer role UI gating** — the Run and Approve buttons are hidden for anyone whose role in the selected org is `viewer`, matching the spec's "hidden for viewers" requirement. This is a UI convenience on top of, not instead of, the backend's own enforcement.
- **Cross-org isolation — verified.** Tested directly via GraphiQL using a second organization's user (Org B) with no special override — the same permission path any real request goes through:
  1. Querying `workflows` filtered to Org A's `org_id` as the Org B user returns `[]`, despite Org A's workflow genuinely existing.
  2. Calling `approveStep` on a real Org A `step_run_id` as the Org B user returns `"not authorized to approve this step"` from inside the Action handler.
  3. Querying `step_runs` filtered to an Org A `workflow_run_id` as the Org B user returns `[]` — isolation holds even when the caller already has a real, valid ID to query directly, not just when browsing normally.
  Org B's own data (their own workflow) remained visible to the Org B user throughout, confirming the permission scoping is precise rather than accidentally blocking everyone.

## Stack

- nhost (Postgres, Hasura, Auth, Functions)
- Hasura GraphQL Engine, Actions, subscriptions
- Next.js (App Router) + Apollo Client v3 + `@nhost/react` / `@nhost/nextjs`
- Deployed: nhost Cloud (backend, auto-deploys on push via git integration) + Vercel (frontend)

## Known gaps / honest status

- **`llm_call` and `http_request` are stubbed**, not calling a real external API. This is explicitly permitted by the assignment ("a stubbed call with a disclosed artificial delay is fine"). Retry logic is wired around these calls and would engage on real failures.
- Only one trigger type beyond manual is implemented (webhook) — satisfies "at least one," scheduled/db-event triggers are not built.
- `@nhost/nextjs` / `@nhost/react-apollo` are deprecated packages (Nhost recommends migrating to `@nhost/nhost-js@^4`), kept here for development speed under time pressure. Required `@apollo/client@^3` (not v4) and `--legacy-peer-deps` for compatibility with Next.js 16.
- No dedicated UI for creating organizations, inviting members, or building/editing workflows visually — all of that is done directly via the Hasura console's Data tab during setup/testing. The frontend covers running, observing, and approving workflows, not authoring them.

## Local setup

### Prerequisites
- **Windows users: WSL2 is required** — the nhost CLI has no native Windows binary
- Node.js 18+, Docker Desktop (with WSL2 integration enabled if on Windows) — **make sure Docker Desktop is actually running** before `nhost up`, or it fails with a socket-connection error

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
2. An `org_members` row linking your signed-up user's ID to an org with `role: owner` / `editor` / `viewer`
3. A `workflows` row under that org
4. `workflow_steps` rows (e.g. `llm_call`, `conditional_branch`, `http_request`, `approval_gate`, in `step_order` 1–4)

To test cross-org isolation yourself: repeat the above for a second org and a second user, then compare what each user can see/do — including trying to query the other org's data directly by ID via GraphiQL with that user's `x-hasura-user-id` header.

## Password reset flow

Uses nhost's built-in `resetPassword` / `changePassword` hooks. The person requests a reset link (captured by Mailhog locally at `https://local.mailhog.local.nhost.run`, or sent as a real email in production); clicking it redirects back to the app's own URL with `?type=passwordReset` in the query string, at which point they're already authenticated via a short-lived ticket and are shown a "set new password" screen directly — no old password required. The app waits on `useAuthenticationStatus`'s `isLoading` flag before deciding what to render, to avoid a race where the sign-in form flashes before the ticket is consumed.

## Environment variable naming — a note for anyone extending this

Locally, nhost injects `HASURA_GRAPHQL_GRAPHQL_URL` and `HASURA_GRAPHQL_ADMIN_SECRET` into function containers (via Docker Compose). **In nhost Cloud, the equivalent variables are named `NHOST_GRAPHQL_URL` and `NHOST_ADMIN_SECRET`** — this naming difference cost significant debugging time and is easy to miss. All three functions in `functions/` read the cloud names, with a hardcoded cloud URL as a fallback for portability.

## Deployment

- **Backend:** nhost Cloud project, connected to this GitHub repo — auto-deploys migrations, metadata, and functions on every push to `main` (see `nhost deployments list` / `nhost deployments logs <id>`).
- **Frontend:** Vercel, root directory set to `frontend/`, deployed via `npx vercel --prod` from within that folder. Requires `NEXT_PUBLIC_NHOST_SUBDOMAIN` / `NEXT_PUBLIC_NHOST_REGION` set as production environment variables pointing at the cloud project, and Vercel's Deployment Protection disabled (or public reviewers can't open the link).

## Write-up

See `WRITEUP.md` for schema reasoning, how the two permission layers differ, and how the approval-gate pause/resume is implemented.
