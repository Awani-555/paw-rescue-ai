export function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return 'Unknown distance'
  if (km < 1) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}

export function formatTimeAgo(isoString) {
  if (!isoString) return 'Unknown time'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function formatSeverity(severity) {
  if (!severity) return 'Unknown'
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()
}

export function severityToToken(severity) {
  const normalized = (severity || '').toLowerCase()
  if (['critical', 'urgent', 'mild'].includes(normalized)) return normalized
  return 'mild'
}
