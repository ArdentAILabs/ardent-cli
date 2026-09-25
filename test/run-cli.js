import {spawn} from 'node:child_process'

export const runCLI = (arguments_, configHome, environment = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/run.js', ...arguments_], {
      cwd: process.cwd(),
      env: {...process.env, ARDENT_TOKEN: '', XDG_CONFIG_HOME: configHome, ...environment},
    })
    let stderr = ''
    let stdout = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.on('error', reject)
    child.on('close', (status) => resolve({status, stderr, stdout}))
  })
