import type { Workflow } from '../../shared/types/electron.d'

type ReadNodeParams = (nodeId: string) => Record<string, unknown> | undefined

/** Only plain parameter fields may be used as target keys. */
function validField(name: string): boolean {
  return typeof name === 'string'
    && /^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(name)
    && name !== '__proto__'
    && name !== 'constructor'
    && name !== 'prototype'
}

/**
 * Resolve a target node's parameters at execution time. Binding sources come
 * from the freshest live map, not a stale snapshot captured when Run began.
 * Missing or invalid sources leave the target's explicit fallback unchanged.
 */
export function resolveBoundWorkflowParams(
  workflow: Workflow,
  targetNodeId: string,
  targetParams: Record<string, unknown>,
  readNodeParams: ReadNodeParams,
): Record<string, unknown> {
  const bindings = workflow.paramBindings?.filter((item) => item.targetNodeId === targetNodeId) ?? []
  if (bindings.length === 0) return targetParams

  const resolved = { ...targetParams }
  const sourceNodes = new Set(workflow.nodes.map((node) => node.id))
  for (const item of bindings) {
    if (!sourceNodes.has(item.sourceNodeId) || item.sourceNodeId === item.targetNodeId) continue
    if (!validField(item.sourceParam) || !validField(item.targetParam)) continue
    const sourceParams = readNodeParams(item.sourceNodeId)
    if (sourceParams && Object.prototype.hasOwnProperty.call(sourceParams, item.sourceParam)) {
      resolved[item.targetParam] = sourceParams[item.sourceParam]
    }
  }
  return resolved
}

/** Hide an operator-facing question only if every parameter has a real source node. */
export function areAllWorkflowNodeParamsBound(
  workflow: Workflow,
  nodeId: string,
  paramIds: string[],
): boolean {
  if (paramIds.length === 0) return false
  const sourceNodes = new Set(workflow.nodes.map((node) => node.id))
  const bound = new Set(
    (workflow.paramBindings ?? [])
      .filter((item) => item.targetNodeId === nodeId && item.sourceNodeId !== nodeId)
      .filter((item) => sourceNodes.has(item.sourceNodeId) && validField(item.sourceParam) && validField(item.targetParam))
      .map((item) => item.targetParam),
  )
  return paramIds.every((paramId) => bound.has(paramId))
}
