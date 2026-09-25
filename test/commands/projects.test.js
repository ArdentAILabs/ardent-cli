import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {loadSession, saveSession} from '../../dist/auth/credentials.js'
import {runCLI} from '../run-cli.js'

const listen = async (handler) => {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {server, url: `http://127.0.0.1:${address.port}`}
}

test('creates and lists projects in the logged-in organization', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-projects-'))
  await saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ardent'},
    token: 'test-token',
  })

  const requests = []
  const {server, url} = await listen((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
        idempotencyKey: request.headers['idempotency-key'],
        method: request.method,
        url: request.url,
      })
      response.setHeader('Content-Type', 'application/json')
      if (request.method === 'DELETE') {
        response.statusCode = 204
        response.end()
        return
      }

      if (request.method === 'POST') {
        response.statusCode = 201
        response.end('{"id":"project-1","organization_id":"organization-1","name":"Database","created_at":"now","updated_at":"now"}')
        return
      }

      response.end('[{"id":"project-1","organization_id":"organization-1","name":"Database","created_at":"now","updated_at":"now"},{"id":"project-2","organization_id":"organization-1","name":"Longer database","created_at":"now","updated_at":"now"}]')
    })
  })
  t.after(() => server.close())

  const environment = {ARDENT_API_URL: url}
  const create = await runCLI(['project', 'create', ' Database ', '--json'], configHome, environment)
  assert.equal(create.status, 0, create.stderr)
  assert.equal(JSON.parse(create.stdout).id, 'project-1')
  assert.deepEqual((await loadSession(join(configHome, 'ardent'))).selectedProject, {
    id: 'project-1',
    name: 'Database',
  })

  const list = await runCLI(['project', 'list', '--json'], configHome, environment)
  assert.equal(list.status, 0, list.stderr)
  assert.deepEqual(JSON.parse(list.stdout).projects.map(({id}) => id), ['project-1', 'project-2'])

  const readableList = await runCLI(['project', 'list'], configHome, environment)
  assert.equal(readableList.status, 0, readableList.stderr)
  assert.equal(
    readableList.stdout,
    '┌───────────────────┐\n' +
      '│ Title             │\n' +
      '├───────────────────┤\n' +
      '│ ● Database        │\n' +
      '│   Longer database │\n' +
      '└───────────────────┘\n',
  )

  const requestCountBeforeSwitch = requests.length
  const switchProject = await runCLI(['project', 'switch', 'Longer database'], configHome, environment)
  assert.equal(switchProject.status, 0, switchProject.stderr)
  assert.equal(switchProject.stdout, '✓ Switched to project Longer database\n')
  assert.equal(requests.length, requestCountBeforeSwitch)
  assert.deepEqual((await loadSession(join(configHome, 'ardent'))).selectedProject, {
    id: 'project-2',
    name: 'Longer database',
  })

  const switchedList = await runCLI(['project', 'list'], configHome, environment)
  assert.equal(switchedList.status, 0, switchedList.stderr)
  assert.equal(
    switchedList.stdout,
    '┌───────────────────┐\n' +
      '│ Title             │\n' +
      '├───────────────────┤\n' +
      '│   Database        │\n' +
      '│ ● Longer database │\n' +
      '└───────────────────┘\n',
  )

  const deleteResult = await runCLI(['project', 'delete', 'Longer database'], configHome, environment)
  assert.equal(deleteResult.status, 0, deleteResult.stderr)
  assert.equal(deleteResult.stdout, 'Deleting project Longer database...\n✓ Deleted project Longer database\n')
  assert.deepEqual(await loadSession(join(configHome, 'ardent')), {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    selectedProject: {id: 'project-1', name: 'Database'},
    token: 'test-token',
  })

  const readableCreate = await runCLI(['project', 'create', 'Database'], configHome, environment)
  assert.equal(readableCreate.status, 0, readableCreate.stderr)
  assert.equal(readableCreate.stdout, '✓ Created project Database\n')

  assert.deepEqual(requests[0], {
    authorization: 'Bearer test-token',
    body: '{"name":"Database","organization_id":"organization-1"}',
    idempotencyKey: requests[0].idempotencyKey,
    method: 'POST',
    url: '/projects',
  })
  assert.match(requests[0].idempotencyKey, /^[0-9a-f-]{36}$/)
  assert.deepEqual(requests[1], {
    authorization: 'Bearer test-token',
    body: '',
    idempotencyKey: undefined,
    method: 'GET',
    url: '/projects?organization_id=organization-1',
  })
  assert.deepEqual(requests[2], requests[1])
  assert.deepEqual(requests[3], requests[1])
  assert.deepEqual(requests[4], requests[1])
  assert.deepEqual(requests[5], {
    authorization: 'Bearer test-token',
    body: '',
    idempotencyKey: undefined,
    method: 'DELETE',
    url: '/projects/project-2?organization_id=organization-1',
  })
})

