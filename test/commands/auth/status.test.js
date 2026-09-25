import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {saveSession} from '../../../dist/auth/credentials.js'
import {runCLI} from '../../run-cli.js'

test('reports whether a local session exists', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-status-'))
  const configDirectory = join(configHome, 'ardent')

  const loggedOut = await runCLI(['status', '--json'], configHome)
  assert.equal(loggedOut.status, 0, loggedOut.stderr)
  assert.deepEqual(JSON.parse(loggedOut.stdout), {authenticated: false})

  await saveSession(configDirectory, {token: 'test-token'})
  const loggedIn = await runCLI(['status', '--json'], configHome)
  assert.equal(loggedIn.status, 0, loggedIn.stderr)
  assert.deepEqual(JSON.parse(loggedIn.stdout), {authenticated: true})
})
