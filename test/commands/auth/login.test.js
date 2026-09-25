import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import test from 'node:test'

import {runCLI} from '../../run-cli.js'
import {loadSession} from '../../../dist/auth/credentials.js'

test('keeps credentials out of token login, status, and logout output', async (t) => {
  const token = 'sk-ard_output-secret-never-print'
  const requests = []
  const server = createServer((request, response) => {
    requests.push({path: request.url, authorization: request.headers.authorization})
    response.setHeader('Content-Type', 'application/json')
    response.end('[{"id":"organization-1","name":"Ardent"}]')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`

  for (const json of [false, true]) {
    for (const source of ['flag', 'environment']) {
      const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-auth-output-'))
      const environment = {ARDENT_API_URL: origin, ARDENT_TOKEN: source === 'environment' ? token : undefined}
      const suffix = json ? ['--json'] : []
      const loginArgs = source === 'flag' ? ['login', '--token', token] : ['login']
      const loggedIn = await runCLI([...loginArgs, ...suffix], configHome, environment)
      assert.equal(loggedIn.status, 0, loggedIn.stderr)
      assert.equal((await loadSession(join(configHome, 'ardent'))).token, token)

      const status = await runCLI(['status', ...suffix], configHome, environment)
      const loggedOut = await runCLI(['logout', ...suffix], configHome, environment)
      for (const result of [loggedIn, status, loggedOut]) {
        assert.equal(result.status, 0, result.stderr)
        assert.ok(!result.stdout.includes(token), 'stdout must not contain the credential')
        assert.ok(!result.stderr.includes(token), 'stderr must not contain the credential')
      }
      if (json) {
        assert.deepEqual(JSON.parse(loggedIn.stdout), {authenticated: true, organizations: [{id: 'organization-1', name: 'Ardent'}]})
        assert.deepEqual(JSON.parse(status.stdout), {authenticated: true})
        assert.deepEqual(JSON.parse(loggedOut.stdout), {authenticated: false})
      } else {
        assert.match(loggedIn.stdout, /Logged in/)
        assert.match(status.stdout, /Logged in/)
        assert.match(loggedOut.stdout, /Logged out/)
      }
      assert.equal(await loadSession(join(configHome, 'ardent')), undefined)
    }
  }
  assert.deepEqual(requests, Array.from({length: 4}, () => ({path: '/organizations', authorization: `Bearer ${token}`})))
})

test('refuses an empty token instead of starting browser login', async (t) => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push(request.url)
    response.statusCode = 500
    response.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  // No browser opener on PATH, and a deadline, so a regression into browser
  // login fails this test instead of opening a browser or hanging it.
  const environment = {ARDENT_API_URL: `http://127.0.0.1:${server.address().port}`, PATH: dirname(process.execPath)}

  for (const [arguments_, token, refusal] of [
    [['login', '--token', ''], undefined, /Ardent API token cannot be empty/],
    [['login', '--token', '  '], undefined, /Ardent API token cannot be empty/],
    [['login'], '', /ARDENT_TOKEN is set but empty/],
    [['login'], '  ', /Ardent API token cannot be empty/],
  ]) {
    const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-empty-token-'))
    const result = await runCLI(arguments_, configHome, {...environment, ARDENT_TOKEN: token}, {timeoutMs: 15_000})
    const label = `${arguments_.join(' ')} with ARDENT_TOKEN=${JSON.stringify(token)}`
    assert.ok(Number.isInteger(result.status) && result.status !== 0, `${label}: exit ${result.status}`)
    assert.match(result.stderr, refusal, label)
    assert.doesNotMatch(result.stdout, /browser|Open this URL/, label)
    assert.equal(await loadSession(join(configHome, 'ardent')), undefined, label)
  }
  assert.deepEqual(requests, [])
})

test('exposes token login without an API target flag', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-login-help-'))
  const help = await runCLI(['login', '--help'], configHome)

  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /--token/)
  assert.match(help.stdout, /ARDENT_TOKEN/)
  assert.doesNotMatch(help.stdout, /api-url/)
})

test('does not require a token flag', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-login-interactive-'))
  const help = await runCLI(['login', '--help'], configHome)

  assert.equal(help.status, 0, help.stderr)
  assert.doesNotMatch(help.stdout, /required.*--token/i)
})
