import { useCallback, useEffect, useState } from "react";
import api from "../services/api";

const STATUS_META = {
  new:                { label: "New",                color: "bg-blue-100 text-blue-700",    dot: "bg-blue-500"    },
  fsqa_review:        { label: "FSQA Review",        color: "bg-amber-100 text-amber-700",  dot: "bg-amber-500"   },
  management_review:  { label: "Mgmt Review",        color: "bg-purple-100 text-purple-700",dot: "bg-purple-500"  },
  closed:             { label: "Closed",              color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

const TYPE_LABELS = {
  general:              "General Inquiry",
  product_quality:      "Product Quality",
  food_safety:          "Food Safety",
  order_shipment:       "Order / Shipment",
  packaging_labelling:  "Packaging / Labelling",
  other:                "Other",
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-36 shrink-0 font-medium text-slate-500">{label}</span>
      <span className="text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function InquiryCard({ inquiry, onUpdated }) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const canFsqa = ["new", "fsqa_review"].includes(inquiry.status);
  const canManagement = inquiry.status === "management_review";
  const isClosed = inquiry.status === "closed";

  async function action(endpoint) {
    setErr("");
    if (!comment.trim()) {
      setErr("Please enter a comment before proceeding.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.patch(`/customer-inquiries/${inquiry.id}/${endpoint}`, {
        comment: comment.trim(),
        reviewer_name: reviewerName.trim() || undefined,
      });
      setComment("");
      setReviewerName("");
      onUpdated(data);
    } catch (e) {
      setErr(e?.response?.data?.message || "Action failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${isClosed ? "border-slate-200 opacity-80" : "border-slate-200 hover:border-slate-300"}`}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-4 p-5 text-left"
      >
        {/* Ref + status */}
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <span className="text-xs font-bold text-slate-400">#{inquiry.id}</span>
          <StatusBadge status={inquiry.status} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900 truncate">{inquiry.subject}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
              {TYPE_LABELS[inquiry.inquiry_type] || inquiry.inquiry_type}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
            <span className="font-medium text-slate-600">{inquiry.customer_name}</span>
            {inquiry.customer_company && <span>· {inquiry.customer_company}</span>}
            <span>· {inquiry.customer_email}</span>
            <span className="ml-auto">{fmtDate(inquiry.created_at)}</span>
          </div>
        </div>

        {/* Chevron */}
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5">
          {/* Customer details */}
          <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4">
            <InfoRow label="Name" value={inquiry.customer_name} />
            <InfoRow label="Company" value={inquiry.customer_company} />
            <InfoRow label="Email" value={inquiry.customer_email} />
            <InfoRow label="Phone" value={inquiry.customer_phone} />
            <InfoRow label="Product" value={inquiry.product} />
            <InfoRow label="Incident Date" value={inquiry.incident_date} />
            <InfoRow label="Submitted" value={fmtDate(inquiry.created_at)} />
          </div>

          {/* Message */}
          <div className="mt-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Message</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{inquiry.message}</p>
          </div>

          {/* FSQA review (if done) */}
          {inquiry.fsqa_comment && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-600">FSQA Review</p>
              <p className="text-sm text-slate-700">{inquiry.fsqa_comment}</p>
              <p className="mt-1 text-xs text-slate-400">
                By {inquiry.fsqa_reviewer || "FSQA"} · {fmtDate(inquiry.fsqa_reviewed_at)}
              </p>
            </div>
          )}

          {/* Management review (if done) */}
          {inquiry.management_comment && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-700">Management Decision</p>
              <p className="text-sm text-slate-700">{inquiry.management_comment}</p>
              <p className="mt-1 text-xs text-slate-400">
                By {inquiry.management_reviewer || "Management"} · {fmtDate(inquiry.management_reviewed_at)}
              </p>
            </div>
          )}

          {/* Action area */}
          {!isClosed && (canFsqa || canManagement) && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                {canFsqa ? "FSQA Action" : "Management Action"}
              </p>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Your name (optional)"
                className="mb-3 w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
              />
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={canFsqa
                  ? "Add your FSQA review comment, then forward to Management…"
                  : "Add your management decision or resolution notes, then close…"}
                className="w-full resize-y rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
              />
              {err && (
                <p className="mt-2 text-xs text-red-600">{err}</p>
              )}
              <div className="mt-3 flex justify-end gap-3">
                {canFsqa && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => action("fsqa-review")}
                    className="rounded-full border-2 border-[#0B3EAF] bg-[#0B3EAF] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#082d82] disabled:opacity-60"
                  >
                    {loading ? "Forwarding…" : "Forward to Management →"}
                  </button>
                )}
                {canManagement && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => action("management-close")}
                    className="rounded-full border-2 border-emerald-600 bg-emerald-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {loading ? "Closing…" : "Close Inquiry ✓"}
                  </button>
                )}
              </div>
            </div>
          )}

          {isClosed && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              This inquiry has been closed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ALL_STATUSES = ["all", "new", "fsqa_review", "management_review", "closed"];
const STATUS_FILTER_LABELS = {
  all:                "All",
  new:                "New",
  fsqa_review:        "FSQA Review",
  management_review:  "Mgmt Review",
  closed:             "Closed",
};

export default function CustomerReviewPage() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/customer-inquiries");
      setInquiries(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function handleUpdated(updated) {
    setInquiries((prev) => prev.map((i) => i.id === updated.id ? updated : i));
  }

  const filtered = inquiries.filter((i) => {
    if (filter !== "all" && i.status !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        String(i.id).includes(q) ||
        (i.customer_name || "").toLowerCase().includes(q) ||
        (i.customer_company || "").toLowerCase().includes(q) ||
        (i.customer_email || "").toLowerCase().includes(q) ||
        (i.subject || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {};
  for (const s of ALL_STATUSES) {
    counts[s] = s === "all" ? inquiries.length : inquiries.filter((i) => i.status === s).length;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fb]">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <img src="/amir-group-logo.png" alt="Amir Group" className="h-10 w-auto" />
          <div className="h-7 w-px bg-slate-200" />
          <div>
            <div className="text-sm font-bold text-slate-900">Customer Inquiry Review</div>
            <div className="text-xs text-slate-400">FSQA &amp; Management Dashboard</div>
          </div>
          <div className="ml-auto">
            <a
              href="/customers"
              className="rounded-full border-2 border-[#0B3EAF] px-4 py-1.5 text-xs font-bold text-[#0B3EAF] transition hover:bg-[#0B3EAF] hover:text-white"
            >
              + New Inquiry
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {/* Stats row */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["new", "fsqa_review", "management_review", "closed"].map((s) => {
              const m = STATUS_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 ${filter === s ? "border-[#0B3EAF] ring-2 ring-[#0B3EAF]/10" : "border-slate-200"}`}
                >
                  <div className={`mb-1 text-xs font-bold uppercase tracking-widest ${m.color.split(" ")[1]}`}>
                    {m.label}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{counts[s] || 0}</div>
                </button>
              );
            })}
          </div>

          {/* Search + filter */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="relative flex-1">
              <svg viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, subject, or ref #…"
                className="w-full rounded-full border border-slate-200 py-2 pl-9 pr-4 text-sm outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
              />
            </div>
            <div className="flex gap-1.5">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === s
                      ? "bg-[#0B3EAF] text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {STATUS_FILTER_LABELS[s]}
                  {counts[s] > 0 && (
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${filter === s ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {counts[s]}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={fetchAll}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              title="Refresh"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#0B3EAF]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
              {search ? "No inquiries match your search." : "No inquiries in this category."}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((i) => (
                <InquiryCard key={i.id} inquiry={i} onUpdated={handleUpdated} />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Amir Group of Companies · FSQA &amp; Management Portal
      </footer>
    </div>
  );
}
