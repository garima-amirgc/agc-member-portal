import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

const EMPTY_FORM = {
  customer_name: "",
  customer_number: "",
  customer_contact: "",
  product_name: "",
  product_description: "",
  request_type: "new_product",
  plant: "",
  requested_launch_date: "",
  estimated_volume: "",
  packaging_requirement: "",
  general_comments: "",
};

export default function NpdNewRequestPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim() || !form.product_name.trim()) {
      setError("Customer name and product name are required.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/npd/requests", form);
      window.dispatchEvent(new Event("agc-npd-changed"));
      navigate(`/npd/requests/${data.id}`);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not create request."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <PageHeader title="New Product Request" subtitle="Step 1 of 13 — kicks off the workflow and routes to Management Approval." />

      <section className="card p-4 sm:p-6">
        {error ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className={FIELD} placeholder="Customer name *" value={form.customer_name} onChange={update("customer_name")} required />
          <input className={FIELD} placeholder="Customer number (optional)" value={form.customer_number} onChange={update("customer_number")} />
          <input className={FIELD} placeholder="Customer contact (optional)" value={form.customer_contact} onChange={update("customer_contact")} />
          <select className={FIELD} value={form.request_type} onChange={update("request_type")}>
            <option value="new_product">New product</option>
            <option value="existing_product_modification">Existing product modification</option>
          </select>
          <input className={FIELD} placeholder="Product name *" value={form.product_name} onChange={update("product_name")} required />
          <input className={FIELD} placeholder="Plant (optional)" value={form.plant} onChange={update("plant")} />
          <input type="date" className={FIELD} placeholder="Requested launch date" value={form.requested_launch_date} onChange={update("requested_launch_date")} />
          <input className={FIELD} placeholder="Estimated volume (optional)" value={form.estimated_volume} onChange={update("estimated_volume")} />
          <input className={`${FIELD} sm:col-span-2`} placeholder="Packaging requirement (optional)" value={form.packaging_requirement} onChange={update("packaging_requirement")} />
          <textarea className={`${FIELD} sm:col-span-2`} rows={3} placeholder="Product description (optional)" value={form.product_description} onChange={update("product_description")} />
          <textarea className={`${FIELD} sm:col-span-2`} rows={3} placeholder="General comments (optional)" value={form.general_comments} onChange={update("general_comments")} />

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:col-span-2"
          >
            {submitting ? "Creating…" : "Create request & send to Management Approval"}
          </button>
        </form>
      </section>
    </div>
  );
}
