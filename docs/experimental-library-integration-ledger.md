# Experimental Library & Lineage Integration Ledger — 2026-10-09

> **NOT A RELEASE.** Review branch only. Parent: `integration/modly-next-2026-10-09`
> (upstream v0.4.3 + separate candidate fixes). This port has **not** passed
> combined npm/TypeScript/Python tests or a Windows desktop smoke test.

## Source PRs ported as separate commits

| Upstream PR | Feature | Port note |
| --- | --- | --- |
| [#242](https://github.com/lightningpixel/modly/pull/242) | Animated GLB clips | Corrected malformed upstream JSX fallback `{clip.name || }` on our branch, then incorporated the MotionBar replacement from #245. |
| [#243](https://github.com/lightningpixel/modly/pull/243) | Library thumbnails and width persistence | Reconciled GeneratePage state with current mesh-export UI. |
| [#244](https://github.com/lightningpixel/modly/pull/244) | Normalize manifest object-shaped input slots | Merged 3 regression cases into the newer existing test file. |
| [#245](https://github.com/lightningpixel/modly/pull/245) | Motion bar, tag UX, export metadata, panel zoom/resize | Reconciled viewer and parameter controls with 0.4.3; intentionally did not overwrite newer `package-lock.json`. Added required free-text param renderer. |
| [#247](https://github.com/lightningpixel/modly/pull/247) | Taller resizable Library | Reconciled stored height and state refs with current viewer. |
| [#248](https://github.com/lightningpixel/modly/pull/248) | Wider Library, direct open, hover-preview | Reconciled preview type imports. |
| [#249](https://github.com/lightningpixel/modly/pull/249) | Gallery grouped by project and lineage | Integrated updated asset-index tests in current suite. |

**Credits:** The work is based on PRs submitted by OmarB97 to Lightning Pixel's
Modly repository. The adaptations in this fork do not supersede their source PRs.

## Not ported: requires an independent functional adaptation

- **#246** is staged on child branch `integration/agent-asset-context-2026-10-10`:
  bounded, workspace-confined sidecar/GLB metadata is surfaced to the existing
  llama.cpp assistant; clip names and multiline narrative inputs are supported.
  Provenance now threads through workflow process inputs, with an ambiguity
  check, and the exporter writes a two-hop `derived_from` record without
  following arbitrary file paths from metadata. Five isolated Python and seven
  isolated Node tests passed. Combined end-to-end desktop tests remain unrun.
- **#250** is now staged in child branch `integration/optimizer-presets-2026-10-10`.
  The current Python workflow adapter implements full-detail pass-through without
  changing the shared mesh-op API, and normalizes numeric budgets from HTML selects.
  Four regression tests were added to the project's Python suite; five isolated
  Python checks passed on a reproduction of the changed adapter.
- **#251** is now staged on the same child branch in two focused commits:
  freshest-value parameter bindings, plus shared Library/viewer animation state
  and responsive Library placement. Seven isolated Node tests passed for the
  binding helper, including orphaned/self references and prototype-safe keys.
  Native Electron/browser smoke tests and combined project CI remain unrun.
- **#252 (Artist intent + texture hot reload):** divided into separately
  reviewable features. The child branch `integration/artist-intent-core-2026-10-10`
  now stages **explicit** Artist Context start/carry nodes and the versioned
  `modly.intent.v1` record. The carrying operations verify physical workspace
  containment, reject sidecar symlinks and cap input and metadata sizes.
  **Automatic** intent propagation through generated model stages, texture
  hot-reloading, and proof assets are **NOT** integrated. The nine regression
  tests are added to the Node test command; full suite and Windows smoke are pending.

## Validation checklist — currently not executed on the combined branch

- [ ] Install dependencies reproducibly and run `npm run lint`.
- [ ] `npm run test:node` and `npm run test:py`.
- [ ] `npx tsc --noEmit -p tsconfig.node.json`.
- [ ] `npm run build`.
- [ ] Native Windows checks: launch Electron and load GLB with 1 and 3 clips,
  switch motion bar clips, unload, and verify mixer teardown.
- [ ] Check Library thumbnails, previews, project/lineage filters and persistent
  panel size across restart, with missing/corrupt metadata.
- [ ] Export rigged GLB/OBJ/STL/PLY, verify transforms/tags and project lineage.
- [ ] Verify binding source parameter updates propagate through actual paused
  and repeated workflows without hiding missing or invalid source questions.
- [ ] Verify 3D motion-bar and Library previews remain synchronized, including
  changing models and project/lineage views.
- [ ] Retry free-text params and object-shaped manifest inputs.
- [ ] Generate an asset, re-export it via multiple processing nodes and verify
  ancestry labels in the exported .tags.json, with symlink and multi-parent cases.
- [ ] Check chat context with sidecars, embedded GLB extras, long/malicious labels,
  and its tool responses under both local and external LLM providers.
- [ ] Exercise the explicit #252 start/carry nodes in a real workflow with valid
  PNG input and GLB output, including restart, conflicting intent IDs,
  temporary workspace cleanup and sidecar read/write failures.
- [ ] Design separate additive automation for carrying `modly.intent.v1` through
  model generation; do not gate ordinary existing workflows on its presence.
- [ ] Review #252 live texture watcher on another branch; avoid importing the
  old fork UI/renderer files wholesale.
- [ ] Verify source #370 destructive-storage safeguards and related tests in
  the final combined branch.
- [ ] Review source #266 local API security separately (not included).

## Integration rules

1. Keep the user's `main` and upstream untouched.
2. Pin reviewed source PR/commit IDs; credit original contributors.
3. A matching patch hunk is **not** a passing test.
4. Do not merge this branch into Modly Next before validating the full
   app and resolving the remaining integration ledger.
