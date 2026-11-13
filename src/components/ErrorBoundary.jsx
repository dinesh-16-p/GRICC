import React, { Component } from 'react';
import { AlertOctagon, RefreshCw, RotateCcw } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary] Caught error in ${this.props.name || 'Component'}:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const moduleName = this.props.name || 'Intelligence Module';
      const isDev = process.env.NODE_ENV !== 'production';

      return (
        <div className="my-6 rounded-2xl border border-red-500/30 bg-navy-900/90 p-6 md:p-8 shadow-xl backdrop-blur-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-navy-700/60 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15 border border-red-500/40 text-red-400">
                <AlertOctagon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-wide">
                  {moduleName} Encountered an Error
                </h3>
                <p className="text-xs text-slate-400">
                  The rest of the GRICC Command Center remains operational.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry Module
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-700 bg-navy-800/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-navy-700 hover:text-white transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload Page
              </button>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs text-slate-300">
              {this.state.error?.message || 'An unexpected rendering error occurred while mounting this component.'}
            </p>
            {isDev && this.state.error?.stack && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-navy-950 p-3 text-[11px] font-mono text-red-300/80 border border-navy-800">
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

