/**
 * Pure, fail-closed resolver for artists' intent provenance across workflow
 * edges. A text-only input never dilutes an asset's intent.
 */
export interface IntentBearingOutput {
  filePath?: string
  intentAssetPath?: string
}

export type IntentSourceDecision =
  | { source: string; conflict: false }
  | { source: undefined; conflict: boolean }

export function assessIntentSources(
  inputs: readonly (IntentBearingOutput | undefined)[],
): IntentSourceDecision {
  const assets = inputs.filter((value): value is IntentBearingOutput =>
    typeof value?.filePath === 'string' && value.filePath.length > 0)
  const tagged = assets.filter((value) => typeof value.intentAssetPath === 'string'
    && value.intentAssetPath.length > 0)
  if (tagged.length === 0) return { source: undefined, conflict: false }
  if (tagged.length !== assets.length) return { source: undefined, conflict: true }
  const sources = new Set(tagged.map((value) => value.intentAssetPath!))
  if (sources.size !== 1) return { source: undefined, conflict: true }
  return { source: [...sources][0], conflict: false }
}
