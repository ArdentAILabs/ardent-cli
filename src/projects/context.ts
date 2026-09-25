import {saveSession, type ProjectIdentity, type Session} from '../auth/credentials.js'
import type {Project} from './client.js'

export async function replaceProjectCache(directory: string, session: Session, projects: Project[]): Promise<Session> {
  const identities = projects.map(projectIdentity)
  const selectedProject =
    identities.find(({id}) => id === session.selectedProject?.id) ??
    (identities.length === 1 ? identities[0] : undefined)
  const updated = {...session, projects: identities, selectedProject}
  if (selectedProject === undefined) delete updated.selectedProject
  if (!updated.selectedProject || session.selectedProject?.id !== updated.selectedProject.id) {
    delete updated.connectors
    delete updated.selectedConnector
    delete updated.branches
    delete updated.selectedBranch
  }
  await saveSession(directory, updated)
  return updated
}

export async function selectProject(
  directory: string,
  session: Session,
  project: ProjectIdentity,
): Promise<Session> {
  const selectedProject = projectIdentity(project)
  const projects = [...(session.projects ?? [])]
  const existingIndex = projects.findIndex(({id}) => id === selectedProject.id)
  if (existingIndex === -1) projects.push(selectedProject)
  else projects[existingIndex] = selectedProject
  const updated = {...session, projects, selectedProject}
  if (!updated.selectedProject || session.selectedProject?.id !== updated.selectedProject.id) {
    delete updated.connectors
    delete updated.selectedConnector
    delete updated.branches
    delete updated.selectedBranch
  }
  await saveSession(directory, updated)
  return updated
}

export function cachedProjectNamed(session: Session, name: string): ProjectIdentity | undefined {
  return session.projects?.find((project) => project.name === name)
}

function projectIdentity(project: ProjectIdentity): ProjectIdentity {
  return {id: project.id, name: project.name}
}
