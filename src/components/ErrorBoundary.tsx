import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const DOM_ERROR_PATTERNS = [
  'insertBefore',
  'removeChild',
  'appendChild',
  'replaceChild',
  'NotFoundError',
  'not a child of this node',
  'Failed to execute',
];

function isDomReconciliationError(error: Error | string): boolean {
  const msg = typeof error === 'string' ? error : error?.message || '';
  return DOM_ERROR_PATTERNS.some(p => msg.includes(p));
}

function isStaleChunkError(error: Error | string): boolean {
  const msg = typeof error === 'string' ? error : error?.message || '';
  return msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('ChunkLoadError');
}

interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };
  private recovering = false;

  static getDerivedStateFromError(error: Error): State | null {
    // For DOM reconciliation errors, don't show error UI - we'll auto-recover
    if (isDomReconciliationError(error) || isStaleChunkError(error)) {
      return null; // Don't update state, let componentDidCatch handle it
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isStaleChunkError(error) && !this.recovering) {
      this.recovering = true;
      const recoveryKey = 'replaytime-chunk-recovery';
      try {
        if (sessionStorage.getItem(recoveryKey) === '1') {
          this.setState({ hasError: true, error });
          return;
        }
        sessionStorage.setItem(recoveryKey, '1');
      } catch { /* continue with one recovery attempt */ }
      void (async () => {
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key.startsWith('app-code-') || key.startsWith('html-nav-')).map((key) => caches.delete(key)));
          }
        } finally {
          window.location.reload();
        }
      })();
      return;
    }

    console.error('ErrorBoundary caught:', error, info);
    
    if (isDomReconciliationError(error) && !this.recovering) {
      this.recovering = true;
      console.warn('DOM reconciliation error detected, forcing recovery...');
      // Schedule a clean re-render after the current cycle
      setTimeout(() => {
        this.recovering = false;
        this.forceUpdate();
      }, 100);
    }
  }

  componentDidMount() {
    // Global handler to suppress DOM reconciliation errors from crashing Chrome
    window.addEventListener('error', this.handleGlobalError);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    if (isDomReconciliationError(event.error || event.message)) {
      console.warn('Suppressed DOM reconciliation error:', event.message);
      event.preventDefault();
      event.stopPropagation();
    }
  };

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
