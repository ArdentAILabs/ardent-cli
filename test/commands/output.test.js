import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {saveSession} from '../../dist/auth/credentials.js'
import {runCLI} from '../run-cli.js'

test('escapes remote login and table text while preserving JSON values', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-output-'))
  t.after(() => rm(configHome, {recursive: true, force: true}))
  const organization = {id: 'org\u009b1m', name: 'Org\u001b[2J'}
  const project = {
    id: 'project-1', organization_id: organization.id, name: 'A\u001b[2JB\u202eC',
    created_at: 'now', updated_at: 'now',
  }
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(request.url === '/organizations' ? [organization] : [project]))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const environment = {ARDENT_API_URL: `http://127.0.0.1:${server.address().port}`}

  const login = await runCLI(['login', '--token', 'test-token'], configHome, environment)
  assert.equal(login.status, 0, login.stderr)
  assert.match(login.stdout, /Org\\u001b\[2J/)
  assert.match(login.stdout, /org\\u009b1m/)
  assert.doesNotMatch(login.stdout, /[\u001b\u009b]/)
  const loginJSON = await runCLI(['login', '--token', 'test-token', '--json'], configHome, environment)
  assert.equal(loginJSON.status, 0, loginJSON.stderr)
  assert.deepEqual(JSON.parse(loginJSON.stdout).organizations, [organization])

  const list = await runCLI(['project', 'list'], configHome, environment)
  assert.equal(list.status, 0, list.stderr)
  assert.match(list.stdout, /A\\u001b\[2JB\\u202eC/)
  assert.doesNotMatch(list.stdout, /[\u001b\u202e]/)
  const listJSON = await runCLI(['project', 'list', '--json'], configHome, environment)
  assert.equal(listJSON.status, 0, listJSON.stderr)
  assert.deepEqual(JSON.parse(listJSON.stdout).projects, [project])
})

test('escapes API error messages and codes in human output while preserving JSON errors', async (t) => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-error-output-'))
  t.after(() => rm(configHome, {recursive: true, force: true}))
  await saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ardent'}, token: 'test-token',
  })
  const message = 'No\u001b[2J\u202e'
  const code = 'bad\u009b1m'
  const server = createServer((_request, response) => {
    response.writeHead(403, {'Content-Type': 'application/json'})
    response.end(JSON.stringify({error: code, message}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const environment = {ARDENT_API_URL: `http://127.0.0.1:${server.address().port}`}

  const human = await runCLI(['project', 'list'], configHome, environment)
  assert.notEqual(human.status, 0)
  assert.match(human.stderr, /No\\u001b\[2J\\u202e/)
  assert.match(human.stderr, /bad\\u009b1m/)
  assert.doesNotMatch(human.stderr, /[\u001b\u009b\u202e]/)

  const json = await runCLI(['project', 'list', '--json'], configHome, environment)
  assert.notEqual(json.status, 0)
  const result = JSON.parse(json.stdout).error
  assert.equal(result.message, message)
  assert.equal(result.code, code)
})
