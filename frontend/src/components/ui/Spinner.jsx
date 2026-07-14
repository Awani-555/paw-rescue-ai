const SIZE_CLASS = {
  sm: 'ui-spinner-sm',
  md: 'ui-spinner-md',
  lg: 'ui-spinner-lg',
}

export default function Spinner({ size = 'md', color }) {
  const style = color ? { borderTopColor: color } : undefined
  return <span className={`ui-spinner ${SIZE_CLASS[size] || SIZE_CLASS.md}`} style={style} />
}
