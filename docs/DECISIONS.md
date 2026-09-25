# CLI decisions

Why each load-bearing choice was made, and what it displaced.

One of three documents this component keeps under `docs/`:
`docs/REQUIREMENTS.md` is what must hold, `docs/EVIDENCE.md` is what was
measured and how, this is why.

**An argument has one home.** Where a choice is argued at its enforcement site
or in `ARDENT_CLI_DEVELOPMENT.md`, it is named here and not restated. What lands
here is the choice that is not about one call site.

**A rejected option is recorded when it shipped and was taken back out, or when
it is the option the next reviewer reaches for first.** An option nobody would
propose is noise; one that was merged and reverted is the only protection
against merging it again. Each rejection below says which of the two it is,
because "nearly adopted" asserted without a commit behind it is a story.

**Compiled 2026-09-15; re-checked 2026-09-25.** Each decision states its status
against the working tree. The re-check corrected the statements that later
changes had made false; it did not re-derive every decision.

---

## 1. This component delivers no credential of its own

**ADOPTED, after the alternative shipped and was reverted.** The CLI is a client
for the control-plane API. It sends one PostgreSQL connection URL and the
control plane owns parsing it, generating runtime identifiers from it, and
delivering credentials.

**Why.** `ARDENT_CLI_DEVELOPMENT.md` disowns cloud access, so a
credential-delivery path in this component sits outside its declared boundary.
That is the standing rule. The revert's own stated reason was narrower — the
path was unapproved — and the two are recorded separately here rather than the
second being dressed up as the first.

### Rejected: the CLI delivering source credentials directly

**Not hypothetical — it was built and merged.** A change delivered source
credentials through the customer CLI, with the supporting API exposure, the IAM
changes, the tests and the documentation claims that went with it. The revert
took all of it out in one commit and called the credential-delivery path
unapproved. It is recorded here because the change had a real motivation, the
motivation has not gone away, and the next person to have it should find this
entry rather than the deleted code.

### Rejected: separate host, user and password flags

The URL is one positional argument. Replacing it with flags, or adding a
temporary passwordless-only form while credential delivery was unfinished, would
have made users and automation migrate twice. `ARDENT_CLI_DEVELOPMENT.md` under "Connector
URL contract" is the home of that argument, and a `.greptile` rule flags a
change that reopens it.

**What it costs.** A password-bearing URL is visible in shell history and in the
process argument vector. That exposure is an accepted property of the interface,
stated where the contract is, and the CLI claims no hidden secret-input channel.
The adopted control-plane delivery path keeps the CLI at its client boundary:
it can read an optional paired client-certificate and private-key file and send
their contents in the registration request, but it never delivers them to a
runtime itself. A successful interactive `connector create` still says that
replication readiness is pending.

## 2. Two login paths, and the token may arrive either way

**ADOPTED.** `login` opens the browser; `login --token` takes an existing API
token, which `ARDENT_TOKEN` supplies when the flag is absent.

**Why two.** A human should not have to mint an API key to use the CLI, and CI
cannot open a browser. Neither path can serve both.

### Rejected: token login as the only path

This is how the CLI shipped. The browser path came later, and the commit that
made the token flag optional landed immediately before it — the demotion was
the preparation, not the consequence. Recorded because a token-only CLI is
the cheaper thing to build and reads like a reasonable beta: it makes every new
user's first step "go to the web app and create an API key", which is the step
the browser path exists to remove.

### Rejected: the environment variable as the only way to supply a token

Also shipped, also reversed. The flag was removed in favour of requiring
`ARDENT_TOKEN`, on the argument that a token on the command line is visible in
the process argument vector, and then restored. The restoration is the current
state and it is defensible: `SECURITY.md` classes shell history and
shoulder-surfing as not a vulnerability absent a defect in the CLI, and a flag
that automation cannot use is a flag automation works around. The environment
variable remains the documented non-interactive path.

**What the browser path costs.** A loopback HTTP server, a 30-minute deadline, a
retry loop for the one `503` the exchange retries — the code that means a
workflow is still running — and an HTML page served from this repository. The binding is PKCE: a
32-byte verifier whose SHA-256 goes out as the challenge, plus a 32-byte `state`
the callback must return. **The CLI's half is proving it holds the verifier; the
enforcement is the control plane's**, and no test here can reach it.

## 3. The organization's list is the authority; the cache is a shortcut

