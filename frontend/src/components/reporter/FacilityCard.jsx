import Card from '../ui/Card'
import { formatDistance } from '../../utils/formatters'

export default function FacilityCard({ facility, userLocation }) {
  const originLat = userLocation?.lat ?? 26.8467
  const originLng = userLocation?.lng ?? 80.9462
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${facility.lat},${facility.lng}`

  return (
    <Card className="facility-card">
      <div className="facility-card-top">
        <div>
          <div className="facility-name">{facility.name}</div>
          <div className="facility-type">
            {facility.type} · {facility.hours || 'Hours not confirmed, call ahead'}
          </div>
          {facility.address && <div className="facility-address">{facility.address}</div>}
        </div>
        <span className="facility-distance">{formatDistance(facility.distance)}</span>
      </div>
      <div className="facility-actions">
        {facility.phone && (
          <a className="btn btn-secondary" href={`tel:${facility.phone}`}>
            Call
          </a>
        )}
        <a className="btn btn-primary" href={directionsUrl} target="_blank" rel="noopener noreferrer">
          Directions
        </a>
      </div>
    </Card>
  )
}
