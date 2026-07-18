import CaseCard from './CaseCard'

const SEVERITY_ORDER = { critical: 0, urgent: 1, mild: 2 }

export function sortCases(cases) {
  return [...cases].sort((a, b) => {
    const severityDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    if (severityDiff !== 0) return severityDiff

    const distanceDiff = (a.distance ?? Infinity) - (b.distance ?? Infinity)
    if (distanceDiff !== 0) return distanceDiff

    return new Date(a.timestamp) - new Date(b.timestamp)
  })
}

export default function CaseFeed({ cases, onRespond, onResolve, onViewMap, highlightCaseId }) {
  const sorted = sortCases(cases)

  if (sorted.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-10) 0' }}>
        No active cases right now.
      </p>
    )
  }

  return (
    <div className="case-feed">
      {sorted.map((caseItem) => (
        <CaseCard
          key={caseItem.id}
          caseItem={caseItem}
          onRespond={onRespond}
          onResolve={onResolve}
          onViewMap={onViewMap}
          highlighted={caseItem.id === highlightCaseId}
        />
      ))}
    </div>
  )
}