test('requires login with organization context', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-context-'))

  const loggedOut = await runCLI(['project', 'list'], configHome)
  assert.equal(loggedOut.status, 2)
  assert.match(loggedOut.stderr, /Run ardent-beta login/)

  await saveSession(join(configHome, 'ardent'), {token: 'old-token'})
  const oldSession = await runCLI(['project', 'list'], configHome)
  assert.equal(oldSession.status, 2)
  assert.match(oldSession.stderr, /You must be logged in to run this command\. Run ardent-beta login\./)
})

test('switches to a project created since the last list, with no cache present', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-switch-'))
  await saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ardent'},
    token: 'test-token',
  })

  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify([
        {
          created_at: '2026-01-01T00:00:00Z',
          id: 'project-1',
          name: 'sanfran',
          organization_id: 'organization-1',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]),
    )
  })
  t.after(() => server.close())

  const result = await runCLI(['project', 'switch', 'sanfran'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '\u2713 Switched to project sanfran\n')
  const session = await loadSession(join(configHome, 'ardent'))
  assert.deepEqual(session.selectedProject, {id: 'project-1', name: 'sanfran'})
})

test('refuses a project name absent from the authoritative list', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-switch-missing-'))
  await saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    token: 'test-token',
  })

  const requests = []
  const {server, url} = await listen((request, response) => {
    requests.push(request.url)
    response.setHeader('Content-Type', 'application/json')
    response.end('[]')
  })
  t.after(() => server.close())

  // A miss on the cache is checked against the organization before it is
  // reported as missing, so this asks the server exactly once and then refuses.
  const result = await runCLI(['project', 'switch', 'Never existed'], configHome, {ARDENT_API_URL: url})
  assert.equal(requests.length, 1)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /"Never existed" not found in organization "Ardent"/)
})

test('a refused switch escapes the remote organization name', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-switch-escape-'))
  await saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ard\u202Eent\u001b[31m'},
    projects: [{id: 'project-1', name: 'Database'}],
    token: 'test-token',
  })
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end('[]')
  })
  t.after(() => server.close())

  const result = await runCLI(['project', 'switch', 'Missing'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 2)
  assert.ok(result.stderr.includes('"Ard\\u202eent\\u001b[31m"'), result.stderr)
  assert.doesNotMatch(result.stderr, /[\u001b\u202e]/)
})

test('a refused switch leaves the selected project and its context alone', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-switch-refused-'))
  const before = {
    connectors: [{id: 'connector-1', name: 'Warehouse', project_id: 'gone-project'}],
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'gone-project', name: 'Deleted elsewhere'}],
    selectedConnector: {id: 'connector-1', name: 'Warehouse', project_id: 'gone-project'},
    selectedProject: {id: 'gone-project', name: 'Deleted elsewhere'},
    token: 'test-token',
  }
  await saveSession(join(configHome, 'ardent'), before)

  // The selected project is gone and exactly one other remains, which is the
  // shape that makes replaceProjectCache adopt it. A refused switch must not
  // reach that write at all.
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify([
        {
          created_at: '2026-01-01T00:00:00Z',
          id: 'project-2',
          name: 'Only survivor',
          organization_id: 'organization-1',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]),
    )
  })
  t.after(() => server.close())

  const result = await runCLI(['project', 'switch', 'Typo'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 2)
  assert.match(result.stderr, /"Typo" not found in organization "Ardent"/)
  assert.deepEqual(await loadSession(join(configHome, 'ardent')), before)
})

test('does not delete a project name absent from the authoritative list', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-delete-'))
  await saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'stale-project', name: 'Stale project'}],
    selectedProject: {id: 'stale-project', name: 'Stale project'},
    token: 'test-token',
  })

  const requests = []
  const {server, url} = await listen((request, response) => {
    requests.push({method: request.method, url: request.url})
    response.setHeader('Content-Type', 'application/json')
    response.end('[]')
  })
  t.after(() => server.close())

  const result = await runCLI(['project', 'delete', 'Stale project'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Project "Stale project" not found\./)
  assert.deepEqual(requests, [{method: 'GET', url: '/projects?organization_id=organization-1'}])
})

