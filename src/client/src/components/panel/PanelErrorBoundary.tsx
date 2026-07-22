import { Component, type ReactNode } from "react";
import PanelErrorFallback from "./PanelErrorFallback";

interface Props {
  children: ReactNode;
  panelName?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PanelErrorBoundary] ${this.props.panelName ?? "Panel"} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <PanelErrorFallback
          title={`${this.props.panelName ?? "Panel"} error`}
          error={this.state.error}
          onRetry={() => {
            this.setState({ hasError: false, error: null });
            this.props.onRetry?.();
          }}
        />
      );
    }
    return this.props.children;
  }
}
