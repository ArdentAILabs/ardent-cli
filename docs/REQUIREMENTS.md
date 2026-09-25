# CLI requirements

What must be true of this component, the mechanism enforcing each requirement,
and what is owed.

One of three documents this component keeps under `docs/`: this is what must
hold, `docs/EVIDENCE.md` is what was measured and how, `docs/DECISIONS.md` is
why a choice was made and what it displaced.

**This directory is exported one way to a mirror repository**, where these files
sit under `docs/` at the root with nothing above them. Every path below is
relative to this directory, and no sibling component is named by path, because a
reader of the mirror cannot resolve one. Where a requirement depends on the
control plane, the dependency is stated in words.

**A requirement names the mechanism that enforces it.** `AGENTS.md` requires
that "Work that is owed is stated as owed", so a requirement with no mechanism
is written in the Met and owed accounting rather than asserted here. Where a
mechanism covers less than the sentence would, the sentence is narrowed.

**`README.md` carries the implementation status**, and this document does not
restate it. A requirement here constrains behavior that exists; the inventory of
what exists has one home and it is not this file.

**Verified against the working tree, 2026-09-15; re-checked 2026-09-25.** Every
mechanism named below was read on the first date, and `docs/EVIDENCE.md` records
which of them were also mutation-tested and which survived their guard being
deleted. The re-check confirmed that every test and symbol named here exists and
corrected the statements it found false; it did not re-read every mechanism.

## Index

1. Boundary
2. Credential custody
3. Login
4. Local context
5. Target visibility and fail-closed refusal
6. Request construction and response validation
7. Long-running operations
8. Terminal output
9. Distribution
10. Met and owed
11. Explicit non-goals

---

## 1. Boundary

The CLI is a customer client for the control-plane API. It owns authentication
UX, local context, request construction, workflow-status polling, and terminal
output. `ARDENT_CLI_DEVELOPMENT.md` under "Repository boundary" is the home of
that argument and it is named, not restated, here.

**Its request and response types are its own.** Every wire shape the CLI reads
is declared in this repository next to the function that reads it, and every one
of them is validated before it reaches a command. Seven have a named predicate —
`isProject`, `isMembership`, `isInvitation`, `isConnector`,
`isConnectorRegistration`, `isConnectorRegistrationStatus`, `isBranch` — while
`BranchOperation` is checked by `validateOperation` and `Organization` inline in
`loginWithToken`.

**A file outside `src/` cannot compile into the package.** `tsconfig.json` sets
`rootDir` to `src` and `include` to `src/**/*.ts`, so an import reaching a
sibling directory fails `npm run typecheck` and `npm run build` with TypeScript's
`TS6059`. That is the only mechanical part of the no-shared-code rule.
**Nothing mechanically refuses a new dependency**, and the dependency set is an
approval boundary held by review; see the Met and owed accounting.

## 2. Credential custody

> The session file is the only place this component writes a credential.

**2.1 It is written at mode `0600` inside a directory at mode `0700`.**
`saveSession` creates the directory with mode `0o700`, chmods it to `0o700` on
every write, writes a temporary file with `flag: 'wx'` and mode `0o600`, then
renames it over the destination. The rename is what makes a concurrent reader
see either the old file or the new one. A failure before the rename unlinks the
temporary file and rethrows. `stores, overwrites, and clears a local session`
asserts both modes. `narrows an existing wide session directory before saving
credentials` starts at `0755` and asserts the parent becomes `0700`.

**2.2 A credential that did not validate is never written.** `loginWithToken`
requests `/organizations`, validates the response shape, requires exactly one
organization, and re-checks the abort signal before calling `saveSession`. Four
tests assert that nothing is stored on each failure: `does not store a rejected
token`, `does not store malformed successful responses`, `rejects an empty
token`, `requires the API token to identify one organization`.

**2.3 `logout` removes the file and tolerates its absence.** `clearSession`
swallows `ENOENT` only and rethrows anything else. `removes the local session`
asserts the file is gone; `stores, overwrites, and clears a local session` calls
it twice.

**2.4 `logout` is local.** Nothing in this component revokes a credential
server-side, and no sentence anywhere may say a logged-out token is dead. The
only thing that changes is this machine.

