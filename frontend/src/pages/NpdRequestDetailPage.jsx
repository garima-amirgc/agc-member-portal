import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api, { postNpdAttachment } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { useAuth } from "../context/AuthContext";
import { hasAdminGrant } from "../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import NpdStepper from "../components/npd/NpdStepper";
import NpdStepActionPanel from "../components/npd/NpdStepActionPanel";
import { NPD_REQUEST_STATUS_LABELS, npdRequestStatusBadgeClass } from "../constants/npd";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "workflow", label: "Workflow" },
  { key: "documents", label: "Documents" },
  { key: "comments", label: "Comments" },
  { key: "activity", label: "Activity History" },
];

export default function NpdRequestDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD);

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("workflow");
  // Which step's card the "Workflow" tab is showing on the right. null =
  // follow the workflow's actual current step. Clicking any step in the
  // left-hand list (including a skipped one) pins the view to that step,
  // so a skipped step's form only ever shows up when someone deliberately
  // selects it — never tacked onto whatever step is currently active.
  const [selectedStep, setSelectedStep] = useState(null);

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
    setSelectedStep(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cancelRequest = async () => {
    if (!window.confirm("Cancel this NPD request? This stops the workflow.")) return;
    try {
      const { data } = await api.post(`/npd/requests/${id}/cancel`, {});
      setRequest(data);
      window.dispatchEvent(new Event("agc-npd-changed"));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not cancel this request."));
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
          subtitle={`${request.customer_name}${request.customer_number ? ` (#${request.customer_number})` : ""}`}
        />
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${npdRequestStatusBadgeClass(request.status)}`}>
            {NPD_REQUEST_STATUS_LABELS[request.status] || request.status}
          </span>
          {isAdmin && !["completed", "cancelled"].includes(request.status) ? (
            <button
              type="button"
              onClick={cancelRequest}
              className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:text-red-300"
            >
              Cancel request
            </button>
          ) : null}
          <Link to="/npd" className="text-sm text-[#0B3EAF] underline dark:text-[#A7D344]">
            ← All requests
          </Link>
        </div>
      </div>

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

      {tab === "overview" ? <OverviewTab request={request} /> : null}
      {tab === "workflow" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="card p-4 sm:p-6 lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold text-[#000000] dark:text-white">All 13 steps</h2>
            <p className="mb-3 -mt-2 text-xs text-slate-500 dark:text-slate-400">Click any step to view or work on it.</p>
            <NpdStepper
              steps={request.steps}
              currentStep={request.current_step}
              selectedStep={selectedStep ?? request.current_step}
              onSelectStep={setSelectedStep}
            />
          </section>
          <section className="card p-4 sm:p-6 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[#000000] dark:text-white">
                {(selectedStep ?? request.current_step) === request.current_step ? "Current step action" : "Step details"}
              </h2>
              {selectedStep != null && selectedStep !== request.current_step ? (
                <button
                  type="button"
                  onClick={() => setSelectedStep(null)}
                  className="text-xs font-semibold text-[#0B3EAF] underline dark:text-[#A7D344]"
                >
                  Back to current step ({request.current_step})
                </button>
              ) : null}
            </div>
            <NpdStepActionPanel
              request={request}
              user={user}
              onUpdated={setRequest}
              viewStepNumber={selectedStep ?? request.current_step}
            />
          </section>
        </div>
      ) : null}
      {tab === "documents" ? <DocumentsTab request={request} onUpdated={setRequest} /> : null}
      {tab === "comments" ? <CommentsTab request={request} onUpdated={setRequest} /> : null}
      {tab === "activity" ? <ActivityTab request={request} /> : null}
    </div>
  );
}

function OverviewTab({ request }) {
  const rows = [
    ["Request type", request.request_type === "existing_product_modification" ? "Existing product modification" : "New product"],
    ["Plant", request.plant || "—"],
    ["Requested launch date", request.requested_launch_date || "—"],
    ["Estimated volume", request.estimated_volume || "—"],
    ["Packaging requirement", request.packaging_requirement || "—"],
    ["Customer contact", request.customer_contact || "—"],
    ["Created by", `${request.created_by_name || "—"} on ${new Date(request.created_at).toLocaleDateString()}`],
    ["Current step", `${request.current_step} of 13`],
  ];
  return (
    <section className="card p-4 sm:p-6">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-sm text-slate-800 dark:text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      {request.product_description ? (
        <div className="mt-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Product description</dt>
          <dd className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{request.product_description}</dd>
        </div>
      ) : null}
      {request.general_comments ? (
        <div className="mt-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">General comments</dt>
          <dd className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{request.general_comments}</dd>
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
