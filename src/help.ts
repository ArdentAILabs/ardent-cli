import {type Command, ux} from '@oclif/core'
import {getHelpFlagAdditions, Help} from '@oclif/core/help'

import {loadSession} from './auth/credentials.js'

type GroupedCommand = Command.Loadable & {helpGroup?: unknown}

export default class ArdentHelp extends Help {
  public async showHelp(arguments_: string[]): Promise<void> {
    const rootHelp = arguments_.every((argument) => getHelpFlagAdditions(this.config).includes(argument))
    if (!rootHelp) return super.showHelp(arguments_)

    const authenticated = await this.authenticated()
    if (arguments_.length > 0 || authenticated) {
      this.showArdentHelp(authenticated)
      return
    }

    this.log('Get started:')
    this.log('')
    this.log(ux.colorize('green', '  ardent-beta login                    Standard CLI login'))
    this.log('  ardent-beta login --token <token>    Non-interactive login (CI and automation)')
    this.log('')
    this.log('For all commands:')
    this.log('')
    this.log('  ardent-beta --help')
  }

  private async authenticated(): Promise<boolean> {
    try {
      return (await loadSession(this.config.configDir)) !== undefined
    } catch {
      return false
    }
  }

  private showArdentHelp(authenticated: boolean): void {
    this.log(`Ardent CLI ${ux.colorize('dim', `v${this.config.version}`)}`)
    this.log('')
    this.log(this.section('USAGE', '$ ardent-beta <command>'))

    const groups = new Map<string, GroupedCommand[]>()
    for (const command of this.sortedCommands as GroupedCommand[]) {
      if (command.hidden || command.pluginName !== this.config.name || typeof command.helpGroup !== 'string') continue
      const commands = groups.get(command.helpGroup) ?? []
      commands.push(command)
      groups.set(command.helpGroup, commands)
    }

    for (const [group, commands] of groups) {
      const rows: Array<[string, string | undefined]> = commands.map((command) => {
        const name = `ardent-beta ${command.id.replaceAll(':', ' ')}`
        return [!authenticated && command.id === 'login' ? ux.colorize('green', name) : name, this.summary(command)]
      })

      this.log('')
      this.log(this.section(group.toUpperCase(), rows))
    }
  }
}
