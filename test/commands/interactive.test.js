import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {loadSession, saveSession} from '../../dist/auth/credentials.js'
import {runCLIInTerminal, terminalSupported} from '../run-cli-terminal.js'

const project = {id: 'project-1', name: 'Database'}
const connector = {id: 'connector-1', name: 'Primary', project_id: project.id}
const branch = {id: 'branch-1', name: 'feature', connector_id: connector.id, state: 'ACTIVE'}
const operation = {branch, operation: {operation_id: 'operation-1', workflow_id: 'workflow-1'}}
const session = {token: 'test-token', organization: {id: 'organization-1', name: 'Ardent'}, projects: [project], selectedProject: project, connectors: [connector], selectedConnector: connector}
const options = {skip: !terminalSupported}

async function fixture(t, handle, saved = session, connectors = [connector]) {
  const home = await mkdtemp(join(tmpdir(), 'ardent-cli-terminal-'))
  await saveSession(join(home, 'ardent'), saved)
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString()
    const item = {method: request.method, url: request.url, authorization: request.headers.authorization, ...(body ? {body: JSON.parse(body)} : {})}
    requests.push(item)
    response.setHeader('Content-Type', 'application/json')
    if (item.method === 'GET' && item.url.startsWith('/connectors?')) {
      response.end(JSON.stringify(connectors.map((identity) => ({
        ...identity, environment_id: 'environment-1', status: 'registered',
        source: {database: 'postgres', host: 'database.example', port: 5432},
        created_at: '2026-09-21', updated_at: '2026-09-21',
      }))))
    } else handle(item, response)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  return {
    requests,
    session: () => loadSession(join(home, 'ardent')),
    run: (args, answer) => runCLIInTerminal(t, args, home, {ARDENT_API_URL: `http://127.0.0.1:${server.address().port}`}, answer),
  }
}

async function reachedPoll(pending, running) {
  return Promise.race([
    pending.promise,
    running.finished.then((result) => { throw new Error(`CLI exited before polling: ${JSON.stringify(result)}`) }),
  ])
}

function completed(result, success = true) {
  assert.equal(result.timedOut, false, result.output)
  if (success) assert.equal(result.status, 0, result.output)
  else assert.notEqual(result.status, 0, result.output)
}

test('terminal connector picker accepts a number, preserves the current default, and refuses invalid input', options, async (t) => {
  const second = {...connector, id: 'connector-2', name: 'Analytics'}
  for (const [answer, current, expected] of [['2', connector, second], ['', second, second], ['9', connector, undefined]]) {
    const saved = {...session, connectors: [connector, second], selectedConnector: current}
    const setup = await fixture(t, (_, response) => response.end('[]'), saved, [connector, second])
    const result = await setup.run(['branch', 'list'], answer).finished
    completed(result, expected !== undefined)
    assert.match(result.output, /1\. Primary/)
    assert.match(result.output, /2\. Analytics/)
    assert.ok(result.output.includes(`Select a connector by number [${current.name}]:`))
    assert.equal((await setup.session()).selectedConnector.id, (expected ?? current).id)
    if (expected) assert.equal(setup.requests[1].url, `/branches?connector_id=${expected.id}`)
    else {
      assert.match(result.output, /Invalid connector selection/)
      assert.equal(setup.requests.length, 1)
    }
  }
})

test('terminal branch creation waits for workflow success after request acceptance', options, async (t) => {
  const pending = Promise.withResolvers()
  let polls = 0
  const setup = await fixture(t, (request, response) => {
    if (request.method === 'POST' && request.url === '/branches') {
      response.writeHead(202).end(JSON.stringify(operation))
    } else if (request.url === '/workflows/workflow-1') {
      if (++polls === 1) pending.resolve(response)
      else response.end(JSON.stringify({id: 'workflow-1', status: 'SUCCESS'}))
    } else response.writeHead(500).end('{}')
  })
  const running = setup.run(['branch', 'create', 'feature'])
  const response = await reachedPoll(pending, running)
  assert.doesNotMatch(running.output, /✓ created|Branch creation started/)
  assert.equal((await setup.session()).branches[0].id, branch.id)
  response.end(JSON.stringify({id: 'workflow-1', status: 'PENDING'}))

  const result = await running.finished
  completed(result)
  assert.match(result.output, /✓ created/)
  assert.equal(polls, 2)
  assert.equal(setup.requests.find(({method}) => method === 'POST').body.connector_id, connector.id)
  assert.ok(setup.requests.every(({authorization}) => authorization === 'Bearer test-token'))
})

