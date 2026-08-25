'use client';

import { useState, useEffect } from 'react';
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client';
import {
  useSignInEmailPassword,
  useSignUpEmailPassword,
  useAuthenticationStatus,
  useSignOut,
  useUserId,
  useResetPassword,
  useChangePassword,
} from '@nhost/react';

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
      id
      name
      quota_used
      quota_limit
    }
  }
`;

// Looks up which org(s) the signed-in user belongs to, and their role in each.
const GET_MY_ORGS = gql`
  query GetMyOrgs($user_id: uuid!) {
    org_members(where: { user_id: { _eq: $user_id } }) {
      role
      organization {
        id
        name
      }
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

// ---------- Auth form (sign in / sign up / forgot password) ----------

function AuthForm() {
  const { signInEmailPassword } = useSignInEmailPassword();
  const { signUpEmailPassword } = useSignUpEmailPassword();
  const { resetPassword } = useResetPassword();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const clearMessages = () => {
    setError('');
    setResetSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    const result =
      mode === 'signin'
        ? await signInEmailPassword(email, password)
        : await signUpEmailPassword(email, password);
    if (result.error) setError(result.error.message);
  };

  const handleForgotPassword = async () => {
    clearMessages();
    if (!email) {
      setError('Enter your email above first, then click "Forgot password"');
      return;
    }
    // No separate route needed — nhost redirects back to this same page
    // (auth.redirections.clientUrl) with ?type=passwordReset in the URL,
    // which the top-level HomeClient component below detects.
    const result = await resetPassword(email);
    if (result.error) {
      setError(result.error.message);
    } else {
      setResetSent(true);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: 400 }}>
      <h1>Workflow Builder</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 10 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearMessages();
            }}
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearMessages();
            }}
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {resetSent && <p style={{ color: 'green' }}>Check your email for a reset link.</p>}
        <button type="submit">{mode === 'signin' ? 'Sign In' : 'Sign Up'}</button>
      </form>

      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          clearMessages();
        }}
        style={{ marginTop: 10, display: 'block' }}
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>

      {mode === 'signin' && (
        <button onClick={handleForgotPassword} style={{ marginTop: 10, display: 'block' }}>
          Forgot password?
        </button>
      )}
    </div>
  );
}

// ---------- Reset-password landing screen ----------
// Nhost redirects here (to auth.redirections.clientUrl) after the person
// clicks the emailed reset link, carrying a ticket in the URL that the SDK
// consumes automatically to authenticate them — no old password needed.

function SetNewPassword({ onDone }: { onDone: () => void }) {
  const { changePassword } = useChangePassword();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 9) {
      setError('Password must be at least 9 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const result = await changePassword(newPassword);
    if (result.error) {
      setError(result.error.message);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div style={{ padding: 40, maxWidth: 400 }}>
        <h1>Password updated</h1>
        <p style={{ color: 'green' }}>Your password has been changed successfully.</p>
        <button onClick={onDone}>Continue to dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 400 }}>
      <h1>Set a new password</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 10 }}>
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Update password</button>
      </form>
    </div>
  );
}

// ---------- Main dashboard ----------

