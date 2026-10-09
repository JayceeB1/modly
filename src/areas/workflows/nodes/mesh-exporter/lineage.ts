/** Workspace-bound ancestry for the built-in mesh exporter. */
import fs from 'node:fs'
import path from 'node:path'

export interface LineageRef {
  path: string
  name: string | null
}
export interface DerivedFrom {
  parent: LineageRef
  root: LineageRef
}
const MAX_SIDECAR_BYTES = 64 * 1024
const MAX_GLB_JSON_BYTES = 512 * 1024

function within(parent: string, candidate: string): string | null {
  const relative = path.relative(parent, candidate)
  return relative && relative !== '..'
    && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
    ? relative.split(path.sep).join('/')
    : null
}
function nameOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 160) : null
}
function safeRootReference(value: unknown): LineageRef | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const candidate = raw.path
  if (typeof candidate !== 'string' || candidate.length > 512) return null
  const parts = candidate.replace(/\\/g, '/').split('/')
  if (parts.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))) return null
  if (candidate.startsWith('/') || candidate.startsWith('\\')) return null
  return { path: parts.join('/'), name: nameOf(raw.name) }
}
function readGlbName(source: string): string | null {
  if (path.extname(source).toLowerCase() !== '.glb') return null
  let fd: number | null = null
  try {
    fd = fs.openSync(source, 'r')
    const header = Buffer.alloc(20)
    if (fs.readSync(fd, header, 0, 20, 0) !== 20) return null
    if (header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2) return null
    const length = header.readUInt32LE(12)
    if (header.toString('ascii', 16, 20) !== 'JSON' || length > MAX_GLB_JSON_BYTES) return null
    const total = header.readUInt32LE(8)
    if (length > total - 20) return null
    const blob = Buffer.alloc(length)
    if (fs.readSync(fd, blob, 0, length, 20) !== length) return null
    const document = JSON.parse(blob.toString('utf8'))
    return nameOf(document?.asset?.extras?.modly?.name)
  } catch {
    return null
  } finally {
    if (fd !== null) fs.closeSync(fd)
  }
}

/** Never read from outside the physical workspace, even through symlinks. */
export function resolveDerivedFrom(sourceAssetPath: string | undefined, workspaceDir: string): DerivedFrom | null {
  if (!sourceAssetPath || !path.isAbsolute(sourceAssetPath)) return null
  let source: string
  let rootDir: string
  try {
    source = fs.realpathSync(sourceAssetPath)
    rootDir = fs.realpathSync(workspaceDir)
    if (!fs.statSync(source).isFile()) return null
  } catch {
    return null
  }
  const relative = within(rootDir, source)
  if (!relative) return null
  const parent: LineageRef = { path: relative, name: null }
  let root: LineageRef = parent
  const sidecar = source.replace(/\.[^./\\]+$/, '') + '.tags.json'
  try {
    const resolvedSidecar = fs.realpathSync(sidecar)
    if (within(rootDir, resolvedSidecar) && fs.statSync(resolvedSidecar).size <= MAX_SIDECAR_BYTES) {
      const meta = JSON.parse(fs.readFileSync(resolvedSidecar, 'utf8')) as Record<string, unknown>
      parent.name = nameOf(meta?.name)
      const ancestor = (meta?.derived_from as { root?: unknown } | undefined)?.root
      const valid = safeRootReference(ancestor)
      if (valid) root = valid
    }
  } catch {
    // A missing/corrupt sidecar does not prevent exporting an existing mesh.
  }
  if (!parent.name) parent.name = readGlbName(source)
  // Never recursively open or follow ancestor references: they are labels.
  return { parent, root: root === parent ? { ...parent } : root }
}
