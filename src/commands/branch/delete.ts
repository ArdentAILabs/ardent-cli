import {Args, ux} from '@oclif/core'

import {ArdentCommand} from '../../command.js'
import {branchName, deleteBranch, waitForBranchOperation, type BranchOperation} from '../../branches/client.js'
import {replaceBranchCache} from '../../branches/context.js'
import {requireConnector} from '../../connectors/context.js'
import {terminalText} from '../../terminal.js'

export default class BranchDelete extends ArdentCommand {
  public static args = {name: Args.string({description: 'Branch name', required: true})}
  public static strict = false
  public static description = 'Delete a branch in the selected connector'
  public static helpGroup = 'Branches'

  public async run(): Promise<BranchOperation> {
    const {argv} = await this.parse(BranchDelete)
    const name = branchName(argv)
    const session = await requireConnector(this.config.configDir, !this.jsonEnabled())
    const interactive = !this.jsonEnabled() && ux.action.type === 'spinner'
    const target = `${terminalText(name)} in connector ${terminalText(session.selectedConnector.name)}`
    if (interactive) ux.action.start(`Deleting branch ${target}`)
    else if (!this.jsonEnabled()) this.log(`Deleting branch ${target}...`)
    try {
      const result = await deleteBranch(session.token, session.selectedConnector.id, name)
      if (interactive) {
        await waitForBranchOperation(session.token, result.operation.workflow_id, (status) => { ux.action.status = status })
        await replaceBranchCache(this.config.configDir, session, (session.branches ?? []).filter(({id}) => id !== result.branch.id))
        ux.action.stop(ux.colorize('green', '✓ deleted'))
      } else if (!this.jsonEnabled()) this.log(`Branch deletion started (${terminalText(result.branch.id)}).`)
      return result
    } catch (error) {
      if (interactive) ux.action.stop('failed')
      throw error
    }
  }
}