**2.5 `status` reports whether a local session file exists and parses**, not
whether its credential is still valid. `Status` calls `loadSession` and makes no
request. `reports whether a local session exists` is the test, and its name is
the honest form of the claim.

**2.6 The exercised authentication outputs omit the stored token.**
`keeps credentials out of token login, status, and logout output` checks stdout
and stderr on successful human and JSON paths, with both flag and environment
token login. The negative browser-callback tests inspect the refused callback
and subsequent successful callback bodies. A guarantee across every output
path remains owed — see the Met and owed accounting.

## 3. Login

> There are two login paths and no third.

**3.1 The browser path binds the callback with PKCE.** `loginWithBrowser`
generates a 32-byte random `state` and a 32-byte random verifier, sends the
verifier's SHA-256 as `code_challenge` with `code_challenge_method=S256`, and
serves one loopback endpoint: a `GET` on `/callback` at an OS-assigned port on
`127.0.0.1`. Anything else is answered `404`. `exchanges a PKCE-bound loopback
callback and saves the CLI credential` asserts the challenge is the SHA-256 of
the verifier the exchange later sends, and that the returned key is what lands
in the session. `rejects a mismatched callback state without exchanging or
saving a credential` asserts a `400`, no exchange request and no session, then
completes login with the valid state.

**3.2 The CLI proves it holds the verifier; nothing here proves the receiver
checks it.** PKCE is only worth what the authorization server enforces, and that
enforcement is the control plane's. This component's half is that the verifier
never leaves the process except in the exchange body.

**3.3 The exchange runs once and is abandoned on the deadline.** A callback with
no code, or a second callback while an exchange is in flight, is answered `400`
and changes nothing. The exchange retries only a `503` whose `error` code is
`workflow_result_timeout`, waiting five seconds under the login abort signal, so
the deadline cancels a pending retry rather than letting it complete. `stops an
active exchange when browser login times out` asserts exactly one exchange
attempt and no saved session. `rejects a concurrent callback replay while the
first exchange is pending` holds the first exchange open, asserts the replay
receives `400` without saving a session, then releases the original exchange
and checks that only one exchange and organization lookup occurred.

**3.4 The login deadline is 30 minutes** by default, overridable only from
inside the process by the option `loginWithBrowser` takes for its own tests. A
browser that never returns leaves no session.

**3.5 The token path exists for CI and automation.** `login --token` reads
`ARDENT_TOKEN` when the flag is absent, and `loginWithToken` trims the value and
refuses an empty one. A token that is supplied but empty never falls back to
browser login: an empty or blank `--token`, and a blank `ARDENT_TOKEN`, reach
`loginWithToken`'s refusal; an empty `ARDENT_TOKEN`, which Oclif discards before
the command sees it, is refused by `Login.run` itself. `refuses an empty token
instead of starting browser login` drives all four with no browser opener on
`PATH` and asserts a nonzero exit, no request and no session. `exposes token login without an API target flag` asserts
`login --help` offers no API-target flag; `does not require a token flag` asserts
the flag is optional.

**3.6 A login must resolve exactly one organization.** `loginWithToken` refuses
zero or several rather than choosing. Every command that needs an organization
then reads it from the session and refuses when it is absent — the shape a
pre-organization session file takes — which `requires login with organization
context` asserts for `project list`.

## 4. Local context

> Local context is a cache of names and ids. It is never an authority.

**4.1 A session file that violates its own shape is refused, loudly.**
`loadSession` requires a non-empty token; refuses any context field present
without an organization; requires a selected project to be one of the cached
project identities; requires every cached connector to carry the selected
project's id and every cached branch the selected connector's id; requires a
selected connector and a selected branch to be present in their own cached list;
and refuses duplicate ids or duplicate names within any of the three lists. A
violation throws one error naming the file and telling the reader to log out and
log in again. There is no repair path and no partial load. `rejects a corrupted
local session`, `rejects project selection outside the cached project
identities` and `configuration rejects a connector or branch belonging to
another parent` are the tests.

**4.2 Moving a selection drops everything beneath it.**
`replaceProjectCache` and `selectProject` delete the connector and branch
context when the selected project changes or disappears; `replaceConnectorCache`
and `selectConnector` delete the branch context when the selected connector
changes or disappears. `project switching clears connector and branch
selection`, `connector refresh or switching clears stale branch context` and
`project removal clears an unselected connector cache and preserves readable
configuration` are the tests. The invariant this preserves is 4.1's: a child
that outlived its parent is exactly the shape `loadSession` refuses.

