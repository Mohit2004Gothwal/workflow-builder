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
    throw new Error(`GraphQL error. Variables sent: ${JSON.stringify(variables)}. Errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

module.exports = async (req, res) => {
  try {
    const { step_run_id } = req.body.input;
    const userId = req.body.session_variables['x-hasura-user-id'];

    // 1. Look up the step_run, its run, and the org
    const data = await gql(`
      query($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id
          status
          workflow_run {
            id
            org_id
            status
          }
        }
      }
    `, { id: step_run_id });

    const stepRun = data.step_runs_by_pk;
    if (!stepRun) {
      return res.status(404).json({ message: 'step_run not found' });
    }

    if (stepRun.status !== 'paused_awaiting_approval') {
      return res.status(409).json({ message: 'step is not awaiting approval' });
    }

    // 2. Check the approver's role in that org, fresh from org_members
    const memberData = await gql(`
      query($org_id: uuid!, $user_id: uuid!) {
        org_members(where: { org_id: { _eq: $org_id }, user_id: { _eq: $user_id } }) {
          role
        }
      }
    `, { org_id: stepRun.workflow_run.org_id, user_id: userId });

    const membership = memberData.org_members[0];
    if (!membership || !['owner', 'editor'].includes(membership.role)) {
      return res.status(403).json({ message: 'not authorized to approve this step' });
    }

    // 3. Mark this step approved + succeeded
    await gql(`
      mutation($id: uuid!, $approved_by: uuid!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "succeeded",
          approved_by: $approved_by,
          approved_at: "now()"
        }) { id }
      }
    `, { id: step_run_id, approved_by: userId });

    // 4. Resume the run: get remaining steps after this one, and continue executing
    const runId = stepRun.workflow_run.id;

    await gql(`
      mutation($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "running" }) { id }
      }
    `, { id: runId });

    // Find this step's order, then get all steps after it
    const thisStepData = await gql(`
      query($id: uuid!) {
        step_runs_by_pk(id: $id) {
          workflow_step { workflow_id step_order }
        }
      }
    `, { id: step_run_id });

    const { workflow_id, step_order } = thisStepData.step_runs_by_pk.workflow_step;

    const remainingStepsData = await gql(`
      query($workflow_id: uuid!, $step_order: Int!) {
        workflow_steps(
          where: { workflow_id: { _eq: $workflow_id }, step_order: { _gt: $step_order } },
          order_by: { step_order: asc }
        ) { id type config }
      }
    `, { workflow_id, step_order });

    const remainingSteps = remainingStepsData.workflow_steps;
    let lastOutput = null;

    for (const step of remainingSteps) {
      const stepRunData = await gql(`
        mutation($workflow_run_id: uuid!, $workflow_step_id: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $workflow_run_id,
            workflow_step_id: $workflow_step_id,
            status: "running"
          }) { id }
        }
      `, { workflow_run_id: runId, workflow_step_id: step.id });

      const newStepRunId = stepRunData.insert_step_runs_one.id;

      if (step.type === 'approval_gate') {
        await gql(`
          mutation($id: uuid!) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused_awaiting_approval" }) { id }
          }
        `, { id: newStepRunId });
        await gql(`
          mutation($id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused" }) { id }
          }
        `, { id: runId });
        return res.json({ run_id: runId, status: 'paused' });
      }

      let output;
      if (step.type === 'llm_call') output = { note: 'stubbed llm call', input: lastOutput };
      else if (step.type === 'http_request') output = { note: 'stubbed http call' };
      else if (step.type === 'conditional_branch') output = { branch: 'default' };
      else if (step.type === 'db_write') output = { written: true };
      else if (step.type === 'notify') output = { notified: true };

      lastOutput = output;

      await gql(`
        mutation($id: uuid!, $output: jsonb!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "succeeded", output: $output }) { id }
        }
      `, { id: newStepRunId, output });
    }

    await gql(`
      mutation($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed" }) { id }
      }
    `, { id: runId });

    return res.json({ run_id: runId, status: 'completed' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: String(err) });
  }
};