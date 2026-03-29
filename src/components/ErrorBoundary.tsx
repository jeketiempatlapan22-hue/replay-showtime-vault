import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="text-center space-y-4 max-w-md">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Terjadi Kesalahan</h2>
            <p className="text-muted-foreground text-sm">
              {this.state.error?.message || 'Sesuatu tidak berjalan dengan baik.'}
            </p>
            <Button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>
              Muat Ulang
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