**4.3 A cache miss is not an answer.** `project switch` resolves a name against
the cache first, and on a miss asks the organization's list before refusing — so
a project created since the last `project list` switches rather than being
reported absent. `cachedProjectNamed` then `listProjects` is the mechanism;
`switches to a project created since the last list, with no cache present` is
the test. The comment at that call site is the home of the argument for why a
miss is consulted and a hit is not.

**4.4 A stale cache entry is not corrected until something refreshes it.** A
project deleted from another machine still switches locally, because a cached
hit makes no request. `branch switch` does not have that property — it calls
`listBranches` every time and refuses a name the connector no longer has, which
`switch selects by name within the connector and writes only local context`
pins. Stated because 4.3 reads as stronger than it is.

**4.5 List responses must satisfy the cache's identity constraints before a
write.** `listProjects`, `listConnectors` and `listBranches` refuse duplicate
ids or names and empty names before returning a list to a command. The project
and connector command tests exercise duplicate ids, duplicate names and empty
names against a fixture server, then assert that the saved session is unchanged
byte for byte and still loads with its selected project, connector and branch.
`docs/EVIDENCE.md` records the regression measurement.

## 5. Target visibility and fail-closed refusal

`AGENTS.md` states the rule: a command that can create, mutate or delete a
resource "states what it is about to act on, and fails closed rather than
silently targeting production". What that means in this component, precisely:

**5.1 The target is an organization, a project, a connector and a name.** There
is no environment-selection policy here — `ARDENT_CLI_DEVELOPMENT.md` disowns it
— and no command names an environment by a human label, so there is no
production-versus-staging default for one to get wrong. The one placement
argument is `connector create --environment`, which passes an opaque id through
unparsed and omits the field entirely when it is not supplied, leaving the
choice to the control plane. `accepts an explicit environment ID without waiting
outside an interactive terminal` asserts the id reaches the request body. **The
CLI cannot tell what environment such an id names**, so a caller who supplies
one is the only party that knows what it targeted.

**5.2 A destructive command resolves its target against the API, not the
cache.** `project delete` and `member delete` list from the organization and
refuse a name absent from that list. `does not delete a project name absent from
the authoritative list` asserts the refusal costs exactly one `GET` and no
`DELETE`; `does not guess when an email is missing or has multiple matches`
asserts a refusal on zero matches and on more than one.

**5.3 A refusal writes nothing.** `project switch` looks the name up in the
API's response *before* calling `replaceProjectCache`, because that call
persists, drops connector and branch context, and adopts the sole remaining
project when the selected one is gone. `a refused switch leaves the selected
project and its context alone` builds the shape that triggers the adoption and
asserts the session is unchanged after the refusal.

**5.4 An incomplete view is not a licence to delete.** `member delete` reads
memberships and invitations with the strict `listInvitations`, so a login that
cannot read invitations fails the command instead of deleting a membership
without having checked for a matching invitation. `does not delete when pending
invitations cannot be checked` is the test. `member list` uses
`listReadableInvitations` instead and degrades — that asymmetry is deliberate and
`docs/DECISIONS.md` is where it is argued.

**5.5 A deletion is reported only against a `204`.** `request` returns
`undefined` only for status 204; `deleteProject`, `deleteMembership` and
`deleteInvitation` each throw when it returns anything else, naming the command
to run before retrying. `preserves project context unless deletion is confirmed`
and `does not report deletion before the API confirms it` assert a `202` exits
non-zero, prints no success line, and leaves local context alone.

**5.6 Automation never guesses a connector.** `requireConnector` returns a saved
connector without a request outside an interactive terminal; otherwise it
discovers, adopts a sole connector, and **refuses rather than choosing** when
more than one is available and no terminal is there to ask. `uses the sole
discovered connector and refuses ambiguous automation` asserts the outcome and
the request count at zero, one and two connectors. `fails without login or
connector discovery context before making a request` asserts the refusal happens
before any request.

