import { useEffect, useState } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api, { postNpdAttachment } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import NpdScorecardForm, { npdRequestToForm } from "../components/npd/NpdScorecardForm";
import { npdPriorityBadgeClass } from "../utils/npdScoring";
import { useAuth } from "../context/AuthContext";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "comments", label: "Comments" },
  { key: "activity", label: "Activity History" },
];

export default function NpdRequestDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Picks up the one-time "could not send it for SLT review" reason carried
  // over from NpdNewRequestPage when creating + submitting for review in one
  // step only partly succeeds (request created, but the review submission
  // itself failed — e.g. an incomplete scorecard). Kept separate from the
  // load/delete `error` above (which load() resets on every fetch) so it
  // isn't wiped out the moment this page's data finishes loading.
  const [sltError, setSltError] = useState(() => location.state?.sltError || "");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (location.state?.sltError) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/npd/requests/${id}`);
      setRequest(data);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load this request."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const deleteRequest = async () => {
    if (!window.confirm(`Delete ${request.request_number}? This cannot be undone from here.`)) return;
    setError("");
    try {
      await api.delete(`/npd/requests/${id}`);
      window.dispatchEvent(new Event("agc-npd-changed"));
      window.location.href = "/npd";
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not delete this request."));
    }
  };

  if (loading) return <div className={PAGE_SHELL}><p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p></div>;
  if (error && !request) {
    return (
      <div className={PAGE_SHELL}>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      </div>
    );
  }
  if (!request) return null;

  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={`${request.request_number} — ${request.product_name}`}
          subtitle={request.customer_name}
        />
        <div className="flex items-center gap-2">
          {request.priority_tier ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${npdPriorityBadgeClass(request.priority_tier)}`}
              title={`Gate 1 Weighted Score: ${request.weighted_score}`}
            >
              {request.priority_tier} ({request.weighted_score})
            </span>
          ) : null}
          <button
            type="button"
            onClick={deleteRequest}
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:text-red-300"
          >
            Delete
          </button>
          <Link to="/npd" className="text-sm text-[#0B3EAF] underline dark:text-[#A7D344]">
            ← All requests
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {sltError ? (
        <div className="flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <span>
            Request created, but it wasn't sent for SLT review: {sltError} Click Edit below, re-pick the SLT approver(s), and save to try
            again.
          </span>
          <button
            type="button"
            onClick={() => setSltError("")}
            className="shrink-0 font-semibold text-amber-900 underline dark:text-amber-200"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-t px-4 py-2 text-sm font-semibold ${
              tab === t.key
                ? "border-b-2 border-[#0B3EAF] text-[#0B3EAF] dark:border-[#A7D344] dark:text-[#A7D344]"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab request={request} onUpdated={setRequest} /> : null}
      {tab === "documents" ? <DocumentsTab request={request} onUpdated={setRequest} /> : null}
      {tab === "comments" ? <CommentsTab request={request} onUpdated={setRequest} /> : null}
      {tab === "activity" ? <ActivityTab request={request} /> : null}
    </div>
  );
}

