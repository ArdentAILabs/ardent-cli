import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {loadSession, saveSession} from '../../dist/auth/credentials.js'
import {replaceProjectCache, selectProject} from '../../dist/projects/context.js'
import {replaceConnectorCache, selectConnector} from '../../dist/connectors/context.js'

const project = {id: 'project-1', name: 'First'}
const connector = {id: 'connector-1', name: 'Source', project_id: project.id}
const branch = {id: 'branch-1', name: 'Feature', connector_id: connector.id}
const session = {token: 'token', organization: {id: 'org', name: 'Org'}, projects: [project], selectedProject: project, connectors: [connector], selectedConnector: connector, branches: [branch], selectedBranch: branch}

test('project switching clears connector and branch selection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-branch-context-'))
  await selectProject(directory, session, {id: 'project-2', name: 'Second'})
  const updated = await loadSession(directory)
  assert.equal(updated.selectedProject.id, 'project-2')
  assert.equal(updated.connectors, undefined)
  assert.equal(updated.selectedConnector, undefined)
  assert.equal(updated.branches, undefined)
  assert.equal(updated.selectedBranch, undefined)
})

test('project removal clears an unselected connector cache and preserves readable configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-branch-context-'))
  const unselected = {...session, selectedConnector: undefined, branches: undefined, selectedBranch: undefined}
  await replaceProjectCache(directory, unselected, [])
  const updated = await loadSession(directory)
  assert.equal(updated.selectedProject, undefined)
  assert.equal(updated.connectors, undefined)
})

test('connector refresh or switching clears stale branch context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-branch-context-'))
  const other = {...connector, id: 'connector-2', name: 'Other'}
  await selectConnector(directory, {...session, connectors: [connector, other]}, other)
  assert.equal((await loadSession(directory)).selectedBranch, undefined)
  await replaceConnectorCache(directory, session, [])
  const updated = await loadSession(directory)
  assert.equal(updated.selectedConnector, undefined)
  assert.equal(updated.branches, undefined)
})

test('configuration rejects a connector or branch belonging to another parent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-branch-context-'))
  for (const invalid of [
    {...session, connectors: [{...connector, project_id: 'wrong'}]},
    {...session, branches: [{...branch, connector_id: 'wrong'}]},
    {...session, selectedBranch: {...branch, id: 'missing'}},
    {...session, branches: [branch, branch]},
  ]) {
    await saveSession(directory, invalid)
    await assert.rejects(loadSession(directory), /configuration.*invalid/)
  }
})
