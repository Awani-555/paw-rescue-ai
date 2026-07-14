export default function Card({ children, className = '', onClick, ...rest }) {
  const classes = ['ui-card', onClick ? 'interactive' : '', className].filter(Boolean).join(' ')
  return (
    <div className={classes} onClick={onClick} {...rest}>
      {children}
    </div>
  )
}
