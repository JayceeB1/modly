import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function loadModule() {
  const outfile = join(mkdtempSync(join(tmpdir(), 'modly-workflow-ext-test-')), 'mockExtensions.cjs')
  const require = createRequire(import.meta.url)
  const result = buildSync({
    entryPoints: [resolve('src/areas/workflows/mockExtensions.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  })
  writeFileSync(outfile, result.outputFiles[0].text, 'utf8')
  return require(outfile)
}

function extension(type, overrides = {}) {
  return {
    type,
    id: `${type}-extension`,
    name: `${type} extension`,
    trusted: false,
    builtin: false,
    entry: type === 'process' ? 'processor.js' : undefined,
    nodes: [{
      id: 'generate',
      name: 'Generate',
      input: 'image',
      output: 'mesh',
      paramsSchema: [],
    }],
    ...overrides,
  }
}

test('workflow discovery excludes corrupted extensions with preserved nodes', () => {
  const { buildAllWorkflowExtensions } = loadModule()
  const healthyModel = extension('model', { id: 'healthy-model' })
  const pendingModel = extension('model', {
    id: 'pixal3d',
    corrupted: true,
    manifestError: 'incomplete',
  })
  const pendingProcess = extension('process', {
    id: 'pending-process',
    corrupted: true,
    manifestError: 'incomplete',
  })

  const result = buildAllWorkflowExtensions(
    [healthyModel, pendingModel],
    [pendingProcess],
  )

  assert.deepEqual(result.map((entry) => entry.id), ['healthy-model/generate'])
})

test('object-shaped manifest inputs are normalized to plain type strings', () => {
  const { buildAllWorkflowExtensions } = loadModule()
  const ext = extension('process', {
    nodes: [{
      id: 'image-to-image', name: 'Image to Image', input: 'image',
      inputs: [
        { name: 'front', label: 'Front', type: 'image', required: true },
        { name: 'back', label: 'Back', type: 'image', required: false },
      ],
      output: 'image', paramsSchema: [],
    }],
  })
  assert.deepEqual(buildAllWorkflowExtensions([], [ext])[0].inputs, ['image', 'image'])
})

test('plain-string multi-input manifest values are preserved', () => {
  const { buildAllWorkflowExtensions } = loadModule()
  const ext = extension('process', {
    nodes: [{ id: 'p', name: 'Process', input: 'image', inputs: ['image', 'text'],
      inputLabels: ['Source', 'Prompt'], output: 'mesh', paramsSchema: [] }],
  })
  const [node] = buildAllWorkflowExtensions([], [ext])
  assert.deepEqual(node.inputs, ['image', 'text'])
  assert.deepEqual(node.inputLabels, ['Source', 'Prompt'])
})

test('manifest without multi-input keeps inputs undefined', () => {
  const { buildAllWorkflowExtensions } = loadModule()
  assert.equal(buildAllWorkflowExtensions([], [extension('process')])[0].inputs, undefined)
})
