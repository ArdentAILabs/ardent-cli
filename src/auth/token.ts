import {request} from '../api/client.js'
import {saveSession} from './credentials.js'

export interface Organization {
  id: string
  name: string
}

export async function loginWithToken(directory: string, value: string, signal?: AbortSignal): Promise<Organization[]> {
  const token = value.trim()
  if (!token) throw new Error('Ardent API token cannot be empty.')

  const organizations = await request<Organization[]>(token, '/organizations', {signal})
  if (
    !Array.isArray(organizations) ||
    organizations.some(
      (organization) =>
        typeof organization !== 'object' ||
        organization === null ||
        typeof organization.id !== 'string' ||
        organization.id.length === 0 ||
        typeof organization.name !== 'string' ||
        organization.name.length === 0,
    )
  ) {
    throw new Error('Ardent API returned an invalid organization response.')
  }
  if (organizations.length !== 1) throw new Error('Ardent API token must belong to exactly one organization.')

  signal?.throwIfAborted()
  await saveSession(directory, {organization: organizations[0], token})
  return organizations
}
