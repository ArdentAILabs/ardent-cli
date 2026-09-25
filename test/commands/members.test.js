import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {saveSession} from '../../dist/auth/credentials.js'
import {runCLI} from '../run-cli.js'

const membership = {
  created_at: 'now',
  email: 'alice@example.com',
  full_name: 'Alice',
  organization_id: 'organization-1',
  role_display_name: 'Owner',
  scopes: ['organizations.read'],
  updated_at: 'now',
  user_id: 'user-1',
}

const invitation = {
  created_at: 'now',
  created_by: 'user-1',
  email: 'bob@example.com',
  expires_at: 'later',
  id: 'invitation-1',
  inviter_name: 'Alice',
  organization_id: 'organization-1',
  organization_name: 'Ardent',
  role_display_name: 'Member',
  scopes: ['organizations.read'],
}

const viewerScopes = [
  'organizations.read',
  'organization_memberships.read',
  'projects.read',
  'environments.read',
  'connectors.read',
]

const memberScopes = [...viewerScopes, 'projects.create', 'connectors.create', 'branches.connect']

const adminScopes = [
  'organizations.read',
  'organization_memberships.read',
  'organization_memberships.update',
  'organization_invitations.read',
  'organization_invitations.create',
  'organization_invitations.delete',
  'projects.read',
  'projects.create',
  'projects.update',
  'projects.delete',
  'environments.read',
  'environments.create',
  'connectors.read',
  'connectors.create',
  'environments.update',
  'branches.connect',
  'billing.read',
  'api_keys.read',
  'api_keys.create',
  'api_keys.revoke',
]

const ownerScopes = adminScopes.flatMap((scope) => (scope === 'billing.read' ? [scope, 'billing.manage'] : [scope]))

const listen = async (handler) => {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {server, url: `http://127.0.0.1:${address.port}`}
}

const loggedIn = async (prefix) => {
  const configHome = await mkdtemp(join(tmpdir(), prefix))
  await saveSession(join(configHome, 'ardent'), {
    organization: {id: 'organization-1', name: 'Ardent'},
    token: 'test-token',
  })
  return configHome
}

test('lists active members and pending invitations', async (t) => {
  const configHome = await loggedIn('ardent-cli-members-list-')
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(request.url.endsWith('/memberships') ? [membership] : [invitation]))
  })
  t.after(() => server.close())

  const result = await runCLI(['member', 'list'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    result.stdout,
    '┌───────────────────┬────────┬─────────┐\n' +
      '│ Email             │ Role   │ Status  │\n' +
      '├───────────────────┼────────┼─────────┤\n' +
      '│ alice@example.com │ Owner  │ Active  │\n' +
      '│ bob@example.com   │ Member │ Pending │\n' +
      '└───────────────────┴────────┴─────────┘\n',
  )

  const json = await runCLI(['member', 'list', '--json'], configHome, {ARDENT_API_URL: url})
  assert.equal(json.status, 0, json.stderr)
  assert.deepEqual(JSON.parse(json.stdout), {invitations: [invitation], memberships: [membership]})
})

test('lists active members without invitation read permission', async (t) => {
  const configHome = await loggedIn('ardent-cli-members-list-limited-')
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url.endsWith('/invitations')) {
      response.statusCode = 403
      response.end('{"error":"permission_denied","message":"You do not have permission to read organization invitations."}')
      return
    }

    response.end(JSON.stringify([membership]))
  })
  t.after(() => server.close())

  const result = await runCLI(['member', 'list'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    result.stdout,
    '┌───────────────────┬───────┬────────┐\n' +
      '│ Email             │ Role  │ Status │\n' +
      '├───────────────────┼───────┼────────┤\n' +
      '│ alice@example.com │ Owner │ Active │\n' +
      '└───────────────────┴───────┴────────┘\n' +
      'Pending invitations are not visible with this login.\n',
  )

  const json = await runCLI(['member', 'list', '--json'], configHome, {ARDENT_API_URL: url})
  assert.equal(json.status, 0, json.stderr)
  assert.deepEqual(JSON.parse(json.stdout), {invitations: null, memberships: [membership]})
})

test('invites every supported role with its standard scopes', async (t) => {
  const configHome = await loggedIn('ardent-cli-member-invite-')
  const received = []
  const {server, url} = await listen((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      received.push({
        authorization: request.headers.authorization,
        body,
        idempotencyKey: request.headers['idempotency-key'],
        method: request.method,
        url: request.url,
      })
      response.statusCode = 201
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({...invitation, email: body.email, role_display_name: body.role_display_name}))
    })
  })
  t.after(() => server.close())

  const cases = [
    {arguments: ['member', 'invite', ' MEMBER@example.com '], role: 'Member', scopes: memberScopes},
    {arguments: ['member', 'invite', 'admin@example.com', '--role', 'admin'], role: 'Admin', scopes: adminScopes},
    {
      arguments: ['member', 'invite', 'owner@example.com', '--role', 'owner'],
      role: 'Owner',
      scopes: ownerScopes,
    },
    {arguments: ['member', 'invite', 'viewer@example.com', '--role', 'viewer'], role: 'Viewer', scopes: viewerScopes},
  ]
  for (const testCase of cases) {
    const result = await runCLI(testCase.arguments, configHome, {ARDENT_API_URL: url})
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, new RegExp(` as ${testCase.role}\\n$`))
  }

  assert.equal(received.length, cases.length)
  for (const [index, request] of received.entries()) {
    assert.deepEqual(request, {
      authorization: 'Bearer test-token',
      body: {
        email: cases[index].arguments[2].trim().toLowerCase(),
        role_display_name: cases[index].role,
        scopes: cases[index].scopes,
      },
      idempotencyKey: request.idempotencyKey,
      method: 'POST',
      url: '/organizations/organization-1/invitations',
    })
    assert.match(request.idempotencyKey, /^[0-9a-f-]{36}$/)
  }
})

