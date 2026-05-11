import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(y, m1, d) {
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

function monthWindow(year, month0) {
  const start = new Date(year, month0, 1);
  const end = new Date(year, month0 + 1, 0);
  return {
    from: ymd(year, month0 + 1, 1),
    to: ymd(year, month0 + 1, end.getDate()),
  };
}

const EMPTY = { title: "", kind: "holiday", start_date: "", end_date: "", color: "", notes: "" };

export default function AdminCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({ ...EMPTY, start_date: ymd(now.getFullYear(), now.getMonth() + 1, now.getDate()) }));
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const win = useMemo(() => monthWindow(year, month0), [year, month0]);
  const title = useMemo(() => new Date(year, month0, 1).toLocaleString(undefined, { month: "long", year: "numeric" }), [year, month0]);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .get("/api/calendar/events", { params: { from: win.from, to: win.to } })
      .then(({ data }) => {
        setEvents(Array.isArray(data?.events) ? data.events : []);
      })
      .catch((e) => {
        setEvents([]);
        setError(friendlyErrorMessage(e, "Could not load calendar events."));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.from, win.to]);

  const prev = () => {
    setMonth0((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };
  const next = () => {
    setMonth0((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const payload = {
      title: form.title,
      kind: form.kind,
      start_date: String(form.start_date || "").trim(),
      end_date: String(form.end_date || "").trim() || null,
      color: String(form.color || "").trim() || null,
      notes: String(form.notes || "").trim(),
    };
    try {
      if (editingId != null) {
        await api.put(`/api/calendar/events/${editingId}`, payload);
        setMessage("Event updated.");
      } else {
        await api.post("/api/calendar/events", payload);
        setMessage("Event added.");
      }
      setEditingId(null);
      setForm((f) => ({ ...EMPTY, start_date: f.start_date || win.from }));
      load();
    } catch (err) {
      setError(friendlyErrorMessage(err, editingId != null ? "Could not update event." : "Could not add event."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setError("");
    setMessage("");
    setForm({
      title: ev.title || "",
      kind: ev.kind || "holiday",
      start_date: ev.start_date || "",
      end_date: ev.end_date || "",
      color: ev.color || "",
      notes: ev.notes || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError("");
    setMessage("");
    setForm((f) => ({ ...EMPTY, start_date: f.start_date || win.from }));
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this event?")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.delete(`/api/calendar/events/${id}`);
      setMessage("Event deleted.");
      if (editingId === id) cancelEdit();
      load();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not delete event."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Calendar (admin)" />

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Viewing: <span className="font-bold">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-outline px-3 py-2" onClick={prev} aria-label="Previous month">
              ‹
            </button>
            <button type="button" className="btn-outline px-3 py-2" onClick={next} aria-label="Next month">
              ›
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/50 dark:text-emerald-100">
            {message}
          </div>
        ) : null}

        <form onSubmit={submit} className="agc-form grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#101010] sm:grid-cols-2">
          {editingId != null ? (
            <div className="sm:col-span-2 rounded-lg border border-[#0B3EAF]/20 bg-[#0B3EAF]/5 px-3 py-2 text-sm font-semibold text-[#0B3EAF] dark:border-[#A7D344]/30 dark:bg-[#A7D344]/10 dark:text-[#A7D344]">
              Editing event #{editingId}
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Title</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#141414]"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Victoria Day"
              required
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Type</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#141414]"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              disabled={saving}
            >
              <option value="holiday">Holiday</option>
              <option value="activity">Activity</option>
              <option value="other">Others</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Color (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#141414]"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              placeholder="#E02B20"
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Start date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#141414]"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              required
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">End date (optional)</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#141414]"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Notes (optional)</label>
            <textarea
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#141414]"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
            {editingId != null ? (
              <button type="button" className="btn-outline" onClick={cancelEdit} disabled={saving}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : editingId != null ? "Save changes" : "Add event"}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#101010]">
          <div className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">Events in {title}</div>
          {loading ? (
            <div className="text-sm text-slate-600 dark:text-slate-300">Loading…</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">No events yet.</div>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{ev.title}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      {(ev.kind === "other" ? "others" : ev.kind)} · {ev.start_date}
                      {ev.end_date ? ` → ${ev.end_date}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn-outline px-3 py-2 text-xs" onClick={() => startEdit(ev)} disabled={saving}>
                      Edit
                    </button>
                    <button type="button" className="btn-danger px-3 py-2 text-xs" onClick={() => remove(ev.id)} disabled={saving}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

