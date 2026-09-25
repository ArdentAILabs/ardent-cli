import {randomUUID} from 'node:crypto'

import {request} from '../api/client.js'

export interface Branch {
  id: string
  connector_id: string
  name: string
  state: string
  failure_reason?: string
}

export interface BranchOperation {
  branch: Branch
  operation: {operation_id: string; workflow_id: string}
}

export async function listBranches(token: string, connectorID: string): Promise<Branch[]> {
  const branches = await request<Branch[]>(token, `/branches?${new URLSearchParams({connector_id: connectorID})}`)
  if (!Array.isArray(branches) || branches.some((branch) => !isBranch(branch, connectorID)) || new Set(branches.map(({id}) => id)).size !== branches.length || new Set(branches.map(({name}) => name)).size !== branches.length) {
    throw new Error('Ardent API returned an invalid branches response.')
  }
  return branches
}

export async function createBranch(token: string, connectorID: string, name: string): Promise<BranchOperation> {
  const result = await request<BranchOperation>(token, '/branches', {
    method: 'POST', body: JSON.stringify({connector_id: connectorID, name, request_id: randomUUID()}),
  })
  validateOperation(result, connectorID, name)
  return result
}

export async function deleteBranch(token: string, connectorID: string, name: string): Promise<BranchOperation> {
  const result = await request<BranchOperation>(token, '/branches', {
    method: 'DELETE', body: JSON.stringify({connector_id: connectorID, name}),
  })
  validateOperation(result, connectorID, name)
  return result
}

export async function waitForBranchOperation(token: string, workflowID: string, onStatus?: (status: string) => void): Promise<void> {
  const deadline = Date.now() + 30 * 60 * 1000
  while (Date.now() < deadline) {
    const result = await request<{id: string; status: string; failure?: string}>(token, `/workflows/${encodeURIComponent(workflowID)}`)
    if (!result || result.id !== workflowID || !['DELAYED', 'ENQUEUED', 'PENDING', 'SUCCESS', 'ERROR', 'CANCELLED', 'MAX_RECOVERY_ATTEMPTS_EXCEEDED'].includes(result.status) || (result.failure !== undefined && typeof result.failure !== 'string')) {
      throw new Error('Ardent API returned an invalid branch operation status.')
    }
    onStatus?.(result.status.toLowerCase())
    if (result.status === 'SUCCESS') return
    if (!['DELAYED', 'ENQUEUED', 'PENDING'].includes(result.status)) throw new Error(result.failure || `Branch operation ${result.status.toLowerCase()}.`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Timed out waiting for the branch operation. Run ardent-beta branch list to check its state.')
}

export function branchName(arguments_: unknown[]): string {
  const name = arguments_.map(String).join(' ').trim()
  if (!name || [...name].length > 128 || /[\p{Cc}]/u.test(name)) throw new Error('Branch name must contain 1 to 128 characters without control characters.')
  return name
}

function isBranch(value: unknown, connectorID: string): value is Branch {
  if (typeof value !== 'object' || value === null) return false
  const branch = value as Partial<Branch>
  return typeof branch.id === 'string' && branch.id.length > 0 && branch.connector_id === connectorID &&
    typeof branch.name === 'string' && branch.name.length > 0 && typeof branch.state === 'string' && branch.state.length > 0 &&
    (branch.failure_reason === undefined || typeof branch.failure_reason === 'string')
}

function validateOperation(result: BranchOperation, connectorID: string, name: string): void {
  if (!result || !isBranch(result.branch, connectorID) || result.branch.name !== name || !result.operation ||
    typeof result.operation.operation_id !== 'string' || !result.operation.operation_id ||
    typeof result.operation.workflow_id !== 'string' || !result.operation.workflow_id) {
    throw new Error('Ardent API returned an invalid branch operation response.')
  }
}
