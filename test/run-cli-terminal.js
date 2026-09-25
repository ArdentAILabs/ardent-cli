import {spawn} from 'node:child_process'
import {stripVTControlCharacters} from 'node:util'

export const terminalSupported = ['darwin', 'linux'].includes(process.platform)

// macOS script accepts an argv; util-linux script accepts a shell command.
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`

export function runCLIInTerminal(t, args, configHome, environment, answer) {
  const command = [process.execPath, 'bin/run.js', ...args]
  const scriptArgs = process.platform === 'darwin'
    ? ['-q', '/dev/null', ...command]
    : ['-q', '-e', '-c', command.map(shellQuote).join(' '), '/dev/null']
  // Node's piped stdin is a socket, which macOS script rejects. cat supplies a
  // real pipe; the completion marker lets us close cat's input when script exits.
  const shellCommand = `cat | { ${['script', ...scriptArgs].map(shellQuote).join(' ')}; printf '\\036ARDENT_EXIT:%d\\036' "$?"; }`
  const child = spawn('/bin/sh', ['-c', shellCommand], {
    detached: true,
    env: {...process.env, CI: '', TERM: 'xterm-256color', SHELL: '/bin/sh', ARDENT_TOKEN: '', XDG_CONFIG_HOME: configHome, ...environment},
  })
  let output = ''
  let answered = false
  let timedOut = false
  let closed = false
  let commandStatus
  const stop = () => {
    if (closed) return
    // Interrupt the terminal's foreground command, then close its PTY by
    // terminating script's process group, including its output relay.
    child.stdin.write('\x03')
    try { process.kill(-child.pid, 'SIGTERM') } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  const timer = setTimeout(() => { timedOut = true; stop() }, 15_000)
  const collect = (chunk) => {
    output += chunk
    const completion = /\x1eARDENT_EXIT:(\d+)\x1e/.exec(output)
    if (completion) {
      commandStatus = Number(completion[1])
      output = output.replace(completion[0], '')
      child.stdin.end()
    }
    if (!answered && answer !== undefined && /Select a connector by number(?: \[[^\]]*\])?: /.test(stripVTControlCharacters(output))) {
      answered = true
      child.stdin.write(`${answer}\n`)
    }
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.stdin.on('error', () => {})
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (status) => {
      closed = true
      clearTimeout(timer)
      resolve({status: commandStatus ?? (status || 1), timedOut, output: stripVTControlCharacters(output)})
    })
  })
  t.after(async () => { stop(); await finished })
  return {finished, get output() { return stripVTControlCharacters(output) }}
}
