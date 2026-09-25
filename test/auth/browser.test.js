import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {get} from 'node:http'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {loginWithBrowser} from '../../dist/auth/browser.js'
import {loadSession} from '../../dist/auth/credentials.js'

function requestCallback(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.once('end', () => resolve({status: response.statusCode, body}))
      response.once('error', reject)
    })
    request.once('error', reject)
    request.setTimeout(2000, () => request.destroy(new Error('Callback did not respond')))
  })
}

test('rejects a mismatched callback state without exchanging or saving a credential', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-browser-state-'))
  const requests = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    requests.push(input.toString())
    return input.toString().endsWith('/auth/cli/exchange')
      ? new Response('{"key":"sk-ard_state_test"}', {status: 201})
      : new Response('[{"id":"organization-1","name":"Ardent"}]')
  })
  let refused
  let accepted
  let requestsAfterRefusal
  let sessionAfterRefusal
  await loginWithBrowser(directory, {
    open: async (authorization) => {
      const authorizationURL = new URL(authorization)
      const callback = new URL(authorizationURL.searchParams.get('callback_uri'))
      callback.searchParams.set('code', 'signed-code')
      callback.searchParams.set('state', 'wrong-state')
      refused = await requestCallback(callback)
      requestsAfterRefusal = [...requests]
      sessionAfterRefusal = await loadSession(directory)
      callback.searchParams.set('state', authorizationURL.searchParams.get('state'))
      accepted = await requestCallback(callback)
    },
    timeoutMs: 3000,
  })

  assert.equal(refused.status, 400)
  assert.deepEqual(requestsAfterRefusal, [])
  assert.equal(sessionAfterRefusal, undefined)
  assert.equal(accepted.status, 200)
  assert.equal(requests.length, 2)
  assert.equal((await loadSession(directory)).token, 'sk-ard_state_test')
  assert.ok(!refused.body.includes('sk-ard_state_test'))
  assert.ok(!accepted.body.includes('sk-ard_state_test'))
})

test('rejects a concurrent callback replay while the first exchange is pending', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-browser-replay-'))
  const exchangeStarted = Promise.withResolvers()
  const exchangeReleased = Promise.withResolvers()
  let exchangeRequests = 0
  let organizationRequests = 0
  t.mock.method(globalThis, 'fetch', async (input) => {
    if (input.toString().endsWith('/auth/cli/exchange')) {
      exchangeRequests += 1
      if (exchangeRequests === 1) {
        exchangeStarted.resolve()
        await exchangeReleased.promise
      }
      return new Response('{"key":"sk-ard_replay_test"}', {status: 201})
    }
    organizationRequests += 1
    return new Response('[{"id":"organization-1","name":"Ardent"}]')
  })
  let refused
  let accepted
  let sessionBeforeRelease
  await loginWithBrowser(directory, {
    open: async (authorization) => {
      const authorizationURL = new URL(authorization)
      const callback = new URL(authorizationURL.searchParams.get('callback_uri'))
      callback.searchParams.set('state', authorizationURL.searchParams.get('state'))
      callback.searchParams.set('code', 'signed-code')
      const first = requestCallback(callback)
      try {
        await Promise.race([
          exchangeStarted.promise,
          first.then(() => { throw new Error('Callback completed before exchange started') }),
        ])
        refused = await requestCallback(callback)
        sessionBeforeRelease = await loadSession(directory)
      } finally {
        exchangeReleased.resolve()
        accepted = await first
      }
    },
    timeoutMs: 3000,
  })

  assert.equal(refused.status, 400)
  assert.equal(sessionBeforeRelease, undefined)
  assert.equal(accepted.status, 200)
  assert.equal(exchangeRequests, 1)
  assert.equal(organizationRequests, 1)
  assert.equal((await loadSession(directory)).token, 'sk-ard_replay_test')
  assert.ok(!refused.body.includes('sk-ard_replay_test'))
  assert.ok(!accepted.body.includes('sk-ard_replay_test'))
})

test('exchanges a PKCE-bound loopback callback and saves the CLI credential', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-browser-auth-'))
  let expectedChallenge = ''
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = input.toString()
    if (url.endsWith('/auth/cli/exchange')) {
      const body = JSON.parse(init.body)
      assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), expectedChallenge)
      assert.equal(body.code, 'signed-code')
      return new Response('{"key":"sk-ard_created"}', {status: 201})
    }
    assert.equal(url, 'https://production.tryardent.com/organizations')
    assert.equal(init.headers.Authorization, 'Bearer sk-ard_created')
    return new Response('[{"id":"organization-1","name":"Ardent"}]')
  })

  const organizations = await loginWithBrowser(directory, {
    open: async (authorization) => {
      const authorizationURL = new URL(authorization)
      expectedChallenge = authorizationURL.searchParams.get('code_challenge')
      const callback = new URL(authorizationURL.searchParams.get('callback_uri'))
      callback.searchParams.set('state', authorizationURL.searchParams.get('state'))
      callback.searchParams.set('code', 'signed-code')
      await new Promise((resolve, reject) => get(callback, resolve).once('error', reject))
    },
  })

  assert.deepEqual(organizations, [{id: 'organization-1', name: 'Ardent'}])
  assert.deepEqual(await loadSession(directory), {
    organization: {id: 'organization-1', name: 'Ardent'},
    token: 'sk-ard_created',
  })
})

test('stops an active exchange when browser login times out', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-browser-auth-timeout-'))
  let exchangeRequests = 0
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = input.toString()
    if (url.endsWith('/auth/cli/exchange')) {
      exchangeRequests += 1
      if (exchangeRequests === 1) {
        return new Response('{"error":"workflow_result_timeout"}', {status: 503})
      }

      return new Response('{"key":"sk-ard_created_after_timeout"}', {status: 201})
    }

    return new Response('[{"id":"organization-1","name":"Ardent"}]')
  })

  const startedAt = Date.now()
  await assert.rejects(
    loginWithBrowser(directory, {
      open: async (authorization) => {
        const authorizationURL = new URL(authorization)
        const callback = new URL(authorizationURL.searchParams.get('callback_uri'))
        callback.searchParams.set('state', authorizationURL.searchParams.get('state'))
        callback.searchParams.set('code', 'signed-code')
        get(callback, (response) => response.resume()).once('error', () => {})
      },
      timeoutMs: 25,
    }),
    /login timed out/,
  )

  assert.ok(Date.now() - startedAt < 1000, 'login should not wait for another exchange attempt')
  assert.equal(exchangeRequests, 1)
  assert.equal(await loadSession(directory), undefined)
})
