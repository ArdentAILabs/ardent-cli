# CLI evidence

What was measured about this component, how, and what the measurement does not
reach.

One of three documents this component keeps under `docs/`:
`docs/REQUIREMENTS.md` is what must hold, this is what was measured,
`docs/DECISIONS.md` is why a choice was made and what it displaced.

**A passing test is not evidence that a guard works.** A test that passes with
the guard deleted proves only that the test runs. So eight of the guards
`docs/REQUIREMENTS.md` names were deleted one at a time and the suite run again
— the mutation table has the results, including the three that nothing caught.
Eight is not all of them, and the table says which eight.

**Baseline compiled 2026-09-15 against the working tree, on macOS with Node
24.20.0.** The dated follow-up in section 2.1 updates authentication coverage;
the original readings below remain historical. The suite's own runtime target
is Node 22. A separate cache-validation follow-up on 2026-09-21 ran `make ci`
on macOS with Node 22.23.2: all 70 tests passed, typechecking passed, and the
package dry run succeeded. The table below retains the initial reading.

---

## 1. What the suite is

`make ci` is `npm ci`, `npm run typecheck`, `npm test`, `npm pack --dry-run`.
`npm test` builds, regenerates the Oclif manifest, and runs
`node --import ./test/setup.js --test "test/**/*.test.js"`. The test-only preload
initializes the lazy `fetch` property before a test replaces it with
`mock.method`.

| Reading | Value |
|---|---|
| tests | 64, all passing |
| failures, skips, todos | 0 |
| wall time for `node --test` | 4.1 s |
| `tsc --noEmit` | clean |
| published tarball | 70 files, 24.2 kB packed, 113.8 kB unpacked |
| runtime dependencies declared | 3 |
| lockfile entries, non-development | 47 |
| lockfile entries, total | 232 |

**Every test runs against a fixture, never against the control plane.** Two
original mechanisms do it: `t.mock.method(globalThis, 'fetch', ...)` for the unit tests,
and a real `node:http` server on `127.0.0.1` reached through `ARDENT_API_URL`
for the command tests, which spawn `bin/run.js` as a child process through
`runCLI`. The interactive follow-up adds `runCLIInTerminal` against the same
kind of local fixture. The command tests are therefore end-to-end over the real Oclif
parser, the real session file and the real HTTP client, against a fake server.

**No reading here was taken against a deployed control plane.** Every response
shape in this suite is one this repository wrote. That is the single largest
limit on everything below: a shape the control plane actually returns and this
repository does not expect would pass every test here and fail in a customer's
terminal. **Nothing in this component can close that gap**, because closing it
means reaching a second repository, and how that is done is not this
component's decision to record.

### Combined runtime verification, 2026-09-21

After combining the CLI follow-ups, the gate's install, typecheck, test and
package-dry-run commands passed on macOS and in a Debian Bookworm Linux aarch64
container with Node 22.23.2. Each run passed all 96 tests, with no failures,
skips or cancellations. The package dry runs reported 71 files, 25.2 kB packed
and 118.5 kB unpacked. These are later readings; the original baseline table
above is unchanged.

The first macOS run on the minimum declared Node 22.0.0 failed 31 tests because
that release exposes `fetch` as a lazy accessor: `mock.method` inspected it
before the first property read initialized the function. `test/setup.js` now
reads `globalThis.fetch` before the tests load, without calling it or changing
production code. With that preload, `npm test` passed all 96 tests on macOS with
Node 22.0.0 and Node 22.23.2, with no failures, skips or cancellations. The full
combined gate readings above preceded this test-harness change.

This measures the fixture suite on those runtime/platform combinations, not
every Node 22 patch, Windows behavior, a clean-machine installation, or deployed
compatibility. Linux was measured on Node 22.23.2, not Node 22.0.0.

## 2. The mutation table

On 2026-09-15, eight guards named by `docs/REQUIREMENTS.md` were deleted one at a time, each in
an isolated copy of the tree, with the suite run after each. Five were caught;
three were not.

| Mutation | Caught | By |
|---|---|---|
| session file mode `0600` widened to `0644` | yes | `stores, overwrites, and clears a local session` |
| `loadSession` accepts a selected project absent from the cached list | yes | `rejects project selection outside the cached project identities` |
| `project switch` writes the refreshed cache before refusing an unknown name | yes | `a refused switch leaves the selected project and its context alone` |
| `requireConnector` takes the first connector instead of refusing an ambiguous automation | yes | `uses the sole discovered connector and refuses ambiguous automation` |
| `deleteProject` accepts any response as confirmation | yes | `preserves project context unless deletion is confirmed` |
| the loopback callback's `state` comparison removed | **no** | — |
| the single-use `exchanging` guard removed | **no** | — |
| `renderTable` stops calling `terminalText` on headers and cells | **no** | — |

