import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import NpdScorecardForm, { NPD_EMPTY_SCORECARD_FORM } from "../components/npd/NpdScorecardForm";

export default function NpdNewRequestPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(NPD_EMPTY_SCORECARD_FORM);
  const [sltOptions, setSltOptions] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get("/npd/slt-users")
      .then(({ data }) => setSltOptions(Array.isArray(data) ? data : []))
      .catch(() => setSltOptions([]));
  }, []);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim() || !form.product_name.trim()) {
      setError("Customer and Product / SKU are required.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/npd/requests", form);
      // Selecting SLT approver(s) sends it for review right away, as part
      // of the same "Create request" click — no separate submit step. If
      // this part fails (e.g. the scorecard turned out incomplete), the
      // request itself was still created fine — just land on its detail
      // page, where the SLT Review panel will show it hasn't been sent yet
      // and editing it lets them pick approvers again once it's complete.
      let sltError = "";
      if (form.slt_approver_ids.length > 0) {
        try {
          await api.post(`/npd/requests/${data.id}/submit-for-review`, {
            approver_user_ids: form.slt_approver_ids.map(Number),
          });
        } catch (reviewErr) {
          // Request itself was still created fine — land on its detail page
          // either way, but carry the specific reason it wasn't sent to SLT
          // (e.g. an incomplete scorecard) so it's visible there instead of
          // silently disappearing.
          sltError = friendlyErrorMessage(reviewErr, "Request created, but could not send it for SLT review.");
        }
      }
      window.dispatchEvent(new Event("agc-npd-changed"));
      navigate(`/npd/requests/${data.id}`, sltError ? { state: { sltError } } : undefined);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not create request."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <PageHeader title="New Product Request" subtitle="Gate 1 — score a potential launch and get an automatic priority." />

      <form onSubmit={submit} className="space-y-4">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <NpdScorecardForm form={form} onChange={update} submitting={submitting} sltOptions={sltOptions} />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create request"}
        </button>
      </form>
    </div>
  );
}
