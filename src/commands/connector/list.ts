import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {listConnectors, type Connector} from '../../connectors/client.js'
import {replaceConnectorCache} from '../../connectors/context.js'
import {renderTable} from '../../table.js'

export default class ConnectorList extends ArdentCommand {
  public static description = 'List connectors in the selected project'
  public static helpGroup = 'Connectors'

  public async run(): Promise<{connectors: Connector[]}> {
    const session = await loadSession(this.config.configDir)
    if (!session?.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')
    if (!session.selectedProject) this.error('No project selected. Run ardent-beta project list, then ardent-beta project switch <name>.')

    const connectors = await listConnectors(session.token, session.organization.id, session.selectedProject.id)
    await replaceConnectorCache(this.config.configDir, session, connectors)
    if (!this.jsonEnabled()) {
      if (connectors.length === 0) this.log('No connectors found.')
      else {
        const lines = renderTable(connectors, [
          {header: 'Title', maxWidth: 30, shrinkPriority: 1, value: ({name}) => name},
          {header: 'Status', shrinkPriority: 2, value: ({status}) => status},
          {
            header: 'Source',
            maxWidth: 50,
            minWidth: 20,
            shrinkPriority: 0,
            value: ({source}) => `${source.host}:${source.port}/${source.database}`,
          },
        ], process.stdout.columns ?? 120)
        for (const line of lines) this.log(line)
      }
    }

    return {connectors}
  }
}
