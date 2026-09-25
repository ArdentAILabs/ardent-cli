import {loadSession} from '../auth/credentials.js'
import {ArdentCommand} from '../command.js'

export default class Status extends ArdentCommand {
  public static description = 'Show your Ardent login status'
  public static helpGroup = 'Authentication'

  public async run(): Promise<{authenticated: boolean}> {
    const session = await loadSession(this.config.configDir)
    const result = {authenticated: session !== undefined}

    if (!this.jsonEnabled()) {
      if (session === undefined) {
        this.log('Not logged in to Ardent')
      } else {
        this.log('✓ Logged in to Ardent')
      }
    }

    return result
  }
}
