import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import type { TextureWatchUpdate } from '@shared/types/liveTexture'
import {
  findLiveTextureTarget,
  prepareLiveTexture,
  replaceLiveTexture,
  restoreLiveTexture,
  type LiveTextureTarget,
} from './liveTexture'

type PanelState =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string; message: string }
  | { kind: 'watching'; fileName: string; updatedAt: number }
  | { kind: 'error'; fileName?: string; message: string }

interface LiveTexturePanelProps {
  object: THREE.Object3D | null
  onApplied: () => void
}

function timeLabel(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function LiveTexturePanel({ object, onApplied }: LiveTexturePanelProps): JSX.Element {
  const [watching, setWatching] = useState(false)
  const [panel, setPanel] = useState<PanelState>({ kind: 'idle' })
  const latestRevision = useRef(0)
  const latestTexture = useRef<THREE.Texture | null>(null)
  const targetRef = useRef<LiveTextureTarget | null>(null)
  // Unmount/stop invalidates in-flight TextureLoader promises.
  const epochRef = useRef(0)
  const pickerPending = useRef(false)

  const acceptUpdate = useCallback(async (update: TextureWatchUpdate): Promise<void> => {
    const epoch = epochRef.current
    if (update.revision < latestRevision.current) return
    latestRevision.current = update.revision

    if (update.state === 'reading') {
      setPanel({
        kind: 'reading',
        fileName: update.fileName,
        message: update.message ?? 'Checking the saved texture…',
      })
      return
    }
    if (update.state === 'error') {
      setPanel({
        kind: 'error',
        fileName: update.fileName,
        message: update.message ?? 'The saved texture could not be read.',
      })
      return
    }

    const found = object ? findLiveTextureTarget(object) : null
    if (!found?.ok) {
      setPanel({
        kind: 'error',
        fileName: update.fileName,
        message: found?.message ?? 'The model is not ready for texture updates.',
      })
      return
    }

    const { target } = found
    if (update.width !== target.width || update.height !== target.height) {
      setPanel({
        kind: 'error',
        fileName: update.fileName,
        message: `This texture is ${update.width ?? '?'} × ${update.height ?? '?'}. The model uses ${target.width} × ${target.height}. Save it at ${target.width} × ${target.height} to update the preview.`,
      })
      return
    }
    if (!update.dataUrl) {
      setPanel({
        kind: 'error',
        fileName: update.fileName,
        message: 'The saved texture was empty and the preview was not updated.',
      })
      return
    }

    let texture: THREE.Texture
    try {
      texture = await new THREE.TextureLoader().loadAsync(update.dataUrl)
    } catch {
      if (update.revision !== latestRevision.current) return
      setPanel({
        kind: 'error',
        fileName: update.fileName,
        message: 'The saved texture could not be opened. It may still be saving or the file may be damaged.',
      })
      return
    }

    if (update.revision !== latestRevision.current || epoch !== epochRef.current) {
      texture.dispose()
      return
    }

    prepareLiveTexture(texture, target.texture)
    replaceLiveTexture(target, texture)
    // All materials have been updated before disposing the previous GPU map.
    latestTexture.current?.dispose()
    latestTexture.current = texture
    targetRef.current = target
    onApplied()

    const appliedAt = Date.now()
    setPanel({ kind: 'watching', fileName: update.fileName, updatedAt: appliedAt })
    window.dispatchEvent(new CustomEvent('modly:texture-updated', {
      detail: {
        filePath: update.filePath,
        revision: update.revision,
        detectedAt: update.changedAt,
        savedAt: update.savedAt,
        appliedAt,
      },
    }))
  }, [object, onApplied])

  useEffect(() => {
    window.electron.texture.onChange(acceptUpdate)
    return () => window.electron.texture.offChange()
  }, [acceptUpdate])

  useEffect(() => () => {
    epochRef.current += 1
    void window.electron.texture.stopWatching()
    if (latestTexture.current && targetRef.current) {
      restoreLiveTexture(targetRef.current, latestTexture.current)
      latestTexture.current.dispose()
    }
    latestTexture.current = null
    targetRef.current = null
  }, [])

  const toggleWatching = async (): Promise<void> => {
    if (pickerPending.current) return
    if (watching) {
      epochRef.current += 1
      try {
        await window.electron.texture.stopWatching()
      } finally {
        setWatching(false)
        setPanel({ kind: 'idle' })
        latestRevision.current = 0
      }
      return
    }

    const found = object ? findLiveTextureTarget(object) : null
    if (!found?.ok) {
      setPanel({
        kind: 'error',
        message: found?.message ?? 'The model is not ready for texture updates.',
      })
      return
    }

    pickerPending.current = true
    try {
      const choice = await window.electron.texture.chooseAndWatch()
      if (choice.cancelled) {
        if (choice.error) setPanel({ kind: 'error', message: choice.error })
        return
      }
      latestRevision.current = 0
      setWatching(true)
      await acceptUpdate(choice.update)
    } catch (err) {
      setPanel({ kind: 'error', message: String(err) })
    } finally {
      pickerPending.current = false
    }
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-stretch overflow-hidden rounded-lg border border-zinc-700/60 bg-zinc-900/85 shadow-lg backdrop-blur-sm">
      <button
        type="button"
        data-testid="watch-texture-button"
        onClick={() => { void toggleWatching() }}
        className={`px-3 py-2 text-xs transition-colors ${
          watching
            ? 'bg-violet-600 text-white hover:bg-violet-500'
            : 'text-zinc-300 hover:bg-zinc-700/70 hover:text-white'
        }`}
      >
        {watching ? 'Stop watching' : 'Watch texture'}
      </button>

      {panel.kind !== 'idle' && (
        <div
          data-testid="texture-watch-status"
          role={panel.kind === 'error' ? 'alert' : 'status'}
          className={`max-w-[460px] border-l px-3 py-1.5 ${
            panel.kind === 'error'
              ? 'border-red-500/50 bg-red-950/70'
              : 'border-zinc-700/60'
          }`}
        >
          <p className={`truncate text-xs font-medium ${
            panel.kind === 'error' ? 'text-red-200' : 'text-zinc-200'
          }`}>
            {panel.kind === 'error'
              ? 'Texture not updated'
              : panel.kind === 'reading'
                ? `Checking ${panel.fileName}`
                : `Watching ${panel.fileName}`}
          </p>
          <p className={`text-[10px] leading-tight ${
            panel.kind === 'error' ? 'text-red-300' : 'text-zinc-500'
          } ${panel.kind === 'error' ? 'whitespace-normal' : 'truncate'}`}>
            {panel.kind === 'watching'
              ? `Updated ${timeLabel(panel.updatedAt)}`
              : panel.message}
          </p>
        </div>
      )}
    </div>
  )
}