**The three misses were all in the same class**: a guard whose only test drove
the success path. Both browser-login tests sent back the `state` the
authorization URL asked for; neither sent a second callback. Every table
fixture carried benign text. The authentication follow-up below closes the
first two misses, and the terminal-output follow-up closes the third.

**The mutation that mattered most was caught.** Writing the project cache before
refusing an unknown name is a real defect this component had: the refusal exited
non-zero having already switched the local selection and cleared the connector
with it. The test that now pins the ordering asserts the session is unchanged
byte for byte, and it fails against the old ordering.

**What the table does not reach.** Five caught guards out of the dozens
`docs/REQUIREMENTS.md` names. A guard absent from this table was not measured,
and its requirement rests on the test naming it running at all.

### 2.1 Authentication follow-up, 2026-09-21

On macOS with Node 24.20.0, the suite passed all 68 tests. The new loopback tests
send a wrong state before a valid callback, and hold one exchange pending while
sending a concurrent replay. They assert `400`, no credential write from the
refused callback, and successful completion of the legitimate request. The
session-directory test starts with mode `0755` and observes `0700` after saving.

`keeps credentials out of token login, status, and logout output` runs all three
commands through `runCLI` in human and JSON modes with both flag and environment
token login. It checks the fixture's bearer header, the persisted credential,
logout removal, and absence of the token in stdout and stderr. The loopback
tests also check their response bodies for the token.

Four mutations were applied individually to the compiled JavaScript in the
isolated worktree, running only the named test and restoring the file after
each. Every mutation produced an assertion failure:

| Mutation | Caught by |
|---|---|
| bypass the callback `state` comparison | `rejects a mismatched callback state without exchanging or saving a credential` |
| remove `exchanging` from the callback guard | `rejects a concurrent callback replay while the first exchange is pending` |
| remove the directory `chmod` | `narrows an existing wide session directory before saving credentials` |
| print `session.token` in human `status` output | `keeps credentials out of token login, status, and logout output` |

This reaches the existing CLI guards, not server-side PKCE enforcement or
authorization-code reuse. It does not establish secrecy across command errors,
browser-login terminal output or the remaining commands, nor filesystem mode
behavior on Windows or filesystems that ignore modes.

## 3. Reproductions

Three behaviors were run rather than read, because in each of them reading the
code alone gives the wrong answer.

**A sibling import does not compile.** An `import` from a path above `src/`
fails `tsc` with `TS6059`, "File ... is not under 'rootDir'". Reproduced by
adding one file under `src/` importing one outside it. This is the only
mechanical part of the no-shared-code rule in this component.

**Duplicate names previously poisoned the local cache; refusal now preserves
it.** The 2026-09-15 fixture returned two projects named `Same`: `project list`
rendered and cached both, and the next command failed with "configuration is
invalid". Two same-named connectors caused the same failure. The branch list
already refused duplicates.

On 2026-09-21, the project and connector command tests drove duplicate ids,
duplicate names and empty names through the real CLI against fixture servers.
All six cases exit non-zero before rendering a list; each compares the saved
session byte for byte and reloads its project, connector and branch selections.
Restoring both clients to their pre-fix source made all six regressions fail
with a successful exit where refusal was expected.
`listProjects` and `listConnectors` now reject these invalid identities before
returning them to a command. This does not repair already-corrupted files or
establish what the deployed API returns.

**An undeclared flag is refused by the parser, not by the command.** `branch
create feature --mark mark-1` exits non-zero with "Nonexistent flag: --mark",
even though the branch commands set `strict = false` to accept a name in several
words. Worth running: `strict = false` reads like it accepts anything, and the
requirement that no snapshot can be named rests on the parser still refusing an
undeclared flag.

## 4. What the suite reaches, by area

