'use client';
import Link from 'next/link';
import AuthCard from './AuthCard';

const features = [
  ['Triggers', 'Start a workflow from an event, so nobody has to press run.'],
  ['Ordered steps', 'Chain steps in a fixed order. Each step has its own type and settings.'],
  ['Human approvals', 'Pause a run until a person approves it. The approver and the time are recorded.'],
  ['Roles that matter', 'Owners manage everything, editors change workflows, viewers read only.'],
  ['Run history', "See every run, each step's input, output, attempts and errors."],
  ['Usage quota', 'Each organization has a quota, so usage stays visible and capped.'],
];

// Shown to signed-out visitors. Replaces the old <AuthForm /> in HomeClient.
export default function Landing() {
  return (
    <main>
      <section className="hero">
        <div className="hero-wrap">
          <h1>Automate the routine. Approve what matters.</h1>
          <p className="lead">
            Workflow Builder chains triggers, AI steps and approvals into runs your team can review,
            with owner, editor and viewer access built in.
          </p>
          <div className="cta">
            <a className="btn" href="#signin">Get started</a>
            <Link className="btn ghost" href="/about">See how it works</Link>
          </div>
          <ol className="pipeline" aria-label="Example workflow">
            <li><small>Trigger</small><b>Request received</b><span className="st">Done</span></li>
            <li><small>AI step</small><b>Summarize request</b><span className="st">Done</span></li>
            <li className="wait-node"><small>Approval</small><b>Editor reviews</b><span className="st wait">Waiting</span></li>
            <li><small>Action</small><b>Send update</b><span className="st" style={{ color: 'var(--muted)' }}>Queued</span></li>
          </ol>
        </div>
      </section>

      <section className="auth" style={{ minHeight: 0, paddingTop: 72 }}>
        <AuthCard />
      </section>

      <section className="section center">
        <h2>Everything a run needs, in one place</h2>
        <p className="sub">Build once, then let the workflow run while your team keeps control of the decisions.</p>
        <dl className="defs" style={{ textAlign: 'left' }}>
          {features.map(([t, d]) => (<div key={t}><dt>{t}</dt><dd>{d}</dd></div>))}
        </dl>
      </section>
    </main>
  );
}