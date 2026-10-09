import assert from 'node:assert/strict'
import test from 'node:test'
import { areAllWorkflowNodeParamsBound, resolveBoundWorkflowParams } from './workflowParamBindings.ts'

const workflow = {
  id: 'asset', name: 'Asset', description: '', createdAt: '', updatedAt: '',
  nodes: [{ id: 'generate', data: { params: { faces: 12000 } } }, { id: 'optimize', data: { params: { target_faces: 1000000 } } }],
  edges: [],
  paramBindings: [{ sourceNodeId: 'generate', sourceParam: 'faces', targetNodeId: 'optimize', targetParam: 'target_faces' }],
}

test('latest upstream parameter wins on each target execution', () => {
  const live = new Map([
    ['generate', { faces: 60000 }],
    ['optimize', { target_faces: 1000000 }],
  ])
  assert.deepEqual(resolveBoundWorkflowParams(workflow, 'optimize', live.get('optimize'), (id) => live.get(id)), { target_faces: 60000 })
  live.set('generate', { faces: 12000 })
  assert.deepEqual(resolveBoundWorkflowParams(workflow, 'optimize', live.get('optimize'), (id) => live.get(id)), { target_faces: 12000 })
})

test('unbound parameters preserve the same object and values', () => {
  const original = { export_format: 'glb' }
  assert.equal(resolveBoundWorkflowParams(workflow, 'export', original, () => undefined), original)
})

test('missing source value retains explicit target fallback', () => {
  assert.deepEqual(resolveBoundWorkflowParams(workflow, 'optimize', { target_faces: 50000 }, () => undefined), { target_faces: 50000 })
})

test('only fully bound extension nodes hide Generate questions', () => {
  assert.equal(areAllWorkflowNodeParamsBound(workflow, 'optimize', ['target_faces']), true)
  assert.equal(areAllWorkflowNodeParamsBound(workflow, 'optimize', ['target_faces', 'preserve_uvs']), false)
  assert.equal(areAllWorkflowNodeParamsBound(workflow, 'generate', ['faces']), false)
  assert.equal(areAllWorkflowNodeParamsBound(workflow, 'optimize', []), false)
})

test('dangling or self-referential binding cannot hide a question', () => {
  const broken = { ...workflow, paramBindings: [{ ...workflow.paramBindings[0], sourceNodeId: 'missing' }] }
  assert.equal(areAllWorkflowNodeParamsBound(broken, 'optimize', ['target_faces']), false)
  assert.deepEqual(resolveBoundWorkflowParams(broken, 'optimize', { target_faces: 10000 }, () => ({ faces: 12000 })), { target_faces: 10000 })
  const self = { ...workflow, paramBindings: [{ ...workflow.paramBindings[0], sourceNodeId: 'optimize' }] }
  assert.equal(areAllWorkflowNodeParamsBound(self, 'optimize', ['target_faces']), false)
})

test('untrusted prototype target key is ignored', () => {
  const evil = { ...workflow, paramBindings: [{ ...workflow.paramBindings[0], targetParam: '__proto__' }] }
  const result = resolveBoundWorkflowParams(evil, 'optimize', { target_faces: 10000 }, () => ({ faces: { admin: true } }))
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
  assert.deepEqual(result, { target_faces: 10000 })
})

test('target is never mutated by binding resolution', () => {
  const target = Object.freeze({ target_faces: 1000000 })
  const result = resolveBoundWorkflowParams(workflow, 'optimize', target, () => ({ faces: 30000 }))
  assert.equal(target.target_faces, 1000000)
  assert.equal(result.target_faces, 30000)
})
