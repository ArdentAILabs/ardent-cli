import {terminalText} from '../terminal.js'

const DEFAULT_TIMEOUT_MS = 10_000
const DURABLE_MUTATION_TIMEOUT_MS = 90_000

export const API_URL = process.env.ARDENT_API_URL || 'https://production.tryardent.com'

export class APIError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly workflowID?: string,
    public readonly location?: string,
  ) {
    super(message)
  }
}

export async function requestDurableMutation<T>(
  token: string,
  path: string,
  init: RequestInit,
  refreshCommand: string,
): Promise<T> {
  // The API can await its durable workflow for 75 seconds. Allow response transit
  // time too, without replacing an explicit caller deadline or retrying a write.
  try {
    return await request<T>(token, path, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(DURABLE_MUTATION_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status !== 503 || error.code !== 'workflow_result_timeout') throw error
      const workflow = error.workflowID ? ` Workflow: ${terminalText(error.workflowID)}.` : ''
      const location = error.location ? ` Check its status with an authenticated GET ${terminalText(error.location)}.` : ''
      error.message = `The mutation was still running when the API stopped waiting.${workflow}${location} Run ${refreshCommand} to refresh resource state; confirm the workflow outcome before retrying.`
      throw error
    }

    throw new Error(`The mutation response was not received completely; completion is unknown and work may still be running. Run ${refreshCommand} to refresh resource state and confirm the outcome before retrying.`, {cause: error})
  }
}

export async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  return requestJSON<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })
}

export async function requestWithoutAuthentication<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestJSON<T>(path, init)
}

async function requestJSON<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(new URL(path, `${API_URL}/`), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : {'Content-Type': 'application/json'}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch (error) {
    throw new Error(`Could not reach the Ardent API: ${error instanceof Error ? error.message : String(error)}`)
  }

  const text = await response.text()
  if (!response.ok) {
    let detail: unknown
    try {
      detail = JSON.parse(text)
    } catch {
      // Plain-text errors still receive the status-based fallback below.
    }

    const fields = typeof detail === 'object' && detail !== null ? detail as Record<string, unknown> : {}
    throw new APIError(
      typeof fields.message === 'string' ? fields.message : `Ardent API request failed with HTTP ${response.status}.`,
      response.status,
      typeof fields.error === 'string' ? fields.error : undefined,
      typeof fields.workflow_id === 'string' ? fields.workflow_id : undefined,
      response.headers.get('Location') ?? undefined,
    )
  }

  if (response.status === 204) return undefined as T

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Ardent API returned an invalid JSON response.')
  }
}
