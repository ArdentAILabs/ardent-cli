# Ardent CLI -- working agreement

Applies to every file in this directory.

**This file stands alone.** This directory is exported one way to a mirror
repository, where this file sits at the root and can follow no link above it.
Everything it needs is stated here rather than inherited, and every path it
names is relative to this directory.

`ARDENT_CLI_DEVELOPMENT.md` is the canonical guide. Read it before changing
anything here. `CONTRIBUTING.md` explains how changes reach this repository.

Use [Iteration and verification](ARDENT_CLI_DEVELOPMENT.md#iteration-and-verification)
for the local build/test loop, package checks and live API verification limits.

## What this component is

An independent customer command-line client for the Ardent control-plane API. It
owns authentication UX, local context, request construction, workflow-status
polling, and terminal output.

`README.md` carries the implementation status for this component.

It does **not** own infrastructure deployment, environment-selection policy,
cloud access, Kubernetes behavior, data-plane implementation, or direct database
access. It talks to the control plane through authenticated requests and owns
its own request and response types.

## The three documents

Three documents under `docs/` are the entry points, and this directory keeps no
others there. `docs/REQUIREMENTS.md` is what must hold and what is owed.
`docs/EVIDENCE.md` is what was measured, under what conditions, and what the
measurement does not reach. `docs/DECISIONS.md` is why a choice was made and
what it displaced, including the options it rejected.

A change that falsifies one of them fixes it in the same commit. The trigger is
that a document became wrong, never that a file was touched: writing a section
because the diff looked thin is how a reader loses the ability to tell a
verified sentence from a decorative one. Where a truthful edit cannot be made,
the change is not finished.

`README.md` stays the one home for implementation status. A requirement's
reasoning stays beside the requirement rather than moving to
`docs/DECISIONS.md`, which holds the choices that shaped the component rather
than one of its flags.

This directory is exported, so every path above is relative to it and the
control-plane API it consumes is named rather than pointed at. A reader of the
mirror can resolve no path outside this directory.

## Rules specific to this component

- **Keep target selection visible.** A command that can create, mutate, or
  delete a resource states what it is about to act on, and fails closed rather
  than silently targeting production.
- **Do not copy control-plane models or generated clients into this
  repository**, import sibling source, or create generic shared packages. The
  wire format is the contract; the types on this side are this side's.
- Add a directory only when an approved CLI behavior requires it.

## Rules that also apply here

- **A document may not assert a property the code does not have.** Name the
  mechanism, and check that it covers the scope the sentence claims. Work that
  is owed is stated as owed.
- **An argument has one home**, normally its enforcement site; every other
  mention names it rather than restating it. Invariants may be restated wherever
  a reader needs them. Arguments may not.
- **Code is debt.** Minimize it, but never at the expense of correctness,
  clarity, or a complete implementation. A helper, abstraction, package, or
  layer must represent real reuse, ownership, policy, or an independently
  testable boundary.
- **`_TODO.md`** reserves a directory that is approved but not yet built and
  says what belongs there. It is not a backlog item to pick up unprompted.
- **`<!-- DOCS: [topic] -->`** anchors use a closed vocabulary: `analytics`,
  `architecture`, `auth`, `billing`, `branching`, `connectors`, `environments`,
  `infrastructure`, `organizations`, `policies`, `projects`, `workflows`. Most
  sections need no anchor.
- **Every commit carries a `Signed-off-by` trailer** naming its own author
  (`git commit -s`). See `CONTRIBUTING.md`.

## Approval

Get explicit approval before changing the public command surface, authentication
behavior, the dependency set, the local configuration format, or
destructive-command safety behavior.
