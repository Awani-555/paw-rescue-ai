import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { formatDistance, formatTimeAgo } from '../../utils/formatters'

export default function CaseCard({ caseItem, onRespond, onViewMap }) {
  return (
    <Card className="case-card">
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
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
          {caseItem.location}
        </div>
        <div className="case-card-actions">
          <Button variant="primary" onClick={() => onRespond(caseItem.id)} disabled={caseItem.status === 'responding'}>
            {caseItem.status === 'responding' ? 'Responding…' : "I'm Responding"}
          </Button>
          <Button variant="secondary" onClick={() => onViewMap(caseItem)}>
            View on Map
          </Button>
        </div>
      </div>
    </Card>
  )
}
