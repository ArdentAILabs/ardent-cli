import assert from 'node:assert/strict'
import test from 'node:test'

import {createBranch, deleteBranch, listBranches, waitForBranchOperation} from '../../dist/branches/client.js'

const branch = {id: 'branch-1', connector_id: 'connector-1', name: 'feature', state: 'ACTIVE'}

test('rejects branches from another connector and malformed responses', async (t) => {
  for (const value of [null, {}, [null], [{...branch, connector_id: 'other'}], [branch, branch]]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(value))
    await assert.rejects(listBranches('token', 'connector-1'), /invalid branches response/)
  }
  for (const value of [null, {}, {branch, operation: {}}, {branch: {...branch, name: 'other'}, operation: {workflow_id: 'w', operation_id: 'o'}}]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(value))
    await assert.rejects(createBranch('token', 'connector-1', 'feature'), /invalid branch operation/)
    await assert.rejects(deleteBranch('token', 'connector-1', 'feature'), /invalid branch operation/)
  }
})

test('polls workflow completion rather than treating the branch state as completion', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => Response.json({id: 'workflow-1', status: ['DELAYED', 'PENDING', 'SUCCESS'][calls++]}))
  const statuses = []
  await waitForBranchOperation('token', 'workflow-1', (status) => statuses.push(status))
  assert.deepEqual(statuses, ['delayed', 'pending', 'success'])
})

test('reports terminal workflow failure and rejects wrong workflow identity', async (t) => {
  for (const status of ['ERROR', 'CANCELLED', 'MAX_RECOVERY_ATTEMPTS_EXCEEDED']) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({id: 'workflow-1', status, failure: 'Creation failed.'}))
    await assert.rejects(waitForBranchOperation('token', 'workflow-1'), /Creation failed/)
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({id: 'wrong-workflow', status: 'SUCCESS'}))
  await assert.rejects(waitForBranchOperation('token', 'workflow-1'), /invalid branch operation status/)
})