**ADOPTED**, and it is the decision this component got wrong twice.

**Why.** `project switch` resolved a name against the session's cached project
list and nothing else. That cache holds whatever the last `project list`
returned, so a project created since then was reported not to exist — and the
workaround was to run the command that refreshes the cache. A miss on a cache is
an absence of information, not an answer.

So a cached name still switches with no request, which is what keeps the command
cheap enough to run constantly, and only a miss consults the organization.

### Rejected: treating a cache miss as an answer

The original behavior. Recorded because it is what a cache looks like when it is
mistaken for a source of truth, and because `Session` holds cached names for
connectors and branches too — so the shape is available anywhere a command
decides from the cache alone.

### Rejected: refreshing the cache and then deciding

The first version of the fix. `replaceProjectCache` is not a read — it persists,
it drops connector and branch context when the selection moves, and it adopts
the sole remaining project when the selected one is gone. So `project switch
Typo`, run against an organization with one project that was not the selected
one, exited non-zero having quietly switched the local context to that project
and cleared the connector with it. Three reviewers found it independently.

**What the ordering costs.** Nothing, which is why the entry exists: the fix was
to move a lookup above a write. `a refused switch leaves the selected project and
its context alone` builds the shape that triggers the adoption and fails against
the old ordering, which `docs/EVIDENCE.md` confirms by mutation.

## 4. A read may degrade; a delete may not

**ADOPTED.** `member list` tolerates a `403 permission_denied` on the
invitations endpoint, prints that pending invitations are not visible with this
login, and returns `null` for them under `--json`. `member delete` reads the
same endpoint through the strict function and fails when it cannot.

**Why the asymmetry.** A login that can read memberships but not invitations is
a real role, and refusing `member list` outright makes the command useless to
the role most likely to run it. A delete is different: `member delete` resolves
an email against both lists and refuses when more than one row matches, so a
missing invitations list means the ambiguity check ran on half the data. The
guard is worth nothing if the input is partial.

### Rejected: tolerating the `403` everywhere

**Shipped, and taken back out.** `member delete` used the tolerant function too,
and filtered the possibly-absent invitations as `invitations?.filter(...) ?? []`
— so on a `403` the ambiguity check ran against an empty list and the delete
went ahead. It reported the permission problem only when nothing matched at all,
which is the one case where it did not matter. An email with both a membership
and a pending invitation deleted the membership and left the invitation, having
never seen it. The fix swapped in the strict function and deleted the
special-cased error message.

### Rejected: refusing `member list` for a login that cannot read invitations

The consistent option, and the reason it lost is that consistency is not the
goal. The list command has no side effect, so a partial answer that says it is
partial is strictly better than no answer.

**What it costs.** Exactly one exception to this component's hard-failure
posture, and it is scoped as narrowly as it can be: one status code, one error
code, one endpoint, one caller. `listReadableInvitations` is the only function
here that turns a failure into an absence.

## 5. Completion is the operation's status, never the resource's state

**ADOPTED.** `waitForBranchOperation` polls the workflow the mutation returned,
accepts only a closed set of status values, and treats `SUCCESS` alone as
success.

**Why.** A branch row exists the moment the API accepts the request, so its own
`state` cannot say whether the operation that created it finished. Reading it as
completion reports success on work that has not started.

### Rejected: an elapsed polling interval as failure

This is what the connector path did before it was changed to wait for a terminal
backend state. Turning "I have been polling for a while" into "the registration
failed" invents a failure the server never reported, and the user's next action
is to retry an operation that was going to succeed.

**What it costs.** The connector poller originally had no deadline, leaving a
connector stuck in `registering` holding the terminal indefinitely. It now
bounds the wait at 30 minutes, as the branch poller does. An overall abort signal
also reaches the connector status request and polling delay. Expiry reports an
unknown outcome and retains the connector id in the recovery message; it does
not report registration failure. `docs/REQUIREMENTS.md` records the mechanism.

## 6. Local context is a strict schema with no repair path

**ADOPTED.** `loadSession` validates the whole session file — token, the
organization, each list's internal uniqueness, and every parent-child
relationship between the selected project, connectors and branches — and on any
violation throws one error naming the file and telling the reader to log out and
log in again.

**Why.** A session file records what the next command will target. Accepting a
file that is internally inconsistent means acting on a target the operator did
not choose, and the failure would be silent by construction: the command
succeeds, against the wrong thing.

