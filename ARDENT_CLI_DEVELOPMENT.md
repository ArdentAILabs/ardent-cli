# Ardent CLI development

This is the canonical guide to how the CLI repository is organized and changed.

<!-- DOCS: [architecture] -->

## Repository boundary

The CLI is an independent customer client for the control-plane API. It owns authentication UX, local context, request construction, workflow-status polling, and terminal output. `README.md` carries the implementation status.

The CLI does not own infrastructure deployment, environment-selection policy, cloud access, Kubernetes behavior, data-plane implementation, or direct database access. It talks to the control plane through authenticated requests and owns its local request and response types.

## Structure

Add directories only when an approved CLI behavior requires them. Do not copy control-plane models or generated clients into this repository, import sibling source, or create generic shared packages.

Oclif owns command discovery and parsing. `src/command.ts` is the one shared command base and enables Oclif's native JSON flag. Every future file under `src/commands/` must be an executable command; helpers and local wire types stay outside that directory.

Keep target selection visible. Commands that can create, mutate, or delete resources must fail closed rather than silently targeting production.

## Connector URL contract

The PostgreSQL URL is the command contract: `ardent-beta connector create` takes the
connector type and one standard connection URL as positional arguments. Do not
replace that URL with separate host, user, or password flags, and do not add a
temporary passwordless-only form while credential delivery is unfinished. The
credential-delivery implementation must consume the same command shape rather
than require users and automation to migrate twice.

A password-bearing URL is visible in shell history and the process argument
vector. That exposure is an explicitly accepted property of this interface; the
CLI does not claim to provide a hidden secret-input channel. `createConnector`
sends that URL as the one source value and does not parse it or reproduce its
fields; the control plane owns parsing and credential delivery. The connector
command test inspects the serialized request and terminal output to prove the
URL is sent but never printed. Optional `--tls-client-cert` and
`--tls-client-key` paths must be supplied together. The command reads their
bounded PEM contents, sends them beside the URL, and never places those contents
in argv or terminal output. Registration still does not establish replication
readiness.

## Iteration and verification

Run commands from this component's directory with Node satisfying
`package.json`'s engine requirement. Run `npm ci` for initial setup or after an
approved lockfile change; reuse that installation during the edit/test loop.

| Change or stage | Command | What it exercises and what remains unverified |
|---|---|---|
| Command or client iteration | `npm run build`; `npm run manifest`; `node --import ./test/setup.js --test test/commands/branches.test.js` | Substitute the relevant test file. Use the same test setup as `npm test`. Tests consume compiled `dist/` and command discovery uses the manifest, so rebuild both after source edits. Exercises the test's local fixtures, not a deployed API. |
| Type checking | `make typecheck` | Checks TypeScript without exercising requests or terminal behavior. |
| All CLI tests | `make test` | Rebuilds code and the manifest before running the Node test suite. Passing mocked/local HTTP interactions does not prove deployed authentication or workflow completion. |
| Package contents | `make pack` | `npm pack --dry-run` invokes `prepack`, rebuilding code and the manifest and listing package contents. Does not publish or prove installation on another machine. |
| Before review | `make ci` | Reinstalls locked dependencies, type-checks, tests and checks packaging. This is the component gate, not a live API test. |

For parsing/help iteration, `node bin/run.js --help` uses the compiled local
CLI without an npm publication. For changes spanning authentication, requests
or workflow polling, exercise the changed command against an explicitly
selected development API and local CLI context using `README.md`'s setup.
Record the target and observed response or terminal workflow state; obtaining
a workflow ID alone is not completion. That live exercise is separate from the
automated suite: there is no live-API integration Make target. Mutating commands
retain their target-selection and approval requirements. Report live API or
installed-package behavior as unverified if only the local suite was run.

## Code quality

Code is debt. Minimize code and structural bloat, but never optimize for line count at the expense of correctness, clarity, or a complete implementation. Do not mechanically compress code, combine unrelated behavior, or mutate files in strange ways merely to reduce lines.

Prefer direct, typed, traceable paths that look intentionally written by a human. A helper, abstraction, package, or layer must represent real reuse, ownership, policy, or an independently testable boundary. Bloated implementations, decorative indirection, and speculative architecture make the system harder for both people and future coding agents to understand and safely change.

## Structural TODOs

When an approved structural boundary has no implementation yet, an `_TODO.md` file holds its directory in Git and defines what belongs there. It begins with a `# TODO:` heading and is deleted when real implementation makes the directory non-empty. None exist in this repository today; the commands below are how to check that claim rather than a map of current ones.

Find TODOs with:

```bash
rg --hidden --glob '!.git/**' -n -F 'TODO:' .
rg --hidden --glob '!.git/**' --files | rg -F '_TODO.md'
```

## Documentation anchors

`DOCS:` topics name major product or architectural domains, not documentation types or implementation details. Reuse a topic already present in this repository. Add a new topic only for a deliberately approved major Ardent domain, and document that decision here. Most documentation needs no anchor.

List all documentation anchors:

```bash
rg --hidden --glob '!.git/**' -n 'DOCS: \[[a-z][a-z-]*\]' .
```

Filter to one topic by replacing `TOPIC` with the topic you want:

```bash
rg --hidden --glob '!.git/**' -n -F 'DOCS: [TOPIC]' .
```

For example, replace `TOPIC` with `architecture` -- today the only topic anchored in this repository -- to find the two files carrying that anchor.

## Approval boundaries

Get explicit approval before changing the public command surface, authentication behavior, dependency set, local configuration format, or destructive-command safety behavior.
