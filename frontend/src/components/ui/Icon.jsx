const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function PawIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="7" cy="8" r="1.6" />
      <circle cx="12" cy="6" r="1.6" />
      <circle cx="17" cy="8" r="1.6" />
      <circle cx="19" cy="13" r="1.6" />
      <path d="M12 12c-3 0-6.5 2.3-6.5 5.3 0 1.7 1.4 2.9 3 2.6 1.2-.2 2.2-.9 3.5-.9s2.3.7 3.5.9c1.6.3 3-.9 3-2.6C18.5 14.3 15 12 12 12z" />
    </svg>
  )
}

export function CameraIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </svg>
  )
}

export function SparkleIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z" />
      <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z" />
    </svg>
  )
}

export function PinIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s7-6.6 7-11.5a7 7 0 1 0-14 0C5 14.4 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  )
}

export function WifiOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M2 2l20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 12.5a10 10 0 0 1 3.5-2.3" />
      <path d="M12.5 8.02c2.9-.15 5.8.86 8 2.98" />
      <path d="M16 12.5c.6.35 1.15.78 1.65 1.28" />
      <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ArrowRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}
