import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {loadSession, saveSession} from '../../../dist/auth/credentials.js'
import {runCLI} from '../../run-cli.js'

test('removes the local session', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-logout-'))
  const configDirectory = join(configHome, 'ardent')
  await saveSession(configDirectory, {token: 'test-token'})

  const result = await runCLI(['logout'], configHome)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Logged out/)
  assert.equal(await loadSession(configDirectory), undefined)
})
