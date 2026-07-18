export default function CameraCapture({ camera }) {
  const { image, error, cameraInputRef, galleryInputRef, handleFile, pickFromCamera, pickFromGallery, clear } = camera

  return (
    <div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {error && <div className="form-error">{error}</div>}

      {image ? (
        <div className="image-preview-wrap">
          <img src={image} alt="Captured animal" />
        </div>
      ) : (
        <div className="camera-capture-zone" onClick={pickFromCamera}>
          <svg
            className="camera-capture-icon"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="14" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p style={{ fontWeight: 600 }}>Tap to take a photo</p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
            A clear photo helps identify the animal and injuries
          </p>
        </div>
      )}

      {image ? (
        <button className="camera-gallery-link" onClick={clear}>
          Remove photo
        </button>
      ) : (
        <button className="camera-gallery-link" onClick={pickFromGallery}>
          Choose from gallery instead
        </button>
      )}
    </div>
  )
}
