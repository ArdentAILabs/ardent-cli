import assert from 'node:assert/strict'
import test from 'node:test'

import {waitForConnectorRegistration} from '../../dist/connectors/client.js'

test('reports connector status changes while polling to registration', async (t) => {
  let polls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    polls++
    return Response.json({
      connector_id: 'connector-1',
      status: polls === 1 ? 'registering' : 'registered',
    })
  })

  const statuses = []
  const result = await waitForConnectorRegistration('token', 'connector-1', (status) => statuses.push(status))

  assert.equal(result.status, 'registered')
  assert.deepEqual(statuses, ['registering', 'registered'])
})

test('surfaces a terminal connector registration failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({connector_id: 'connector-1', failure: 'registration failed', status: 'failed'}),
  )

  await assert.rejects(waitForConnectorRegistration('token', 'connector-1'), /registration failed/)
})

for (const status of ['deleting', 'deleted']) {
  test(`reports connector ${status} without reporting registration success`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({connector_id: 'connector-1', status}))
    const statuses = []
    await assert.rejects(
      waitForConnectorRegistration('token', 'connector-1', (value) => statuses.push(value)),
      new RegExp(`Connector connector-1 is ${status}\\. Run ardent-beta connector list`),
    )
    assert.deepEqual(statuses, [status])
  })
}

test('reports a failed deletion with its failure text through terminalText', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({connector_id: 'connector-1', status: 'deleting', failure: 'connector_deletion_failed\u001b[31m'}))
  await assert.rejects(
    waitForConnectorRegistration('token', 'connector-1'),
    (error) => error.message === 'Connector connector-1 is deleting: connector_deletion_failed\\u001b[31m. Run ardent-beta connector list to check its state.',
  )
})

// Answers halted once and registered after, so a poller that treated halted as still in progress
// would resolve and fail the test within one polling interval instead of hanging to the deadline.
function haltedThenRegistered(t, halted) {
  const calls = {polls: 0}
  t.mock.method(globalThis, 'fetch', async () => {
    calls.polls++
    return Response.json(calls.polls === 1 ? {connector_id: 'connector-1', status: 'halted', ...halted} : {connector_id: 'connector-1', status: 'registered'})
  })
  return calls
}

test('reports a halted connector with its halt reason without reporting registration success', async (t) => {
  const calls = haltedThenRegistered(t, {failure: 'normalizer:edge_behind_frontier'})
  const statuses = []
  await assert.rejects(
    waitForConnectorRegistration('token', 'connector-1', (value) => statuses.push(value)),
    /^Error: Connector connector-1 is halted: normalizer:edge_behind_frontier\. Run ardent-beta connector list/,
  )
  assert.deepEqual(statuses, ['halted'])
  assert.equal(calls.polls, 1)
})

test('reports a halted connector that carries no halt reason', async (t) => {
  haltedThenRegistered(t, {})
  await assert.rejects(
    waitForConnectorRegistration('token', 'connector-1'),
    /^Error: Connector connector-1 is halted\. Run ardent-beta connector list/,
  )
})

test('rejects malformed registration statuses and another connector identity', async (t) => {
  for (const response of [null, {}, {connector_id: 'other', status: 'registered'}, {connector_id: 'connector-1', status: 'ready'}, {connector_id: 'connector-1', status: 'failed', failure: 7}]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(response))
    await assert.rejects(waitForConnectorRegistration('token', 'connector-1'), /invalid connector registration status/)
  }
})

test('aborts an in-flight registration request at the overall deadline', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']})
  let signal
  t.mock.method(globalThis, 'fetch', (url, init) => {
    signal = init.signal
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}))
  })
  const wait = waitForConnectorRegistration('token', 'connector-1')
  const rejected = assert.rejects(wait, /Timed out waiting for connector connector-1 registration\. Its outcome is unknown\. Run ardent-beta connector list/)
  t.mock.timers.tick(30 * 60 * 1000 - 1)
  assert.equal(signal.aborted, false)
  t.mock.timers.tick(1)
  assert.equal(signal.aborted, true)
  await rejected
})

test('the registration deadline interrupts the polling interval', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']})
  let respond
  let polls = 0
  t.mock.method(globalThis, 'fetch', () => {
    polls++
    return new Promise((resolve) => { respond = resolve })
  })
  const wait = waitForConnectorRegistration('token', 'connector-1')
  const rejected = assert.rejects(wait, /Its outcome is unknown\. Run ardent-beta connector list/)
  t.mock.timers.tick(30 * 60 * 1000 - 1)
  respond(Response.json({connector_id: 'connector-1', status: 'registering'}))
  await new Promise(setImmediate)
  t.mock.timers.tick(1)
  await rejected
  assert.equal(polls, 1)
})

test('does not accept a registration response arriving after the deadline', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']})
  let respond
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { respond = resolve }))
  const statuses = []
  const wait = waitForConnectorRegistration('token', 'connector-1', (status) => statuses.push(status))
  const rejected = assert.rejects(wait, /Its outcome is unknown/)
  t.mock.timers.tick(30 * 60 * 1000)
  respond(Response.json({connector_id: 'connector-1', status: 'registered'}))
  await rejected
  assert.deepEqual(statuses, [])
})

test('retains the request timeout and distinguishes it from the overall deadline', async (t) => {
  const requestTimeout = new AbortController()
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10_000)
    return requestTimeout.signal
  })
  t.mock.method(globalThis, 'fetch', (url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true})
  }))
  const wait = waitForConnectorRegistration('token', 'connector-1')
  const rejected = assert.rejects(wait, /Could not reach the Ardent API: read deadline/)
  requestTimeout.abort(new Error('read deadline'))
  await rejected
})

test('clears the overall deadline after a terminal status', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']})
  let signal
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    signal = init.signal
    return Response.json({connector_id: 'connector-1', status: 'registered'})
  })
  await waitForConnectorRegistration('token', 'connector-1')
  t.mock.timers.tick(30 * 60 * 1000)
  assert.equal(signal.aborted, false)
})


test('escapes remote failure text in registration errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    connector_id: 'connector-1', status: 'failed', failure: 'bad\u001b[2J\n\u202Etext',
  }))
  await assert.rejects(waitForConnectorRegistration('token', 'connector-1'), (error) => {
    assert.equal(error.message, 'bad\\u001b[2J\\u000a\\u202etext')
    return true
  })
})

test('escapes remote halt reason text in halted errors', async (t) => {
  haltedThenRegistered(t, {failure: 'bad\u001b[2J\n\u202Etext'})
  await assert.rejects(waitForConnectorRegistration('token', 'connector-1'), (error) => {
    assert.equal(
      error.message,
      'Connector connector-1 is halted: bad\\u001b[2J\\u000a\\u202etext. Run ardent-beta connector list to check its state.',
    )
    return true
  })
})
