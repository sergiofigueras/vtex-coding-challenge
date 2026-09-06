export function formatSuccessfulRunFooter(entry) {
  const knownUsd = entry?.accounting?.cumulativeKnownActualUsd
  const costText = typeof knownUsd === 'number' && Number.isFinite(knownUsd) ? `$${knownUsd.toFixed(6)}` : 'unavailable'
  return `Measured cumulative known OpenAI cost ${costText}; ${entry?.accounting?.unreconciledAttempts ?? 0} unreconciled attempt(s).`
}
