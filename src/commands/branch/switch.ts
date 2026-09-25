import {Args} from '@oclif/core'

import {saveSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {branchName, listBranches, type Branch} from '../../branches/client.js'
import {replaceBranchCache} from '../../branches/context.js'
import {requireConnector} from '../../connectors/context.js'
import {terminalText} from '../../terminal.js'

export default class BranchSwitch extends ArdentCommand {
  public static args = {name: Args.string({description: 'Branch name', required: true})}
  public static strict = false
  public static description = 'Switch to a branch in the selected connector'
  public static helpGroup = 'Branches'

  public async run(): Promise<Branch> {
    const {argv} = await this.parse(BranchSwitch)
    const name = branchName(argv)
    const session = await requireConnector(this.config.configDir, !this.jsonEnabled())
    const branches = await listBranches(session.token, session.selectedConnector.id)
    const updated = await replaceBranchCache(this.config.configDir, session, branches)
    const branch = branches.find((candidate) => candidate.name === name)
    if (!branch) this.error(`Branch ${JSON.stringify(name)} not found in connector ${terminalText(JSON.stringify(session.selectedConnector.name))}.`)
    await saveSession(this.config.configDir, {...updated, selectedBranch: {id: branch.id, name: branch.name, connector_id: branch.connector_id}})
    if (!this.jsonEnabled()) this.log(`✓ Switched to branch ${terminalText(name)} in connector ${terminalText(session.selectedConnector.name)}`)
    return branch
  }
}
