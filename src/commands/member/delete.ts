import {Args} from '@oclif/core'

import {loadSession} from '../../auth/credentials.js'
import {ArdentCommand} from '../../command.js'
import {deleteInvitation, deleteMembership, listInvitations, listMemberships} from '../../members/client.js'
import {terminalText} from '../../terminal.js'

export default class MemberDelete extends ArdentCommand {
  public static args = {
    email: Args.string({description: 'Member or pending invitation email', required: true}),
  }

  public static description = 'Delete a member or pending invitation by email'
  public static helpGroup = 'Members'

  public async run(): Promise<{email: string; status: 'active' | 'pending'}> {
    const {args} = await this.parse(MemberDelete)
    const email = args.email.trim().toLowerCase()
    if (!email) this.error('Email cannot be empty.')

    const session = await loadSession(this.config.configDir)
    if (!session?.organization) this.error('You must be logged in to run this command. Run ardent-beta login.')

    const [memberships, invitations] = await Promise.all([
      listMemberships(session.token, session.organization.id),
      listInvitations(session.token, session.organization.id),
    ])
    const matchingMemberships = memberships.filter((candidate) => candidate.email.toLowerCase() === email)
    const matchingInvitations = invitations.filter((candidate) => candidate.email.toLowerCase() === email)
    if (matchingMemberships.length + matchingInvitations.length > 1) {
      this.error(`Multiple active members or pending invitations match ${JSON.stringify(email)}.`)
    }

    const [membership] = matchingMemberships
    const [invitation] = matchingInvitations

    if (membership) {
      if (!this.jsonEnabled()) this.log(`Deleting member ${terminalText(membership.email)}...`)
      await deleteMembership(session.token, session.organization.id, membership.user_id)
      if (!this.jsonEnabled()) this.log(`✓ Deleted member ${terminalText(membership.email)}`)
      return {email: membership.email, status: 'active'}
    }

    if (!invitation) this.error(`Member ${JSON.stringify(email)} not found.`)
    if (!this.jsonEnabled()) this.log(`Canceling invitation for ${terminalText(invitation.email)}...`)
    await deleteInvitation(session.token, session.organization.id, invitation.id)
    if (!this.jsonEnabled()) this.log(`✓ Canceled invitation for ${terminalText(invitation.email)}`)
    return {email: invitation.email, status: 'pending'}
  }
}
