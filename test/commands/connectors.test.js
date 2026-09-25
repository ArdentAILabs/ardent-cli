import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
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

const saveProjectSession = (configHome) =>
  saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    selectedProject: {id: 'project-1', name: 'Database'},
    token: 'test-token',
  })

test('lists connectors in the selected project', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-connectors-list-'))
  await saveProjectSession(configHome)

  const requests = []
  const {server, url} = await listen((request, response) => {
    requests.push({authorization: request.headers.authorization, method: request.method, url: request.url})
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify([
        {
          created_at: '2026-09-07T00:00:00Z',
          environment_id: 'environment-1',
          id: 'connector-1',
          name: 'Primary',
          project_id: 'project-1',
          source: {database: 'postgres', host: 'database.example', port: 5432},
          status: 'registered',
          updated_at: '2026-09-07T00:00:00Z',
        },
        {
          created_at: '2026-09-07T00:00:00Z',
          environment_id: 'environment-1',
          id: 'connector-2',
          name: 'Analytics database',
          project_id: 'project-1',
          source: {database: 'analytics', host: 'analytics.example', port: 5432},
          status: 'ready',
          updated_at: '2026-09-07T00:00:00Z',
        },
      ]),
    )
  })
  t.after(() => server.close())

  const result = await runCLI(['connector', 'list'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    result.stdout,
    '┌────────────────────┬────────────┬──────────────────────────────────┐\n' +
      '│ Title              │ Status     │ Source                           │\n' +
      '├────────────────────┼────────────┼──────────────────────────────────┤\n' +
      '│ Primary            │ registered │ database.example:5432/postgres   │\n' +
      '│ Analytics database │ ready      │ analytics.example:5432/analytics │\n' +
      '└────────────────────┴────────────┴──────────────────────────────────┘\n',
  )
  assert.deepEqual(requests, [
    {
      authorization: 'Bearer test-token',
      method: 'GET',
      url: '/connectors?organization_id=organization-1&project_id=project-1',
    },
  ])
})

test('registers a connector in Ardent Cloud without polling outside an interactive terminal', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-connectors-create-'))
  await saveProjectSession(configHome)

  const requests = []
  const {server, url} = await listen((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
        method: request.method,
        url: request.url,
      })
      response.setHeader('Content-Type', 'application/json')
      if (request.method === 'POST') {
        response.statusCode = 202
        response.end('{"connector_id":"connector-1"}')
        return
      }

      response.end(JSON.stringify({connector_id: 'connector-1', status: 'registered'}))
    })
  })
  t.after(() => server.close())

  const result = await runCLI(
    ['connector', 'create', 'postgresql', 'postgresql://capture:secret@database.example:5433/app?sslmode=require'],
    configHome,
    {ARDENT_API_URL: url},
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stdout,
    /^Registering connector Database-[0-9a-f]{8} for project Database\.\.\.\nConnector registration started \(connector-1\)\.\n$/,
  )

  const body = JSON.parse(requests[0].body)
  assert.match(body.name, /^Database-[0-9a-f]{8}$/)
  assert.deepEqual(
    {...body, name: '<name>', request_id: '<uuid>'},
    {
      name: '<name>',
      organization_id: 'organization-1',
      project_id: 'project-1',
      request_id: '<uuid>',
      url: 'postgresql://capture:secret@database.example:5433/app?sslmode=require',
    },
  )
  assert.match(body.request_id, /^[0-9a-f-]{36}$/)
  assert.doesNotMatch(result.stdout + result.stderr, /secret/)
  assert.deepEqual(
    requests.map(({authorization, method, url: requestURL}) => ({authorization, method, url: requestURL})),
    [
      {authorization: 'Bearer test-token', method: 'POST', url: '/connectors'},
    ],
  )
})

test('reads a paired TLS client identity and sends its contents without printing them', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-connectors-mtls-'))
  await saveProjectSession(configHome)
  const certificate = join(configHome, 'client.crt')
  const key = join(configHome, 'client.key')
  await Promise.all([writeFile(certificate, 'certificate-secret'), writeFile(key, 'private-key-secret')])

  let body
  const {server, url} = await listen((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      body = JSON.parse(Buffer.concat(chunks).toString())
      response.writeHead(202, {'Content-Type': 'application/json'})
      response.end('{"connector_id":"connector-1"}')
    })
  })
  t.after(() => server.close())

  const result = await runCLI(
    ['connector', 'create', 'postgresql', 'postgresql://capture:secret@database.example/app?sslmode=require', '--tls-client-cert', certificate, '--tls-client-key', key],
    configHome,
    {ARDENT_API_URL: url},
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(body.tls_client_certificate, 'certificate-secret')
  assert.equal(body.tls_client_key, 'private-key-secret')
  assert.doesNotMatch(result.stdout + result.stderr, /certificate-secret|private-key-secret/)

  const refused = await runCLI(
    ['connector', 'create', 'postgresql', 'postgresql://capture:secret@database.example/app?sslmode=require', '--tls-client-cert', certificate],
    configHome,
    {ARDENT_API_URL: url},
  )
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /must be supplied together/)
})

test('accepts an explicit environment ID without waiting outside an interactive terminal', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-connectors-failure-'))
  await saveProjectSession(configHome)

  let postedBody
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      if (request.method === 'POST') {
        postedBody = JSON.parse(Buffer.concat(chunks).toString())
        response.statusCode = 202
        response.end('{"connector_id":"connector-1"}')
        return
      }

      response.end('{"connector_id":"connector-1","status":"failed","failure":"registration failed"}')
    })
  })
  t.after(() => server.close())

  const result = await runCLI(
    [
      'connector',
      'create',
      'postgresql',
      'postgresql://capture:secret@database.example/app',
      '--name',
      'Primary',
      '--environment',
      'environment-1',
    ],
    configHome,
    {ARDENT_API_URL: url},
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Connector registration started \(connector-1\)\./)
  assert.equal(postedBody.environment_id, 'environment-1')
})

for (const invalid of ['duplicate id', 'duplicate name', 'empty name']) {
  test(`refuses ${invalid} in connector responses without changing saved context`, async (t) => {
    const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-connectors-duplicate-'))
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
      environment_id: 'environment-1',
      id: 'connector-2',
      name: 'New connector',
      project_id: 'project-1',
      source: {database: 'postgres', host: 'database.example', port: 5432},
      status: 'registered',
      updated_at: 'now',
    }
    const other = {...row, id: 'connector-3', name: 'Another connector'}
    if (invalid === 'duplicate id') other.id = row.id
    if (invalid === 'duplicate name') other.name = row.name
    if (invalid === 'empty name') other.name = ''
    const {server, url} = await listen((request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify([row, other]))
    })
    t.after(() => server.close())

    const result = await runCLI(['connector', 'list'], configHome, {ARDENT_API_URL: url})
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Ardent API returned an invalid connectors response/)
    assert.equal(result.stdout, '')
    assert.equal(await readFile(join(directory, 'config.json'), 'utf8'), saved)
    assert.deepEqual(await loadSession(directory), before)
  })
}
