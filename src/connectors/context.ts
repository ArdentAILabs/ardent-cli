import {createInterface} from 'node:readline/promises'

import {loadSession, saveSession, type ConnectorIdentity, type Session} from '../auth/credentials.js'
import {terminalText} from '../terminal.js'
import {listConnectors} from './client.js'

export async function replaceConnectorCache(directory: string, session: Session, connectors: ConnectorIdentity[]): Promise<Session> {
  const identities = connectors.map(({id, name, project_id}) => ({id, name, project_id}))
  const selectedConnector = identities.find(({id}) => id === session.selectedConnector?.id) ?? (identities.length === 1 ? identities[0] : undefined)
  const updated = {...session, connectors: identities, selectedConnector}
  if (!selectedConnector) delete updated.selectedConnector
  if (session.selectedConnector?.id !== selectedConnector?.id) {
    delete updated.branches
    delete updated.selectedBranch
  }
  await saveSession(directory, updated)
  return updated
}

export async function selectConnector(directory: string, session: Session, connector: ConnectorIdentity): Promise<Session> {
  const updated = {...session, selectedConnector: connector}
  if (session.selectedConnector?.id !== connector.id) {
    delete updated.branches
    delete updated.selectedBranch
  }
  await saveSession(directory, updated)
  return updated
}

export async function requireConnector(directory: string, interactive: boolean): Promise<Session & {selectedConnector: ConnectorIdentity}> {
  let session = await loadSession(directory)
  if (!session?.organization) throw new Error('You must be logged in to run this command. Run ardent-beta login.')
  if (session.selectedConnector && (!interactive || !process.stdin.isTTY)) return {...session, selectedConnector: session.selectedConnector}
  if (!session.selectedProject) throw new Error('No project selected for connector discovery. Run ardent-beta project list, then ardent-beta project switch <name>.')
  const connectors = await listConnectors(session.token, session.organization.id, session.selectedProject.id)
  session = await replaceConnectorCache(directory, session, connectors)
  if (session.selectedConnector && connectors.length === 1) return {...session, selectedConnector: session.selectedConnector}
  if (connectors.length === 0) throw new Error('No connectors found. Run ardent-beta connector create first.')
  if (!interactive || !process.stdin.isTTY) throw new Error('No connector selected. Run this command in a terminal to select a connector first.')
  for (const [index, connector] of connectors.entries()) process.stderr.write(`${index + 1}. ${terminalText(connector.name)}\n`)
  const prompt = createInterface({input: process.stdin, output: process.stderr})
  let answer: string
  const current = session.selectedConnector
  const question = current ? `Select a connector by number [${terminalText(current.name)}]: ` : 'Select a connector by number: '
  try { answer = (await prompt.question(question)).trim() } finally { prompt.close() }
  const connector = !answer && current ? current : /^\d+$/.test(answer) ? connectors[Number(answer) - 1] : undefined
  if (!connector) throw new Error('Invalid connector selection.')
  session = await selectConnector(directory, session, connector)
  return {...session, selectedConnector: connector}
}
