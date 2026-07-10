import { Component } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Root error boundary. A render-time exception anywhere in the tree
 * shows this fallback instead of a white screen (FE-01 fix).
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    // In dev, mirror to the console. In prod, swap with Sentry/Datadog.
    if (import.meta.env.DEV) {
       
      console.error("ErrorBoundary caught:", err, info);
    }
  }

  handleReset = () => {
    this.setState({ err: null });
  };

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>
              The page hit an unexpected error. Try again — if it keeps happening, contact support.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {import.meta.env.DEV && this.state.err?.message && (
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
                {this.state.err.message}
              </pre>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={this.handleReset}>
                <RotateCw className="h-4 w-4 me-2" />
                Try Again
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => (window.location.href = "/")}>
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
