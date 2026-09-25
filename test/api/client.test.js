import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'

import {APIError, API_URL, request, requestDurableMutation} from '../../dist/api/client.js'

test('targets the deployed control-plane origin', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url.toString(), `${API_URL}/organizations`)
    return new Response('[]')
  })

  await request('token', '/organizations')
})

test('accepts a development control-plane origin from the environment', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', "import {API_URL} from './dist/api/client.js'; process.stdout.write(API_URL)"],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {...process.env, ARDENT_API_URL: 'http://localhost:8080'},
    },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'http://localhost:8080')
})

test('preserves structured API errors', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('{"error":"permission_denied","message":"No access."}', {
        headers: {'Content-Type': 'application/json'},
        status: 403,
      }),
  )

  await assert.rejects(request('token', '/organizations'), (error) => {
    assert.ok(error instanceof APIError)
    assert.equal(error.status, 403)
    assert.equal(error.code, 'permission_denied')
    assert.equal(error.message, 'No access.')
    return true
  })
})

test('rejects invalid success JSON', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('not-json'))

  await assert.rejects(request('token', '/organizations'), /invalid JSON response/)
})

test('falls back safely when API error fields are not strings', async (t) => {
  for (const body of ['null', '42', '[]', '{"message":17,"error":{"code":"denied"},"workflow_id":false}']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, {status: 503}))
    await assert.rejects(request('token', '/projects'), (error) => {
      assert.ok(error instanceof APIError)
      assert.equal(error.status, 503)
      assert.equal(error.message, 'Ardent API request failed with HTTP 503.')
      assert.equal(error.code, undefined)
      assert.equal(error.workflowID, undefined)
      return true
    })
  }
})

test('accepts an empty no-content response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 204}))

  assert.equal(await request('token', '/projects/project-1', {method: 'DELETE'}), undefined)
})

test('gives every synchronous mutation ninety seconds and retains pending recovery details without replay', async (t) => {
  const {createProject, deleteProject} = await import('../../dist/projects/client.js')
  const {inviteMember, deleteMembership, deleteInvitation} = await import('../../dist/members/client.js')
  const budgets = []
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    budgets.push(milliseconds)
    return new AbortController().signal
  })
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: 'workflow_result_timeout', message: 'Still running.', workflow_id: 'workflow-1',
  }), {status: 503, headers: {Location: '/workflows/workflow-1'}}))

  for (const mutate of [
    () => createProject('token', 'org', 'name'),
    () => deleteProject('token', 'org', 'project'),
    () => inviteMember('token', 'org', 'member@example.com', 'Member'),
    () => deleteMembership('token', 'org', 'user'),
    () => deleteInvitation('token', 'org', 'invite'),
  ]) {
    await assert.rejects(mutate(), (error) => {
      assert.ok(error instanceof APIError)
      assert.equal(error.status, 503)
      assert.equal(error.code, 'workflow_result_timeout')
      assert.equal(error.workflowID, 'workflow-1')
      assert.equal(error.location, '/workflows/workflow-1')
      assert.match(error.message, /still running when the API stopped waiting/)
      assert.match(error.message, /authenticated GET \/workflows\/workflow-1/)
      assert.match(error.message, /confirm the workflow outcome before retrying/)
      return true
    })
  }
  assert.equal(fetch.mock.callCount(), 5)
  assert.deepEqual(budgets, Array(5).fill(90_000))
  t.mock.method(globalThis, 'fetch', async () => new Response('[]'))
  await request('token', '/projects')
  assert.equal(budgets.at(-1), 10_000)
})

test('reports an unknown outcome when a mutation deadline expires before headers or during the body', async (t) => {
  for (const bodyStarted of [false, true]) {
    const controller = new AbortController()
    t.mock.method(AbortSignal, 'timeout', () => controller.signal)
    const fetch = t.mock.method(globalThis, 'fetch', async (_url, {signal}) => {
      if (bodyStarted) {
        return new Response(new ReadableStream({start(stream) {
          signal.addEventListener('abort', () => stream.error(signal.reason), {once: true})
        }}))
      }
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true})
      })
    })
    const result = requestDurableMutation('token', '/projects', {method: 'POST'}, 'ardent-beta project list')
    controller.abort(new DOMException('Request timed out', 'TimeoutError'))
    await assert.rejects(result, /completion is unknown.*ardent-beta project list.*confirm the outcome before retrying/)
    assert.equal(fetch.mock.callCount(), 1)
  }
})

test('honors an explicit mutation cancellation signal without installing another deadline', async (t) => {
  const controller = new AbortController()
  const timeout = t.mock.method(AbortSignal, 'timeout', () => { throw new Error('Unexpected replacement deadline') })
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, {signal}) => {
    assert.equal(signal, controller.signal)
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {once: true})
    })
  })
  const result = requestDurableMutation('token', '/projects', {method: 'POST', signal: controller.signal}, 'ardent-beta project list')
  controller.abort()
  await assert.rejects(result, /completion is unknown/)
  assert.equal(timeout.mock.callCount(), 0)
  assert.equal(fetch.mock.callCount(), 1)
})

test('retains ordinary mutation refusals and tolerates missing workflow recovery details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"error":"permission_denied","message":"No access."}', {status: 403}))
  await assert.rejects(requestDurableMutation('token', '/projects', {method: 'POST'}, 'ardent-beta project list'), (error) => {
    assert.equal(error.message, 'No access.')
    assert.equal(error.status, 403)
    return true
  })
  t.mock.method(globalThis, 'fetch', async () => new Response('{"error":"workflow_result_timeout","workflow_id":123}', {status: 503}))
  await assert.rejects(requestDurableMutation('token', '/projects', {method: 'POST'}, 'ardent-beta project list'), (error) => {
    assert.equal(error.workflowID, undefined)
    assert.equal(error.location, undefined)
    assert.match(error.message, /ardent-beta project list/)
    assert.doesNotMatch(error.message, /undefined|123/)
    return true
  })
})
