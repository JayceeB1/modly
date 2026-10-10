import assert from 'node:assert/strict'
import test from 'node:test'
import { assessIntentSources } from './intentPropagation.ts'

test('opt-out workflows do not receive arbitrary artist intent', () => {
  assert.deepEqual(assessIntentSources([]), { source: undefined, conflict: false })
  assert.deepEqual(assessIntentSources([{ filePath: 'external.glb' }]), { source: undefined, conflict: false })
})

test('a single stamped asset propagates its own request', () => {
  assert.deepEqual(assessIntentSources([
    { filePath: 'stage.png', intentAssetPath: 'stage.png' },
  ]), { source: 'stage.png', conflict: false })
})

test('two matching stamped copies remain attributable to the same request', () => {
  assert.deepEqual(assessIntentSources([
    { filePath: 'stage1.glb', intentAssetPath: 'root.png' },
    { filePath: 'stage2.glb', intentAssetPath: 'root.png' },
  ]), { source: 'root.png', conflict: false })
})

test('two distinct stamped assets fail closed rather than forging ownership', () => {
  assert.deepEqual(assessIntentSources([
    { filePath: 'first.glb', intentAssetPath: 'first.png' },
    { filePath: 'second.glb', intentAssetPath: 'second.png' },
  ]), { source: undefined, conflict: true })
})

test('a mixed stamped and unstamped image is an explicit conflict', () => {
  assert.deepEqual(assessIntentSources([
    { filePath: 'stamped.glb', intentAssetPath: 'stamped.glb' },
    { filePath: 'other.png' },
  ]), { source: undefined, conflict: true })
})

test('non-file text inputs do not erase attached intent', () => {
  assert.deepEqual(assessIntentSources([
    { filePath: 'staged.png', intentAssetPath: 'staged.png' },
    { filePath: undefined },
    undefined,
  ]), { source: 'staged.png', conflict: false })
})

test('blank metadata markers are not treated as a source', () => {
  assert.deepEqual(assessIntentSources([
    { filePath: 'model.glb', intentAssetPath: '' },
  ]), { source: undefined, conflict: false })
})