test('deletes active members and cancels pending invitations by email', async (t) => {
  const configHome = await loggedIn('ardent-cli-member-delete-')
  const deletions = []
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'DELETE') {
      deletions.push(request.url)
      response.statusCode = 204
      response.end()
      return
    }

    response.end(JSON.stringify(request.url.endsWith('/memberships') ? [membership] : [invitation]))
  })
  t.after(() => server.close())

  const cancel = await runCLI(['member', 'delete', 'BOB@example.com'], configHome, {ARDENT_API_URL: url})
  assert.equal(cancel.status, 0, cancel.stderr)
  assert.equal(cancel.stdout, 'Canceling invitation for bob@example.com...\n✓ Canceled invitation for bob@example.com\n')

  const remove = await runCLI(['member', 'delete', 'alice@example.com'], configHome, {ARDENT_API_URL: url})
  assert.equal(remove.status, 0, remove.stderr)
  assert.equal(remove.stdout, 'Deleting member alice@example.com...\n✓ Deleted member alice@example.com\n')
  assert.deepEqual(deletions, [
    '/organizations/organization-1/invitations/invitation-1',
    '/organizations/organization-1/memberships/user-1',
  ])
})

test('does not guess when an email is missing or has multiple matches', async (t) => {
  const configHome = await loggedIn('ardent-cli-member-ambiguous-')
  let invitationRows = [invitation]
  let membershipRows = [{...membership, email: invitation.email}]
  const {server, url} = await listen((request, response) => {
    assert.notEqual(request.method, 'DELETE')
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(request.url.endsWith('/memberships') ? membershipRows : invitationRows))
  })
  t.after(() => server.close())

  const ambiguous = await runCLI(['member', 'delete', invitation.email], configHome, {ARDENT_API_URL: url})
  assert.equal(ambiguous.status, 2)
  assert.match(ambiguous.stderr, /Multiple active members or pending invitations match/)

  invitationRows = []
  membershipRows = [membership, {...membership, user_id: 'user-2', email: membership.email.toUpperCase()}]
  const duplicateMembers = await runCLI(['member', 'delete', membership.email], configHome, {ARDENT_API_URL: url})
  assert.equal(duplicateMembers.status, 2)
  assert.match(duplicateMembers.stderr, /Multiple active members or pending invitations match/)

  invitationRows = []
  membershipRows = []
  const missing = await runCLI(['member', 'delete', 'missing@example.com'], configHome, {ARDENT_API_URL: url})
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /Member "missing@example.com" not found/)
})

test('handles empty lists, missing login, and blank email input', async (t) => {
  const configHome = await loggedIn('ardent-cli-member-input-')
  const {server, url} = await listen((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end('[]')
  })
  t.after(() => server.close())

  const empty = await runCLI(['member', 'list'], configHome, {ARDENT_API_URL: url})
  assert.equal(empty.status, 0, empty.stderr)
  assert.equal(empty.stdout, 'No members found.\n')

  const blankInvite = await runCLI(['member', 'invite', '   '], configHome, {ARDENT_API_URL: url})
  assert.equal(blankInvite.status, 2)
  assert.match(blankInvite.stderr, /Email cannot be empty/)

  const blankDelete = await runCLI(['member', 'delete', '   '], configHome, {ARDENT_API_URL: url})
  assert.equal(blankDelete.status, 2)
  assert.match(blankDelete.stderr, /Email cannot be empty/)

  const loggedOutHome = await mkdtemp(join(tmpdir(), 'ardent-cli-member-logged-out-'))
  for (const command of [['member', 'list'], ['member', 'invite', 'person@example.com'], ['member', 'delete', 'person@example.com']]) {
    const loggedOut = await runCLI(command, loggedOutHome)
    assert.equal(loggedOut.status, 2)
    assert.match(loggedOut.stderr, /Run ardent-beta login/)
  }
})

test('does not report deletion before the API confirms it', async (t) => {
  const configHome = await loggedIn('ardent-cli-member-pending-delete-')
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'DELETE') {
      response.statusCode = 202
      response.end('{"status":"pending"}')
      return
    }

    response.end(JSON.stringify(request.url.endsWith('/memberships') ? [membership] : []))
  })
  t.after(() => server.close())

  const result = await runCLI(['member', 'delete', membership.email], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /did not confirm member deletion/)
  assert.doesNotMatch(result.stdout, /✓ Deleted/)
})

test('does not delete when pending invitations cannot be checked', async (t) => {
  const configHome = await loggedIn('ardent-cli-member-unreadable-invitations-')
  const {server, url} = await listen((request, response) => {
    assert.notEqual(request.method, 'DELETE')
    response.setHeader('Content-Type', 'application/json')
    if (request.url.endsWith('/invitations')) {
      response.statusCode = 403
      response.end('{"error":"permission_denied","message":"You do not have permission to read organization invitations."}')
      return
    }

    response.end(JSON.stringify([membership]))
  })
  t.after(() => server.close())

  const result = await runCLI(['member', 'delete', membership.email], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /permission to read organization invitations/)
})

test('rejects malformed member API responses', async (t) => {
  const configHome = await loggedIn('ardent-cli-member-malformed-')
  const {server, url} = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(request.url.endsWith('/memberships') ? '[{"email":"missing fields"}]' : '[]')
  })
  t.after(() => server.close())

  const result = await runCLI(['member', 'list'], configHome, {ARDENT_API_URL: url})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /invalid memberships response/)
})
