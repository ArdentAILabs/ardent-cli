# Security policy

The Ardent CLI runs on developer workstations and CI runners. It holds credentials that authorize
changes to a customer's Ardent organization, and it is installed from a public package registry.
Its threat model is therefore credential custody and supply-chain integrity: the CLI is not a
service an attacker can reach across the network, but a compromised copy of it — or a leaked token
it was holding — hands over an entire organization.

## Reporting a vulnerability

Two private channels, both read by the same people. Use whichever you prefer:

- **Email security@tryardent.com.** Always available, and the right channel for anything involving
  a live credential that needs revoking now.
- **GitHub private vulnerability reporting** — the *Report a vulnerability* button on this
  repository's Security tab, which GitHub offers on public repositories. It opens a thread visible
  only to maintainers, and nothing becomes public until an advisory is published. If the button is
  not on the Security tab, use email.

Include enough detail to reproduce: the CLI version, the operating system, the command you ran, and
the steps or proof-of-concept that demonstrate impact.

Do not open a public issue, pull request, or code-review comment for a suspected vulnerability, and
take care not to paste real API keys into your report — redact them.

If you want an encrypted channel, send a first message with no technical detail saying so, and one
will be arranged.

## What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement that a person has read your report | 3 business days |
| Initial assessment: reproduced or not, severity, remediation plan | 10 business days |
| Status updates until the report is resolved | every 10 business days |

Please allow 90 days from acknowledgement before disclosing publicly. If a fix will take longer, we
will tell you why and agree on a date rather than let the clock run out silently.

Ardent does not run a paid bug-bounty program. Reporters are credited by name in the security
advisory for the fix unless they ask not to be.

## Scope

The source in this repository, and the behavior of the published package built from it.

**Credential custody.** In scope: where the CLI writes API keys and tokens and with what file
permissions; credentials leaked into terminal output, log files, debug bundles, crash reports, or
telemetry; credentials exposed to other local users through process arguments or the environment;
tokens that survive logout or outlive their intended lifetime.

**Talking to the control plane.** In scope: failure to verify TLS certificates for the API host;
honoring an attacker-supplied base URL or proxy setting in a way that silently redirects
credentials; and following a redirect that sends credentials to a host other than the configured
one.

**Handling untrusted input.** The CLI parses local configuration and control-plane responses. In
scope: path traversal or arbitrary file write when it persists local context, and code execution
triggered by a malicious or compromised API response.

**Supply chain.** In scope: compromise of the published package or of the pipeline that builds and
publishes it; install or postinstall scripts that execute unexpected code; a dependency that exfiltrates
data at install or run time; and anything that would let a third party publish under the Ardent
package name.

**Fail-closed targeting.** The CLI is required to keep the target of a destructive command visible
and to fail closed rather than quietly default to production. A defect that causes a destructive
command to act on production without the operator selecting it is handled as a security issue, not
an ordinary bug.

## What is not a vulnerability

- **An attacker who already has code execution or filesystem access as your user.** The CLI stores
  credentials that your own account can read. It cannot defend your account against itself.
- **That credentials are stored on disk at all.** That is how a CLI stays usable between
  invocations. A report about *how* they are stored — permissions, location, lifetime — is in scope.
- **Shell history, shoulder-surfing, or "run this command" social engineering**, absent a defect in
  the CLI itself.
- **Scanner CVEs in development-only dependencies** that are not shipped in the published package,
  absent a path to exploitation.
- **A key you leaked yourself**, for example by committing it to a public repository. Email the same
  address so it can be revoked quickly — that is incident response, and it is welcome, but it is not
  a vulnerability in the CLI.
