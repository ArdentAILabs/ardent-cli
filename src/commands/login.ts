import {Flags} from '@oclif/core'

import {loginWithBrowser} from '../auth/browser.js'
import {loginWithToken, type Organization} from '../auth/token.js'
import {ArdentCommand} from '../command.js'
import {terminalText} from '../terminal.js'

export default class Login extends ArdentCommand {
  public static description = 'Log in to Ardent'
  public static helpGroup = 'Authentication'

  public static flags = {
    token: Flags.string({description: 'Existing Ardent API token', env: 'ARDENT_TOKEN'}),
  }

  public async run(): Promise<{authenticated: true; organizations: Organization[]}> {
    const {flags} = await this.parse(Login)
    const organizations = flags.token
      ? await loginWithToken(this.config.configDir, flags.token)
      : await loginWithBrowser(this.config.configDir, {
          onAuthorizationURL: (url, opened) => {
            this.log(opened ? 'Opening Ardent in your browser…' : `Open this URL to log in:\n\n${url}`)
            this.log('Complete login in your browser. Keep this terminal open.')
          },
        })

    this.log('✓ Logged in to Ardent')
    if (organizations.length === 1) this.log(`  Organization: ${terminalText(organizations[0].name)} (${terminalText(organizations[0].id)})`)
    else this.log(`  Organizations: ${organizations.length}`)

    return {authenticated: true, organizations}
  }
}
