import { Component, type ReactNode } from "react";

type Props = { onError?: (e: Error) => void; children: ReactNode };
type State = { hasError: boolean };

/** Catches model-load failures so a bad URL doesn't crash the whole canvas. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}
