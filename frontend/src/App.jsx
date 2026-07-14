import { useState, useEffect } from 'react'

function App() {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [locationError, setLocationError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [reports, setReports] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loadingReports, setLoadingReports] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [activeTab, setActiveTab] = useState('report') // 'report' or 'history'

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

  useEffect(() => {
    loadReports()

    // Get user location automatically
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          setUserLocation(coords)
        },
        () => {
          setLocationError('Location access denied. Using default location.')
          setUserLocation({ lat: 26.8467, lng: 80.9462 })
        }
      )
    } else {
      setLocationError('Geolocation not supported. Using default location.')
      setUserLocation({ lat: 26.8467, lng: 80.9462 })
    }
  }, [])

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Image too large. Please select an image under 10MB.')
        return
      }

      setImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
      setError('')
    }
  }

  const handleAnalyze = async () => {
    if (!image) {
      setError('Please select an image first')
      return
    }

    if (!userLocation) {
      setError('Location not available. Please enable location services.')
      return
    }

    setError('')
    setSuccess('')
    setAnalyzing(true)
    setResult(null)
    setShowResult(false)

    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64String = reader.result.split(',')[1]

          const response = await fetch(`${backendUrl}/api/report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image: base64String,
              notes: notes || 'No notes provided',
              location: location || 'Location not specified',
              lat: userLocation.lat,
              lng: userLocation.lng,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || 'Failed to analyze image')
          }

          const data = await response.json()

          setResult(data.result)
          setShowResult(true)
          setSuccess('🎉 Analysis complete! Report saved successfully!')
          
          // Clear form
          setImage(null)
          setImagePreview(null)
          setNotes('')
          setLocation('')
          
          const fileInput = document.getElementById('image')
          if (fileInput) fileInput.value = ''
          
          setTimeout(loadReports, 1000)
        } catch (err) {
          setError(err.message || 'Error analyzing image. Please try again.')
        } finally {
          setAnalyzing(false)
        }
      }

      reader.onerror = () => {
        setError('Error reading image file')
        setAnalyzing(false)
      }

      reader.readAsDataURL(image)
    } catch (err) {
      setError('Unexpected error occurred. Please try again.')
      setAnalyzing(false)
    }
  }

  const loadReports = async () => {
    setLoadingReports(true)
    try {
      const response = await fetch(`${backendUrl}/api/reports`)
      if (!response.ok) {
        throw new Error('Failed to fetch reports')
      }
      const data = await response.json()
      setReports(data.reports || [])
    } catch (err) {
      setError('Unable to load report history.')
    } finally {
      setLoadingReports(false)
    }
  }

  const handleSOS = () => {
    const openWhatsApp = (lat, lng) => {
      const message = `🚨 ANIMAL EMERGENCY at https://maps.google.com/?q=${lat},${lng} — Please help immediately!`
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => openWhatsApp(position.coords.latitude, position.coords.longitude),
        () => openWhatsApp(26.8467, 80.9462)
      )
    } else {
      openWhatsApp(26.8467, 80.9462)
    }
  }

  const getSeverityClass = (severity) => {
    if (!severity) return ''
    return `severity-${severity.toLowerCase()}`
  }

  const getSeverityEmoji = (severity) => {
    const map = {
      'Critical': '🚨',
      'Urgent': '⚠️',
      'Mild': '✅'
    }
    return map[severity] || '❓'
  }

  return (
    <div className="app-container">
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
      </div>

      {/* Header */}
      <header className="main-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-icon">🐾</div>
            <div>
              <h1 className="app-title">PawRescue AI</h1>
              <p className="app-subtitle">Saving Lives with Intelligence</p>
            </div>
          </div>
          {userLocation && (
            <div className="location-badge">
              <span className="location-pulse"></span>
              📍 {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </div>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => setActiveTab('report')}
        >
          <span className="tab-icon">📋</span>
          New Report
        </button>
        <button 
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span className="tab-icon">📜</span>
          History ({reports.length})
        </button>
      </div>

      <div className="main-content">
        {activeTab === 'report' ? (
          <div className="report-section">
            {/* Alert Messages */}
            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">❌</span>
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="alert alert-success">
                <span className="alert-icon">✨</span>
                <span>{success}</span>
              </div>
            )}
            {locationError && (
              <div className="alert alert-warning">
                <span className="alert-icon">⚠️</span>
                <span>{locationError}</span>
              </div>
            )}

            <div className="two-column-layout">
              {/* Left Side - Upload Form */}
              <div className="glass-card upload-card">
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="title-icon">📸</span>
                    Upload Animal Photo
                  </h2>
                </div>

                <div className="upload-zone">
                  {imagePreview ? (
                    <div className="image-preview-container">
                      <img src={imagePreview} alt="Preview" className="image-preview" />
                      <button 
                        className="remove-image-btn"
                        onClick={() => {
                          setImage(null)
                          setImagePreview(null)
                          const fileInput = document.getElementById('image')
                          if (fileInput) fileInput.value = ''
                        }}
                      >
                        ❌ Remove
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="image" className="upload-placeholder">
                      <div className="upload-icon">📁</div>
                      <p className="upload-text">Click to upload image</p>
                      <p className="upload-subtext">PNG, JPG up to 10MB</p>
                      <input
                        id="image"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        disabled={analyzing}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <span className="label-icon">📝</span>
                    Observations
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Describe the animal's condition, visible injuries, behavior..."
                    disabled={analyzing}
                    className="form-textarea"
                    rows="4"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <span className="label-icon">📍</span>
                    Location Details
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Where was the animal found?"
                    disabled={analyzing}
                    className="form-input"
                  />
                </div>

                <button
                  className={`analyze-button ${analyzing ? 'analyzing' : ''}`}
                  onClick={handleAnalyze}
                  disabled={analyzing || !image || !userLocation}
                >
                  {analyzing ? (
                    <>
                      <span className="spinner"></span>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <span className="button-icon">🔍</span>
                      Analyze & Save Report
                    </>
                  )}
                </button>
              </div>

              {/* Right Side - Results */}
              <div className={`glass-card results-card ${showResult ? 'show' : ''}`}>
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="title-icon">📊</span>
                    Analysis Results
                  </h2>
                </div>

                {analyzing && (
                  <div className="analyzing-animation">
                    <div className="scan-line"></div>
                    <div className="pulse-circle"></div>
                    <p className="analyzing-text">AI is analyzing the image...</p>
                  </div>
                )}

                {result && showResult ? (
                  <div className="results-content">
                    {/* Species Card */}
                    <div className="result-card species-card">
                      <div className="result-icon">🐕</div>
                      <div className="result-details">
                        <div className="result-label">Species Detected</div>
                        <div className="result-value">{result.species || 'Unknown'}</div>
                      </div>
                    </div>

                    {/* Severity Card */}
                    <div className={`result-card severity-card ${getSeverityClass(result.severity)}`}>
                      <div className="result-icon">{getSeverityEmoji(result.severity)}</div>
                      <div className="result-details">
                        <div className="result-label">Severity Level</div>
                        <div className="result-value">{result.severity || 'Unknown'}</div>
                      </div>
                    </div>

                    {/* Confidence Card */}
                    <div className="result-card confidence-card">
                      <div className="result-icon"></div>
                      <div className="result-details">
                        <div className="result-label">AI Confidence</div>
                        <div className="result-value">{((result.confidence || 0) * 100).toFixed(1)}%</div>
                        <div className="confidence-bar">
                          <div 
                            className="confidence-fill" 
                            style={{ width: `${(result.confidence || 0) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Injuries */}
                    {result.injuries && result.injuries.length > 0 && (
                      <div className="info-section injuries-section">
                        <h3 className="section-title">
                          <span className="section-icon">🩹</span>
                          Detected Injuries
                        </h3>
                        <ul className="info-list">
                          {result.injuries.map((injury, idx) => (
                            <li key={idx} className="info-item injury-item">{injury}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* First Aid */}
                    {result.first_aid && result.first_aid.length > 0 && (
                      <div className="info-section first-aid-section">
                        <h3 className="section-title">
                          <span className="section-icon">⚕️</span>
                          First Aid Steps
                        </h3>
                        <ol className="info-list numbered-list">
                          {result.first_aid.map((aid, idx) => (
                            <li key={idx} className="info-item first-aid-item">{aid}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Nearest Facilities */}
                    {result.nearestFacilities && result.nearestFacilities.length > 0 && (
                      <div className="info-section facilities-section">
                        <h3 className="section-title">
                          <span className="section-icon"></span>
                          Nearest Help Centers
                        </h3>
                        <div className="facilities-grid">
                          {result.nearestFacilities.map((facility, idx) => (
                            <div key={idx} className="facility-card">
                              <div className="facility-header">
                                <div className="facility-rank">#{idx + 1}</div>
                                <div className="facility-name">{facility.name}</div>
                              </div>
                              <div className="facility-info">
                                <div className="info-row">
                                  <span className="info-icon"></span>
                                  <span>{facility.type}</span>
                                </div>
                                <div className="info-row">
                                  <span className="info-icon"></span>
                                  <span>{facility.distance.toFixed(1)} km away</span>
                                </div>
                                <div className="info-row">
                                  <span className="info-icon"></span>
                                  <span>{facility.phone}</span>
                                </div>
                                <div className="info-row">
                                  <span className="info-icon"></span>
                                  <span>{facility.available24h ? '24/7 Available' : 'Limited Hours'}</span>
                                </div>
                              </div>
                              <a 
                                href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat || 26.8467},${userLocation?.lng || 80.9462}&destination=${facility.lat},${facility.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="directions-btn"
                              >
                                🗺️ Get Directions
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : !analyzing && (
                  <div className="empty-results">
                    <div className="empty-icon"></div>
                    <p className="empty-text">Upload an image to see AI analysis results</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="history-section">
            <div className="glass-card history-card">
              <div className="card-header">
                <h2 className="card-title">
                  <span className="title-icon"></span>
                  Report History
                </h2>
                <button
                  className="refresh-btn"
                  onClick={loadReports}
                  disabled={loadingReports}
                >
                  {loadingReports ? '⏳' : '🔄'} Refresh
                </button>
              </div>

              {loadingReports ? (
                <div className="reports-grid">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="skeleton-card">
                      <div className="skeleton-rect" style={{ height: '140px', marginBottom: '10px' }}></div>
                      <div className="skeleton-rect" style={{ height: '16px', width: '60%' }}></div>
                    </div>
                  ))}
                </div>
              ) : reports.length > 0 ? (
                <div className="reports-grid">
                  {reports.map((report, idx) => (
                    <div key={report.id} className="report-card" style={{ animationDelay: `${idx * 0.1}s` }}>
                      {report.image && (
                        <div className="report-image-container">
                          <img 
                            src={report.image} 
                            alt="Animal" 
                            className="report-image"
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                        </div>
                      )}
                      <div className="report-content">
                        <div className="report-header">
                          <span className="report-species">{report.result?.species || 'Unknown'}</span>
                          <span className={`report-severity ${getSeverityClass(report.result?.severity)}`}>
                            {getSeverityEmoji(report.result?.severity)} {report.result?.severity}
                          </span>
                        </div>
                        <div className="report-info">
                          <div className="report-row">
                            <span className="report-icon">📍</span>
                            <span className="report-text">{report.location}</span>
                          </div>
                          <div className="report-row">
                            <span className="report-icon">🎯</span>
                            <span className="report-text">Confidence: {((report.result?.confidence || 0) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="report-row">
                            <span className="report-icon">🕐</span>
                            <span className="report-text">{new Date(report.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        {report.notes && (
                          <div className="report-notes">
                            <strong>Notes:</strong> {report.notes.substring(0, 100)}{report.notes.length > 100 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <p className="empty-text">No reports yet</p>
                  <p className="empty-subtext">Submit your first rescue report to get started!</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <button className="sos-button" onClick={handleSOS} title="Send emergency alert via WhatsApp">
        🚨 SOS
      </button>
    </div>
  )
}

export default App
