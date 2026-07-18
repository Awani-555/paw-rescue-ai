export default function FirstAidCard({ steps, doNot }) {
  if (!steps || steps.length === 0) return null

  return (
    <div className="first-aid-card">
      <h3>Immediate first aid</h3>
      <ol className="first-aid-steps">
        {steps.map((step, idx) => (
          <li key={idx} style={{ '--i': idx }}>
            {step}
          </li>
        ))}
      </ol>

      {doNot && doNot.length > 0 && (
        <div className="first-aid-donot">
          <h4>Do not</h4>
          <ul>
            {doNot.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