function Dashboard() {
  const { signOut } = useSignOut();
  const userId = useUserId();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Look up every org this user belongs to, and their role in each —
  // no hardcoded ORG_ID, this drives the dashboard and (if more than
  // one org) shows a switcher.
  const {
    data: orgsData,
    loading: orgsLoading,
    error: orgsError,
  } = useQuery(GET_MY_ORGS, {
    variables: { user_id: userId },
    skip: !userId,
  });

  const myOrgs = orgsData?.org_members ?? [];

  useEffect(() => {
    if (!selectedOrgId && myOrgs.length > 0) {
      setSelectedOrgId(myOrgs[0].organization.id);
    }
  }, [myOrgs, selectedOrgId]);

  const { data, loading, error, refetch } = useQuery(GET_WORKFLOWS, {
    variables: { org_id: selectedOrgId },
    skip: !selectedOrgId,
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

  if (orgsLoading) return <p style={{ padding: 40 }}>Loading your organizations...</p>;
  if (orgsError) return <p style={{ padding: 40, color: 'red' }}>Error: {orgsError.message}</p>;

  if (myOrgs.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        <p>Signed in. User ID: {userId}</p>
        <button onClick={() => signOut()}>Sign out</button>
        <hr style={{ margin: '20px 0' }} />
        <p>You don't belong to any organization yet.</p>
      </div>
    );
  }

  const org = data?.organizations_by_pk;
  const currentMembership = myOrgs.find((m: any) => m.organization.id === selectedOrgId);

  return (
    <div style={{ padding: 40 }}>
      <p>Signed in. User ID: {userId}</p>
      <button onClick={() => signOut()}>Sign out</button>
      <hr style={{ margin: '20px 0' }} />

      {myOrgs.length > 1 ? (
        <div style={{ marginBottom: 20 }}>
          <label>
            <strong>Organization:</strong>{' '}
            <select
              value={selectedOrgId ?? ''}
              onChange={(e) => {
                setSelectedOrgId(e.target.value);
                setActiveRunId(null);
              }}
            >
              {myOrgs.map((m: any) => (
                <option key={m.organization.id} value={m.organization.id}>
                  {m.organization.name} ({m.role})
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p>
          <strong>Organization:</strong> {myOrgs[0].organization.name} ({myOrgs[0].role})
        </p>
      )}

      {loading && <p>Loading workflows...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}

      {org && (
        <p>
          <strong>Quota:</strong> {org.quota_used} / {org.quota_limit}
        </p>
      )}

      <h2>Workflows</h2>
      {data?.workflows?.length === 0 && <p>No workflows found for this org.</p>}
      {data?.workflows?.map((wf: any) => (
        <div key={wf.id} style={{ border: '1px solid #ccc', padding: 15, marginBottom: 15 }}>
          <h3>{wf.name}</h3>
          <p>Steps: {wf.workflow_steps.map((s: any) => `${s.step_order}. ${s.type}`).join(' → ')}</p>
          {currentMembership?.role !== 'viewer' ? (
            <button onClick={() => handleTrigger(wf.id)} disabled={triggering}>
              {triggering ? 'Running...' : 'Run'}
            </button>
          ) : (
            <p style={{ color: '#888', fontStyle: 'italic' }}>Viewers cannot trigger runs.</p>
          )}
        </div>
      ))}

      {activeRunId && (
        <div style={{ marginTop: 30 }}>
          <h2>Live Run: {activeRunId}</h2>
          {subData?.step_runs?.map((sr: any) => (
            <div key={sr.id} style={{ padding: 10, borderBottom: '1px solid #eee' }}>
              <strong>
                Step {sr.workflow_step.step_order} ({sr.workflow_step.type})
              </strong>
              : {sr.status}
              {sr.attempt > 1 && ` (attempt ${sr.attempt})`}
              {sr.error && <span style={{ color: 'red' }}> — {sr.error}</span>}
              {sr.status === 'paused_awaiting_approval' && currentMembership?.role !== 'viewer' && (
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

// ---------- Top-level: routes between auth form, reset flow, and dashboard ----------

export default function HomeClient() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const [isPasswordReset, setIsPasswordReset] = useState(false);

  useEffect(() => {
    // Nhost's reset-password email links back to clientUrl with
    // ?type=passwordReset (plus a ticket the SDK consumes automatically
    // to authenticate the person — no old password required).
    const params = new URLSearchParams(window.location.search);
    if (params.get('type') === 'passwordReset') {
      setIsPasswordReset(true);
    }
  }, []);

  // Wait for nhost to fully resolve auth state (including consuming any
  // ticket in the URL) before deciding what to render. Without this,
  // the sign-in form can flash briefly even for a valid reset link.
  if (isLoading) {
    return <p style={{ padding: 40 }}>Loading...</p>;
  }

  if (isAuthenticated && isPasswordReset) {
    return (
      <SetNewPassword
        onDone={() => {
          setIsPasswordReset(false);
          // Clean the query string so a refresh doesn't re-trigger this screen
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  return isAuthenticated ? <Dashboard /> : <AuthForm />;
}