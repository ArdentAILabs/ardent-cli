import {Args} from '@oclif/core'

import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {createProject, type Project} from '../../projects/client.js'
import {selectProject} from '../../projects/context.js'
import {terminalText} from '../../terminal.js'

export default class ProjectCreate extends ArdentCommand {
  public static args = {
    name: Args.string({description: 'Project name', required: true}),
  }

  public static description = 'Create a project'
  public static helpGroup = 'Projects'

  public async run(): Promise<Project> {
    const {args} = await this.parse(ProjectCreate)
    const name = args.name.trim()
    if (!name) this.error('Project name cannot be empty.')

    const session = await loadSession(this.config.configDir)
    if (!session) this.error('Not logged in to Ardent. Run ardent-beta login.')
    if (!session.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')

    const project = await createProject(session.token, session.organization.id, name)
    await selectProject(this.config.configDir, session, project)
    if (!this.jsonEnabled()) this.log(`✓ Created project ${terminalText(project.name)}`)
    return project
  }
}
