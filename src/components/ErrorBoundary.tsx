import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application:', error, errorInfo);
    this.setState({ errorInfo });

    // Auto-recuperación transparente ante actualización de versión o error de módulo
    const errMsg = (error?.message || error?.toString() || '').toLowerCase();
    const isModuleOrNetworkError = 
      errMsg.includes('dynamically imported module') ||
      errMsg.includes('failed to fetch') ||
      errMsg.includes('loading chunk') ||
      errMsg.includes('mime type');

    if (isModuleOrNetworkError) {
      try {
        const lastAutoReload = sessionStorage.getItem('pos_last_chunk_autoreload');
        const now = Date.now();
        if (!lastAutoReload || (now - Number(lastAutoReload)) > 15000) {
          sessionStorage.setItem('pos_last_chunk_autoreload', String(now));
          window.location.reload();
          return;
        }
      } catch {}
    }
  }

  private handleReset = () => {
    try {
      window.sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        }).catch(() => {});
      }
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-stone-800 border border-stone-700 rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
            
            <h1 className="text-xl font-bold text-white mb-2">
              🍗 Pollo Frito Sabor Cervanteño
            </h1>
            <p className="text-sm text-stone-300 mb-6">
              El sistema ha detectado una pausa inesperada. Puede reiniciar la interfaz de forma segura.
            </p>

            {this.state.error && (
              <div className="bg-stone-900/80 border border-stone-700/60 rounded-lg p-3 text-left mb-6 text-xs text-stone-400 font-mono overflow-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-600/20"
              >
                <RefreshCw className="w-4 h-4" />
                Recargar terminal
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                }}
                className="py-3 px-4 bg-stone-700 hover:bg-stone-600 text-stone-200 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Home className="w-4 h-4" />
                Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
