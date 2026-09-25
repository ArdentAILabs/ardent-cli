import {spawn} from 'node:child_process'

// ARDENT_TOKEN is left unset unless a test supplies it: spawn ignores undefined
// values, and an empty one is a refused login. A timeoutMs kills the command
// and resolves with a null status, for tests where a regression would wait.
export const runCLI = (arguments_, configHome, environment = {}, {timeoutMs} = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/run.js', ...arguments_], {
      cwd: process.cwd(),
      env: {...process.env, ARDENT_TOKEN: undefined, XDG_CONFIG_HOME: configHome, ...environment},
    })
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => child.kill(), timeoutMs)
    let stderr = ''
    let stdout = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.on('error', reject)
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({status, stderr, stdout})
    })
  })
