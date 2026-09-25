# Contributing

**Read this paragraph before you write any code.** This repository is a read-only export of Ardent's
private upstream repository, which is the only place this code is edited. Changes travel one way,
from upstream to here, by an export a maintainer runs from the upstream repository, replaying
upstream history onto this one. Exports are manual, so there is no fixed schedule for when a merged
change arrives. A commit made directly here stops the next export until a maintainer removes it, so nothing is committed here directly. Pull requests are
genuinely welcome and are the right way to contribute: a maintainer applies an accepted PR upstream
with your authorship preserved, and it arrives back here on the next export. Your PR is therefore
closed rather than merged with the green button, and the commit that lands carries your name. That
is the normal successful outcome, not a rejection.

## Before you start

Open an issue, or a draft PR describing the approach, before writing a substantial patch. Because
changes land through a manual upstream apply, a large PR that collides with unreleased upstream work
costs you far more than it costs us.

Read [`ARDENT_CLI_DEVELOPMENT.md`](ARDENT_CLI_DEVELOPMENT.md) first. It is the authoritative guide to
what this repository owns and how it may be changed. Two rules in it catch people out: the CLI never
copies control-plane models or generated clients, and commands that can create, mutate, or delete
resources must keep their target visible and fail closed rather than silently act on production.

## Building and testing

```bash
make ci          # install, type-check, test, build, and inspect the npm package
```

Run `make ci` before opening a pull request. Upstream CI runs that same target.

Five things are approval boundaries, not review comments: the public command surface, authentication
behavior, the dependency set, the local configuration format, and destructive-command safety
behavior. Propose a change to any of them in an issue before you build it. Documentation corrections
need no preamble.

## Conventions that will surprise you

- **`_TODO.md` files are structure, not backlog.** A file ending in `_TODO.md` reserves a directory
  that has been approved but not yet built, and defines what belongs there. It starts with a
  `# TODO:` heading and is deleted by the change that puts real implementation in that directory. It
  is not a ticket to pick up unprompted.
- **`<!-- DOCS: [TOPIC] -->` anchors use a closed vocabulary.** The permitted topics are
  `analytics`, `architecture`, `auth`, `billing`, `branching`, `connectors`, `environments`,
  `infrastructure`, `organizations`, `policies`, `projects`, and `workflows`. They name product and
  architectural domains — not documentation types, file layouts, or libraries. Most sections need no
  anchor at all.

## Changes that get extra scrutiny

The CLI holds credentials that authorize changes to a customer's entire Ardent organization, and it
is installed from a public registry. Patches touching credential storage, terminal or log output
that could echo a token, TLS verification, the dependency set, or destructive-command targeting are
reviewed harder and land slower. Adding a dependency needs a justification, because every dependency
is added to the supply chain of everyone who installs the CLI.

## Licensing

Contributions are accepted under the Apache License 2.0, the same license this repository is
distributed under — see [`LICENSE`](LICENSE). By opening a pull request you offer your contribution
under those terms: inbound license equals outbound license. Do not contribute code you cannot
license this way, and do not paste in code from a project under a different license.

## Sign off your commits

Ardent uses the **Developer Certificate of Origin (DCO)**. Every commit must carry a
`Signed-off-by` line, which `git` adds for you:

```bash
git commit -s -m "your message"
```

Signing off asserts that you wrote the contribution, or otherwise have the right to submit it
under Apache-2.0. It is an assertion about provenance, not a transfer of rights — you keep your
copyright.

There is no CLA to sign. Apache-2.0 section 5 already provides that a contribution submitted for
inclusion is licensed under Apache-2.0 unless you say otherwise, so no separate agreement is
needed to accept your work.

Sign-off is enforced automatically. Upstream CI runs a `dco` job on every pull request that
requires each non-merge commit to carry a `Signed-off-by` line matching its author, and that job is
required to merge. Your contribution passes through it when a maintainer applies the change
upstream, so a missing trailer stops the work there.

> **Maintainers:** the `dco` job gates the upstream pull request, not the one opened here — this
> export repository does not run it. Check sign-off before you apply, so a contributor hears about
> a missing trailer while the branch is still theirs to amend (`git commit --amend -s`, or
> `git rebase --signoff <base>` for a range). Note in the PR that it passed when you close it.

## Security

Do not report security vulnerabilities through issues or pull requests.
[`SECURITY.md`](SECURITY.md) has the private disclosure channels and the scope.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Report unacceptable behavior to
conduct@tryardent.com.
