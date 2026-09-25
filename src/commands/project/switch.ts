import {Args} from '@oclif/core'

import {loadSession, type Session} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {listProjects} from '../../projects/client.js'
import {cachedProjectNamed, replaceProjectCache, selectProject} from '../../projects/context.js'
import {terminalText} from '../../terminal.js'

export default class ProjectSwitch extends ArdentCommand {
  public static args = {
    name: Args.string({description: 'Project name', required: true}),
  }

  public static description = 'Switch to a project in the logged-in organization'
  public static helpGroup = 'Projects'

  public async run(): Promise<{id: string; name: string}> {
    const {args} = await this.parse(ProjectSwitch)
    const name = args.name.trim()
    if (!name) this.error('Project name cannot be empty.')

    let session: Session | undefined = await loadSession(this.config.configDir)
    if (!session?.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')

    // A cached name switches without a request, which is what makes this cheap
    // enough to run constantly. A miss is not an answer though: the cache only
    // holds what the last `project list` returned, so a project created since
    // then reported that it did not exist. Only the organization's list can say
    // that, and it is already the authority `project delete` defers to.
    let project = cachedProjectNamed(session, name)
    if (!project) {
      const projects = await listProjects(session.token, session.organization.id)
      // Refused before anything is written. replaceProjectCache is not a read:
      // it persists, it drops the connector and branch context when the
      // selection moves, and it adopts the sole remaining project when the
      // selected one is gone. Running it first would let a mistyped name exit
      // non-zero having quietly selected a different project underneath.
      project = projects.find((candidate) => candidate.name === name)
      if (!project) {
        this.error(
          `Project ${JSON.stringify(name)} not found in organization "${terminalText(session.organization.name)}".`,
        )
      }

      session = await replaceProjectCache(this.config.configDir, session, projects)
    }

    await selectProject(this.config.configDir, session, project)
    if (!this.jsonEnabled()) this.log(`✓ Switched to project ${terminalText(project.name)}`)
    return {id: project.id, name: project.name}
  }
}
