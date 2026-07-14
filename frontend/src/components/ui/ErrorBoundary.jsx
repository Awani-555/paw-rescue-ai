import { Component } from 'react'
import Card from './Card'
import Button from './Button'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, info)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="error-boundary-card">
          <h2>Something went wrong</h2>
          <p>We hit a snag loading this page. Your data is safe — try again.</p>
          <Button variant="primary" onClick={this.handleRetry}>
            Try again
          </Button>
        </Card>
      )
    }

    return this.props.children
  }
}
