import {randomUUID} from 'node:crypto'
import {chmod, mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

export interface Session {
  organization?: {
    id: string
    name: string
  }
  projects?: ProjectIdentity[]
  selectedProject?: ProjectIdentity
  connectors?: ConnectorIdentity[]
  selectedConnector?: ConnectorIdentity
  branches?: BranchIdentity[]
  selectedBranch?: BranchIdentity
  token: string
}

export interface ConnectorIdentity {
  id: string
  name: string
  project_id: string
}

export interface BranchIdentity {
  id: string
  name: string
  connector_id: string
}

export interface ProjectIdentity {
  id: string
  name: string
}

const configPath = (directory: string) => join(directory, 'config.json')

export async function loadSession(directory: string): Promise<Session | undefined> {
  let contents: string
  try {
    contents = await readFile(configPath(directory), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }

  try {
    const session = JSON.parse(contents) as Partial<Session>
    if (typeof session.token !== 'string' || session.token.length === 0) throw new Error()
    if (session.organization === undefined) {
      if (session.projects !== undefined || session.selectedProject !== undefined || session.connectors !== undefined || session.selectedConnector !== undefined || session.branches !== undefined || session.selectedBranch !== undefined) throw new Error()
      return {token: session.token}
    }
    if (
      typeof session.organization !== 'object' ||
      session.organization === null ||
      typeof session.organization.id !== 'string' ||
      session.organization.id.length === 0 ||
      typeof session.organization.name !== 'string' ||
      session.organization.name.length === 0
    ) {
      throw new Error()
    }

    let projects: ProjectIdentity[] | undefined
    if (session.projects !== undefined) {
      if (!Array.isArray(session.projects) || session.projects.some((project) => !isProjectIdentity(project))) throw new Error()
      projects = session.projects.map(({id, name}) => ({id, name}))
      if (new Set(projects.map(({id}) => id)).size !== projects.length) throw new Error()
      if (new Set(projects.map(({name}) => name)).size !== projects.length) throw new Error()
    }

    let selectedProject: ProjectIdentity | undefined
    if (session.selectedProject !== undefined) {
      if (!isProjectIdentity(session.selectedProject) || projects === undefined) throw new Error()
      selectedProject = projects.find(({id, name}) => id === session.selectedProject?.id && name === session.selectedProject.name)
      if (!selectedProject) throw new Error()
    }

    let connectors: ConnectorIdentity[] | undefined
    if (session.connectors !== undefined) {
      if (!selectedProject || !Array.isArray(session.connectors) || session.connectors.some((connector) => !isProjectIdentity(connector) || connector.project_id !== selectedProject.id)) throw new Error()
      connectors = session.connectors.map(({id, name, project_id}) => ({id, name, project_id}))
      if (new Set(connectors.map(({id}) => id)).size !== connectors.length || new Set(connectors.map(({name}) => name)).size !== connectors.length) throw new Error()
    }
    let selectedConnector: ConnectorIdentity | undefined
    if (session.selectedConnector !== undefined) {
      if (!isProjectIdentity(session.selectedConnector) || !connectors) throw new Error()
      selectedConnector = connectors.find(({id, name, project_id}) => id === session.selectedConnector?.id && name === session.selectedConnector.name && project_id === session.selectedConnector.project_id)
      if (!selectedConnector) throw new Error()
    }
    let branches: BranchIdentity[] | undefined
    if (session.branches !== undefined) {
      if (!selectedConnector || !Array.isArray(session.branches) || session.branches.some((branch) => !isProjectIdentity(branch) || branch.connector_id !== selectedConnector.id)) throw new Error()
      branches = session.branches.map(({id, name, connector_id}) => ({id, name, connector_id}))
      if (new Set(branches.map(({id}) => id)).size !== branches.length || new Set(branches.map(({name}) => name)).size !== branches.length) throw new Error()
    }
    let selectedBranch: BranchIdentity | undefined
    if (session.selectedBranch !== undefined) {
      if (!isProjectIdentity(session.selectedBranch) || !branches) throw new Error()
      selectedBranch = branches.find(({id, name, connector_id}) => id === session.selectedBranch?.id && name === session.selectedBranch.name && connector_id === session.selectedBranch.connector_id)
      if (!selectedBranch) throw new Error()
    }

    return {
      ...(connectors === undefined ? {} : {connectors}),
      ...(selectedConnector === undefined ? {} : {selectedConnector}),
      ...(branches === undefined ? {} : {branches}),
      ...(selectedBranch === undefined ? {} : {selectedBranch}),
      organization: session.organization,
      ...(projects === undefined ? {} : {projects}),
      ...(selectedProject === undefined ? {} : {selectedProject}),
      token: session.token,
    }
  } catch {
    throw new Error(`Ardent configuration at ${configPath(directory)} is invalid. Run ardent-beta logout, then log in again.`)
  }
}

function isProjectIdentity(value: unknown): value is ProjectIdentity {
  if (typeof value !== 'object' || value === null) return false
  const project = value as Partial<ProjectIdentity>
  return typeof project.id === 'string' && project.id.length > 0 && typeof project.name === 'string' && project.name.length > 0
}

export async function saveSession(directory: string, session: Session): Promise<void> {
  await mkdir(directory, {mode: 0o700, recursive: true})
  await chmod(directory, 0o700)

  const destination = configPath(directory)
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(session, undefined, 2)}\n`, {flag: 'wx', mode: 0o600})
    await rename(temporary, destination)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

export async function clearSession(directory: string): Promise<void> {
  await unlink(configPath(directory)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}