// Overview tab shows the Gate 1 scorecard. "Edit" swaps in the same form
// NpdNewRequestPage uses (live weighted-score preview included) and saves
// with PUT /npd/requests/:id, which recomputes the Weighted Score/Priority
// server-side exactly as creation does.
function OverviewTab({ request, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => npdRequestToForm(request));
  const [sltOptions, setSltOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    setForm(npdRequestToForm(request));
    setError("");
    setEditing(true);
    api
      .get("/npd/slt-users")
      .then(({ data }) => setSltOptions(Array.isArray(data) ? data : []))
      .catch(() => setSltOptions([]));
  };

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Previously-pending approver(s) this request was already sent to, before
  // whatever the form's SLT dropdown currently has selected.
  const previouslyPendingIds = (request.approvers || [])
    .filter((a) => !a.decided_at)
    .map((a) => String(a.user_id));

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim() || !form.product_name.trim()) {
      setError("Customer and Product / SKU are required.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/npd/requests/${request.id}`, form);
      let finalData = data;
      // Only re-submit when the SLT selection actually changed from what
      // was already pending — otherwise saving unrelated fields would spam
      // a fresh "sent for review" every time.
      const selectionChanged =
        form.slt_approver_ids.length !== previouslyPendingIds.length ||
        form.slt_approver_ids.some((id) => !previouslyPendingIds.includes(id));
      if (form.slt_approver_ids.length > 0 && selectionChanged) {
        try {
          const resubmitRes = await api.post(`/npd/requests/${request.id}/submit-for-review`, {
            approver_user_ids: form.slt_approver_ids.map(Number),
          });
          finalData = resubmitRes.data;
        } catch (reviewErr) {
          setError(friendlyErrorMessage(reviewErr, "Saved, but could not send this to SLT."));
        }
      }
      onUpdated(finalData);
      window.dispatchEvent(new Event("agc-npd-changed"));
      setEditing(false);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save changes."));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-4">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}
        <NpdScorecardForm form={form} onChange={update} submitting={saving} sltOptions={sltOptions} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const rows = [
    ["Channel", request.channel || "—"],
    ["Plant", request.plant || "—"],
    ["Start date", request.start_date || "—"],
    ["Target launch date", request.requested_launch_date || "—"],
    ["Created by", `${request.created_by_name || "—"} on ${new Date(request.created_at).toLocaleDateString()}`],
  ];

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <section className="card p-4 sm:p-6">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="text-sm text-slate-800 dark:text-slate-100">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <ScorecardSummary request={request} onEdit={startEdit} />
      <SltReviewPanel request={request} onUpdated={onUpdated} onEdit={startEdit} />
    </div>
  );
}

// SLT review — the actual submit/resubmit control lives in the scorecard
// form itself (pick SLT approver(s) from the dropdown there and save); this
// panel just shows where things stand and, for whoever it's pending on
// right now, the Approve/Hold/Reject buttons. Any one of the people it was
// sent to deciding settles it (first response wins). Once Approved this
// just sits as "awaiting Gate 2" until that gate is built.
function SltReviewPanel({ request, onUpdated, onEdit }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const approvers = request.approvers || [];
  const myPendingAssignment = approvers.find((a) => !a.decided_at && Number(a.user_id) === Number(user?.id));

  const decide = async (decision) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/npd/requests/${request.id}/decision`, { decision });
      onUpdated(data);
      window.dispatchEvent(new Event("agc-npd-changed"));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not record that decision."));
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = {
    approved: (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        Gate 1 Approved — awaiting Gate 2
      </span>
    ),
    rejected: (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
        Rejected
      </span>
    ),
    hold: (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Hold — Need More Details
      </span>
    ),
    pending_review: (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
        Pending SLT review
      </span>
    ),
  }[request.review_status] || (
    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      Not submitted for SLT review
    </span>
  );

  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#000000] dark:text-white">SLT Review</h2>
        {statusBadge}
      </div>

      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {approvers.length > 0 ? (
        <ul className="mb-3 space-y-1 text-sm">
          {approvers.map((a) => (
            <li
              key={a.user_id}
              className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 dark:border-slate-800"
            >
              <span>
                {a.name} <span className="text-slate-500 dark:text-slate-400">({a.email})</span>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {a.decided_at ? "Responded" : "Awaiting response"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {myPendingAssignment ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("approved")}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("hold")}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            Hold — Need More Info
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("rejected")}
            className="rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300"
          >
            Reject
          </button>
        </div>
      ) : null}

      <p className="text-sm text-slate-500 dark:text-slate-400">
        To {request.review_status ? "resubmit this to SLT" : "send this to SLT"}, click{" "}
        <button type="button" onClick={onEdit} className="font-semibold text-[#0B3EAF] underline dark:text-[#A7D344]">
          Edit
        </button>{" "}
        above, pick SLT approver(s) at the bottom of the form, and save.
      </p>
    </section>
  );
}

// Gate 1 launch scorecard — read-only summary, with an Edit button that
// switches the tab to the same form used to create a request.
function ScorecardSummary({ request, onEdit }) {
  const economics = [
    ["Annual Volume (kg)", request.annual_volume_kg],
    ["Annual Revenue ($)", request.annual_revenue],
    ["Annual GP$ ($)", request.annual_gp_dollars],
    ["GP%", request.gp_percent != null ? `${Math.round(request.gp_percent * 1000) / 10}%` : null],
  ];
  const qualitative = [
    ["Strategic Fit", request.strategic_fit_score],
    ["Customer / Market Value", request.customer_market_value_score],
    ["Complexity", request.complexity_score],
    ["Speed to Market", request.speed_to_market_score],
  ];
  const commercial = [
    ["CapEx Required ($)", request.capex_required],
    ["Customer Commitment", request.customer_commitment],
  ];

  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#000000] dark:text-white">Gate 1 — Launch Scorecard</h2>
        <div className="flex items-center gap-3">
          {request.weighted_score != null ? (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{request.weighted_score}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${npdPriorityBadgeClass(request.priority_tier)}`}>{request.priority_tier}</span>
            </div>
          ) : (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Not yet scored
            </span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="rounded border border-[#0B3EAF] px-3 py-1.5 text-xs font-semibold text-[#0B3EAF] hover:bg-[#0B3EAF]/5 dark:border-[#A7D344] dark:text-[#A7D344]"
          >
            Edit
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...economics, ...qualitative, ...commercial].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-sm text-slate-800 dark:text-slate-100">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {request.key_strategic_rationale ? (
        <div className="mt-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Key Strategic Rationale</dt>
          <dd className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{request.key_strategic_rationale}</dd>
        </div>
      ) : null}
      {request.key_risks_comments ? (
        <div className="mt-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Key Risks / Comments</dt>
          <dd className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{request.key_risks_comments}</dd>
        </div>
      ) : null}
    </section>
  );
}