### Rejected: dropping the invalid part and continuing

Never taken here, and recorded because it is what most configuration loaders do
and it never interrupts anybody, so it is the change a reader will propose as a
usability fix. It is the silent-wrong-target failure with extra steps: a
selected connector that does not belong to the selected project would be dropped
and rediscovered, and the next branch command would act on a different
connector than the last one did, with nothing said.

**What it costs.** Invalid API identities must be refused before they enter
that strict session file. The project and connector list paths previously
accepted duplicate names and wrote a session that the next command could not
load. Their validators now reject duplicate ids, duplicate names and empty
names, matching the constraints on cached identities. `docs/EVIDENCE.md`
records the reproduction and the regression tests. A previously corrupted
session still requires logout and login; this change adds no repair path.

## 7. Destructive safety is authoritative resolution and a printed target

**ADOPTED.** No command in this repository asks for confirmation. `AGENTS.md`'s
rule — a destructive command "states what it is about to act on, and fails closed
rather than silently targeting production" — is met by resolving the name
against the API's own list, printing the resolved target before acting, and
refusing on zero or several matches.

**Why.** The CLI's primary consumer is a person in a terminal and its secondary
consumer is CI, and a prompt serves the first at the cost of the second. A
prompt with a bypass flag is a prompt that automation always passes, which
leaves the automation path exactly as protected as it was without one — while
reading, in the documentation, as though both were covered.

### Rejected: a confirmation prompt with a `--yes` bypass

Never proposed here, and recorded because it is what most CLIs do and therefore
what a reviewer asks for first. Two reasons it loses. It protects the path least
likely to be wrong: a human who typed a project name is looking at it, and CI is
not. And it is a second safety mechanism with a different scope from the first,
so each new destructive command would have two rules to remember instead of one.

**What it costs.** A correct name typed against the wrong organization deletes
the resource with no second chance, because the only thing standing between the
command and the deletion is that the name resolved. The mitigation is that it has
to resolve *in the API's list*, not in the local cache, which is why
`docs/REQUIREMENTS.md` insists on that distinction.

## 8. Terminal escaping is applied at the call sites

**ADOPTED, and the weakest decision here.** `terminalText` escapes C0 and C1
control characters and bidirectional overrides. `renderTable` applies it to
every header and cell, and each command applies it to the names it interpolates
into a message.

**Why at the call sites.** The values that need escaping are the ones a remote
party chose — a project, connector, branch or organization name, an email — and
they arrive at output through two shapes: a table cell and a template string.
Covering the table centrally covers most of it for free.

### Rejected: escaping centrally at the logging boundary

The design a reviewer will propose, and the reason it does not replace the call
sites is worth writing down rather than rediscovering: it does not reach far
enough. An `APIError` message is server-supplied text that Oclif prints through
its own error path, and no override of a command-level log method sees it. So
central escaping would be a third mechanism rather than a replacement for the
second, and the two unescaped paths would still be unescaped.

**The API error boundary is separate from normal logging.** `ArdentCommand.catch`
escapes an `APIError` message and code only when handing it to Oclif for human
output. JSON consumers retain the server's original values, and the display
copy keeps the original stack location. This catches errors that do not pass
through `Command.log` without rewriting the command's returned data.

**What it costs.** Table cells and normal command messages still need their own
escaping, including the organization line in `login`. The error boundary is
specific to `APIError`; remote failure strings carried by other error types
remain outside it. `docs/EVIDENCE.md` records the original missed table mutation
and the later command regressions that close the login, table and API-error gaps.

## 9. `--json` behavior belongs to Oclif

**ADOPTED.** `ArdentCommand` sets `enableJsonFlag`, every command returns the
value that becomes its JSON body, and the suppression of human output under
`--json` is Oclif's: its `Command.log` writes nothing while the flag is
enabled.

**Why.** A hand-rolled JSON mode means every command carries the rule, and a new
command that forgets it produces output that is neither readable nor parseable.
Deferring it means the rule has one home outside this repository.

**What it costs, and it is visible in the source.** The commands also check
`jsonEnabled()` before logging, which is a second copy of a rule Oclif already
holds. It is harmless and it is misleading: a reader concludes the checks are
what keeps JSON clean, and a new command written without one still behaves
correctly. `docs/REQUIREMENTS.md` states which of the two is the mechanism.

