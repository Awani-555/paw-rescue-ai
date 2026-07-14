import { formatSeverity, severityToToken } from '../../utils/formatters'

export default function Badge({ severity }) {
  const token = severityToToken(severity)
  return (
    <span className={`badge badge-${token}`}>
      <span className="badge-dot" />
      {formatSeverity(severity) || 'Unknown'}
    </span>
  )
}
