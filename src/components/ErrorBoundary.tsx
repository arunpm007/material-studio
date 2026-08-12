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

  // Recovery is handled by the parent, which remounts this boundary via a
  // `key` tied to the current model — so a fresh instance starts clean.

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}
