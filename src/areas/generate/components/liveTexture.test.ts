import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import {
  findLiveTextureTarget,
  prepareLiveTexture,
  replaceLiveTexture,
  restoreLiveTexture,
} from './liveTexture.ts'

function texture(width = 2, height = 2): THREE.DataTexture {
  return new THREE.DataTexture(new Uint8Array(width * height * 4), width, height)
}

test('finds one shared painted texture and replaces every material that uses it', () => {
  const original = texture()
  const first = new THREE.MeshBasicMaterial({ map: original })
  const second = new THREE.MeshBasicMaterial({ map: original })
  const group = new THREE.Group()
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(), first),
    new THREE.Mesh(new THREE.BoxGeometry(), second),
  )

  const found = findLiveTextureTarget(group)
  assert.equal(found.ok, true)
  if (!found.ok) return
  assert.equal(found.target.width, 2)
  assert.equal(found.target.height, 2)
  assert.equal(found.target.materials.length, 2)

  original.flipY = false
  original.wrapS = THREE.RepeatWrapping
  original.wrapT = THREE.MirroredRepeatWrapping
  const replacement = texture()
  prepareLiveTexture(replacement, original)
  replaceLiveTexture(found.target, replacement)

  assert.equal(first.map, replacement)
  assert.equal(second.map, replacement)
  assert.equal(replacement.flipY, false)
  assert.equal(replacement.wrapS, THREE.RepeatWrapping)
  assert.equal(replacement.wrapT, THREE.MirroredRepeatWrapping)
  assert.equal(replacement.magFilter, original.magFilter)
  assert.equal(replacement.minFilter, original.minFilter)
  assert.equal(replacement.generateMipmaps, original.generateMipmaps)
  assert.equal(replacement.colorSpace, original.colorSpace)
  restoreLiveTexture(found.target, replacement)
  assert.equal(first.map, original)
  assert.equal(second.map, original)
})

test('fails visibly when a model has more than one painted texture', () => {
  const group = new THREE.Group()
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture() })),
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture() })),
  )

  const found = findLiveTextureTarget(group)
  assert.equal(found.ok, false)
  if (found.ok) return
  assert.match(found.message, /more than one painted texture/)
})


test('does not restore maps that were replaced independently by another editor', () => {
  const base = texture()
  const independent = texture()
  const preview = texture()
  const material = new THREE.MeshBasicMaterial({ map: base })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material)
  const target = findLiveTextureTarget(mesh)
  assert.equal(target.ok, true)
  if (!target.ok) return
  replaceLiveTexture(target.target, preview)
  material.map = independent
  restoreLiveTexture(target.target, preview)
  assert.equal(material.map, independent)
})

test('rejects an untextured model without allocating a new map', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  const found = findLiveTextureTarget(mesh)
  assert.equal(found.ok, false)
  if (!found.ok) assert.match(found.message, /no painted texture/)
})
