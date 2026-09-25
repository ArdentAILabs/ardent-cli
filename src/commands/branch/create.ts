import {Args, ux} from '@oclif/core'

import {ArdentCommand} from '../../command.js'
import {branchName, createBranch, waitForBranchOperation, type BranchOperation} from '../../branches/client.js'
import {replaceBranchCache} from '../../branches/context.js'
import {requireConnector} from '../../connectors/context.js'
import {terminalText} from '../../terminal.js'

export default class BranchCreate extends ArdentCommand {
  public static args = {name: Args.string({description: 'Branch name', required: true})}
  public static strict = false
  public static description = 'Create a branch in the selected connector'
  public static helpGroup = 'Branches'

  public async run(): Promise<BranchOperation> {
    const {argv} = await this.parse(BranchCreate)
    const name = branchName(argv)
    const session = await requireConnector(this.config.configDir, !this.jsonEnabled())
    const interactive = !this.jsonEnabled() && ux.action.type === 'spinner'
    const target = `${terminalText(name)} in connector ${terminalText(session.selectedConnector.name)}`
    if (interactive) ux.action.start(`Creating branch ${target}`)
    else if (!this.jsonEnabled()) this.log(`Creating branch ${target}...`)
    try {
      const result = await createBranch(session.token, session.selectedConnector.id, name)
      await replaceBranchCache(this.config.configDir, session, [...(session.branches ?? []).filter(({id, name}) => id !== result.branch.id && name !== result.branch.name), result.branch])
      if (interactive) {
        await waitForBranchOperation(session.token, result.operation.workflow_id, (status) => { ux.action.status = status })
        ux.action.stop(ux.colorize('green', '✓ created'))
      } else if (!this.jsonEnabled()) this.log(`Branch creation started (${terminalText(result.branch.id)}).`)
      return result
    } catch (error) {
      if (interactive) ux.action.stop('failed')
      throw error
    }
  }
}
