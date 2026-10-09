import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveDerivedFrom } from './lineage.ts'

function withTemp(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'modly-lineage-'))
  try { run(root) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
function createGlb(file, name) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0', extras: { modly: { name } } } }))
  const padding = Buffer.alloc((4 - json.length % 4) % 4, 0x20)
  const payload = Buffer.concat([json, padding])
  const header = Buffer.alloc(20)
  header.write('glTF', 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + payload.length, 8)
  header.writeUInt32LE(payload.length, 12)
  header.write('JSON', 16)
  fs.writeFileSync(file, Buffer.concat([header, payload]))
}

test('direct source preserves parent/root with bounded name', () => withTemp((root) => {
  const workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace)
  const source = path.join(workspace, 'hero.glb')
  createGlb(source, 'embedded')
  fs.writeFileSync(path.join(workspace, 'hero.tags.json'), JSON.stringify({ name: 'Murloc', tags: ['hero'] }))
  assert.deepEqual(resolveDerivedFrom(source, workspace), {
    parent: { path: 'hero.glb', name: 'Murloc' },
    root: { path: 'hero.glb', name: 'Murloc' },
  })
}))

test('re-export preserves original root and updates immediate parent', () => withTemp((root) => {
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const source = path.join(workspace, 'v3.glb'); createGlb(source, 'v3')
  fs.writeFileSync(path.join(workspace, 'v3.tags.json'), JSON.stringify({
    name: 'Version 3',
    derived_from: { parent: { path: 'v2.glb', name: 'Version 2' }, root: { path: 'v1.glb', name: 'Original' } },
  }))
  assert.deepEqual(resolveDerivedFrom(source, workspace), {
    parent: { path: 'v3.glb', name: 'Version 3' },
    root: { path: 'v1.glb', name: 'Original' },
  })
}))

test('GLB extras provide a fallback name', () => withTemp((root) => {
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const source = path.join(workspace, 'source.glb'); createGlb(source, 'embedded')
  assert.equal(resolveDerivedFrom(source, workspace).parent.name, 'embedded')
}))

test('sibling-prefix and outside paths cannot become lineage sources', () => withTemp((root) => {
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const outside = path.join(root, 'workspace-other'); fs.mkdirSync(outside)
  const source = path.join(outside, 'secret.glb'); createGlb(source, 'secret')
  assert.equal(resolveDerivedFrom(source, workspace), null)
  assert.equal(resolveDerivedFrom('../secret.glb', workspace), null)
}))

test('symlink that leaves workspace is rejected', { skip: process.platform === 'win32' }, () => withTemp((root) => {
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const original = path.join(root, 'source.glb'); createGlb(original, 'outside')
  const symlink = path.join(workspace, 'aliased.glb'); fs.symlinkSync(original, symlink)
  assert.equal(resolveDerivedFrom(symlink, workspace), null)
}))

test('corrupt root reference cannot fabricate ancestry', () => withTemp((root) => {
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const source = path.join(workspace, 'source.glb'); createGlb(source, 'embedded')
  fs.writeFileSync(path.join(workspace, 'source.tags.json'), JSON.stringify({
    name: 'derived', derived_from: { root: { path: '../elsewhere.glb', name: 'outside' } },
  }))
  assert.deepEqual(resolveDerivedFrom(source, workspace), {
    parent: { path: 'source.glb', name: 'derived' }, root: { path: 'source.glb', name: 'derived' },
  })
}))

test('invalid and oversized sidecars fall back to GLB without reading outside', () => withTemp((root) => {
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const source = path.join(workspace, 'source.glb'); createGlb(source, 'embedded')
  fs.writeFileSync(path.join(workspace, 'source.tags.json'), ' '.repeat(66000))
  assert.equal(resolveDerivedFrom(source, workspace).parent.name, 'embedded')
}))
