import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--g-accent-soft)" }}>
            <span className="text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--g-text-primary)" }}>Something went wrong</h2>
          <p className="text-sm text-center max-w-md" style={{ color: "var(--g-text-tertiary)" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
