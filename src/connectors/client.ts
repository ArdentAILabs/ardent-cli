import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'

import {request} from '../api/client.js'
import {terminalText} from '../terminal.js'

export interface Connector {
  created_at: string
  environment_id: string
  id: string
  name: string
  project_id: string
  source: {
    database: string
    host: string
    port: number
  }
  status: string
  updated_at: string
}

export interface ConnectorRegistration {
  connector_id: string
}

export interface ConnectorRegistrationStatus {
  connector_id: string
  failure?: string
  status: 'deleted' | 'deleting' | 'failed' | 'halted' | 'registered' | 'registering'
}

export async function listConnectors(token: string, organizationID: string, projectID: string): Promise<Connector[]> {
  const query = new URLSearchParams({organization_id: organizationID, project_id: projectID})
  const connectors = await request<Connector[]>(token, `/connectors?${query}`)
  if (
    !Array.isArray(connectors) ||
    connectors.some((connector) => !isConnector(connector, projectID)) ||
    new Set(connectors.map(({id}) => id)).size !== connectors.length ||
    new Set(connectors.map(({name}) => name)).size !== connectors.length
  ) {
    throw new Error('Ardent API returned an invalid connectors response.')
  }

  return connectors
}

export async function createConnector(
  token: string,
  organizationID: string,
  projectID: string,
  environmentID: string | undefined,
  name: string,
  url: string,
  tlsClientCertificate?: string,
  tlsClientKey?: string,
): Promise<ConnectorRegistration> {
  const requestID = randomUUID()
  const registration = await request<ConnectorRegistration>(token, '/connectors', {
    body: JSON.stringify({
      ...(environmentID ? {environment_id: environmentID} : {}),
      name,
      organization_id: organizationID,
      project_id: projectID,
      request_id: requestID,
      url,
      ...(tlsClientCertificate ? {tls_client_certificate: tlsClientCertificate, tls_client_key: tlsClientKey} : {}),
    }),
    method: 'POST',
  })
  if (!isConnectorRegistration(registration)) throw new Error('Ardent API returned an invalid connector registration response.')
  return registration
}

export async function waitForConnectorRegistration(
  token: string,
  connectorID: string,
  onStatus?: (status: ConnectorRegistrationStatus['status']) => void,
): Promise<ConnectorRegistrationStatus> {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), 30 * 60 * 1000)
  try {
    for (;;) {
      const status = await request<ConnectorRegistrationStatus>(token, `/connectors/${encodeURIComponent(connectorID)}`, {
        signal: AbortSignal.any([deadline.signal, AbortSignal.timeout(10_000)]),
      })
      deadline.signal.throwIfAborted()
      if (!isConnectorRegistrationStatus(status, connectorID)) {
        throw new Error('Ardent API returned an invalid connector registration status.')
      }

      onStatus?.(status.status)
      if (status.status === 'registered') return status
      if (status.status === 'failed') throw new Error(terminalText(status.failure || 'Connector registration failed.'))
      if (status.status === 'halted') {
        // Not success, and not polled through: docs/REQUIREMENTS.md section 7's
        // "a halt does not clear by being polled".
        const reason = status.failure ? `: ${terminalText(status.failure)}` : ''
        throw new Error(`Connector ${terminalText(connectorID)} is halted${reason}. Run ardent-beta connector list to check its state.`)
      }
      if (status.status === 'deleting' || status.status === 'deleted') {
        const reason = status.failure ? `: ${terminalText(status.failure)}` : ''
        throw new Error(`Connector ${terminalText(connectorID)} is ${status.status}${reason}. Run ardent-beta connector list to check its state.`)
      }
      await delay(2000, undefined, {signal: deadline.signal})
    }
  } catch (error) {
    if (deadline.signal.aborted) {
      throw new Error(`Timed out waiting for connector ${terminalText(connectorID)} registration. Its outcome is unknown. Run ardent-beta connector list to check its state.`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function isConnector(value: unknown, projectID: string): value is Connector {
  if (typeof value !== 'object' || value === null) return false
  const connector = value as Partial<Connector>
  const source = connector.source as Partial<Connector['source']> | undefined
  return (
    typeof connector.id === 'string' &&
    connector.id.length > 0 &&
    connector.project_id === projectID &&
    typeof connector.environment_id === 'string' &&
    connector.environment_id.length > 0 &&
    typeof connector.name === 'string' &&
    connector.name.length > 0 &&
    typeof connector.status === 'string' &&
    connector.status.length > 0 &&
    typeof source === 'object' &&
    source !== null &&
    typeof source.host === 'string' &&
    Number.isInteger(source.port) &&
    typeof source.database === 'string' &&
    typeof connector.created_at === 'string' &&
    typeof connector.updated_at === 'string'
  )
}

function isConnectorRegistration(value: unknown): value is ConnectorRegistration {
  if (typeof value !== 'object' || value === null) return false
  const registration = value as Partial<ConnectorRegistration>
  return typeof registration.connector_id === 'string' && registration.connector_id.length > 0
}

function isConnectorRegistrationStatus(value: unknown, connectorID: string): value is ConnectorRegistrationStatus {
  if (typeof value !== 'object' || value === null) return false
  const status = value as Partial<ConnectorRegistrationStatus>
  return (
    status.connector_id === connectorID &&
    (status.status === 'registering' || status.status === 'registered' || status.status === 'failed' || status.status === 'halted' || status.status === 'deleting' || status.status === 'deleted') &&
    (status.failure === undefined || typeof status.failure === 'string')
  )
}
