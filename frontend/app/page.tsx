'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client';
import { useSignInEmailPassword, useSignUpEmailPassword, useAuthenticated, useSignOut, useUserId } from '@nhost/react';

// Hardcoded for now — later this comes from an org switcher
const ORG_ID = '11e693c2-e93b-4fe3-86bd-d19943d99791';

const GET_WORKFLOWS = gql`
  query GetWorkflows($org_id: uuid!) {
    workflows(where: { org_id: { _eq: $org_id } }) {
      id
      name
      workflow_steps(order_by: { step_order: asc }) {
        id
        type
        step_order
      }
    }
    organizations_by_pk(id: $org_id) {
      quota_used
      quota_limit
    }
  }
`;

const TRIGGER_RUN = gql`
  mutation TriggerRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      run_id
      status
    }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) {
      run_id
      status
    }
  }
`;

const STEP_RUNS_SUB = gql`
  subscription StepRuns($run_id: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $run_id } }, order_by: { started_at: asc }) {
      id
      status
      attempt
      output
      error
      approved_by
      workflow_step {
        type
        step_order
      }
    }
  }
`;

function AuthForm() {
  const { signInEmailPassword } = useSignInEmailPassword();
  const { signUpEmailPassword } = useSignUpEmailPassword();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = mode === 'signin'
      ? await signInEmailPassword(email, password)
      : await signUpEmailPassword(email, password);
    if (result.error) setError(result.error.message);
  };

  return (
    <div style={{ padding: 40, maxWidth: 400 }}>
      <h1>Workflow Builder</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 10 }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">{mode === 'signin' ? 'Sign In' : 'Sign Up'}</button>
      </form>
      <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={{ marginTop: 10 }}>
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}

function Dashboard() {
  const { signOut } = useSignOut();
  const userId = useUserId();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useQuery(GET_WORKFLOWS, {
    variables: { org_id: ORG_ID },
  });

  const [triggerRun, { loading: triggering }] = useMutation(TRIGGER_RUN);
  const [approveStep] = useMutation(APPROVE_STEP);

  const { data: subData } = useSubscription(STEP_RUNS_SUB, {
    variables: { run_id: activeRunId },
    skip: !activeRunId,
  });

  const handleTrigger = async (workflowId: string) => {
    try {
      const res = await triggerRun({ variables: { workflow_id: workflowId } });
      const runId = res.data?.triggerWorkflowRun?.run_id;
      if (runId) setActiveRunId(runId);
      refetch();
    } catch (err: any) {
      alert('Trigger failed: ' + err.message);
    }
  };

  const handleApprove = async (stepRunId: string) => {
    try {
      await approveStep({ variables: { step_run_id: stepRunId } });
    } catch (err: any) {
      alert('Approve failed: ' + err.message);
    }
  };

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;
  if (error) return <p style={{ padding: 40, color: 'red' }}>Error: {error.message}</p>;

  const org = data?.organizations_by_pk;

  return (
    <div style={{ padding: 40 }}>
      <p>Signed in. User ID: {userId}</p>
      <button onClick={() => signOut()}>Sign out</button>
      <hr style={{ margin: '20px 0' }} />

      {org && (
        <p><strong>Quota:</strong> {org.quota_used} / {org.quota_limit}</p>
      )}

      <h2>Workflows</h2>
      {data?.workflows?.length === 0 && <p>No workflows found for this org.</p>}
      {data?.workflows?.map((wf: any) => (
        <div key={wf.id} style={{ border: '1px solid #ccc', padding: 15, marginBottom: 15 }}>
          <h3>{wf.name}</h3>
          <p>Steps: {wf.workflow_steps.map((s: any) => `${s.step_order}. ${s.type}`).join(' → ')}</p>
          <button onClick={() => handleTrigger(wf.id)} disabled={triggering}>
            {triggering ? 'Running...' : 'Run'}
          </button>
        </div>
      ))}

      {activeRunId && (
        <div style={{ marginTop: 30 }}>
          <h2>Live Run: {activeRunId}</h2>
          {subData?.step_runs?.map((sr: any) => (
            <div key={sr.id} style={{ padding: 10, borderBottom: '1px solid #eee' }}>
              <strong>Step {sr.workflow_step.step_order} ({sr.workflow_step.type})</strong>: {sr.status}
              {sr.attempt > 1 && ` (attempt ${sr.attempt})`}
              {sr.error && <span style={{ color: 'red' }}> — {sr.error}</span>}
              {sr.status === 'paused_awaiting_approval' && (
                <button onClick={() => handleApprove(sr.id)} style={{ marginLeft: 10 }}>
                  Approve
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const isAuthenticated = useAuthenticated();
  return isAuthenticated ? <Dashboard /> : <AuthForm />;
}