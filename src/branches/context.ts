import {saveSession, type BranchIdentity, type Session} from '../auth/credentials.js'

export async function replaceBranchCache(directory: string, session: Session, branches: BranchIdentity[]): Promise<Session> {
  const identities = branches.map(({id, name, connector_id}) => ({id, name, connector_id}))
  const selectedBranch = identities.find(({id}) => id === session.selectedBranch?.id)
  const updated = {...session, branches: identities, selectedBranch}
  if (!selectedBranch) delete updated.selectedBranch
  await saveSession(directory, updated)
  return updated
}
