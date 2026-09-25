import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {loadSession} from '../../dist/auth/credentials.js'
import {loginWithToken} from '../../dist/auth/token.js'

test('validates and saves a token', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-auth-'))
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.toString(), 'https://production.tryardent.com/organizations')
    assert.equal(init.headers.Authorization, 'Bearer test-token')
    return new Response('[{"id":"org-1","name":"Ardent"}]')
  })

  const organizations = await loginWithToken(directory, ' test-token ')

  assert.deepEqual(organizations, [{id: 'org-1', name: 'Ardent'}])
  assert.deepEqual(await loadSession(directory), {
    organization: {id: 'org-1', name: 'Ardent'},
    token: 'test-token',
  })
})

test('does not store a rejected token', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-rejected-auth-'))
  t.mock.method(globalThis, 'fetch', async () => new Response('unauthorized', {status: 401}))

  await assert.rejects(loginWithToken(directory, 'rejected-token'), /HTTP 401/)
  assert.equal(await loadSession(directory), undefined)
})

test('does not store malformed successful responses', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-malformed-auth-'))
  t.mock.method(globalThis, 'fetch', async () => new Response('[null]'))

  await assert.rejects(loginWithToken(directory, 'test-token'), /invalid organization response/)
  assert.equal(await loadSession(directory), undefined)
})

test('rejects an empty token', async () => {
  await assert.rejects(loginWithToken('unused', '  '), /token cannot be empty/)
})

test('requires the API token to identify one organization', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-organization-'))
  t.mock.method(globalThis, 'fetch', async () => new Response('[]'))

  await assert.rejects(loginWithToken(directory, 'test-token'), /exactly one organization/)
  assert.equal(await loadSession(directory), undefined)
})
