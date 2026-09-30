import Link from "next/link";

const roles = [
  ["Owner", "Yes", "Yes", "Yes", "Yes"],
  ["Editor", "Yes", "Yes", "Yes", "No"],
  ["Viewer", "No", "Yes", "No", "No"],
];

const tables = [
  ["organizations", "A team or company. Holds the name and the usage quota."],
  ["org_members", "Who belongs to an organization and their role."],
  ["workflows", "A named automation that belongs to one organization."],
  ["workflow_triggers", "What starts a workflow."],
  ["workflow_steps", "The ordered steps of a workflow: type and settings."],
  ["workflow_runs", "One execution of a workflow: status, who started it, when."],
  ["step_runs", "One execution of a step: input, output, attempts, errors and approvals."],
];

export default function About() {
  return (
    <main>
      <section className="section center" style={{ paddingTop: 72 }}>
        <h1 style={{ fontFamily: "var(--font-head)", fontSize: "clamp(2rem,4.5vw,3.2rem)", letterSpacing: "-.02em" }}>
          How Workflow Builder works
        </h1>
        <p className="sub" style={{ marginTop: 12 }}>
          A workflow automation app for teams. You define what starts a workflow and what happens next,
          and people approve the steps that need a decision.
        </p>
        <div className="flow">
          <span>Trigger</span><em>then</em><span>Steps</span><em>then</em><span>Approval</span><em>then</em><span>Result</span>
        </div>
      </section>

      <section className="section">
        <h2>The idea</h2>
        <p className="sub">
          Repetitive work should run itself, but some decisions still need a person. Workflow Builder lets an
          organization build workflows out of triggers and steps, including AI steps, and pauses for approval where needed.
          Every run is recorded, so you can see what happened, who approved it and why something failed.
        </p>
      </section>

      <section className="section">
        <h2>Who can do what</h2>
        <p className="sub">Access is enforced in the database layer, not just hidden in the interface.</p>
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Role</th><th>Create</th><th>Read</th><th>Update</th><th>Delete</th></tr></thead>
            <tbody>{roles.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {/* Adjust the table above to match your real permissions. */}
      </section>

      <section className="section">
        <h2>How the data is organized</h2>
        <p className="sub">Everything belongs to an organization, and permissions follow that link.</p>
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Table</th><th>What it stores</th></tr></thead>
            <tbody>{tables.map(([n, d]) => <tr key={n}><td><code>{n}</code></td><td>{d}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Under the hood</h2>
        <dl className="defs">
          <div><dt>Frontend</dt><dd>Next.js and React, deployed on Vercel.</dd></div>
          <div><dt>API</dt><dd>GraphQL through Apollo Client to Hasura.</dd></div>
          <div><dt>Database and auth</dt><dd>Postgres and sign-in (Google, email code, password) on Nhost.</dd></div>
          <div><dt>Access control</dt><dd>Hasura role permissions, checked against the signed-in user and their organization.</dd></div>
        </dl>
      </section>

      <section className="section center">
        <h2>Try it</h2>
        <div className="cta" style={{ marginTop: 16 }}>
          <Link className="btn" href="/#signin">Sign in</Link>
          <Link className="btn ghost" href="/">Back to home</Link>
        </div>
      </section>
    </main>
  );
}