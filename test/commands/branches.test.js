import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {loadSession, saveSession} from '../../dist/auth/credentials.js'
import {runCLI} from '../run-cli.js'

const branch = {id: 'branch_feature', connector_id: 'connector-1', name: 'my feature', state: 'REGISTERED'}
const operation = {branch, operation: {operation_id: 'operation-1', workflow_id: 'workflow-1'}}
const connector = {id: 'connector-1', name: 'Primary', project_id: 'project-1'}
const project = {id: 'project-1', name: 'Database'}
const session = {token: 'test-token', organization: {id: 'organization-1', name: 'Ardent'}, projects: [project], selectedProject: project, connectors: [connector], selectedConnector: connector}

async function fixture(t, handle, saved = session) {
  const home = await mkdtemp(join(tmpdir(), 'ardent-branches-'))
  if (saved) await saveSession(join(home, 'ardent'), saved)
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString()
    const item = {method: request.method, url: request.url, authorization: request.headers.authorization, ...(body ? {body: JSON.parse(body)} : {})}
    requests.push(item)
    response.setHeader('Content-Type', 'application/json')
    handle(item, response)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  return {home, requests, run: (args) => runCLI(['branch', ...args], home, {ARDENT_API_URL: `http://127.0.0.1:${server.address().port}`})}
}

test('create sends connector ID and the name, with an internal request ID and no snapshot or placement arguments', async (t) => {
  const {run, requests} = await fixture(t, (_, response) => {response.statusCode = 202; response.end(JSON.stringify(operation))})
  const result = await run(['create', 'my', 'feature'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Creating branch my feature in connector Primary/)
  assert.match(result.stdout, /Branch creation started/)
  assert.equal(requests.length, 1)
  const [{body, ...request}] = requests
  assert.deepEqual(request, {method: 'POST', url: '/branches', authorization: 'Bearer test-token'})
  assert.match(body.request_id, /^[0-9a-f-]{36}$/)
  assert.deepEqual({...body, request_id: '<uuid>'}, {connector_id: 'connector-1', name: 'my feature', request_id: '<uuid>'})
})

test('delete sends the name and connector ID directly and retains selection until completion', async (t) => {
  const saved = {...session, branches: [branch], selectedBranch: branch}
  const {run, requests, home} = await fixture(t, (_, response) => {response.statusCode = 202; response.end(JSON.stringify(operation))}, saved)
  const result = await run(['delete', 'my feature', '--json'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), operation)
  assert.deepEqual(requests, [{method: 'DELETE', url: '/branches', authorization: 'Bearer test-token', body: {connector_id: 'connector-1', name: 'my feature'}}])
  const updated = await loadSession(join(home, 'ardent'))
  assert.equal(updated.selectedBranch.id, branch.id)
  assert.equal(updated.branches.length, 1)
})

test('list fetches the selected connector every time and refreshes stale branch selection', async (t) => {
  let calls = 0
  const {run, requests, home} = await fixture(t, (_, response) => response.end(JSON.stringify(++calls === 1 ? [{...branch, state: 'ACTIVE'}] : [])), {...session, branches: [branch], selectedBranch: branch})
  const first = await run(['list'])
  assert.equal(first.status, 0, first.stderr)
  assert.equal(
    first.stdout,
    '┌──────────┬────────────┬────────┐\n' +
      '│ Selected │ Title      │ Status │\n' +
      '├──────────┼────────────┼────────┤\n' +
      '│ ●        │ my feature │ ACTIVE │\n' +
      '└──────────┴────────────┴────────┘\n',
  )
  const second = await run(['list', '--json'])
  assert.deepEqual(JSON.parse(second.stdout), {branches: []})
  assert.equal(requests.length, 2)
  assert.ok(requests.every(({url}) => url === '/branches?connector_id=connector-1'))
  assert.equal((await loadSession(join(home, 'ardent'))).selectedBranch, undefined)
})

test('switch selects by name within the connector and writes only local context', async (t) => {
  const {run, home, requests} = await fixture(t, (_, response) => response.end(JSON.stringify([branch])))
  const result = await run(['switch', 'my', 'feature'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Switched to branch my feature in connector Primary/)
  assert.equal((await loadSession(join(home, 'ardent'))).selectedBranch.id, branch.id)
  assert.deepEqual(requests.map(({method}) => method), ['GET'])
})

test('fails without login or connector discovery context before making a request', async (t) => {
  for (const saved of [undefined, {token: 'test-token', organization: session.organization}]) {
    const setup = await fixture(t, () => assert.fail('unexpected request'), saved ?? null)
    const result = await setup.run(['create', 'feature'])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, saved ? /No project selected for connector discovery/ : /Run ardent-beta login/)
    assert.deepEqual(setup.requests, [])
  }
})

test('refuses explicit snapshot selection and invalid names', async (t) => {
  const {run, requests} = await fixture(t, () => assert.fail('unexpected request'))
  for (const args of [['create', 'feature', '--mark', 'mark-1'], ['create', 'feature', '--environment', 'env-1'], ['delete', '  '], ['create', 'a\nb'], ['switch', 'x'.repeat(129)]]) {
    const result = await run(args)
    assert.notEqual(result.status, 0, JSON.stringify(args))
  }
  assert.deepEqual(requests, [])
})

test('API refusal keeps local selection and returns the error', async (t) => {
  const {run, home} = await fixture(t, (_, response) => {response.statusCode = 409; response.end(JSON.stringify({message: 'Branch is busy.'}))}, {...session, branches: [branch], selectedBranch: branch})
  const result = await run(['delete', 'my feature'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Branch is busy/)
  assert.equal((await loadSession(join(home, 'ardent'))).selectedBranch.id, branch.id)
})

test('uses the sole discovered connector and refuses ambiguous automation', async (t) => {
  const record = {...connector, environment_id: 'env-1', status: 'ready', source: {database: 'app', host: 'source', port: 5432}, created_at: 'now', updated_at: 'now'}
  for (const count of [0, 1, 2]) {
    const {run, requests} = await fixture(t, (request, response) => response.end(JSON.stringify(request.url.startsWith('/connectors') ? Array.from({length: count}, (_, i) => ({...record, id: `connector-${i + 1}`, name: `Source ${i + 1}`})) : [])), {...session, connectors: undefined, selectedConnector: undefined})
    const result = await run(['list', '--json'])
    assert.equal(result.status === 0, count === 1, result.stderr)
    assert.equal(requests.length, count === 1 ? 2 : 1)
    if (count === 1) assert.equal(requests[1].url, '/branches?connector_id=connector-1')
  }
})
