import { watch as watchDirectory, type FSWatcher } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'

import type { TextureWatchUpdate } from '../../src/shared/types/liveTexture'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_END = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
// The renderer receives data URLs; a hard cap prevents unlimited IPC/memory use.
export const MAX_TEXTURE_BYTES = 32 * 1024 * 1024
const MAX_TEXTURE_DIMENSION = 8192
const SAVE_SETTLE_MS = 60
const RETRY_MS = 120
const MAX_READ_ATTEMPTS = 6

interface WatchedTexture {
  ownerId: number
  filePath: string
  fileName: string
  revision: number
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
  send: (update: TextureWatchUpdate) => void
}

export interface PngInfo {
  width: number
  height: number
}

export function readPngInfo(buffer: Buffer): PngInfo {
  if (
    buffer.length < 33
    || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || buffer.toString('ascii', 12, 16) !== 'IHDR'
    || buffer.readUInt32BE(8) !== 13
  ) {
    throw new Error('invalid PNG header')
  }

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width < 1 || height < 1
    || width > MAX_TEXTURE_DIMENSION || height > MAX_TEXTURE_DIMENSION
    || !buffer.subarray(-PNG_END.length).equals(PNG_END)) {
    throw new Error('incomplete PNG file')
  }

  return { width, height }
}

export class TextureWatchService {
  private sessions = new Map<number, WatchedTexture>()

  async start(
    ownerId: number,
    filePath: string,
    send: (update: TextureWatchUpdate) => void,
  ): Promise<TextureWatchUpdate> {
    if (extname(filePath).toLowerCase() !== '.png') {
      throw new Error('Live texture updates currently support PNG files.')
    }

    this.stop(ownerId)

    const fileName = basename(filePath)
    const session: WatchedTexture = {
      ownerId,
      filePath,
      fileName,
      revision: 0,
      watcher: watchDirectory(dirname(filePath), (_eventType, changedName) => {
        if (changedName && changedName.toString() !== fileName) return
        this.queueRead(session)
      }),
      timer: null,
      send,
    }
    session.watcher.on('error', () => {
      if (this.sessions.get(ownerId) !== session) return
      const revision = ++session.revision
      send({
        state: 'error',
        filePath,
        fileName,
        revision,
        changedAt: Date.now(),
        message: 'Texture watching stopped because the file could not be watched. Choose it again to retry.',
      })
      this.stop(ownerId)
    })
    this.sessions.set(ownerId, session)

    const revision = ++session.revision
    return this.readUpdate(session, revision)
  }

  stop(ownerId: number): void {
    const session = this.sessions.get(ownerId)
    if (!session) return
    this.sessions.delete(ownerId)
    if (session.timer) clearTimeout(session.timer)
    session.watcher.close()
  }

  stopAll(): void {
    for (const ownerId of [...this.sessions.keys()]) this.stop(ownerId)
  }

  private queueRead(session: WatchedTexture): void {
    if (this.sessions.get(session.ownerId) !== session) return
    const revision = ++session.revision
    if (session.timer) clearTimeout(session.timer)
    session.send({
      state: 'reading',
      filePath: session.filePath,
      fileName: session.fileName,
      revision,
      changedAt: Date.now(),
      message: 'Checking the saved texture…',
    })
    session.timer = setTimeout(() => {
      session.timer = null
      void this.publishAfterSave(session, revision, 0)
    }, SAVE_SETTLE_MS)
  }

  private async publishAfterSave(
    session: WatchedTexture,
    revision: number,
    attempt: number,
  ): Promise<void> {
    if (this.sessions.get(session.ownerId) !== session || session.revision !== revision) return

    const update = await this.readUpdate(session, revision)
    if (this.sessions.get(session.ownerId) !== session || session.revision !== revision) return
    session.send(update)

    if (update.state === 'error' && attempt + 1 < MAX_READ_ATTEMPTS) {
      session.timer = setTimeout(() => {
        session.timer = null
        void this.publishAfterSave(session, revision, attempt + 1)
      }, RETRY_MS)
    }
  }

  private async readUpdate(session: WatchedTexture, revision: number): Promise<TextureWatchUpdate> {
    const changedAt = Date.now()
    try {
      // Only OS-selected PNGs are watched. Do not follow a symlink swapped in
      // between saves, and do not allocate based on an unbounded file size.
      const pathStat = await lstat(session.filePath)
      if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
        throw new Error('Texture is no longer a regular file')
      }
      const handle = await open(session.filePath, 'r')
      let buffer: Buffer
      let fileStat: Awaited<ReturnType<typeof handle.stat>>
      try {
        fileStat = await handle.stat()
        if (!fileStat.isFile() || fileStat.size < 33 || fileStat.size > MAX_TEXTURE_BYTES) {
          throw new Error('Texture exceeds the 32 MiB file limit or is empty')
        }
        buffer = Buffer.alloc(fileStat.size)
        let offset = 0
        while (offset < buffer.length) {
          const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
          if (bytesRead === 0) throw new Error('Incomplete texture save')
          offset += bytesRead
        }
        const after = await handle.stat()
        if (after.size !== fileStat.size || after.mtimeMs !== fileStat.mtimeMs) {
          throw new Error('Texture changed during a read')
        }
      } finally {
        await handle.close()
      }
      const { width, height } = readPngInfo(buffer)
      return {
        state: 'ready',
        filePath: session.filePath,
        fileName: session.fileName,
        revision,
        changedAt,
        savedAt: fileStat.mtimeMs,
        width,
        height,
        dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      }
    } catch {
      return {
        state: 'error',
        filePath: session.filePath,
        fileName: session.fileName,
        revision,
        changedAt,
        message: 'The PNG could not be read (incomplete save, invalid image, or over 32 MiB).',
      }
    }
  }
}