test('preserves project context unless deletion is confirmed', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-delete-pending-'))
  const session = {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    selectedProject: {id: 'project-1', name: 'Database'},
    token: 'test-token',
  }
  await saveSession(join(configHome, 'ardent'), session)

  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'DELETE') {
      response.statusCode = 202
      response.end('{"status":"pending"}')
      return
    }

    response.end('[{"id":"project-1","organization_id":"organization-1","name":"Database","created_at":"now","updated_at":"now"}]')
  })
  t.after(() => server.close())

  const result = await runCLI(['project', 'delete', 'Database'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /did not confirm project deletion/)
  assert.deepEqual(await loadSession(join(configHome, 'ardent')), session)
})

for (const invalid of ['duplicate id', 'duplicate name', 'empty name']) {
  test(`refuses ${invalid} in project responses without changing saved context`, async (t) => {
    const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-projects-duplicate-'))
    t.after(() => rm(configHome, {force: true, recursive: true}))
    const directory = join(configHome, 'ardent')
    const before = {
      organization: {id: 'organization-1', name: 'Ardent'},
      projects: [{id: 'project-1', name: 'Database'}],
      selectedProject: {id: 'project-1', name: 'Database'},
      connectors: [{id: 'connector-1', name: 'Primary', project_id: 'project-1'}],
      selectedConnector: {id: 'connector-1', name: 'Primary', project_id: 'project-1'},
      branches: [{id: 'branch-1', name: 'Feature', connector_id: 'connector-1'}],
      selectedBranch: {id: 'branch-1', name: 'Feature', connector_id: 'connector-1'},
      token: 'test-token',
    }
    await saveSession(directory, before)
    const saved = await readFile(join(directory, 'config.json'), 'utf8')
    const row = {
      created_at: 'now',
      id: 'project-2',
      name: 'New project',
      organization_id: 'organization-1',
      updated_at: 'now',
    }
    const other = {...row, id: 'project-3', name: 'Another project'}
    if (invalid === 'duplicate id') other.id = row.id
    if (invalid === 'duplicate name') other.name = row.name
    if (invalid === 'empty name') other.name = ''
    const {server, url} = await listen((request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify([row, other]))
    })
    t.after(() => server.close())

    const result = await runCLI(['project', 'list'], configHome, {ARDENT_API_URL: url})
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Ardent API returned an invalid projects response/)
    assert.equal(result.stdout, '')
    assert.equal(await readFile(join(directory, 'config.json'), 'utf8'), saved)
    assert.deepEqual(await loadSession(directory), before)
  })
}
test('pending durable project mutations preserve context and recovery details in text and JSON', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-project-durable-pending-'))
  const session = {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    selectedProject: {id: 'project-1', name: 'Database'},
    token: 'test-token',
  }
  await saveSession(join(configHome, 'ardent'), session)
  const mutations = []
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'GET') {
      response.end('[{"id":"project-1","organization_id":"organization-1","name":"Database","created_at":"now","updated_at":"now"}]')
      return
    }
    mutations.push(request.method)
    response.statusCode = 503
    response.setHeader('Location', '/workflows/workflow-1')
    response.end('{"error":"workflow_result_timeout","message":"Still running.","workflow_id":"workflow-1"}')
  })
  t.after(() => server.close())

  for (const command of ['create', 'delete']) {
    for (const json of [false, true]) {
      const result = await runCLI(['project', command, 'Database', ...(json ? ['--json'] : [])], configHome, {ARDENT_API_URL: url})
      assert.equal(result.status, 1)
      const failure = json ? JSON.parse(result.stdout).error : undefined
      if (json) {
        assert.equal(failure.status, 503)
        assert.equal(failure.code, 'workflow_result_timeout')
        assert.equal(failure.workflowID, 'workflow-1')
        assert.equal(failure.location, '/workflows/workflow-1')
      }
      const message = json ? failure.message : result.stderr.replace(/\s+/g, ' ')
      assert.match(message, /still running when the API stopped waiting/)
      assert.match(message, /Workflow: workflow-1/)
      assert.match(message, /GET \/workflows\/workflow-1/)
      assert.match(message, /confirm the workflow outcome before retrying/)
      assert.doesNotMatch(result.stdout, /✓|Created project|Deleted project/)
      assert.deepEqual(await loadSession(join(configHome, 'ardent')), session)
    }
  }
  assert.deepEqual(mutations, ['POST', 'POST', 'DELETE', 'DELETE'])
})