In a terminal, `requireConnector` offers the discovered connectors by number,
uses the current selection on an empty answer, and rejects an invalid number.
`terminal connector picker accepts a number, preserves the current default,
and refuses invalid input` drives those paths through a pseudo-terminal,
including a current selection that is not the first connector.

**5.7 No destructive command asks for confirmation.** The refusal is name
resolution plus a printed target, not a prompt. Stated so nothing documents a
confirmation step that does not exist.

**5.8 `branch create` takes no snapshot or placement argument.** Neither flag is
declared, and Oclif's parser refuses an undeclared flag even though the branch
commands set `strict = false` to accept a name in several words. `refuses
explicit snapshot selection and invalid names` asserts `--mark` and
`--environment` both exit non-zero with no request made. Why a caller cannot name
a snapshot is the control plane's argument, not this component's.

**5.9 A branch name is bounded before it is sent.** `branchName` joins the
variadic arguments, refuses an empty result, refuses more than 128 code points,
and refuses any Unicode control character. The same test covers all three.

## 6. Request construction and response validation

**6.1 One origin, resolved once.** `API_URL` is read from `ARDENT_API_URL` at
module load and defaults to the deployed control plane, so no command can
retarget mid-run and no command takes an origin as an argument. `targets the
deployed control-plane origin` and `accepts a development control-plane origin
from the environment` are the tests; the second runs a separate process because
the value is fixed at import.

**6.2 An authenticated request carries the bearer and asks for JSON.** `request`
sets `Authorization: Bearer <token>`; `requestJSON` sets `Accept:
application/json` and adds `Content-Type: application/json` only when there is a
body. `requestWithoutAuthentication` exists for the one unauthenticated
endpoint, the login exchange.

**6.3 Every request carries a deadline, and the ten-second default applies only
when the caller supplies no signal.** `requestDurableMutation` supplies a
90-second signal for project creation and deletion, invitations, membership
deletion and invitation cancellation; an explicit signal takes precedence.
`requestJSON` otherwise uses `init.signal ?? AbortSignal.timeout(...)`, so the
organization lookup during browser login is bounded by the login deadline.
`gives every synchronous mutation ninety seconds and retains pending recovery
details without replay` asserts both timeout budgets and all five mutation call
sites; `honors an explicit mutation cancellation signal without installing
another deadline` checks cancellation.

**6.4 A transport failure is reported as unreachable by `requestJSON`.**
`requestDurableMutation` instead reports an unknown outcome when transport or
response-body reading fails, naming the list command to refresh resource state
and requiring the outcome to be confirmed before retrying. It never replays the
mutation. `reports an unknown outcome when a mutation deadline expires before
headers or during the body` injects both interruptions and checks one attempt.

**6.5 A non-2xx response becomes an `APIError` carrying the status and the
server's `error` code**, with the server's `message` or a status-based fallback
as the message. Non-JSON bodies and non-string messages use the fallback;
non-string error codes and workflow identifiers are ignored. `preserves
structured API errors` asserts status, code and message survive; the 403 handling
in `listReadableInvitations` depends on both fields being there. `APIError` also
retains a string `workflow_id` and the `Location` header. For a 503
`workflow_result_timeout`, `requestDurableMutation` says the mutation was still
running when the API stopped waiting and includes those recovery details when
present. This is an incomplete outcome, still exiting nonzero, never confirmation
of success or failure. `pending durable project mutations preserve context and
recovery details in text and JSON` exercises both output modes and leaves the
saved project context unchanged.

**6.6 A success body that is not JSON is refused**, and a 204 is the only empty
success. `rejects invalid success JSON` and `accepts an empty no-content
response` are the tests.

**6.7 Every response is shape-checked before a command sees it.** Each client
module validates its own responses and throws rather than rendering a partial
answer: `isProject` also pins `organization_id` to the organization asked for,
`isConnector` pins `project_id` to the project asked for, `isBranch` pins
`connector_id` to the connector asked for, and
`isConnectorRegistrationStatus` pins `connector_id` to the connector being
polled. `rejects malformed member API responses` and `rejects branches from
another connector and malformed responses` are the tests.

