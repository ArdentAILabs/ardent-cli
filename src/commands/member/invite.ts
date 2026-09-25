import {Args, Flags} from '@oclif/core'

import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {inviteMember, type Invitation, type OrganizationRole} from '../../members/client.js'
import {terminalText} from '../../terminal.js'

const roles: Record<string, OrganizationRole> = {
  admin: 'Admin',
  member: 'Member',
  owner: 'Owner',
  viewer: 'Viewer',
}

export default class MemberInvite extends ArdentCommand {
  public static args = {
    email: Args.string({description: 'Email address to invite', required: true}),
  }

  public static description = 'Invite a member to the organization'
  public static helpGroup = 'Members'
  public static flags = {
    role: Flags.string({default: 'member', description: 'Role to grant', options: Object.keys(roles)}),
  }

  public async run(): Promise<Invitation> {
    const {args, flags} = await this.parse(MemberInvite)
    const email = args.email.trim().toLowerCase()
    if (!email) this.error('Email cannot be empty.')

    const session = await loadSession(this.config.configDir)
    if (!session?.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')

    const role = roles[flags.role]
    const invitation = await inviteMember(session.token, session.organization.id, email, role)
    if (!this.jsonEnabled()) this.log(`✓ Invited ${terminalText(invitation.email)} as ${terminalText(invitation.role_display_name)}`)
    return invitation
  }
}
