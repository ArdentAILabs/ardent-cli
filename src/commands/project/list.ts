import {ux} from '@oclif/core'

import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {listProjects, type Project} from '../../projects/client.js'
import {replaceProjectCache} from '../../projects/context.js'
import {renderTable} from '../../table.js'

export default class ProjectList extends ArdentCommand {
  public static description = 'List projects'
  public static helpGroup = 'Projects'

  public async run(): Promise<{projects: Project[]}> {
    const session = await loadSession(this.config.configDir)
    if (!session) this.error('Not logged in to Ardent. Run ardent-beta login.')
    if (!session.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')

    const projects = await listProjects(session.token, session.organization.id)
    const refreshedSession = await replaceProjectCache(this.config.configDir, session, projects)
    if (!this.jsonEnabled()) {
      if (projects.length === 0) this.log('No projects found.')
      else {
        const lines = renderTable(projects, [
          {
            header: 'Title',
            maxWidth: 30,
            shrinkPriority: 0,
            value: ({id, name}) => `${id === refreshedSession.selectedProject?.id ? '●' : ' '} ${name}`,
          },
        ], process.stdout.columns ?? 120)
        const selectedIndex = projects.findIndex(({id}) => id === refreshedSession.selectedProject?.id)
        if (selectedIndex >= 0) {
          const lineIndex = selectedIndex + 3
          const value = lines[lineIndex].slice(2, -2).trimEnd()
          lines[lineIndex] = `${lines[lineIndex].slice(0, 2)}${ux.colorize('green', value)}${lines[lineIndex].slice(value.length + 2)}`
        }
        for (const line of lines) this.log(line)
      }
    }

    return {projects}
  }
}
