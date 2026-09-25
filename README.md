<!-- DOCS: [architecture] -->

# Ardent CLI

The Ardent CLI is the customer command-line client for the control-plane API.

Install the beta with `npm install --global ardent-cli-beta`, then run
`ardent-beta <command>`. The package registers only the `ardent-beta` executable,
so it can be installed alongside an existing `ardent` command. `package.json`
carries version `0.0.0` in source; the release pipeline sets the published
version when it publishes, so a local build reports `0.0.0`.

The Oclif foundation and authentication are implemented. `ardent-beta login` opens
the Ardent frontend, receives an authorization code on a loopback callback, and
exchanges it for an API key with PKCE. `ardent-beta login --token <token>` validates and stores an existing
API token for CI and automation; `ARDENT_TOKEN` supplies the same flag
non-interactively, and one that is set but empty fails rather than starting a
browser login. `ardent-beta status` and `ardent-beta logout` inspect and remove that
local session. The CLI defaults to Ardent's production control plane. Oclif
provides help, version, autocomplete, and native JSON command behavior. Resource
context is retained from login. Project listing, creation, deletion, and local
context switching are implemented. Organization member listing, invitation,
removal, and pending-invitation cancellation are implemented. Connector listing
and registration are implemented; registration follows connector status and
sends the connection URL for the control plane's credential delivery, while
replication readiness remains owed. Connector-scoped branch
creation, deletion, listing, and local switching are implemented.

[openapi.json](openapi.json) describes the HTTP endpoints used by the CLI and
ships in the npm package. It is a documentation snapshot of the control-plane
specification as of 2026-09-24, from Ardent's private source revision
`c8510ab3e2422756a93e1df09acf994cf6bac34d`, and not proof of deployed
compatibility. To refresh it, replace it with the reviewed
control-plane specification, record its source revision here, and run `make ci`.
The package test verifies archive contents; it does not detect upstream API
changes. Ownership and snapshot limits are recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

Set `ARDENT_API_URL` to point the CLI at a development control plane. Without
it, the CLI uses `https://production.tryardent.com`.

```bash
npm ci
npm run build
./bin/run.js --help
./bin/run.js login
./bin/run.js login --token <token>
./bin/run.js project list
./bin/run.js project create "My project"
./bin/run.js project switch "My project"
./bin/run.js project delete "My project"
./bin/run.js member list
./bin/run.js member invite teammate@example.com
./bin/run.js member invite administrator@example.com --role admin
./bin/run.js member delete teammate@example.com
./bin/run.js connector list
./bin/run.js connector create postgresql 'postgresql://user:password@database.example.com/app'
./bin/run.js branch create "my feature"
./bin/run.js branch list
./bin/run.js branch switch "my feature"
./bin/run.js branch delete "my feature"
ARDENT_API_URL=http://localhost:8080 ./bin/run.js login --token <token>
```

Branch commands operate on a connector. When discovering connectors, the CLI uses
its project context; one connector is selected automatically. In an interactive
terminal, multiple connectors appear in a numbered picker with the saved connector
as the default. Automation uses the saved connector and fails if selection is
ambiguous. Project changes clear connector and branch context.

Creation uses the connector's latest published snapshot. If that snapshot is
unavailable, creation fails without choosing an older one. Names are unique within
a connector while the branch is not deleted. `branch delete` sends the connector
and name to the API, which resolves the target. `branch list` fetches current state
and marks the locally selected branch with `●` in its `Selected` column; `branch switch` changes local
context. Create and delete follow the operation in an interactive terminal;
non-interactive commands and `--json` return the accepted operation immediately.

Before changing this repository, read [ARDENT_CLI_DEVELOPMENT.md](ARDENT_CLI_DEVELOPMENT.md).

Running `npm test` or `make ci` requires Node 22+, npm and `tar`. The interactive
tests also require macOS's system `script`, or Linux's util-linux `script` with
`-e` and `-c` support, on `PATH`. These are test prerequisites; the installed CLI
does not invoke `script`. The PTY tests skip other operating systems and fail on
Linux if the required utility is missing or incompatible.
