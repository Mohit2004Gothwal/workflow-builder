const fetch = require('node-fetch');

const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'http://graphql:8080/v1/graphql'; // internal docker network URL, we'll confirm the exact value next
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

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
    const { workflow_id } = req.body.input;
    const userId = req.body.session_variables['x-hasura-user-id'];
    
    console.log('DEBUG req.body:', JSON.stringify(req.body));
    // 1. Fetch workflow + org
    const wfData = await gql(`
      query($id: uuid!) {
        workflows_by_pk(id: $id) {
          id org_id
        }
      }
    `, { id: workflow_id });

    const workflow = wfData.workflows_by_pk;
    if (!workflow) {
      return res.status(404).json({ message: 'workflow not found' });
    }

    // 2. Check membership + role
    const memberData = await gql(`
      query($org_id: uuid!, $user_id: uuid!) {
        org_members(where: { org_id: { _eq: $org_id }, user_id: { _eq: $user_id } }) {
          role
        }
      }
    `, { org_id: workflow.org_id, user_id: userId });

    const membership = memberData.org_members[0];
    if (!membership || !['owner', 'editor'].includes(membership.role)) {
      return res.status(403).json({ message: 'not authorized to trigger this workflow' });
    }

    // 3. Check quota
    const orgData = await gql(`
      query($id: uuid!) {
        organizations_by_pk(id: $id) {
         id quota_used quota_limit
        }
      }
    `, { id: workflow.org_id });

    const org = orgData.organizations_by_pk;
    if (org.quota_used >= org.quota_limit) {
      return res.status(429).json({ message: 'quota exhausted' });
    }

    // 4. Create the run
    const runData = await gql(`
      mutation($workflow_id: uuid!, $org_id: uuid!, $started_by: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflow_id,
          org_id: $org_id,
          status: "running",
          started_by: $started_by,
          trigger_type: "manual"
        }) { id }
      }
    `, { workflow_id, org_id: workflow.org_id, started_by: userId });

    const runId = runData.insert_workflow_runs_one.id;

    // 5. Get ordered steps
    const stepsData = await gql(`
      query($workflow_id: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $workflow_id } }, order_by: { step_order: asc }) {
          id type config
        }
      }
    `, { workflow_id });

    const steps = stepsData.workflow_steps;
    let lastOutput = null;

    for (const step of steps) {
      const stepRunData = await gql(`
        mutation($workflow_run_id: uuid!, $workflow_step_id: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $workflow_run_id,
            workflow_step_id: $workflow_step_id,
            status: "running"
          }) { id }
        }
      `, { workflow_run_id: runId, workflow_step_id: step.id });

      const stepRunId = stepRunData.insert_step_runs_one.id;

      if (step.type === 'approval_gate') {
        await gql(`
          mutation($id: uuid!) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused_awaiting_approval" }) { id }
          }
        `, { id: stepRunId });
        await gql(`
          mutation($id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused" }) { id }
          }
        `, { id: runId });
        return res.json({ run_id: runId, status: 'paused' });
      }

      try {
        let output;
        if (step.type === 'llm_call') {
          output = { note: 'stubbed llm call', input: lastOutput };
          // TODO: replace with real LLM API call
        } else if (step.type === 'http_request') {
          output = { note: 'stubbed http call' };
          // TODO: replace with real fetch() to step.config.url
        } else if (step.type === 'conditional_branch') {
          output = { branch: 'default', prevOutput: lastOutput };
        } else if (step.type === 'db_write') {
          output = { written: true };
        } else if (step.type === 'notify') {
          output = { notified: true };
        }

        lastOutput = output;

        await gql(`
          mutation($id: uuid!, $output: jsonb!) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "succeeded", output: $output }) { id }
          }
        `, { id: stepRunId, output });

      } catch (err) {
        await gql(`
          mutation($id: uuid!, $error: String!) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: $error }) { id }
          }
        `, { id: stepRunId, error: String(err) });

        await gql(`
          mutation($id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed" }) { id }
          }
        `, { id: runId });

        return res.json({ run_id: runId, status: 'failed' });
      }
    }

    // 6. Mark complete + increment quota
    await gql(`
      mutation($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed" }) { id }
      }
    `, { id: runId });

    await gql(`
      mutation($id: uuid!, $used: Int!) {
        update_organizations_by_pk(pk_columns: { id: $id }, _set: { quota_used: $used }) { id }
      }
    `, { id: org.id, used: org.quota_used + 1 });

    return res.json({ run_id: runId, status: 'completed' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: String(err) });
  }
};