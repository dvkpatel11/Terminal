import { Component, type ReactNode } from "react";
import PanelErrorFallback from "./PanelErrorFallback";

const MAX_RETRIES = 3;

interface Props {
  children: ReactNode;
  panelName?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Static counter survives state replacements from getDerivedStateFromError
let globalRetryCount = 0;
let lastErrorKey = "";

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Only count each unique crash once (prevents double-counting from re-renders)
    const key = String(error?.message ?? error);
    if (key !== lastErrorKey) {
      globalRetryCount++;
      lastErrorKey = key;
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PanelErrorBoundary] ${this.props.panelName ?? "Panel"} crashed (${globalRetryCount}/${MAX_RETRIES}):`, error, info);
  }

  render() {
    if (this.state.hasError) {
      const retriesLeft = MAX_RETRIES - globalRetryCount;
      return (
        <PanelErrorFallback
          title={`${this.props.panelName ?? "Panel"} error`}
          error={this.state.error}
          onRetry={retriesLeft > 0 ? () => {
            lastErrorKey = "";
            this.setState({ hasError: false, error: null });
            this.props.onRetry?.();
          } : undefined}
        />
      );
    }
    return this.props.children;
  }
}
