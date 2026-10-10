# Experimental Live Texture Preview — upstream #252 (second slice)

Source: [OmarB97's PR #252](https://github.com/lightningpixel/modly/pull/252).
Stacked after the explicit Artist Context experiment in [PR #6](https://github.com/JayceeB1/modly/pull/6).

This is a **candidate**, not an approved release or a replacement for the
original upstream implementation.

## Behavior

An explicit "Watch texture" action opens an OS-owned PNG picker. The main
process owns the filesystem watcher per renderer and sends revisioned, bounded
PNG snapshots to the preview. Only a loaded model with a *single painted
texture* is supported; multi-texture assets are rejected with an explanation.
The texture must retain its original dimensions.

Saving the chosen file emits a coalesced change notification; incomplete
saves are retried. Good changes are applied to the viewer, and invalid saves
show an error without discarding the previous appearance.

## Additional guardrails relative to source PR

- No arbitrary watch-path argument from renderer code. The OS picker chooses
  the file; only the owning window receives updates. Watchers are cleaned up
  on navigation/destruction and app quit.
- Maximum 32 MiB encoded PNG per read, with bounded file-handle reads and a
  check for file-size/mtime changes during save. Reject direct symlink files,
  oversized dimensions and non-PNG paths.
- Do not forcibly change texture filters or color space: reuse settings from
  the model's original map. Restore original maps before freeing live preview
  GPU textures on panel unmount; discard stale asynchronous loads.
- Unit regressions cover truncated saves, recovery, per-owner stop,
  symlinks, size caps, invalid dimensions, IPC visibility, single/multiple
  texture detection, map swaps, and cleanup.

## Validation

- [ ] Linux GitHub Actions: full Node/Python, build, lint and TypeScript gates
- [ ] Windows GitHub Actions: watcher/IPC/Three.js tests and desktop bundle
- [ ] Real interactive Electron test: preview texture edit in external editor,
      incomplete save, recovery, restart, project change, GPU usage, undo/redo
- [ ] Manual large/animated/UV-transformed GLB cases and image decode failures

This feature is an **opt-in viewer preview**, not a background image editor or
a guarantee of texture persistence into saved GLBs. It deliberately does not
automatically rewrite any user files, nor import the old global UI-zoom changes.
