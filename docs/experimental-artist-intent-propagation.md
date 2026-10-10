# Artist Context — Explicit Start, Automatic Stage Carry

Source: [OmarB97's Modly #252](https://github.com/lightningpixel/modly/pull/252).
This experimental slice stacks on the standalone
[Artist Context core](https://github.com/JayceeB1/modly/pull/6).

## What changes

Only a workflow with the **Remember Artist Context** (intent-travel/start)
node is opted in. Its output is a staged image containing a new
\`modly.intent.v1\` sidecar. A processing stage receiving that image or a
derived image/mesh automatically runs intent-travel/carry before publishing
its output, appending a stage event and retaining the immutable request ID,
artist words, style and project.

The goal is to preserve the original brief through:

Image → Remember Artist Context → Style → Generator → Rig/Optimize → GLB Export

The **Carry Artist Context** node also remains available for an explicit
source/destination transfer when a workflow cannot infer the connection.

## Fail-closed rules

- Workflows without an explicit start node remain unchanged.
- A generated stage never invents an original request or ancestry.
- Multiple input asset paths must **all** carry the same intent marker.
  Mixed tagged/untagged files or different roots produce an explicit error
  rather than silently attributing the output to the wrong source.
- Text-only edge inputs do not invalidate one tagged image/mesh.
- Processors can return the original path unchanged (e.g. Full detail);
  no copy is needed then.
- If the processor fails to carry the record, the workflow returns an
  error rather than declaring completion with missing metadata.
- The renderer cannot choose arbitrary artist-intent sidecar paths;
  the underlying process extension rechecks physical workspace location
  and sidecar size limits.
- A drag/drop image in \`selectedImageData\` can initialize the record,
  with the same image size cap as the source processor.

## Tests and evidence

- Seven pure Node regression cases validate the decision logic for opt-in,
  common origins, conflicting sources, orphaned/unmarked sources and text.
- The helper is wired into the existing Node test command and runs in
  Windows and Linux checks.
- Integration compilation (Electron, TypeScript) ensures the runner and
  extension signatures remain compatible.

## Remaining acceptance work

- [ ] Real Windows desktop run with a reference PNG and installed generators
      (Style → 3D model → optimizer → exporter)
- [ ] Inspect the exported \`.tags.json\`: stable \`intent_id\`, original
      sentences, stage events, project, \`derived_from\` unchanged
- [ ] Verify restart/continue and interrupted stage scenarios, including
      source-output races and large inputs
- [ ] Review storage retention: staged source image copies currently remain
      in \`Workflows/intent-sources\` until cleaned intentionally
- [ ] Validate compatibility with multi-input texture and scene generators

Not an automatic change to all existing Modly workflows; **not approved for
release** until runtime smoke tests and storage retention policy are reviewed.
