import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional label for identifying which section crashed */
  section?: string;
  /** If true, renders a compact inline error instead of full-page */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error(`[ErrorBoundary${this.props.section ? ` - ${this.props.section}` : ""}]`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Compact inline error for section-level boundaries
      if (this.props.inline) {
        return (
          <div className="flex flex-col items-center justify-center p-6 text-center gap-3 rounded-lg" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--g-text-primary, inherit)" }}>
                {this.props.section ? `${this.props.section} failed to load` : "Something went wrong"}
              </p>
              {this.state.error && (
                <p className="text-xs mt-1 font-mono" style={{ color: "var(--g-text-tertiary, #666)" }}>
                  {this.state.error.message.slice(0, 120)}
                </p>
              )}
            </div>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:opacity-80"
              style={{ background: "var(--g-accent, #f97316)", color: "#fff" }}
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        );
      }

      // Full-page error for app-level boundary
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

/** Lightweight section boundary — wraps a feature section so crashes don't take down the whole page */
export function SectionBoundary({ children, name }: { children: ReactNode; name: string }) {
  return <ErrorBoundary section={name} inline>{children}</ErrorBoundary>;
}
