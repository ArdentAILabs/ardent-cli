import assert from 'node:assert/strict'
import {chmod, mkdtemp, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {clearSession, loadSession, saveSession} from '../../dist/auth/credentials.js'

test('stores, overwrites, and clears a local session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-session-'))
  await saveSession(directory, {token: 'first'})
  await saveSession(directory, {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    selectedProject: {id: 'project-1', name: 'Database'},
    token: 'second',
  })

  assert.deepEqual(await loadSession(directory), {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    selectedProject: {id: 'project-1', name: 'Database'},
    token: 'second',
  })
  assert.equal((await stat(join(directory, 'config.json'))).mode & 0o777, 0o600)
  assert.equal((await stat(directory)).mode & 0o777, 0o700)

  await clearSession(directory)
  await clearSession(directory)
  assert.equal(await loadSession(directory), undefined)
})

test('rejects a corrupted local session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-corrupt-session-'))
  await writeFile(join(directory, 'config.json'), '{')

  await assert.rejects(loadSession(directory), /configuration .* is invalid/)
})

test('narrows an existing wide session directory before saving credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-wide-session-'))
  await chmod(directory, 0o755)
  assert.equal((await stat(directory)).mode & 0o777, 0o755)

  await saveSession(directory, {token: 'private-token'})

  assert.equal((await stat(directory)).mode & 0o777, 0o700)
  assert.equal((await stat(join(directory, 'config.json'))).mode & 0o777, 0o600)
  assert.deepEqual(await loadSession(directory), {token: 'private-token'})
})

test('rejects project selection outside the cached project identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-corrupt-project-context-'))
  await saveSession(directory, {
    organization: {id: 'organization-1', name: 'Ardent'},
    projects: [{id: 'project-1', name: 'Database'}],
    selectedProject: {id: 'project-2', name: 'Missing'},
    token: 'test-token',
  })

  await assert.rejects(loadSession(directory), /configuration .* is invalid/)
})
