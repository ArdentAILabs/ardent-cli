import {Args} from '@oclif/core'

import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {deleteProject, listProjects} from '../../projects/client.js'
import {replaceProjectCache} from '../../projects/context.js'
import {terminalText} from '../../terminal.js'

export default class ProjectDelete extends ArdentCommand {
  public static args = {
    name: Args.string({description: 'Project name', required: true}),
  }

  public static description = 'Delete a project by name'
  public static helpGroup = 'Projects'

  public async run(): Promise<{id: string; name: string}> {
    const {args} = await this.parse(ProjectDelete)
    const name = args.name.trim()
    if (!name) this.error('Project name cannot be empty.')

    const session = await loadSession(this.config.configDir)
    if (!session?.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')

    const projects = await listProjects(session.token, session.organization.id)
    const project = projects.find((candidate) => candidate.name === name)
    if (!project) this.error(`Project ${JSON.stringify(name)} not found.`)

    if (!this.jsonEnabled()) this.log(`Deleting project ${terminalText(project.name)}...`)
    await deleteProject(session.token, session.organization.id, project.id)
    await replaceProjectCache(
      this.config.configDir,
      session,
      projects.filter(({id}) => id !== project.id),
    )
    if (!this.jsonEnabled()) this.log(`✓ Deleted project ${terminalText(project.name)}`)
    return {id: project.id, name: project.name}
  }
}
