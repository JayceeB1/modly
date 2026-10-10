import assert from 'node:assert/strict'
import test from 'node:test'

import type { TextureWatchUpdate } from '../../src/shared/types/liveTexture.ts'
import { createElectronApi } from './electron-api.ts'

test('renderer sees only scoped texture watching, never a file path argument', async () => {
  const invoked: Array<{ channel: string; args: unknown[] }> = []
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const api = createElectronApi({
    invoke: async (channel, ...args) => {
      invoked.push({ channel, args })
      return channel === 'texture:chooseAndWatch'
        ? { cancelled: false, update: { state: 'reading', revision: 1, filePath: 'chosen.png' } }
        : undefined
    },
    send: () => undefined,
    on: (name, listener) => { listeners.set(name, listener) },
    removeAllListeners: (name) => { listeners.delete(name) },
  }, { setZoomFactor: () => undefined }, { getPathForFile: () => '' })

  const choice = await api.texture.chooseAndWatch()
  assert.equal(choice.cancelled, false)
  await api.texture.stopWatching()
  assert.deepEqual(invoked, [
    { channel: 'texture:chooseAndWatch', args: [] },
    { channel: 'texture:stopWatching', args: [] },
  ])
  let received: TextureWatchUpdate | null = null
  api.texture.onChange((update) => { received = update })
  const update: TextureWatchUpdate = {
    state: 'ready', fileName: 'texture.png', filePath: 'texture.png',
    revision: 2, changedAt: 1, width: 2, height: 2,
  }
  listeners.get('texture:changed')?.({}, update)
  assert.deepEqual(received, update)
  api.texture.offChange()
  assert.equal(listeners.has('texture:changed'), false)
})
