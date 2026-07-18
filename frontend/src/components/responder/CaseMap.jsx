import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatTimeAgo } from '../../utils/formatters'

const SEVERITY_COLOR = {
  critical: '#C4291C',
  urgent: '#B9821C',
  mild: '#33473A',
}

const LUCKNOW_CENTER = [26.8467, 80.9462]

export default function CaseMap({ cases, center }) {
  const mapCenter = center ? [center.lat, center.lng] : LUCKNOW_CENTER

  return (
    <div className="case-map-container">
      <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {cases.map((caseItem) => (
          <CircleMarker
            key={caseItem.id}
            center={[caseItem.lat, caseItem.lng]}
            radius={9}
            pathOptions={{
              color: SEVERITY_COLOR[caseItem.severity] || SEVERITY_COLOR.mild,
              fillColor: SEVERITY_COLOR[caseItem.severity] || SEVERITY_COLOR.mild,
              fillOpacity: 0.7,
            }}
          >
            <Popup>
              <strong>{caseItem.species || 'Unknown'}</strong>
              <br />
              {caseItem.location}
              <br />
              {formatTimeAgo(caseItem.timestamp)}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
