import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { exportToCsv, exportToXlsx, exportToPdf, exportToPptx, exportToPng } from "../utils/exportTable";

/**
 * Shared "Export" dropdown used on every SLT Tracker board (Action
 * Register, Decisions, 90 Day Commitments) — one shared component rather
 * than copy-pasted per board (this codebase's usual "duplicate small UI
 * bits per file" convention doesn't fit here, since it would mean
 * triplicating the format-specific export logic and its heavy library
 * imports three times over).
 *
 * Exports exactly the rows passed in via `rows` — callers pass their
 * current FILTERED list (after search/column filters/tab selection), not
 * the full board, so the export always matches whatever's on screen. See
 * each board's own EXPORT_COLUMNS constant for which fields go in the file
 * (built from that board's existing field list, so it stays in sync if
 * fields are ever added there).
 *
 * The dropdown panel renders through a portal into document.body (same
 * trick as ColumnFilterHeader in these board files) since the button
 * typically sits in a plain white area above the table, but a portal keeps
 * this safe even if a future caller places it somewhere with
 * overflow-hidden (e.g. inside the gradient BoardHeader banner).
 */

const FORMATS = [
  { key: "csv", label: "CSV (.csv)" },
  { key: "xlsx", label: "Excel (.xlsx)" },
  { key: "pdf", label: "PDF (.pdf)" },
  { key: "pptx", label: "PowerPoint (.pptx)" },
  { key: "png", label: "Image (.png)" },
];

export default function ExportMenu({ columns, rows, filenameBase, title, variant = "light", overrides }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const closeMenu = () => setOpen(false);

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      const insideAny = [btnRef, panelRef].some((r) => r.current && r.current.contains(e.target));
      if (!insideAny) closeMenu();
    };
    const onScrollOrResize = () => closeMenu();
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const runExport = async (formatKey) => {
    closeMenu();
    setBusy(true);
    try {
      const payload = { columns, rows, filenameBase, title };
      // A caller can redirect one specific format to its own function
      // instead of the generic client-side export above — the Master
      // Calendar's Excel format is the reason this exists: it has an
      // existing backend-generated .xlsx that a paired "Import from
      // Excel" feature depends on, so Excel here has to keep calling that
      // endpoint rather than building a plain spreadsheet from `columns`.
      if (overrides && overrides[formatKey]) await overrides[formatKey](payload);
      else if (formatKey === "csv") exportToCsv(payload);
      else if (formatKey === "xlsx") exportToXlsx(payload);
      else if (formatKey === "pdf") exportToPdf(payload);
      else if (formatKey === "pptx") await exportToPptx(payload);
      else if (formatKey === "png") await exportToPng(payload);
    } catch (e) {
      console.error("Export failed:", e);
      window.alert("Could not export this list. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const lightClasses =
    "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";
  const onBlueClasses = "border-white/40 text-white/90 hover:bg-white/10";

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => (open ? closeMenu() : openMenu())}
        disabled={busy}
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
          variant === "onBlue" ? onBlueClasses : lightClasses
        }`}
      >
        {busy ? "Exporting…" : "Export"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" fill="none" className="h-2 w-2.5 shrink-0 opacity-70" aria-hidden>
          <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              style={{ position: "fixed", top: pos.top, right: pos.right }}
              className="z-[100] w-44 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-2xl dark:border-slate-700 dark:bg-[#1a1a1a]"
            >
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => runExport(f.key)}
                  className="block w-full rounded px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  {f.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
