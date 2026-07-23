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
  retryCount: number;
}

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, retryCount: 0 };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState((prev) => ({ retryCount: prev.retryCount + 1 }));
    console.error(`[PanelErrorBoundary] ${this.props.panelName ?? "Panel"} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      const retriesLeft = MAX_RETRIES - this.state.retryCount;
      return (
        <PanelErrorFallback
          title={`${this.props.panelName ?? "Panel"} error`}
          error={this.state.error}
          onRetry={retriesLeft > 0 ? () => {
            this.setState({ hasError: false, error: null });
            this.props.onRetry?.();
          } : undefined}
        />
      );
    }
    return this.props.children;
  }
}
