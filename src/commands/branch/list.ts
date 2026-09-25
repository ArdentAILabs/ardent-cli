import {ArdentCommand} from '../../command.js'
import {listBranches, type Branch} from '../../branches/client.js'
import {replaceBranchCache} from '../../branches/context.js'
import {requireConnector} from '../../connectors/context.js'
import {renderTable} from '../../table.js'

export default class BranchList extends ArdentCommand {
  public static description = 'List branches in the selected connector'
  public static helpGroup = 'Branches'

  public async run(): Promise<{branches: Branch[]}> {
    const session = await requireConnector(this.config.configDir, !this.jsonEnabled())
    const branches = await listBranches(session.token, session.selectedConnector.id)
    const updated = await replaceBranchCache(this.config.configDir, session, branches)
    if (!this.jsonEnabled()) {
      if (branches.length === 0) this.log('No branches found.')
      else {
        const lines = renderTable(branches, [
          {header: 'Selected', value: ({id}) => id === updated.selectedBranch?.id ? '●' : ''},
          {header: 'Title', maxWidth: 30, shrinkPriority: 0, value: ({name}) => name},
          {header: 'Status', shrinkPriority: 1, value: ({state}) => state},
        ], process.stdout.columns ?? 120)
        for (const line of lines) this.log(line)
      }
    }
    return {branches}
  }
}
