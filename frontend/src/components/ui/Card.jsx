import { forwardRef } from 'react'

const Card = forwardRef(function Card({ children, className = '', onClick, ...rest }, ref) {
  const classes = ['ui-card', onClick ? 'interactive' : '', className].filter(Boolean).join(' ')
  return (
    <div ref={ref} className={classes} onClick={onClick} {...rest}>
      {children}
    </div>
  )
})

export default Card