function DocumentsTab({ request, onUpdated }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadData = await postNpdAttachment(formData);
      await api.post(`/npd/requests/${request.id}/attachments`, {
        file_name: uploadData.filename,
        original_name: uploadData.original_name,
        file_url: uploadData.file_url,
        file_type: file.type,
      });
      const { data: refreshed } = await api.get(`/npd/requests/${request.id}`);
      onUpdated(refreshed);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not upload that file."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="card p-4 sm:p-6">
      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <label className="mb-4 inline-block cursor-pointer rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
        {uploading ? "Uploading…" : "Upload document"}
        <input type="file" className="hidden" onChange={onFileChange} disabled={uploading} />
      </label>
      {request.attachments.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {request.attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
              <a href={a.file_url} target="_blank" rel="noreferrer" className="font-medium text-[#0B3EAF] hover:underline dark:text-[#A7D344]">
                {a.original_file_name}
              </a>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {a.uploaded_by_name} · {new Date(a.uploaded_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentsTab({ request, onUpdated }) {
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const post = async () => {
    if (!comment.trim()) return;
    setPosting(true);
    setError("");
    try {
      await api.post(`/npd/requests/${request.id}/comments`, { comment });
      setComment("");
      const { data } = await api.get(`/npd/requests/${request.id}`);
      onUpdated(data);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not post that comment."));
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="card p-4 sm:p-6">
      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <div className="mb-4 flex gap-2">
        <textarea
          className={`${FIELD} flex-1`}
          rows={2}
          placeholder="Add a comment for everyone with access to see…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <button
          type="button"
          onClick={post}
          disabled={posting || !comment.trim()}
          className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          Post
        </button>
      </div>
      {request.comments.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {request.comments.map((c) => (
            <li key={c.id} className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200">{c.created_by_name}</span>
                <span>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{c.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityTab({ request }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-3 text-lg font-semibold text-[#000000] dark:text-white">Full audit trail</h2>
      {request.activity.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No activity yet.</p>
      ) : (
        <ol className="space-y-2 border-l border-slate-200 pl-4 dark:border-slate-800">
          {request.activity.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
              <p className="text-sm text-slate-800 dark:text-slate-100">{a.description}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {a.user_name || "System"} · {new Date(a.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