| Area | Reached | Not reached |
|---|---|---|
| Session file | modes, narrowing an already-wide directory, overwrite, tolerated double clear, every shape refusal in `loadSession` | that the replace is atomic; concurrent writers; a filesystem that ignores modes |
| Browser login | the challenge-to-verifier binding, the saved credential, the abandoned retry on deadline, mismatched state and concurrent callback rejection, absence of the token in those callback bodies | server-side code reuse; a `404` on a wrong path; remaining browser-facing HTML behavior; `openBrowser` on any platform |
| Token login | trim, empty refusal, one-organization refusal, malformed-response refusal, nothing stored on failure, flag and `ARDENT_TOKEN` command paths | rejected-token command output |
| HTTP client | origin default and override, bearer and `Accept` headers, structured errors, invalid JSON, 204; the later durable-mutation checks below | any redirect; TLS behavior; actual ten- or ninety-second wall-clock expiry |
| Commands | the non-interactive success path of every command, including token `login`; a logged-out refusal in the project, member and branch groups; a malformed-response refusal for projects, connectors, members and branches; exact table output; `--json` shape; picker and spinner paths in the interactive follow-up | browser login through the CLI; interactive interruption and failure paths beyond the measured branch workflow `ERROR` |
| Output | table geometry at three widths with combining marks, ZWJ sequences and wide characters; `terminalText` in isolation; the follow-up below drives login, project-table and API-error escaping | other commands and error types; colour |
| Packaging | the tarball's contents, printed by `npm pack --dry-run` on every run; the later archive inspection and isolated-prefix installation below | arbitrary allowlist changes; dependency lifecycle hooks; a registry download or clean-machine installation |

### Interactive follow-up, 2026-09-21

The gate's install, typecheck, test and package-dry-run commands passed on Node
22.23.2 on macOS and in a Debian Bookworm Linux container. Each isolated branch
run passed 68 tests with no failures or skips. The PTY tests skip on platforms
other than macOS and Linux; no Windows behavior was measured.

`runCLIInTerminal` requires macOS's system `script` or Linux's util-linux
`script` with `-e` and `-c` support to provide a real pseudo-terminal to the CLI,
with a 15-second test deadline and process cleanup. These are test prerequisites,
not CLI runtime dependencies. Platform detection does not check that the utility
is installed or supports those options; a Linux host without it fails the PTY
tests. The runner uses macOS argv invocation or util-linux's shell invocation, and sends picker
input only after the prompt appears. The test child clears `CI` and sets `TERM`
so Oclif chooses its existing spinner path. No production behavior is changed.

Four tests exercise the Oclif commands against a local fixture server: numbered
connector selection, an empty answer retaining the second connector, invalid
selection refusal, branch creation and deletion through `PENDING` to `SUCCESS`,
deletion through `PENDING` to `ERROR`, and connector creation through
`registering` to `registered`. Holding the first status response proves the
commands have reached polling without reporting completion. The same point
checks that creation has cached the accepted branch and deletion has retained
its selection. Completion clears the deleted branch only after `SUCCESS`;
`ERROR` preserves it. The connector test checks the remaining-readiness message
and absence of the connection URL and password from terminal output.

Four individual mutations of the compiled JavaScript were caught on macOS with
Node 22.23.2: omitting branch creation's workflow wait, moving deletion's cache
write before its wait, choosing the first connector for an empty answer, and
omitting connector registration's wait. Each ran only its matching terminal
test, and every modified file was restored afterward. The premature cache-write
failure also exercised test cleanup while the CLI was waiting on an open HTTP
response; no CLI or `script` process remained afterward.

These fixtures do not establish deployed compatibility, browser login through
the terminal, interruption behavior, connector failure command output, or
behavior in every terminal emulator. The original `runCLI` remains a pipe-based
runner and exercises the automation paths.

**Connector polling follow-up, 2026-09-21.** On macOS with Node 22.23.2,
`make ci` passed all 73 tests, typechecking and the package dry run. The connector
client tests use mock timers to advance the 30-minute deadline during an
in-flight request and during the polling interval. They assert that the request signal aborts, a
response arriving after the deadline cannot report success, the timeout names
the connector and an unknown outcome, and a completed registration clears the
overall timer. Separate tests retain the ten-second request timeout, reject
malformed statuses, escape remote failure text, and stop on `deleting` or
`deleted` without reporting
registration success. These tests run the polling function directly with
fixture responses; they do not close the interactive-command or deployed-API
gaps above.

## 5. What is owed

- **A reading against a deployed control plane.** Every response shape here was
  written in this repository. Until something compares them with what the API
  returns, this suite measures self-consistency.
- **Further interactive failure and interruption coverage.** The dated
  follow-up reaches the picker and the spinner paths; interruption and
  connector-failure command behavior remain unmeasured.
- **A continuing check on the declared runtime.** The dated combined-runtime
  follow-up reaches Node 22.0.0 and Node 22.23.2. These readings do not establish
  compatibility with every Node 22 release or with future changes to the CLI.
