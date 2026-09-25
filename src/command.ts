import {Command} from '@oclif/core'

import {APIError} from './api/client.js'
import {terminalText} from './terminal.js'

export abstract class ArdentCommand extends Command {
  public static enableJsonFlag = true

  protected async catch(error: Error): Promise<void> {
    if (error instanceof APIError && !this.jsonEnabled()) {
      const displayError = new APIError(
        terminalText(error.message),
        error.status,
        error.code === undefined ? undefined : terminalText(String(error.code)),
      )
      displayError.stack = error.stack?.replace(error.message, () => displayError.message)
      return super.catch(displayError)
    }

    return super.catch(error)
  }
}
