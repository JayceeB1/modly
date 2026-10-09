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

- **#246 (Chat + asset context):** its old Ollama agent backend does not match
  current 0.4.3 llama.cpp/chat architecture. The workflow runner input routing
  also changed. Do not paste the old agent router or silently drop context.
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
- **#252 (Artist intent record and texture hot reload):** much larger divergent
  patch (workflow and API changes, new watcher services, extra proof assets).
  Requires separate rebase and validation against 0.4.3 and #246/#251.

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
- [ ] Verify source #370 destructive-storage safeguards and related tests in
  the final combined branch.
- [ ] Review source #266 local API security separately (not included).

## Integration rules

1. Keep the user's `main` and upstream untouched.
2. Pin reviewed source PR/commit IDs; credit original contributors.
3. A matching patch hunk is **not** a passing test.
4. Do not merge this branch into Modly Next before validating the full
   app and resolving the remaining integration ledger.
