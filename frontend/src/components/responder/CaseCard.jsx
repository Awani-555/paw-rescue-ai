import { useEffect, useRef } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { formatDistance, formatTimeAgo } from '../../utils/formatters'

export default function CaseCard({ caseItem, onRespond, onResolve, onViewMap, highlighted = false }) {
  const isResponding = caseItem.status === 'responding'
  const cardRef = useRef(null)

  useEffect(() => {
    if (highlighted) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlighted])

  return (
    <Card
      ref={cardRef}
      className={`case-card${highlighted ? ' case-card-highlighted' : ''}`}
      style={{ scrollMarginTop: 80 }}
    >
      {caseItem.image && <img className="case-card-thumb" src={caseItem.image} alt="Animal" loading="lazy" />}
      <div className="case-card-body">
        <div className="case-card-top">
          <strong>{caseItem.species || 'Unknown species'}</strong>
          <Badge severity={caseItem.severity} />
        </div>
        <div className="case-card-meta">
          <span>{formatDistance(caseItem.distance)}</span>
          <span>{formatTimeAgo(caseItem.timestamp)}</span>
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
          {caseItem.location}
        </div>

        {isResponding && (
          <div className="case-status-line">
            <span className="case-status-dot" />
            Responding since {formatTimeAgo(caseItem.respondedAt)}
            {caseItem.respondedBy ? ` · ${caseItem.respondedBy}` : ''}
          </div>
        )}

        <div className="case-card-actions">
          {isResponding ? (
            <Button variant="primary" onClick={() => onResolve(caseItem.id)}>
              Mark Resolved
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onRespond(caseItem.id)}>
              I'm Responding
            </Button>
          )}
          <Button variant="secondary" onClick={() => onViewMap(caseItem)}>
            View on Map
          </Button>
        </div>
      </div>
    </Card>
  )
}
