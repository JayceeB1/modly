# Experimental Artist Context — first slice of upstream #252

This is a **candidate**, not a validated Modly release. Original feature author:
[OmarB97](https://github.com/OmarB97), source:
[lightningpixel/modly#252](https://github.com/lightningpixel/modly/pull/252).

## Why a separate experiment?

The upstream PR combines a versioned artist-intent sidecar, automatic workflow
propagation, animation/quality hints and live texture hot reload. It predates
the current v0.4.3 shared mesh operations, scene artifacts and llama.cpp agent.
Importing the entire old branch would replace working new code.

This branch includes *only* the explicit `intent-travel` process extension:
- **Remember Artist Context** accepts an image, creates a unique staged copy
  below `workspace/Workflows/intent-sources/<id>/source.<ext>`, and writes its
  `.tags.json` with an append-only-style `modly.intent.v1` record.
- **Carry Artist Context** accepts a workspace asset *whose sidecar already
  has intent*, plus a separate **existing** workspace destination asset
  selected by `destinationPath`. It verifies both paths physically remain
  inside the workspace and merges the intent by ID, refusing disagreement.

Each start has a fresh ID. Fields cover project, movement, extra details,
style name and style prompt, and the source image's filename. The original
external image is not modified.

**Critical limitation:** this does **not** automatically carry intent
across a generator that outputs a new mesh. After a normal image→3D step,
the resulting mesh will not necessarily have the source image's sidecar.
The carry node therefore requires an explicit source asset that already
contains an intent record. Do not advertise this as a complete end-to-end
artist-memory workflow yet.

## Safety contract

- Managed sidecars and carry source/destination must remain within the
  canonical workspace; symlinked sidecars and staging ancestors that escape
  the workspace are rejected.
- A source image can be read from outside only after its extension is
  verified and its size is capped at 64 MiB, then it is copied into the
  managed workspace. Sidecars and records are limited to 1 MiB.
- A conflicting `intent_id` fails without overwriting the destination
  metadata. Existing metadata fields are retained.
- This is not an OS-level sandbox, and symlink races/external modifications
  still require broader runtime/security review.

## Verification ledger

- [x] Files written to a dedicated branch, separate from `main`.
- [x] Nine regression test cases added, including workspace escapes,
  symlinks, oversized sidecars, missing destinations, and intent conflicts.
- [ ] Run targeted Node tests against the full repository dependencies.
- [ ] Run full Node/Python test suites, TypeScript checking, lint and Electron.
- [ ] Test on Windows, including junctions, long paths, and normal asset flows.
- [ ] Test actual UI/extension wiring, existing project data and data retention.

The live-texture-watch component of #252 is intentionally **not** part of this
slice. Integrate and validate it separately.
