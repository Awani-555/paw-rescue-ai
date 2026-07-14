import Spinner from './Spinner'

export default function Button({
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  onClick,
  children,
  type = 'button',
  className = '',
  ...rest
}) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'large' ? 'btn-lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size="sm" color="currentColor" />}
      {children}
    </button>
  )
}
