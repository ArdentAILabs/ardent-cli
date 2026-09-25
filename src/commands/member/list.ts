import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {listMemberships, listReadableInvitations, type Invitation, type Membership} from '../../members/client.js'
import {renderTable} from '../../table.js'

export default class MemberList extends ArdentCommand {
  public static description = 'List organization members and pending invitations'
  public static helpGroup = 'Members'

  public async run(): Promise<{invitations: Invitation[] | null; memberships: Membership[]}> {
    const session = await loadSession(this.config.configDir)
    if (!session?.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')

    const [memberships, invitations] = await Promise.all([
      listMemberships(session.token, session.organization.id),
      listReadableInvitations(session.token, session.organization.id),
    ])
    const readableInvitations = invitations ?? []
    if (!this.jsonEnabled()) {
      const rows = [
        ...memberships.map((membership) => ({
          email: membership.email,
          role: membership.role_display_name,
          status: 'Active',
        })),
        ...readableInvitations.map((invitation) => ({
          email: invitation.email,
          role: invitation.role_display_name,
          status: 'Pending',
        })),
      ]
      if (rows.length === 0) this.log('No members found.')
      else {
        const lines = renderTable(rows, [
          {header: 'Email', maxWidth: 40, minWidth: 12, shrinkPriority: 0, value: ({email}) => email},
          {header: 'Role', maxWidth: 20, shrinkPriority: 1, value: ({role}) => role},
          {header: 'Status', shrinkPriority: 2, value: ({status}) => status},
        ], process.stdout.columns ?? 120)
        for (const line of lines) this.log(line)
      }
      if (invitations === undefined) this.log('Pending invitations are not visible with this login.')
    }

    return {invitations: invitations ?? null, memberships}
  }
}
