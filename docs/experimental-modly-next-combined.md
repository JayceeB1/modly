# Modly Next — combined experimental preview (2026-10-10)

This branch is the **working integration snapshot** of
[Modly Next's earlier PRs](https://github.com/JayceeB1/modly/pulls) and
the two independent parts of upstream
[OmarB97's Modly #252](https://github.com/lightningpixel/modly/pull/252):

- **Artist Context:** opt-in \`modly.intent.v1\` record and automatic carrying
  of verified intent only when the workflow contains "Remember Artist Context"
  ([PR #8](https://github.com/JayceeB1/modly/pull/8)).
- **Live Texture:** OS-picked PNG watcher with bounded reads, recoverable
  saves and viewer preview cleanup
  ([PR #7](https://github.com/JayceeB1/modly/pull/7)).

A two-parent Git commit combines those separately reviewed changes without
rewriting either original branch or flattening attribution.

## Current gates

- [ ] Run the **combined** Linux full Node, Python, lint, typecheck, build
- [ ] Run combined Windows watcher, intent, filesystem and build checks
- [ ] Real Windows desktop pilot in a disposable workspace
- [ ] Exercise a real image→model→optimizer→export workflow carrying intent
- [ ] Watch a real texture file edited in another program and verify cleanup
- [ ] Verify migration/retention of staged images and \`.tags.json\` files
- [ ] Review existing storage deletion policies before opening real user data

This is **not** a published release. Do not merge into \`main\` or distribute
an installer without the manual gates above.
