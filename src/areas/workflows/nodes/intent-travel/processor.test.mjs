import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync,
  rmSync, symlinkSync, existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function loadModule() {
  const outDir = mkdtempSync(join(tmpdir(), 'modly-intent-test-module-'))
  const outfile = join(outDir, 'processor.cjs')
  const compiled = buildSync({
    entryPoints: [resolve('src/areas/workflows/nodes/intent-travel/processor.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false,
  })
  writeFileSync(outfile, compiled.outputFiles[0].text, 'utf8')
  return createRequire(import.meta.url)(outfile)
}

const processor = loadModule()
const context = (workspaceDir) => ({ workspaceDir, progress() {} })
const sidecar = (p) => p.replace(/\.[^./\\]+$/, '') + '.tags.json'
const metadata = (p) => JSON.parse(readFileSync(sidecar(p), 'utf8'))

async function withWorkspace(run) {
  const root = mkdtempSync(join(tmpdir(), 'modly-intent-'))
  const workspace = join(root, 'workspace')
  mkdirSync(workspace)
  try { await run(root, workspace) } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('start makes unique v1 records and leaves the original source untouched', async () => {
  await withWorkspace(async (root, workspace) => {
    const image = join(root, 'input.png')
    writeFileSync(image, Buffer.from([137, 80, 78, 71]))
    const params = {
      project: 'Azeroth', extraDetails: 'A patient scout.',
      movement: 'Swim slowly.', styleName: 'Low-poly', stylePrompt: 'Warm light',
    }
    const a = await processor({ filePath: image, nodeId: 'start' }, params, context(workspace))
    const b = await processor({ filePath: image, nodeId: 'start' }, params, context(workspace))
    assert.notEqual(a.filePath, b.filePath)
    assert.equal(readFileSync(image).length, 4)
    const intent = metadata(a.filePath).intent
    assert.equal(intent.schema, 'modly.intent.v1')
    assert.equal(intent.request.source_image, 'input.png')
    assert.equal(intent.request.project, 'Azeroth')
    assert.equal(intent.artist_words.some((word) => word.text === 'A patient scout.'), true)
    assert.equal(intent.artist_words.some((word) => word.text === 'Swim slowly.'), true)
    assert.equal(intent.style_choices[0].name, 'Low-poly')
    assert.equal(intent.style_choices[0].prompt, 'Warm light')
  })
})

test('carry preserves request identity and appends one immutable stage event', async () => {
  await withWorkspace(async (root, workspace) => {
    const image = join(root, 'source.png')
    writeFileSync(image, Buffer.from([137, 80, 78, 71]))
    const input = (await processor({ filePath: image, nodeId: 'start' }, {
      project: 'Azeroth',
    }, context(workspace))).filePath
    const result = join(workspace, 'asset.glb')
    writeFileSync(result, 'glb')
    await processor({ filePath: input, nodeId: 'carry' },
      { destinationPath: result, stage: 'mesh-generation' }, context(workspace))
    const before = metadata(input).intent
    const after = metadata(result).intent
    assert.equal(after.intent_id, before.intent_id)
    assert.deepEqual(after.request, before.request)
    assert.equal(after.stage_events.length, before.stage_events.length + 1)
    assert.equal(after.stage_events.at(-1).stage, 'mesh-generation')
  })
})

test('carry never writes outside the physical workspace', async () => {
  await withWorkspace(async (root, workspace) => {
    const image = join(root, 'source.png')
    writeFileSync(image, 'png')
    const input = (await processor({ filePath: image, nodeId: 'start' }, {},
      context(workspace))).filePath
    const outside = join(root, 'personal.glb')
    writeFileSync(outside, 'personal')
    await assert.rejects(() => processor({ filePath: input, nodeId: 'carry' },
      { destinationPath: outside }, context(workspace)), /inside the workspace/)
    assert.equal(readFileSync(outside, 'utf8'), 'personal')
    assert.equal(existsSync(sidecar(outside)), false)
  })
})

test('carry rejects a missing destination instead of writing orphaned metadata', async () => {
  await withWorkspace(async (root, workspace) => {
    const image = join(root, 'source.png')
    writeFileSync(image, 'png')
    const input = (await processor({ filePath: image, nodeId: 'start' }, {},
      context(workspace))).filePath
    const missing = join(workspace, 'missing.glb')
    await assert.rejects(() => processor({ filePath: input, nodeId: 'carry' },
      { destinationPath: missing }, context(workspace)))
    assert.equal(existsSync(sidecar(missing)), false)
  })
})

test('nonimage source is rejected before any staging', async () => {
  await withWorkspace(async (root, workspace) => {
    const file = join(root, 'secret.txt')
    writeFileSync(file, 'secret')
    await assert.rejects(() => processor({ filePath: file, nodeId: 'start' }, {},
      context(workspace)), /image file/)
    assert.equal(existsSync(join(workspace, 'Workflows', 'intent-sources')), false)
  })
})

test('conflicting artist identity does not overwrite the destination sidecar', async () => {
  await withWorkspace(async (root, workspace) => {
    const image = join(root, 'source.png')
    writeFileSync(image, 'png')
    const input = (await processor({ filePath: image, nodeId: 'start' }, {},
      context(workspace))).filePath
    const output = join(workspace, 'asset.glb')
    writeFileSync(output, 'mesh')
    const contents = JSON.stringify({
      intent: { schema: 'modly.intent.v1', intent_id: 'different' },
    })
    writeFileSync(sidecar(output), contents)
    await assert.rejects(() => processor({ filePath: input, nodeId: 'carry' },
      { destinationPath: output }, context(workspace)))
    assert.equal(readFileSync(sidecar(output), 'utf8'), contents)
  })
})

test('oversized source sidecar is rejected before carry', async () => {
  await withWorkspace(async (root, workspace) => {
    const image = join(root, 'source.png')
    writeFileSync(image, 'png')
    const input = (await processor({ filePath: image, nodeId: 'start' }, {},
      context(workspace))).filePath
    writeFileSync(sidecar(input), ' '.repeat(1024 * 1024 + 1))
    const output = join(workspace, 'asset.glb')
    writeFileSync(output, 'mesh')
    await assert.rejects(() => processor({ filePath: input, nodeId: 'carry' },
      { destinationPath: output }, context(workspace)), /too large|exceeds|cannot be read/)
    assert.equal(existsSync(sidecar(output)), false)
  })
})

test('stage rejects Workflows symlink escaping the workspace', {
  skip: process.platform === 'win32',
}, async () => {
  await withWorkspace(async (root, workspace) => {
    const outside = join(root, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, join(workspace, 'Workflows'), 'dir')
    const image = join(root, 'image.png')
    writeFileSync(image, 'png')
    await assert.rejects(() => processor({ filePath: image, nodeId: 'start' },
      {}, context(workspace)), /inside the workspace/)
    assert.equal(existsSync(join(outside, 'intent-sources')), false)
  })
})

test('carry refuses a sidecar symlink outside the workspace', {
  skip: process.platform === 'win32',
}, async () => {
  await withWorkspace(async (root, workspace) => {
    const image = join(root, 'source.png')
    writeFileSync(image, 'png')
    const input = (await processor({ filePath: image, nodeId: 'start' }, {},
      context(workspace))).filePath
    const output = join(workspace, 'asset.glb')
    writeFileSync(output, 'mesh')
    const personal = join(root, 'personal.json')
    writeFileSync(personal, JSON.stringify({ preserve: true }))
    symlinkSync(personal, sidecar(output))
    await assert.rejects(() => processor({ filePath: input, nodeId: 'carry' },
      { destinationPath: output }, context(workspace)), /symlink/)
    assert.equal(readFileSync(personal, 'utf8'), '{"preserve":true}')
  })
})