## 10. The API origin is an environment variable, not a flag

**ADOPTED.** `API_URL` is read from `ARDENT_API_URL` once at module load and
defaults to the deployed control plane.

**Why not a flag.** A per-command origin is a per-command way to send a
credential somewhere else, and it would appear in help output as a supported
thing to do. `exposes token login without an API target flag` asserts that
`login --help` offers none. It is one of the two guards here that exist to keep
an affordance *absent* rather than to check one that is present; the other
refuses a snapshot or placement flag on `branch create`.

**Why read once.** No command can retarget mid-run, so every request in one
process goes to one origin.

### Rejected: no development override at all

Never taken here, and recorded because it is the option that reads as safest and
would be proposed on exactly that ground. It makes the CLI untestable against a
local control plane, which means the end-to-end command tests could not exist —
they work by pointing `ARDENT_API_URL` at a fixture server on `127.0.0.1`. The
override is what makes most of `docs/EVIDENCE.md` possible.

**What it costs, and it is owed.** Any process that can set the environment can
send the token to an origin of its choosing, and no command prints which origin
it used, so nothing tells an operator that their `login --token` went somewhere
else. `SECURITY.md` puts an attacker-supplied base URL in scope. The cheap fix
is to print the origin whenever it is not the default.

## 11. The role-to-scope table is written on this side

**ADOPTED, reluctantly.** `standardRoleScopes` maps each of the four role names
to the scope list sent with an invitation, because the invitation request
carries the scopes and so the CLI has to know them.

**Why it is uncomfortable.** This is the closest thing in the repository to
holding the control plane's model, which `AGENTS.md` forbids copying. It stays
on the right side of that line only because these are this component's own
request types rather than imported ones — and the distinction is formal. The
values are a policy decision made elsewhere.

### Rejected: sending only the role name

The shape that would remove the table entirely, and it is not this component's
to choose: the request carries scopes, so a request naming only a role is a
different API. Whether the receiver would accept one cannot be determined from
here.

**What it costs.** A table this component cannot verify. The test asserts what
is sent for all four roles against arrays restated in the test, so it pins the
CLI to itself and **cannot detect divergence from the scopes the control plane
actually grants.** An invitation that quietly grants the wrong set is
indistinguishable from a correct one on this side.
`docs/REQUIREMENTS.md` records the owed fix and why it cannot live here alone.

## 12. One executable name, and it is not `ardent`

**ADOPTED.** The package is `ardent-cli-beta` and it registers exactly one
executable, `ardent-beta`, which is also the Oclif bin name that appears in
every help string and recovery suggestion.

**Why.** The beta has to be installable on a machine that already has an
`ardent` command, and a package that claims the name takes it.

### Rejected: shipping as `ardent`

**Shipped, and renamed.** Both the npm `bin` entry and the Oclif bin name were
`ardent` until the commit that changed them, and the rename had to carry the
help text, the recovery suggestions and the command examples with it. The name
is the one the product will eventually want; taking it during a beta means an
install that silently replaces a working command, with no way to un-replace it
for the user who did not notice.

**What it costs.** Every command example, help line and error message in this
repository says `ardent-beta`, so the eventual rename to `ardent` will touch all
of them and the tests that assert them. The first rename is the measurement of
what the second will cost.

## 13. These documents carry no `DOCS:` anchor

**ADOPTED.** `ARDENT_CLI_DEVELOPMENT.md` states that `architecture` is the only
anchored topic in this repository and names the two files carrying it. Anchoring
a section here would falsify that sentence, and adding a topic is a deliberate
approval recorded in that guide — not a side effect of writing three new
documents.

**What it costs.** These three documents are not discoverable by the anchor
search the development guide describes. That is the right trade while the closed
vocabulary has one member here.

## 14. Distribute an API documentation snapshot with the CLI

The control plane owns the API contract. The CLI ships a reviewed documentation
snapshot so an external developer can read the contract from the exported
repository or installed package without access to the private control-plane
repository. The snapshot is for readers. Application code must not import it,
generate clients or types from it, validate API payloads with it, or use it as runtime
configuration; the CLI continues to own its request and response types.

This replaces a handoff that required a separately supplied specification. The
snapshot can lag upstream changes: the package test checks only the local
artifact, and refresh is a manual review step described in `README.md`.
