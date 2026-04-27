import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const FACILITIES = ["AGC", "AQM", "SCF", "ASP"];
/** Image uploads to Spaces/local; allow a few minutes on slow links. */
const UPLOAD_IMAGE_TIMEOUT_MS = 3 * 60 * 1000;

const fieldLabelClass =
  "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400 max-xl:text-[0.7rem]";
/** `text-base` avoids iOS input zoom; `max-xl:text-sm` tightens on laptop. */
const fieldInputClass =
  "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15 dark:border-slate-600 dark:bg-slate-800 dark:placeholder:text-slate-500 dark:focus:border-brand-green dark:focus:ring-brand-green/20 max-xl:text-sm";
const formPanelClass =
  "rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 max-xl:p-3";

const ADD_FORM_STORAGE_KEY = "agc_admin_upcoming_facility_pick";

/** Fresh add-form state; `businessUnits` keeps the same array identity semantics as before (new arrays each time). */
function createEmptyAddForm(businessUnits) {
  const units =
    Array.isArray(businessUnits) && businessUnits.length > 0
      ? FACILITIES.filter((code) => businessUnits.map((x) => String(x).toUpperCase()).includes(code))
      : ["AGC"];
  return {
    business_units: units.length ? units : ["AGC"],
    title: "",
    detail: "",
    show_from_at: "",
    event_at: "",
    end_at: "",
    published: true,
    image_url: "",
  };
}

function readStoredFacilityPick() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADD_FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ordered = FACILITIES.filter((code) =>
      parsed.map((x) => String(x).toUpperCase()).includes(code)
    );
    return ordered.length > 0 ? ordered : null;
  } catch {
    return null;
  }
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

