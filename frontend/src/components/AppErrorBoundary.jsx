import { Component } from "react";

export default class AppErrorBoundary extends Component {
  state = { err: null };

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.error("App render error:", err, info);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
          <h1 className="text-xl font-bold text-red-700">Something broke</h1>
          <pre className="mt-4 overflow-auto rounded bg-white p-4 text-sm shadow">{String(this.state.err)}</pre>
          <p className="mt-4 text-sm">Open the browser console (F12) for details. Try a hard refresh (Ctrl+Shift+R).</p>
        </div>
      );
    }
    return this.props.children;
  }
}
