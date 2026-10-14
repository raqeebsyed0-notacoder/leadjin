/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 text-center">
          <h1 className="text-4xl font-bold mb-4">Something went wrong.</h1>
          <pre className="bg-zinc-900 p-6 rounded-xl text-left overflow-auto max-w-full text-xs text-red-400 border border-red-900/50">
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 px-8 py-3 bg-white text-black rounded-full font-bold uppercase tracking-widest text-xs"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
