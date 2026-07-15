import { useMemo, useState } from 'react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import BackButton from '../components/ui/BackButton'
import FirstAidCard from '../components/reporter/FirstAidCard'
import { firstAidData, filterFirstAid } from '../utils/firstAidData'

const SPECIES_OPTIONS = ['All', 'Dog', 'Cat', 'Bird', 'Any']

export default function FirstAidLibrary({ onBack }) {
  const [species, setSpecies] = useState('All')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const results = useMemo(() => filterFirstAid(firstAidData, { species, query }), [species, query])

  return (
    <div className="page-container">
      <div className="step-header">
        <BackButton onClick={onBack} />
        <div className="step-title">
          <h2>First Aid Guide</h2>
          <p>Works completely offline</p>
        </div>
      </div>

      <input
        className="first-aid-library-search"
        placeholder="Search by situation…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="species-filter-row">
        {SPECIES_OPTIONS.map((option) => (
          <button
            key={option}
            className={`species-filter-btn ${species === option ? 'active' : ''}`}
            onClick={() => setSpecies(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="first-aid-grid">
        {results.map((entry) => (
          <Card
            key={entry.id}
            className="first-aid-grid-card"
            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>{entry.species}</h3>
                <div className="situation">{entry.situation}</div>
              </div>
              <Badge severity={entry.severity} />
            </div>

            {expandedId === entry.id && (
              <FirstAidCard steps={entry.immediateSteps} doNot={entry.doNot} />
            )}
          </Card>
        ))}

        {results.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-8) 0' }}>
            No matching first aid guides found.
          </p>
        )}
      </div>
    </div>
  )
}
