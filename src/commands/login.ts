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
    // Oclif discards an empty environment value, so without this an ARDENT_TOKEN
    // that expands to nothing, such as a missing CI secret, would start a
    // 30-minute browser login instead of failing.
    if (flags.token === undefined && process.env.ARDENT_TOKEN !== undefined) {
      this.error('ARDENT_TOKEN is set but empty. Set it to an Ardent API token, or unset it to log in with the browser.')
    }

    const organizations = flags.token !== undefined
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
