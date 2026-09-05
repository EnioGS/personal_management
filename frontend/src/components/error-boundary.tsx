import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Keeps one broken screen from taking the whole app with it.
 *
 * Without this, an error thrown while rendering a panel unmounts the root and leaves a
 * blank page with nothing to act on — the failure and the diagnosis both disappear. Here
 * the rest of the app keeps working, the message is on screen, and the screen can be
 * retried without a reload.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A screen failed to render', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full flex-col items-start gap-3 p-6 text-sm">
        <h2 className="font-medium">This screen could not be drawn.</h2>
        <p className="text-muted-foreground max-w-prose text-xs">
          Everything else still works, and nothing was changed. If it keeps happening after a reload, the message
          below is what to report.
        </p>
        <pre className="bg-muted max-w-full overflow-auto rounded-md p-3 text-xs">{error.message}</pre>
        <button
          type="button"
          className="border-border rounded-md border px-2 py-1 text-xs"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    )
  }
}
