import { Component } from "react";

// Session-scoped flag so the auto-reload below only ever fires once per
// page mount — see componentDidCatch()'s comment for why. Exported so
// main.jsx can clear it right after a successful initial render, which is
// what makes this work across MULTIPLE deploys in the same browser tab
// (without that reset, only the very first deploy after the tab was opened
// would get the free auto-reload; later ones in the same session wouldn't).
export const CHUNK_RELOAD_FLAG_KEY = "agc_chunk_reload_once";

// Vite/webpack code-splitting error text varies by bundler/browser, but all
// of these mean the same thing: the browser already has an OLD build of
// this page loaded, and it just tried to fetch a lazy-loaded chunk by its
// OLD filename — which the server deleted the moment the latest deploy
// replaced it with a new, differently-hashed filename. It is not a real
// bug in the page.
function isStaleChunkError(err) {
  const msg = String(err?.message || err || "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    err?.name === "ChunkLoadError"
  );
}

export default class AppErrorBoundary extends Component {
  state = { err: null };

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.error("App render error:", err, info);

    // A stale-chunk error fixes itself the instant the page reloads, since
    // the fresh page load pulls the CURRENT index.html, which references
    // the CURRENT (matching) chunk filenames. Reload once automatically
    // instead of showing "Something broke" for what is, from the user's
    // point of view, not actually broken — just out of date. Guarded by
    // sessionStorage so a chunk that's stale for a genuinely different
    // reason (e.g. the deploy itself is broken) doesn't reload-loop
        // forever; after one attempt this falls through to the normal error
    // screen below instead of reloading again.
    if (isStaleChunkError(err)) {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_FLAG_KEY) === "1";
      } catch {
        // sessionStorage unavailable (private browsing, locked-down
        // settings, etc.) — skip the auto-reload and just show the error
        // screen below rather than risking a reload loop with no way to
        // remember "already tried".
        alreadyTried = true;
      }
      if (!alreadyTried) {
        try {
          sessionStorage.setItem(CHUNK_RELOAD_FLAG_KEY, "1");
        } catch {
          /* ignore — worst case this reload attempt isn't remembered */
        }
        window.location.reload();
        return;
      }
    }
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
