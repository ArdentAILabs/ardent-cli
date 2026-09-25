import {randomUUID} from 'node:crypto'

import {APIError, request, requestDurableMutation} from '../api/client.js'

export type OrganizationRole = 'Admin' | 'Member' | 'Owner' | 'Viewer'

export interface Membership {
  created_at: string
  email: string
  full_name: string | null
  organization_id: string
  role_display_name: string
  scopes: string[]
  updated_at: string
  user_id: string
}

export interface Invitation {
  created_at: string
  created_by: string | null
  email: string
  expires_at: string
  id: string
  inviter_name: string | null
  organization_id: string
  organization_name: string
  role_display_name: string
  scopes: string[]
}

const sharedReadScopes = [
  'organizations.read',
  'organization_memberships.read',
  'projects.read',
  'environments.read',
  'connectors.read',
]

const adminScopes = [
  'organizations.read',
  'organization_memberships.read',
  'organization_memberships.update',
  'organization_invitations.read',
  'organization_invitations.create',
  'organization_invitations.delete',
  'projects.read',
  'projects.create',
  'projects.update',
  'projects.delete',
  'environments.read',
  'environments.create',
  'connectors.read',
  'connectors.create',
  'environments.update',
  'branches.connect',
  'billing.read',
  'api_keys.read',
  'api_keys.create',
  'api_keys.revoke',
]

const standardRoleScopes: Record<OrganizationRole, string[]> = {
  Owner: adminScopes.flatMap((scope) => (scope === 'billing.read' ? [scope, 'billing.manage'] : [scope])),
  Admin: adminScopes,
  Member: [...sharedReadScopes, 'projects.create', 'connectors.create', 'branches.connect'],
  Viewer: sharedReadScopes,
}

export async function listMemberships(token: string, organizationID: string): Promise<Membership[]> {
  const memberships = await request<Membership[]>(
    token,
    `/organizations/${encodeURIComponent(organizationID)}/memberships`,
  )
  if (!Array.isArray(memberships) || memberships.some((membership) => !isMembership(membership, organizationID))) {
    throw new Error('Ardent API returned an invalid memberships response.')
  }

  return memberships
}

export async function listInvitations(token: string, organizationID: string): Promise<Invitation[]> {
  const invitations = await request<Invitation[]>(
    token,
    `/organizations/${encodeURIComponent(organizationID)}/invitations`,
  )
  if (!Array.isArray(invitations) || invitations.some((invitation) => !isInvitation(invitation, organizationID))) {
    throw new Error('Ardent API returned an invalid invitations response.')
  }

  return invitations
}

export async function listReadableInvitations(token: string, organizationID: string): Promise<Invitation[] | undefined> {
  try {
    return await listInvitations(token, organizationID)
  } catch (error) {
    if (error instanceof APIError && error.status === 403 && error.code === 'permission_denied') return undefined
    throw error
  }
}

export async function inviteMember(
  token: string,
  organizationID: string,
  email: string,
  role: OrganizationRole,
): Promise<Invitation> {
  const invitation = await requestDurableMutation<Invitation>(
    token,
    `/organizations/${encodeURIComponent(organizationID)}/invitations`,
    {
      body: JSON.stringify({email, role_display_name: role, scopes: standardRoleScopes[role]}),
      headers: {'Idempotency-Key': randomUUID()},
      method: 'POST',
    },
    'ardent-beta member list',
  )
  if (!isInvitation(invitation, organizationID)) throw new Error('Ardent API returned an invalid invitation response.')
  return invitation
}

export async function deleteMembership(token: string, organizationID: string, userID: string): Promise<void> {
  const response = await requestDurableMutation<unknown>(
    token,
    `/organizations/${encodeURIComponent(organizationID)}/memberships/${encodeURIComponent(userID)}`,
    {method: 'DELETE'},
    'ardent-beta member list',
  )
  if (response !== undefined) throw new Error('Ardent API did not confirm member deletion. Run ardent-beta member list before retrying.')
}

export async function deleteInvitation(token: string, organizationID: string, invitationID: string): Promise<void> {
  const response = await requestDurableMutation<unknown>(
    token,
    `/organizations/${encodeURIComponent(organizationID)}/invitations/${encodeURIComponent(invitationID)}`,
    {method: 'DELETE'},
    'ardent-beta member list',
  )
  if (response !== undefined) throw new Error('Ardent API did not confirm invitation cancellation. Run ardent-beta member list before retrying.')
}

function isMembership(value: unknown, organizationID: string): value is Membership {
  if (typeof value !== 'object' || value === null) return false
  const membership = value as Partial<Membership>
  return (
    membership.organization_id === organizationID &&
    typeof membership.user_id === 'string' &&
    membership.user_id.length > 0 &&
    typeof membership.email === 'string' &&
    (membership.full_name === null || typeof membership.full_name === 'string') &&
    typeof membership.role_display_name === 'string' &&
    stringArray(membership.scopes) &&
    typeof membership.created_at === 'string' &&
    typeof membership.updated_at === 'string'
  )
}

function isInvitation(value: unknown, organizationID: string): value is Invitation {
  if (typeof value !== 'object' || value === null) return false
  const invitation = value as Partial<Invitation>
  return (
    invitation.organization_id === organizationID &&
    typeof invitation.id === 'string' &&
    invitation.id.length > 0 &&
    typeof invitation.organization_name === 'string' &&
    typeof invitation.email === 'string' &&
    typeof invitation.role_display_name === 'string' &&
    stringArray(invitation.scopes) &&
    typeof invitation.expires_at === 'string' &&
    (invitation.created_by === null || typeof invitation.created_by === 'string') &&
    (invitation.inviter_name === null || typeof invitation.inviter_name === 'string') &&
    typeof invitation.created_at === 'string'
  )
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