/** Empty or whitespace → null so the API clears the field; otherwise trimmed string. */
function trimDateField(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

/**
 * Sends schedule fields as UTC ISO so the backend always gets a single parseable shape
 * (covers datetime-local, ISO strings, and "YYYY-MM-DD HH:mm" quirks).
 */
function scheduleFieldToApi(s) {
  const t = trimDateField(s);
  if (t === null) return null;
  let normalized = t;
  if (/^\d{4}-\d{2}-\d{2} \d/.test(normalized)) {
    normalized = normalized.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T");
  }
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function assertScheduleField(label, raw, iso) {
  if (trimDateField(raw) != null && iso == null) {
    window.alert(
      `${label} could not be read. Use the date picker or a clear date/time (e.g. 2026-04-11 4:30 PM in your locale).`
    );
    return false;
  }
  return true;
}

/** Read datetime-local values from the form node (avoids stale React state if submit races onChange). */
function readScheduleFromFormEl(formEl) {
  if (!formEl) return null;
  try {
    const fd = new FormData(formEl);
    return {
      show_from_at: String(fd.get("agc_show_from") ?? ""),
      event_at: String(fd.get("agc_event") ?? ""),
      end_at: String(fd.get("agc_end") ?? ""),
    };
  } catch {
    return null;
  }
}

/** Read which facility checkboxes are actually checked in the DOM (authoritative for paint). */
function readBusinessUnitsFromDom(formEl) {
  if (!formEl) return [];
  try {
    const out = [];
    for (const code of FACILITIES) {
      const el = formEl.querySelector(
        `input[type="checkbox"][name="business_units"][value="${code}"]`
      );
      if (el instanceof HTMLInputElement && el.checked) out.push(code);
    }
    return FACILITIES.filter((c) => out.includes(c));
  } catch {
    return [];
  }
}

/**
 * React state and the DOM can disagree briefly after "Select all" or fast toggles + Save.
 * `stateOrdered` should come from a ref updated in the same tick as toggles (not only from `useState`).
 */
function mergeBusinessUnitPick(formEl, stateOrdered) {
  const fromDom = readBusinessUnitsFromDom(formEl);
  const fromState = FACILITIES.filter((f) => (stateOrdered ?? []).includes(f));
  if (fromState.length > fromDom.length) return fromState;
  if (fromDom.length > fromState.length) return fromDom;
  return fromState.length ? fromState : fromDom;
}

export default function AdminUpcomingSection({ className = "card mt-6" }) {
  const [events, setEvents] = useState([]);
  const initialAddForm = createEmptyAddForm(readStoredFacilityPick() ?? undefined);
  /** Same tick as checkbox toggles — avoids React 18 batching where Save runs before state commits. */
  const addBusinessUnitsRef = useRef(initialAddForm.business_units);
  const [form, setForm] = useState(() => initialAddForm);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [editing, setEditing] = useState(null); // event object
  const [editingSaving, setEditingSaving] = useState(false);
  const [uploadingFormImage, setUploadingFormImage] = useState(false);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const formImageInputRef = useRef(null);
  const editImageInputRef = useRef(null);
  const addFormRef = useRef(/** @type {HTMLFormElement | null} */ (null));
  const editShowRef = useRef(null);
  const editEventRef = useRef(null);
  const editEndRef = useRef(null);
  const editModalRef = useRef(/** @type {HTMLFormElement | null} */ (null));
  const editBusinessUnitsRef = useRef(/** @type {string[]} */ ([]));

  const load = () => {
    return api
      .get("/upcoming")
      .then((r) => setEvents(Array.isArray(r.data) ? r.data : []))
      .catch((err) => {
        console.warn("Upcoming admin list failed:", err.response?.status ?? err.message);
        setEvents([]);
      });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    addBusinessUnitsRef.current = form.business_units;
    try {
      sessionStorage.setItem(ADD_FORM_STORAGE_KEY, JSON.stringify(form.business_units));
    } catch {
      /* private mode / quota */
    }
  }, [form.business_units]);

  const broadcastUpdate = () => {
    window.dispatchEvent(new Event("facility-upcoming-updated"));
  };

  /**
   * @param {boolean | undefined} publishedOverride - if set, overrides the form checkbox (e.g. draft = false)
   * @param {{ show_from_at?: string, event_at?: string, end_at?: string } | null} scheduleOverride - from DOM; preferred over React state
   */
  const toggleAddFacility = (code) => {
    setForm((prev) => {
      const next = new Set(prev.business_units);
      if (next.has(code)) {
        if (next.size <= 1) return prev;
        next.delete(code);
      } else {
        next.add(code);
      }
      const ordered = FACILITIES.filter((f) => next.has(f));
      addBusinessUnitsRef.current = ordered;
      return { ...prev, business_units: ordered };
    });
  };

  const toggleEditFacility = (code) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.business_units);
      if (next.has(code)) {
        if (next.size <= 1) return prev;
        next.delete(code);
      } else {
        next.add(code);
      }
      const ordered = FACILITIES.filter((f) => next.has(f));
      editBusinessUnitsRef.current = ordered;
      return { ...prev, business_units: ordered };
    });
  };

  const selectAllFacilitiesAdd = () => {
    const all = [...FACILITIES];
    addBusinessUnitsRef.current = all;
    setForm((prev) => ({ ...prev, business_units: all }));
  };

  const selectAllFacilitiesEdit = () => {
    const all = [...FACILITIES];
    setEditing((prev) => {
      if (!prev) return prev;
      editBusinessUnitsRef.current = all;
      return { ...prev, business_units: all };
    });
  };

  const addUpcomingEvent = async (publishedOverride, scheduleOverride) => {
    if (!form.title.trim()) {
      window.alert("Please enter a title for this event.");
      return;
    }
    const businessUnits = mergeBusinessUnitPick(addFormRef.current, form.business_units);
    if (!businessUnits.length) {
      window.alert("Select at least one facility.");
      return;
    }
    const published =
      publishedOverride !== undefined ? Boolean(publishedOverride) : form.published;
    const sch = scheduleOverride ?? readScheduleFromFormEl(addFormRef.current) ?? {
      show_from_at: form.show_from_at,
      event_at: form.event_at,
      end_at: form.end_at,
    };
    const showIso = scheduleFieldToApi(sch.show_from_at);
    const eventIso = scheduleFieldToApi(sch.event_at);
    const endIso = scheduleFieldToApi(sch.end_at);
    if (!assertScheduleField("Show in list from", sch.show_from_at, showIso)) return;
    if (!assertScheduleField("Event date & time", sch.event_at, eventIso)) return;
    if (!assertScheduleField("Hide from list after", sch.end_at, endIso)) return;

    setSaving(true);
    try {
      await api.post("/upcoming", {
        business_units: businessUnits,
        // Legacy single-field compat (older backends only read `business_unit`)
        business_unit: businessUnits[0],
        title: form.title.trim(),
        detail: form.detail.trim() || undefined,
        show_from_at: showIso ?? undefined,
        event_at: eventIso ?? undefined,
        end_at: endIso ?? undefined,
        published,
        image_url: form.image_url?.trim() || undefined,
      });
      // Clear title/schedule but keep the same facility selection (new object every time — no shared EMPTY_FORM refs).
      const nextForm = createEmptyAddForm(businessUnits);
      addBusinessUnitsRef.current = nextForm.business_units;
      setForm(nextForm);
      await load();
      broadcastUpdate();
    } catch (err) {
      console.warn("Add upcoming failed:", err.response?.data ?? err.message);
      const st = err.response?.status;
      const data = err.response?.data;
      const detail =
        typeof data === "string"
          ? data.slice(0, 300)
          : data?.message || (data && JSON.stringify(data)) || err.message || "Network error";
      window.alert(
        st
          ? `Save failed (HTTP ${st}):\n${detail}\n\nIf you use npm run dev, keep the backend running (npm run dev in backend).`
          : `${detail}\n\nIs the API reachable? Dev uses ${import.meta.env.VITE_API_URL || "/api (Vite proxy → port 5000)"}.`
      );
    } finally {
      setSaving(false);
    }
  };

  const onSubmitForm = (e) => {
    e.preventDefault();
    const schedule = readScheduleFromFormEl(e.currentTarget);
    void addUpcomingEvent(undefined, schedule);
  };

  const onRemove = async (id) => {
    if (
      !window.confirm("Remove this upcoming event? It will disappear from the facility Upcoming list.")
    ) {
      return;
    }
    setRemovingId(id);
    try {
      await api.delete(`/upcoming/${id}`);
      await load();
      broadcastUpdate();
    } catch (err) {
      console.warn("Remove upcoming failed:", err.response?.data ?? err.message);
      const st = err.response?.status;
      const data = err.response?.data;
      const detail =
        typeof data === "string"
          ? data.slice(0, 300)
          : data?.message || (data && JSON.stringify(data)) || err.message;
      window.alert(st ? `Remove failed (HTTP ${st}): ${detail}` : detail || "Could not remove event.");
    } finally {
      setRemovingId(null);
    }
  };

  const toLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEdit = (ev) => {
    const eventSrc = ev.event_at ?? ev.eventAt ?? ev.start_at ?? ev.startAt;
    const showSrc = ev.show_from_at ?? ev.showFromAt;
    const bu = String(ev.business_unit ?? ev.businessUnit ?? "").trim().toUpperCase();
    const fromApi = Array.isArray(ev.business_units) ? ev.business_units : [];
    const business_units =
      fromApi.length > 0
        ? FACILITIES.filter((f) => fromApi.map((x) => String(x).toUpperCase()).includes(f))
        : FACILITIES.includes(bu)
          ? [bu]
          : ["AGC"];
    editBusinessUnitsRef.current = business_units;
    setEditing({
      ...ev,
      business_units,
      business_unit: business_units[0],
      image_url: ev.image_url || "",
      published: ev.published !== 0 && ev.published !== false,
      show_from_at: toLocalInput(showSrc),
      event_at: toLocalInput(eventSrc),
      end_at: toLocalInput(ev.end_at),
    });
  };

  const handleFormImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFormImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await api.post("/upload/upcoming-image", fd, { timeout: UPLOAD_IMAGE_TIMEOUT_MS });
      const url = r.data?.image_url;
      if (url) setForm((s) => ({ ...s, image_url: url }));
      else window.alert("Upload finished but no image URL was returned.");
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || "Image upload failed.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setUploadingFormImage(false);
      e.target.value = "";
    }
  };

  const handleEditImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingEditImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await api.post("/upload/upcoming-image", fd, { timeout: UPLOAD_IMAGE_TIMEOUT_MS });
      const url = r.data?.image_url;
      if (url) setEditing((s) => (s ? { ...s, image_url: url } : s));
      else window.alert("Upload finished but no image URL was returned.");
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || "Image upload failed.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setUploadingEditImage(false);
      e.target.value = "";
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!String(editing.title || "").trim()) {
      window.alert("Title is required.");
      return;
    }
    const showRaw = editShowRef.current?.value ?? editing.show_from_at;
    const eventRaw = editEventRef.current?.value ?? editing.event_at;
    const endRaw = editEndRef.current?.value ?? editing.end_at;
    const showIso = scheduleFieldToApi(showRaw);
    const eventIso = scheduleFieldToApi(eventRaw);
    const endIso = scheduleFieldToApi(endRaw);
    if (!assertScheduleField("Show in list from", showRaw, showIso)) return;
    if (!assertScheduleField("Event date & time", eventRaw, eventIso)) return;
    if (!assertScheduleField("Hide from list after", endRaw, endIso)) return;

    const ordered = mergeBusinessUnitPick(editModalRef.current, editBusinessUnitsRef.current);
    if (ordered.length === 0) {
      window.alert("Select at least one facility.");
      return;
    }

    const titleTrim = String(editing.title).trim();
    const detailTrim = String(editing.detail || "").trim() || null;
    const imgTrim = editing.image_url?.trim() || null;

    setEditingSaving(true);
    try {
      await api.put(`/upcoming/${editing.id}`, {
        business_units: ordered,
        business_unit: ordered[0],
        title: titleTrim,
        detail: detailTrim,
        show_from_at: showIso,
        event_at: eventIso,
        end_at: endIso,
        published: editing.published,
        image_url: imgTrim,
      });

      setEditing(null);
      await load();
      broadcastUpdate();
    } catch (err) {
      const st = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      window.alert(st ? `Edit failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setEditingSaving(false);
    }
  };

  return (
    <section className={className}>
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 max-xl:text-base">
        Upcoming events
      </h2>
      <form
        ref={addFormRef}
        className="mb-6 space-y-5 text-sm max-xl:space-y-4 max-xl:text-xs"
        onSubmit={onSubmitForm}
      >
        <div className={formPanelClass}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 max-xl:text-[0.7rem]">
              Sites
            </span>
            <button
              type="button"
              className="text-xs font-medium text-brand-blue hover:text-brand-blue-hover hover:underline dark:text-brand-green dark:hover:text-brand-green-hover"
              onClick={selectAllFacilitiesAdd}
            >
              Select all
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 max-xl:text-[0.65rem]">
            Choose where this event appears on member facility pages.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2.5">
            {FACILITIES.map((f) => (
              <label
                key={f}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent py-0.5 pr-1 font-medium text-slate-800 hover:border-slate-200/80 dark:text-slate-200 dark:hover:border-slate-600"
              >
                <input
                  type="checkbox"
                  name="business_units"
                  value={f}
                  className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-2 focus:ring-brand-blue/30 dark:border-slate-500 dark:focus:ring-brand-green/30"
                  checked={form.business_units.includes(f)}
                  onChange={() => toggleAddFacility(f)}
                />
                <span>{f}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label htmlFor="agc-upcoming-title" className={fieldLabelClass}>
              Title
            </label>
            <input
              id="agc-upcoming-title"
              className={fieldInputClass}
              placeholder="e.g. Safety town hall"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-500 max-sm:mt-1 max-sm:w-full max-xl:text-xs">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-2 focus:ring-brand-blue/30 dark:border-slate-500"
              checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
            />
            <span className="leading-snug">Published on facility pages</span>
          </label>
        </div>
        <div>
          <label htmlFor="agc-upcoming-detail" className={fieldLabelClass}>
            Details
          </label>
          <input
            id="agc-upcoming-detail"
            className={fieldInputClass}
            placeholder="Location, link, or short notes"
            value={form.detail}
            onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
          />
        </div>

        <div className={formPanelClass}>
          <div className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100 max-xl:text-xs">
            Event image <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 max-xl:text-[0.65rem]">
            JPEG, PNG, GIF, or WebP · max ~8&nbsp;MB · shown on Upcoming cards
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative h-36 w-full overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 dark:border-slate-600 dark:bg-slate-800 sm:h-32 sm:w-48 sm:shrink-0">
              {form.image_url ? (
                <img
                  src={resolvePublicMediaUrl(form.image_url)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  No image selected
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                ref={formImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                disabled={uploadingFormImage || saving}
                onChange={handleFormImageChange}
                className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-blue-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-blue hover:file:bg-brand-surface dark:file:bg-white/10 dark:file:text-brand-green max-xl:file:px-2 max-xl:file:py-1.5 max-xl:file:text-xs"
              />
              {uploadingFormImage ? (
                <p className="font-medium text-brand-blue dark:text-brand-green">Uploading…</p>
              ) : null}
              {form.image_url ? (
                <button
                  type="button"
                  className="btn-outline self-start"
                  disabled={saving || uploadingFormImage}
                  onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                >
                  Remove image
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className={formPanelClass}>
          <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100 max-xl:mb-2 max-xl:text-xs">
            Schedule <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="agc_show_from" className={fieldLabelClass}>
                Show in list from
              </label>
              <input
                id="agc_show_from"
                name="agc_show_from"
                className={fieldInputClass}
                type="datetime-local"
                value={form.show_from_at}
                onChange={(e) => setForm((f) => ({ ...f, show_from_at: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="agc_event" className={fieldLabelClass}>
                Event date &amp; time
              </label>
              <input
                id="agc_event"
                name="agc_event"
                className={fieldInputClass}
                type="datetime-local"
                value={form.event_at}
                onChange={(e) => setForm((f) => ({ ...f, event_at: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="agc_end" className={fieldLabelClass}>
                Hide from list after
              </label>
              <input
                id="agc_end"
                name="agc_end"
                className={fieldInputClass}
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="btn-primary max-xl:!text-xs">
            {saving ? "Saving…" : form.published ? "Publish event" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={saving}
            className="btn-outline max-xl:!text-xs"
            onClick={() => {
              const schedule = readScheduleFromFormEl(addFormRef.current);
              void addUpcomingEvent(false, schedule);
            }}
          >
            Save as draft
          </button>
        </div>
      </form>
      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 max-xl:text-xs dark:text-slate-400">No events yet. Add one above.</p>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/50 p-3 text-sm shadow-sm max-xl:text-xs dark:border-slate-700 dark:bg-slate-900/30"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-200 ring-1 ring-slate-300/60 dark:bg-slate-700 dark:ring-slate-600">
                  {ev.image_url ? (
                    <img
                      src={resolvePublicMediaUrl(ev.image_url)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-1 text-center text-[10px] font-medium leading-tight text-slate-500 dark:text-slate-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                <span className="mr-2 inline-flex flex-wrap gap-1">
                  {(Array.isArray(ev.business_units) && ev.business_units.length > 0
                    ? ev.business_units
                    : [ev.business_unit].filter(Boolean)
                  ).map((u) => (
                    <span
                      key={String(u)}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-700"
                    >
                      {u}
                    </span>
                  ))}
                </span>
                {ev.published === 0 || ev.published === false ? (
                  <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
                    Draft
                  </span>
                ) : (
                  <span className="mr-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                    Published
                  </span>
                )}
                <span className="font-medium">{ev.title}</span>
                {ev.detail ? (
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{ev.detail}</div>
                ) : null}
                {(ev.show_from_at || ev.event_at || ev.start_at || ev.end_at) && (
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {ev.show_from_at ? (
                      <span className="block">Show in list from: {fmtDate(ev.show_from_at)}</span>
                    ) : (
                      <span className="block">Show in list: as soon as published</span>
                    )}
                    {(ev.event_at || ev.start_at) ? (
                      <span className="block">
                        Event: {fmtDate(ev.event_at || ev.start_at)}
                      </span>
                    ) : (
                      <span className="block">Event time: not set</span>
                    )}
                    {ev.end_at ? <span className="block">Hide after: {fmtDate(ev.end_at)}</span> : null}
                  </div>
                )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="btn-outline shrink-0" onClick={() => openEdit(ev)}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={removingId === ev.id}
                  className="btn-danger shrink-0"
                  onClick={() => onRemove(ev.id)}
                >
                  {removingId === ev.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-4">
          <form
            ref={editModalRef}
            key={editing.id}
            className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Edit upcoming event</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">ID #{editing.id}</p>
                <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-snug text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                  <p>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Event date &amp; time: </span>
                    {fmtDate(editing.event_at || editing.start_at) || (
                      <span className="text-slate-500 dark:text-slate-400">Not set</span>
                    )}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Show in list from: </span>
                    {fmtDate(editing.show_from_at) || (
                      <span className="text-slate-500 dark:text-slate-400">When published</span>
                    )}
                  </p>
                  {editing.end_at ? (
                    <p>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">Hide after: </span>
                      {fmtDate(editing.end_at)}
                    </p>
                  ) : null}
                </div>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary shrink-0 text-sm">
                Close
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-600 dark:bg-slate-800/40">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Sites (select one or more)
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-blue underline decoration-brand-blue/40 underline-offset-2 hover:decoration-brand-blue dark:text-brand-green dark:decoration-brand-green/40"
                    onClick={selectAllFacilitiesEdit}
                  >
                    Select all
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {FACILITIES.map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        name="business_units"
                        value={f}
                        className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue dark:border-slate-500"
                        checked={(editing.business_units ?? []).includes(f)}
                        onChange={() => toggleEditFacility(f)}
                      />
                      <span>{f}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Title
                </div>
                <input
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  value={editing.title || ""}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, title: e.target.value } : null))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Details
                </div>
                <input
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  value={editing.detail || ""}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, detail: e.target.value } : null))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Event image (optional)
                </div>
                <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-600 dark:bg-slate-800/60 sm:flex-row sm:items-start">
                  <div className="relative h-28 w-full overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700 sm:h-24 sm:w-36 sm:shrink-0">
                    {editing.image_url ? (
                      <img
                        src={resolvePublicMediaUrl(editing.image_url)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-sm text-slate-500 dark:text-slate-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <input
                      ref={editImageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                      disabled={editingSaving || uploadingEditImage}
                      onChange={handleEditImageChange}
                      className="w-full text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-brand-blue-soft file:px-3 file:py-2 file:text-sm file:font-semibold dark:file:bg-white/10"
                    />
                    {uploadingEditImage ? (
                      <p className="text-sm font-medium text-brand-blue dark:text-brand-green">Uploading…</p>
                    ) : null}
                    {editing.image_url ? (
                      <button
                        type="button"
                        className="btn-outline self-start"
                        disabled={editingSaving || uploadingEditImage}
                        onClick={() =>
                          setEditing((prev) => (prev ? { ...prev, image_url: "" } : null))
                        }
                      >
                        Remove image
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Show in list from (optional)
                </div>
                <input
                  ref={editShowRef}
                  className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                  type="datetime-local"
                  value={editing.show_from_at || ""}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, show_from_at: e.target.value } : null))
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Event date &amp; time (optional)
                </div>
                <input
                  ref={editEventRef}
                  className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                  type="datetime-local"
                  value={editing.event_at || ""}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, event_at: e.target.value } : null))
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Hide from list after (optional)
                </div>
                <input
                  ref={editEndRef}
                  className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                  type="datetime-local"
                  value={editing.end_at || ""}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, end_at: e.target.value } : null))
                  }
                />
              </div>
            </div>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded border border-slate-200 p-2.5 dark:border-slate-600">
              <input
                type="checkbox"
                checked={Boolean(editing.published)}
                onChange={(e) =>
                  setEditing((prev) => (prev ? { ...prev, published: e.target.checked } : null))
                }
              />
              <span className="text-sm font-medium">Published (visible on facility Upcoming)</span>
            </label>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={editingSaving}>
                {editingSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
