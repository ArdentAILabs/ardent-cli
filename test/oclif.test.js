import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {ArdentCommand} from '../dist/command.js'
import {saveSession} from '../dist/auth/credentials.js'
import {runCLI} from './run-cli.js'

const {name, version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('enables Oclif JSON output for commands', () => {
  assert.equal(ArdentCommand.enableJsonFlag, true)
})

test('shows only the two login paths to a logged-out user', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-root-'))
  const result = await runCLI([], configHome)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Get started:/)
  assert.match(result.stdout, /ardent-beta login\s+Standard CLI login/)
  assert.match(result.stdout, /ardent-beta login --token <token>\s+Non-interactive login \(CI and automation\)/)
  assert.match(result.stdout, /For all commands:\n\n  ardent-beta --help/)
  assert.doesNotMatch(result.stdout, /VERSION|USAGE|COMMANDS|autocomplete/)
})

test('groups commands behind the standard help flag', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-help-'))
  const result = await runCLI(['--help'], configHome)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /USAGE/)
  assert.match(result.stdout, /AUTHENTICATION/)
  assert.match(result.stdout, /ardent-beta login\s+Log in to Ardent/)
  assert.match(result.stdout, /ardent-beta logout\s+Log out of Ardent on this device/)
  assert.match(result.stdout, /ardent-beta status\s+Show your Ardent login status/)
  assert.match(result.stdout, /PROJECTS/)
  assert.match(result.stdout, /ardent-beta project create\s+Create a project/)
  assert.match(result.stdout, /ardent-beta project list\s+List projects/)
  assert.match(result.stdout, new RegExp(`Ardent CLI v${version.replaceAll('.', '\\.')}`))
  assert.doesNotMatch(result.stdout, /autocomplete|darwin|linux|node-v|ardent-cli-beta\//)
})

test('lists each command once in grouped help, under its full name', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-help-shorthand-'))
  const result = await runCLI(['--help'], configHome)

  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /ardent-beta (b|\w+ (ls|rm)) /)
})

test('every shorthand reaches the command it abbreviates', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-shorthand-'))
  const summary = async (command) => {
    const result = await runCLI([...command.split(' '), '--help'], configHome)
    assert.equal(result.status, 0, `${command}: ${result.stderr}`)
    return result.stdout.split('\n')[0]
  }

  const shorthands = {
    'branch create': ['b create'],
    'branch delete': ['branch rm', 'b delete', 'b rm'],
    'branch list': ['branch ls', 'b list', 'b ls'],
    'branch switch': ['b switch'],
    'connector list': ['connector ls'],
    'member delete': ['member rm'],
    'member list': ['member ls'],
    'project delete': ['project rm'],
    'project list': ['project ls'],
  }
  for (const [command, forms] of Object.entries(shorthands)) {
    const expected = await summary(command)
    for (const form of forms) assert.equal(await summary(form), expected, form)
  }
})

test('shows grouped help by default after login', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-logged-in-root-'))
  await saveSession(join(configHome, 'ardent'), {token: 'test-token'})
  const result = await runCLI([], configHome)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /AUTHENTICATION/)
  assert.doesNotMatch(result.stdout, /Get started:/)
})

test('prints its package version', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'ardent-cli-version-'))
  const result = await runCLI(['--version'], configHome)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, new RegExp(`${name}/${version.replaceAll('.', '\\.')}`))
})