**6.8 A retried mutation carries a client-minted identity.** Project creation and
invitation creation send an `Idempotency-Key` header; connector creation and
branch creation send a `request_id` field in the body. All four are a fresh
`randomUUID`, and four tests assert the UUID shape at each site. **Which form
each endpoint takes follows the receiver, and nothing in this component
establishes that the receiver requires either.** What the control plane does with
an idempotency key is argued there.

**6.9 The role-to-scope table is written in this repository.**
`standardRoleScopes` maps each of the four role names to the scope list sent with
an invitation. `invites every supported role with its standard scopes` asserts
what is sent for all four roles — against arrays restated in the test, so **it
pins the CLI to itself and cannot detect divergence from the scopes the control
plane actually grants.** Owed.

## 7. Long-running operations

**7.1 An interactive command follows its operation; automation returns the
accepted operation.** `connector create`, `branch create` and `branch delete`
poll only when the JSON flag is off and Oclif reports a spinner-capable
terminal; otherwise they print or return the accepted identifier and exit zero.
`registers a connector in Ardent Cloud without polling outside an interactive
terminal` asserts exactly one request and a started-not-finished message.
`terminal branch creation waits for workflow success after request acceptance`
and `terminal connector creation waits for registration and names the remaining
readiness work` exercise the spinner paths against a fixture server, holding
the first status response to check that acceptance has not printed completion.

