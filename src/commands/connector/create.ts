import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'

import {Args, Flags, ux} from '@oclif/core'

import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {createConnector, waitForConnectorRegistration} from '../../connectors/client.js'
import {terminalText} from '../../terminal.js'

interface ConnectorCreation {
  connector_id: string
  status: 'registered' | 'registering'
}

export default class ConnectorCreate extends ArdentCommand {
  public static args = {
    type: Args.string({description: 'Connector type', required: true}),
    url: Args.string({description: 'PostgreSQL connection URL', required: true}),
  }

  public static description = 'Register a PostgreSQL connector in the selected project'
  public static helpGroup = 'Connectors'
  public static flags = {
    environment: Flags.string({description: 'Environment ID (defaults to Ardent Cloud)'}),
    name: Flags.string({char: 'n', description: 'Connector name'}),
    'tls-client-cert': Flags.string({description: 'PEM client certificate file (requires sslmode=require in the URL)'}),
    'tls-client-key': Flags.string({description: 'PEM client private-key file (requires sslmode=require in the URL)'}),
  }

  public async run(): Promise<ConnectorCreation> {
    const {args, flags} = await this.parse(ConnectorCreate)
    if (!['postgres', 'postgresql'].includes(args.type.toLowerCase())) {
      this.error(`Unsupported connector type ${JSON.stringify(args.type)}. Supported: postgresql.`)
    }

    const session = await loadSession(this.config.configDir)
    if (!session?.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')
    if (!session.selectedProject) this.error('No project selected. Run ardent-beta project list, then ardent-beta project switch <name>.')
    const providedName = flags.name?.trim()
    if (flags.name !== undefined && !providedName) this.error('Connector name cannot be empty.')
    const name = providedName ?? `${session.selectedProject.name}-${randomUUID().slice(0, 8)}`
    const environmentID = flags.environment?.trim()
    if (flags.environment !== undefined && !environmentID) this.error('Environment ID cannot be empty.')
    if (Boolean(flags['tls-client-cert']) !== Boolean(flags['tls-client-key'])) this.error('--tls-client-cert and --tls-client-key must be supplied together.')
    let tlsClientCertificate = ''
    let tlsClientKey = ''
    if (flags['tls-client-cert'] && flags['tls-client-key']) {
      try {
        ;[tlsClientCertificate, tlsClientKey] = await Promise.all([readFile(flags['tls-client-cert'], 'utf8'), readFile(flags['tls-client-key'], 'utf8')])
      } catch {
        this.error('Could not read the TLS client certificate pair.')
      }

      if (tlsClientCertificate.length > 64 * 1024 || tlsClientKey.length > 64 * 1024) this.error('TLS client certificate files must each be at most 64 KiB.')
    }

    const interactive = !this.jsonEnabled() && ux.action.type === 'spinner'
    if (interactive) {
      ux.action.start(`${terminalText(name)} in ${terminalText(session.selectedProject.name)}`, 'registering')
    } else if (!this.jsonEnabled()) {
      this.log(`Registering connector ${terminalText(name)} for project ${terminalText(session.selectedProject.name)}...`)
    }

    const registration = await createConnector(
      session.token,
      session.organization.id,
      session.selectedProject.id,
      environmentID,
      name,
      args.url,
      tlsClientCertificate,
      tlsClientKey,
    )
    if (!interactive) {
      if (!this.jsonEnabled()) {
        this.log(`Connector registration started (${terminalText(registration.connector_id)}).`)
      }

      return {connector_id: registration.connector_id, status: 'registering'}
    }

    await waitForConnectorRegistration(session.token, registration.connector_id, (status) => {
      ux.action.status = status
    })
    ux.action.stop(ux.colorize('green', '✓ registered'))
    this.log('Replication readiness is still pending.')

    return {connector_id: registration.connector_id, status: 'registered'}
  }
}
