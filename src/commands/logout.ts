import {clearSession} from '../auth/credentials.js'
import {ArdentCommand} from '../command.js'

export default class Logout extends ArdentCommand {
  public static description = 'Log out of Ardent on this device'
  public static helpGroup = 'Authentication'

  public async run(): Promise<{authenticated: false}> {
    await clearSession(this.config.configDir)
    if (!this.jsonEnabled()) this.log('✓ Logged out of Ardent')
    return {authenticated: false}
  }
}