test('terminal branch deletion clears selection only after workflow success', options, async (t) => {
  for (const terminal of ['SUCCESS', 'ERROR']) {
    const pending = Promise.withResolvers()
    let polls = 0
    const setup = await fixture(t, (request, response) => {
      if (request.method === 'DELETE' && request.url === '/branches') {
        response.writeHead(202).end(JSON.stringify(operation))
      } else if (request.url === '/workflows/workflow-1') {
        if (++polls === 1) pending.resolve(response)
        else response.end(JSON.stringify({id: 'workflow-1', status: terminal, ...(terminal === 'ERROR' ? {failure: 'fixture deletion failed'} : {})}))
      } else response.writeHead(500).end('{}')
    }, {...session, branches: [branch], selectedBranch: branch})
    const running = setup.run(['branch', 'delete', 'feature'])
    const response = await reachedPoll(pending, running)
    assert.equal((await setup.session()).selectedBranch?.id, branch.id)
    assert.doesNotMatch(running.output, /✓ deleted|Branch deletion started/)
    response.end(JSON.stringify({id: 'workflow-1', status: 'PENDING'}))

    const result = await running.finished
    completed(result, terminal === 'SUCCESS')
    const saved = await setup.session()
    if (terminal === 'SUCCESS') {
      assert.match(result.output, /✓ deleted/)
      assert.equal(saved.selectedBranch, undefined)
      assert.deepEqual(saved.branches, [])
    } else {
      assert.match(result.output, /fixture deletion failed/)
      assert.doesNotMatch(result.output, /✓ deleted/)
      assert.equal(saved.selectedBranch.id, branch.id)
      assert.equal(saved.branches[0].id, branch.id)
    }
    assert.equal(polls, 2)
  }
})

test('terminal connector creation waits for registration and names the remaining readiness work', options, async (t) => {
  const pending = Promise.withResolvers()
  let polls = 0
  const setup = await fixture(t, (request, response) => {
    if (request.method === 'POST' && request.url === '/connectors') {
      response.writeHead(202).end(JSON.stringify({connector_id: connector.id}))
    } else if (request.url === `/connectors/${connector.id}`) {
      if (++polls === 1) pending.resolve(response)
      else response.end(JSON.stringify({connector_id: connector.id, status: 'registered'}))
    } else response.writeHead(500).end('{}')
  })
  const url = 'postgresql://source:private-password@database.example/postgres'
  const running = setup.run(['connector', 'create', 'postgresql', url, '--name', 'Primary'])
  const response = await reachedPoll(pending, running)
  assert.doesNotMatch(running.output, /✓ registered|Connector registration started|replication readiness/)
  response.end(JSON.stringify({connector_id: connector.id, status: 'registering'}))

  const result = await running.finished
  completed(result)
  assert.match(result.output, /✓ registered/)
  assert.match(result.output, /Replication readiness is still pending/)
  assert.ok(!result.output.includes(url))
  assert.ok(!result.output.includes('private-password'))
  assert.equal(setup.requests[0].body.url, url)
  assert.equal(polls, 2)
})

test('terminal connector creation stops on a halted connector without claiming registration', options, async (t) => {
  let polls = 0
  const setup = await fixture(t, (request, response) => {
    if (request.method === 'POST' && request.url === '/connectors') {
      response.writeHead(202).end(JSON.stringify({connector_id: connector.id}))
    } else if (request.url === `/connectors/${connector.id}`) {
      polls++
      response.end(JSON.stringify({connector_id: connector.id, status: 'halted', failure: 'normalizer:edge_behind_frontier'}))
    } else response.writeHead(500).end('{}')
  })
  const result = await setup.run(['connector', 'create', 'postgresql', 'postgresql://source@database.example/postgres', '--name', 'Primary']).finished
  completed(result, false)
  // Oclif wraps the error to the terminal width, so compare with the wrapping removed.
  assert.match(result.output.replace(/\s+/g, ' '), /Connector connector-1 is halted: normalizer:edge_behind_frontier\. Run ardent-beta connector list/)
  assert.doesNotMatch(result.output, /✓ registered|Replication readiness is still pending/)
  assert.equal(polls, 1)
})