**7.2 A branch operation's completion is the workflow's status, never the
branch's state.** `waitForBranchOperation` polls the workflow endpoint, accepts
only a closed set of status values, treats `SUCCESS` alone as success, refuses a
response whose id is not the workflow being polled, and is bounded at 30 minutes
after which it names the command that shows the branch's state. `polls workflow
completion rather than treating the branch state as completion` and `reports
terminal workflow failure and rejects wrong workflow identity` are the tests.

**7.3 A deletion reaches local context only when the operation completes.**
`branch delete` calls `replaceBranchCache` after the wait, so an interrupted or
failed deletion leaves the branch selected. `delete sends the name and connector
ID directly and retains selection until completion` asserts the selection
survives a `--json` run, and `API refusal keeps local selection and returns the
error` asserts it survives a `409`. `terminal branch deletion clears selection
only after workflow success` holds a status response to check that the selected
branch is retained, then checks removal on `SUCCESS` and retention on `ERROR`.

**7.4 A creation reaches local context as soon as the API accepts it**, before
the operation completes, because the acceptance already carries the branch's id
and name — `validateOperation` refuses a response that does not. The asymmetry
with 7.3 is deliberate. `terminal branch creation waits for workflow success
after request acceptance` asserts the branch is cached while the first workflow
status response is still held open.

**7.5 Connector registration polling is bounded at 30 minutes.**
`waitForConnectorRegistration` uses one abort controller for the overall wait,
combines it with a ten-second timeout on each status request, and passes its
signal to the two-second polling delay. The deadline aborts an in-flight request
or delay; expiry identifies the connector, says its outcome is unknown, and
names `ardent-beta connector list` as the recovery command. `registered` alone
returns success; `failed` reports the registration failure through
`terminalText`, while `deleting` and
`deleted` report those states, with the API's failure text through
`terminalText` when it sends one, and stop. A `deleting` connector's error names
`ardent-beta connector list`; a `deleted` one's says the list will not show it,
because the control plane's list leaves deleted connectors out. `halted` also stops without reporting
success: the connector exists, whether or not registration finished, but its
source runtime refused to continue and a halt does not clear by being polled, so the error names
the connector, its halt reason through `terminalText` when the API sends one, and
`ardent-beta connector list`. `terminal connector creation stops on a halted
connector without claiming registration` asserts a nonzero exit, one poll, and no
`✓ registered`. Other states and wrong connector ids are refused by
`isConnectorRegistrationStatus`. The connector client tests exercise the
deadline during requests and delays, late responses, terminal statuses,
malformed responses, the separate read timeout, and timer cleanup.

**7.6 `connector create` says what is still pending.** On a successful
interactive registration it prints that replication readiness is still pending,
because registration is not readiness.
`ARDENT_CLI_DEVELOPMENT.md` under "Connector URL contract" requires the message
and a `.greptile` rule flags its removal. `terminal connector creation waits for
registration and names the remaining readiness work` checks the message after
`registered` and its absence while registration is pending.

## 8. Terminal output

**8.1 A table fits the terminal exactly.** `renderTable` shrinks columns by
declared priority, first to their preferred minimums and then to one column,
truncates with an ellipsis at Unicode grapheme boundaries, and measures display
width rather than code units. Three tests in `test/table.test.js` pin the exact
rendered lines at widths 60, 30 and the default, including a combining mark, a
ZWJ emoji sequence and East Asian wide characters.

**8.2 `terminalText` renders C0 and C1 control characters and bidirectional
overrides as escaped text**, so a name chosen by a remote party cannot move the
cursor, clear the screen or reverse the reading order of a line. `renders
terminal control characters as text` is the unit test.

**8.3 Human output escapes remote names and API errors at their output sites.**
`renderTable` escapes every header and cell; commands escape the names they
interpolate, including `login`'s organization name and id. `ArdentCommand.catch`
passes an escaped copy of an `APIError` message and code to Oclif for human
output, preserving its stack location. JSON output retains the original values.
`escapes remote login and table text while preserving JSON values` and
`escapes API error messages and codes in human output while preserving JSON
errors` drive these paths through real commands against a fixture server.
This does not establish escaping for every error type or every future command.

**8.4 JSON output is never mixed with human text.** Oclif's `Command.log` writes
nothing while the JSON flag is enabled, which is what makes this hold; the
`jsonEnabled()` checks in the commands are a second copy of the same rule rather
than the rule itself. Tests parse whole-stdout JSON for `status`, `project
create`, `project list`, `member list`, `branch list` and `branch delete`.

**8.5 The published help surface is this package's grouped commands and nothing
else.** `ArdentHelp` skips hidden commands, commands belonging to a plugin, and
commands with no string help group, and a logged-out root invocation shows only
the two login paths. `groups commands behind the standard help flag` asserts the
groups are present and that the autocomplete plugin and Oclif's platform banner
are absent; `shows only the two login paths to a logged-out user` and `shows
grouped help by default after login` assert the two root views.

## 9. Distribution

**9.1 The package registers one executable, `ardent-beta`**, so the beta
installs alongside an existing `ardent` command. `package.json`'s `bin` and the
Oclif `bin` are both that name, and `prints its package version` pins the
package name and version in `--version` output.

**9.2 The published tarball is an allowlist.** `package.json`'s `files` publishes
`NOTICE`, `openapi.json`, `bin/`, `dist/` and the Oclif manifest; npm adds `package.json`,
`README.md` and `LICENSE`. `test/package.test.js` inspects a real npm archive for package entrypoints,
executable shebang and mode, and every command path in the Oclif manifest.
`make ci` also ends in `npm pack --dry-run`, which prints the contents.

**9.3 `NOTICE` and `LICENSE` ship in the published tarball.** `NOTICE` is
explicitly included by `files`; npm includes `LICENSE`. The package test reads
both from the archive and checks their text against the nonempty source files.

**9.4 Four package lifecycle hooks are refused.** `test/package.test.js`
asserts that `preinstall`, `install`, `postinstall` and `prepare` are absent from
the archived package metadata. Other package lifecycle keys and dependency
lifecycle hooks are not checked.

**9.5 Node 22 is declared, not enforced.** `engines` names `>=22.0.0`, npm warns
rather than refusing without `engine-strict`, and nothing checks the runtime
version at startup.

**9.6 `make ci` is the gate, and it is install, typecheck, test, and pack.**
`CONTRIBUTING.md` states that upstream CI runs that same target, and it is also
where the export path is described. **Nothing in this directory
can assert what the upstream pipeline does**, so no sentence here may claim a
release is gated on anything beyond `make ci`.

**9.7 The API documentation snapshot ships with the CLI.** `package.json`
includes `openapi.json` in `files`. `test/package.test.js` compares its archived
bytes with the local file, parses its JSON, and checks its OpenAPI version. It
does not validate the complete OpenAPI schema or compare it with a running or
updated control plane. The source revision and refresh procedure are in `README.md`.

## 10. Met and owed

A requirement above is verified only where a test names the behavior. What is
owed is written out, because it is the specification the test will be built
from.

### 10.1 Credential custody and login

Met: `stores, overwrites, and clears a local session` on the file and directory
modes and on the tolerated double clear; the four `loginWithToken` refusals on
2.2; `exchanges a PKCE-bound loopback callback and saves the CLI credential` on
the challenge-to-verifier binding; `stops an active exchange when browser login
times out` on the abandoned retry; the negative state and concurrent replay
tests named in 3.1 and 3.3; `narrows an existing wide session directory before
saving credentials`; and `keeps credentials out of token login, status, and
logout output` on the successful human and JSON paths with flag and environment
tokens. `docs/EVIDENCE.md` records four targeted mutations caught by these tests.

Owed:

- **an assertion that no output path prints the stored token** (2.6). The
  successful token-login, status and logout paths and the exercised browser
  callback bodies are covered; command failures, browser-login terminal output
  and other commands still need coverage.

### 10.2 Local context

Met: `rejects a corrupted local session`, `rejects project selection outside the
cached project identities` and `configuration rejects a connector or branch
belonging to another parent` on 4.1; the three context tests on 4.2; `switches
to a project created since the last list, with no cache present` on 4.3; `a
refused switch leaves the selected project and its context alone` on 5.3; the
project and connector invalid-response command tests on 4.5.

Owed:

- a test that 4.2's clearing holds for every command that writes a selection,
  rather than for the three the context tests drive directly.

### 10.3 Fail-closed behavior

Met: `does not delete a project name absent from the authoritative list` and
`does not guess when an email is missing or has multiple matches` on 5.2;
`preserves project context unless deletion is confirmed` and `does not report
deletion before the API confirms it` on 5.5; `uses the sole discovered connector
and refuses ambiguous automation` and `fails without login or connector
discovery context before making a request` on 5.6; `does not delete when pending
invitations cannot be checked` on 5.4; `refuses explicit snapshot selection and
invalid names` on 5.8 and 5.9.

Owed:

- **a test that every mutating command prints its target before acting**, rather
  than each command's own assertion. `AGENTS.md`'s rule is a property of the
  command surface and is checked command by command, so a new command can omit
  it and nothing fails.

### 10.4 Output

Met: the three table tests on 8.1; `renders terminal control characters as text`
on 8.2; the two command-output regressions named in 8.3 on login, table and
API-error escaping with unchanged JSON values; `groups commands behind the
standard help flag` on 8.5.

Owed:

- coverage of remote failure strings that become ordinary `Error` objects,
  including polling failures; 8.3's error boundary currently covers `APIError`;
- an assertion that escaping holds for every output site, beyond the login,
  project-table and API-error command paths covered by 8.3.

### 10.5 Boundary and distribution

Met: `TS6059` on an import outside `src/` (1), reproduced in
`docs/EVIDENCE.md`; `npm pack --dry-run` printing the tarball on every CI run
(9.2); `test/package.test.js` on archived entrypoints, notices and the four
package lifecycle keys named in 9.4.

Owed:

- **a check that the dependency set has not grown.** It is an approval boundary
  in `AGENTS.md` and `CONTRIBUTING.md` and is held by review alone.
  `CONTRIBUTING.md` states the reason it matters here more than in a private
  component: "every dependency is added to the supply chain of everyone who
  installs the CLI";
- **a check that nothing in this directory names a sibling component's path.**
  The exported copy has to stand alone. `AGENTS.md` is held to that by an
  umbrella gate; the rest of this directory, including these three documents, is
  not;
- a drift check between `standardRoleScopes` and the scopes the control plane
  grants (6.9). It cannot live here alone: this component cannot read the
  control plane's source, so the honest form is an endpoint that returns a
  role's scopes, or the removal of the table from this side.

## 11. Explicit non-goals

- **Infrastructure deployment, environment-selection policy, cloud access,
  Kubernetes behavior, data-plane implementation, and direct database access.**
  `ARDENT_CLI_DEVELOPMENT.md` is the home of that boundary.
- **Parsing, rewriting or hiding the connector URL.** The URL is the command
  contract and its exposure in shell history and the process argument vector is
  an accepted property of the interface, argued once in
  `ARDENT_CLI_DEVELOPMENT.md` under "Connector URL contract".
- **Caller-selected snapshots.** No command offers one (5.8).
- **Server-side revocation on logout** (2.4).
- **Validating a stored credential without being asked to** (2.5).
- **Copying control-plane models or generated clients** (1).
