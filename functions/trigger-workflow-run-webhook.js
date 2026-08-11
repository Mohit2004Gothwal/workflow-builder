const fetch = require('node-fetch');

const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'https://gmfrhjdjkgaaqlpuyzdi.hasura.ap-south-1.nhost.run/v1/graphql';
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET;

async function gql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error. Variables: ${JSON.stringify(variables)}. Errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Plain HTTP endpoint (not a Hasura Action) — external systems POST here directly.
// Expects: { workflow_id, secret } in the JSON body.
module.exports = async (req, res) => {
  try {
    const { workflow_id, secret } = req.body;

    if (!workflow_id || !secret) {
      return res.status(400).json({ message: 'workflow_id and secret are required' });
    }

    // 1. Find the webhook trigger config for this workflow and validate the secret
    const triggerData = await gql(`
      query($workflow_id: uuid!) {
        workflow_triggers(where: { workflow_id: { _eq: $workflow_id }, type: { _eq: "webhook" } }) {
          id config
        }
      }
    `, { workflow_id });

    const trigger = triggerData.workflow_triggers[0];
    if (!trigger || trigger.config.secret !== secret) {
      return res.status(403).json({ message: 'invalid webhook secret or no webhook trigger configured' });
    }

    // 2. Fetch workflow + org (no user/membership check — webhook auth is the secret itself)
    const wfData = await gql(`
      query($id: uuid!) {
        workflows_by_pk(id: $id) { id org_id }
      }
    `, { id: workflow_id });

    const workflow = wfData.workflows_by_pk;
    if (!workflow) return res.status(404).json({ message: 'workflow not found' });

    const orgData = await gql(`
      query($id: uuid!) {
        organizations_by_pk(id: $id) { id quota_used quota_limit }
      }
    `, { id: workflow.org_id });

    const org = orgData.organizations_by_pk;
    if (org.quota_used >= org.quota_limit) {
      return res.status(429).json({ message: 'quota exhausted' });
    }

    // 3. Create the run with trigger_type "webhook"
    const runData = await gql(`
      mutation($workflow_id: uuid!, $org_id: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflow_id,
          org_id: $org_id,
          status: "running",
          trigger_type: "webhook"
        }) { id }
      }
    `, { workflow_id, org_id: workflow.org_id });

    const runId = runData.insert_workflow_runs_one.id;

    // 4. Execute steps (same loop as triggerWorkflowRun — kept simple, no retry duplication for brevity in this stub)
    const stepsData = await gql(`
      query($workflow_id: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $workflow_id } }, order_by: { step_order: asc }) {
          id type config
        }
      }
    `, { workflow_id });

    for (const step of stepsData.workflow_steps) {
      const stepRunData = await gql(`
        mutation($workflow_run_id: uuid!, $workflow_step_id: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $workflow_run_id, workflow_step_id: $workflow_step_id, status: "running"
          }) { id }
        }
      `, { workflow_run_id: runId, workflow_step_id: step.id });

      const stepRunId = stepRunData.insert_step_runs_one.id;

      if (step.type === 'approval_gate') {
        await gql(`mutation($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused_awaiting_approval" }) { id } }`, { id: stepRunId });
        await gql(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused" }) { id } }`, { id: runId });
        return res.json({ run_id: runId, status: 'paused' });
      }

      const output = { note: `stubbed ${step.type}` };
      await gql(`
        mutation($id: uuid!, $output: jsonb!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "succeeded", output: $output }) { id }
        }
      `, { id: stepRunId, output });
    }

    await gql(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed" }) { id } }`, { id: runId });
    await gql(`mutation($id: uuid!, $used: Int!) { update_organizations_by_pk(pk_columns: { id: $id }, _set: { quota_used: $used }) { id } }`, { id: org.id, used: org.quota_used + 1 });

    return res.json({ run_id: runId, status: 'completed' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: String(err) });
  }
};