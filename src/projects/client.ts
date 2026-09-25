import {randomUUID} from 'node:crypto'

import {request, requestDurableMutation} from '../api/client.js'

export interface Project {
  created_at: string
  id: string
  name: string
  organization_id: string
  updated_at: string
}

export async function listProjects(token: string, organizationID: string): Promise<Project[]> {
  const projects = await request<Project[]>(
    token,
    `/projects?organization_id=${encodeURIComponent(organizationID)}`,
  )
  if (
    !Array.isArray(projects) ||
    projects.some((project) => !isProject(project, organizationID)) ||
    new Set(projects.map(({id}) => id)).size !== projects.length ||
    new Set(projects.map(({name}) => name)).size !== projects.length
  ) {
    throw new Error('Ardent API returned an invalid projects response.')
  }

  return projects
}

export async function createProject(token: string, organizationID: string, name: string): Promise<Project> {
  const project = await requestDurableMutation<Project>(token, '/projects', {
    body: JSON.stringify({name, organization_id: organizationID}),
    headers: {'Idempotency-Key': randomUUID()},
    method: 'POST',
  }, 'ardent-beta project list')
  if (!isProject(project, organizationID)) throw new Error('Ardent API returned an invalid project response.')
  return project
}

export async function deleteProject(token: string, organizationID: string, projectID: string): Promise<void> {
  const response = await requestDurableMutation<unknown>(
    token,
    `/projects/${encodeURIComponent(projectID)}?organization_id=${encodeURIComponent(organizationID)}`,
    {method: 'DELETE'},
    'ardent-beta project list',
  )
  if (response !== undefined) {
    throw new Error('Ardent API did not confirm project deletion. Run ardent-beta project list before retrying.')
  }
}

function isProject(value: unknown, organizationID: string): value is Project {
  if (typeof value !== 'object' || value === null) return false
  const project = value as Partial<Project>
  return (
    typeof project.id === 'string' &&
    project.id.length > 0 &&
    project.organization_id === organizationID &&
    typeof project.name === 'string' &&
    project.name.length > 0 &&
    typeof project.created_at === 'string' &&
    typeof project.updated_at === 'string'
  )
}