- **A measurement of anything.** There is no performance, latency or size budget
  in this component, so no number above can be sourced as a capacity claim. The
  tarball size and the dependency count are readings, not limits: nothing fails
  if either doubles.

## 6. Durable mutation response handling, 2026-09-21

On macOS with Node 22.23.2, `make ci` passed all 70 tests. Six additions
exercise the 90-second budget at every synchronous resource mutation call site,
the unchanged ten-second read default, explicit caller cancellation, interruption
before headers and during body consumption, missing recovery fields, ordinary
API refusals, malformed error fields, and the absence of automatic replay. The deadline tests inject
signals and observe the requested durations; they do not wait 90 seconds or
measure a deployed request.

A loopback fixture returns 503 `workflow_result_timeout` to project creation
and deletion. Real CLI subprocesses in text and JSON mode retain the workflow
identifier and status path, exit nonzero without claiming completion, send each
mutation once, and leave the saved session unchanged. Membership and invitation
coverage here uses mocked fetch through their client functions, not command
subprocesses. A deployed gateway's timeout or a response shape differing from
these fixtures remains outside this measurement.

## Terminal-output follow-up, 2026-09-21

`test/commands/output.test.js` runs real token login and project-list commands
against a local HTTP fixture. Organization names and ids, project names, API
error messages and error codes contain C0/C1 control characters or bidirectional
overrides. Human output contains their escaped spelling, while parsed JSON
retains the original strings. This covers these command paths only, not every
remote value or every error type.

The two regressions fail independently when login escaping, table escaping or
the API-error display boundary is removed from the compiled test subject. These
are new measurements; the original mutation table above remains the September
15 baseline. No deployed control plane was used.

## Package archive inspection, 2026-09-21

`make ci` passed on Node 22.23.2 with 65 tests. The additional package test runs
`npm pack --ignore-scripts --json` after the normal test build and manifest
generation, then uses `tar` to read the actual archive. It verifies the shipped
license and notice against their nonempty source files, declared JavaScript and
type entrypoints, executable shebang and mode, manifest version and every
manifest command path, and absence of exactly four package lifecycle keys:
`preinstall`, `install`, `postinstall` and `prepare`. Other lifecycle keys and
dependency hooks are outside this check.
Temporary archives are removed after the test.

Skipping lifecycle scripts in this inspection prevents a second build racing
the other tests; `make ci` subsequently exercises `prepack` through its normal
pack dry run. This measured archive contents on macOS, not an npm registry
download or a clean-machine installation. It neither audits dependencies nor
pins every allowed file, and requires the `npm` and `tar` tools on the test host.

### Locally packed installation, 2026-09-21

Source commit `c37ea734` was packed as `ardent-cli-beta-0.0.0.tgz`. The archive
was installed globally into an isolated temporary prefix on macOS arm64 using
Node 22.23.2 and npm 11.19. With a separate empty configuration directory, the installed
`ardent-beta` executable ran under Node 22.0.0: `--help` succeeded, `--version`
reported `ardent-cli-beta/0.0.0 darwin-arm64 node-v22.0.0`, and `status --json`
returned `{"authenticated":false}`. This used a locally packed source archive,
not the published beta 0.0.15, a clean operating system, or live authentication.

## Packaged OpenAPI snapshot, 2026-09-21

On macOS with Node 22.23.2, `make ci` passed all 96 tests, typechecking and the
package dry run. The archive contained 72 files, including `openapi.json`.
`test/package.test.js` compared its archived bytes with the local snapshot,
parsed the JSON and checked OpenAPI version 3.1.1.

A separate comparison found the snapshot byte-identical to the control-plane
specification at source revision `fbd09a11b9f094ebd13a7d58bda75eb0bb45b016`, the
revision `README.md` recorded then; the snapshot has since been refreshed, see
below. Validation against the official OpenAPI 3.1 document schema passed, as did checks of its 19 route
registrations, references, unique operation IDs, path parameters and five request
examples. These were handoff measurements, not a continuous upstream-drift gate
or a measurement of a deployed API. This package was not published during the
check.

## Refreshed OpenAPI snapshot, 2026-09-25

`openapi.json` was replaced with the control-plane specification at the source
revision `README.md` now records, and `cmp` found the two files byte-identical.
Against the previous snapshot it adds the connector's `ddl_channel` object and the
branch-create `source_ownership` field. On macOS with Node 24.20.0, `make ci`
passed all 104 tests, typechecking and the package dry run, and the archive held
72 files. Schema validation and the route checks of the 2026-09-21 reading were
not repeated, and nothing here measures a deployed API.
