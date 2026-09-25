import {spawn} from 'node:child_process'
import {createHash, randomBytes} from 'node:crypto'
import {createServer, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {setTimeout as wait} from 'node:timers/promises'

import {APIError, API_URL, requestWithoutAuthentication} from '../api/client.js'
import {loginWithToken, type Organization} from './token.js'

const LOGIN_TIMEOUT_MS = 30 * 60 * 1000

interface BrowserLoginOptions {
  onAuthorizationURL?: (url: string, opened: boolean) => void
  open?: (url: string) => Promise<void>
  timeoutMs?: number
}

interface ExchangeResponse {
  key: string
}

export async function loginWithBrowser(directory: string, options: BrowserLoginOptions = {}): Promise<Organization[]> {
  const state = randomValue()
  const verifier = randomValue()
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const deadline = new AbortController()
  let callbackURI = ''
  let exchanging = false
  let resolveLogin: (organizations: Organization[]) => void
  let rejectLogin: (error: Error) => void
  const completion = new Promise<Organization[]>((resolve, reject) => {
    resolveLogin = resolve
    rejectLogin = reject
  })

  const server = createServer(async (request, response) => {
    const callback = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method !== 'GET' || callback.pathname !== '/callback') {
      response.writeHead(404).end()
      return
    }
    if (callback.searchParams.get('state') !== state) {
      browserResponse(response, 400, 'Ardent CLI login was rejected because the request did not match.')
      return
    }
    const authorizationError = callback.searchParams.get('error')
    if (authorizationError) {
      const error = new Error(`Ardent CLI login was not authorized: ${authorizationError}`)
      browserResponse(response, 400, error.message, () => rejectLogin(error))
      return
    }
    const code = callback.searchParams.get('code')
    if (!code || exchanging) {
      browserResponse(response, 400, 'Ardent CLI login could not be completed.')
      return
    }

    exchanging = true
    try {
      const token = await exchange(code, verifier, deadline.signal)
      const organizations = await loginWithToken(directory, token, deadline.signal)
      browserResponse(response, 200, 'Return to your terminal to continue. You can close this tab.', () => resolveLogin(organizations))
    } catch (error) {
      const loginError = error instanceof Error ? error : new Error(String(error))
      browserResponse(response, 500, 'Ardent CLI login failed. Return to your terminal for details.', () => rejectLogin(loginError))
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  callbackURI = `http://127.0.0.1:${address.port}/callback`
  const authorizationURL = new URL('/auth/cli', `${API_URL}/`)
  authorizationURL.search = new URLSearchParams({
    callback_uri: callbackURI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()

  let opened = true
  try {
    await (options.open ?? openBrowser)(authorizationURL.toString())
  } catch {
    opened = false
  }
  options.onAuthorizationURL?.(authorizationURL.toString(), opened)

  const timeout = setTimeout(() => {
    deadline.abort()
    rejectLogin(new Error('Ardent CLI login timed out. Run ardent-beta login to try again.'))
  }, options.timeoutMs ?? LOGIN_TIMEOUT_MS)
  try {
    return await completion
  } finally {
    clearTimeout(timeout)
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }
}

async function exchange(code: string, verifier: string, signal: AbortSignal): Promise<string> {
  for (;;) {
    try {
      const result = await requestWithoutAuthentication<ExchangeResponse>('/auth/cli/exchange', {
        body: JSON.stringify({code, code_verifier: verifier}),
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
      })
      if (typeof result.key !== 'string' || result.key.length === 0) throw new Error('Ardent API returned an invalid CLI credential.')
      return result.key
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== 503 || error.code !== 'workflow_result_timeout') throw error
      await wait(5000, undefined, {signal})
    }
  }
}

function randomValue(): string {
  return randomBytes(32).toString('base64url')
}

function browserResponse(response: ServerResponse, status: number, message: string, complete?: () => void): void {
  response.writeHead(status, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'})
  const escapedMessage = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const succeeded = status < 400
  response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ardent CLI</title>
  <style>
    * { box-sizing: border-box; }
    html { color-scheme: dark; }
    body { margin: 0; background: #0a0a0a; color: #f4f4f5; font-family: "Helvetica Neue", Helvetica, sans-serif; }
    header { display: flex; height: 48px; align-items: center; border-bottom: 1px solid #242424; padding: 0 20px; color: #d4d4d8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 600; letter-spacing: .16em; }
    main { min-height: calc(100vh - 48px); display: grid; place-items: center; padding: 24px; }
    section { width: 100%; max-width: 400px; border: 1px solid #2a2a2a; background: #111; }
    .content { padding: 24px; }
    .status { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: ${succeeded ? '#22c55e' : '#f87171'}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; }
    .indicator { width: 7px; height: 7px; background: currentColor; }
    h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.2; letter-spacing: -.02em; }
    p { margin: 0; color: #a1a1aa; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body><header>ARDENT</header><main><section><div class="content"><div class="status"><span class="indicator"></span>${succeeded ? 'Connected' : 'Not connected'}</div><h1>${succeeded ? 'You\'re signed in' : 'Login failed'}</h1><p>${escapedMessage}</p></div></section></main></body>
</html>`, complete)
}

async function openBrowser(url: string): Promise<void> {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open'
  const arguments_ = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, {detached: true, stdio: 'ignore'})
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
