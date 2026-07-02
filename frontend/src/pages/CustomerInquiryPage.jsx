import { useState } from "react";
import api from "../services/api";

const INQUIRY_TYPES = [
  { value: "general", label: "General Inquiry" },
  { value: "product_quality", label: "Product Quality Concern" },
  { value: "food_safety", label: "Food Safety Issue" },
  { value: "order_shipment", label: "Order / Shipment Issue" },
  { value: "packaging_labelling", label: "Packaging or Labelling Concern" },
  { value: "other", label: "Other" },
];

const PRODUCTS = [
  "Whole Chicken",
  "Chicken Breasts",
  "Chicken Thighs",
  "Chicken Wings",
  "Chicken Drumsticks",
  "Ground Chicken",
  "Chicken Sausage",
  "Marinated / Seasoned Products",
  "Other / Not Applicable",
];

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default function CustomerInquiryPage() {
  const [form, setForm] = useState({
    customer_name: "",
    customer_company: "",
    customer_email: "",
    customer_phone: "",
    inquiry_type: "general",
    product: "",
    subject: "",
    message: "",
    incident_date: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(null); // { id }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim()) return setError("Please enter your name.");
    if (!form.customer_email.trim() || !/\S+@\S+\.\S+/.test(form.customer_email))
      return setError("Please enter a valid email address.");
    if (!form.subject.trim()) return setError("Please provide a subject.");
    if (!form.message.trim()) return setError("Please describe your inquiry.");

    setSubmitting(true);
    try {
      const res = await api.post("/customer-inquiries", form);
      setSubmitted({ id: res.data.id });
    } catch (err) {
      setError(err?.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f4f7fb]">
        <Header />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
            {/* Checkmark */}
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">Inquiry Submitted</h2>
            <p className="mb-1 text-sm text-slate-500">
              Thank you. Your inquiry has been received and will be reviewed by our FSQA team.
            </p>
            <p className="mb-6 text-sm text-slate-400">
              Reference number: <span className="font-semibold text-slate-700">#{submitted.id}</span>
            </p>
            <button
              onClick={() => {
                setSubmitted(null);
                setForm({
                  customer_name: "", customer_company: "", customer_email: "",
                  customer_phone: "", inquiry_type: "general", product: "",
                  subject: "", message: "", incident_date: "",
                });
              }}
              className="rounded-full border-2 border-[#0B3EAF] bg-[#0B3EAF] px-6 py-2 text-sm font-bold text-white transition hover:bg-[#082d82]"
            >
              Submit Another Inquiry
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fb]">
      <Header />

      <main className="flex-1 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {/* Page intro */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Customer Inquiry Form
            </h1>
            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              Have a question, concern, or feedback about our products? We're here to help.
              Fill out the form below and our team will respond promptly.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {/* Section: Contact Information */}
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Contact Information
              </h2>
            </div>
            <div className="grid gap-5 p-6 sm:grid-cols-2">
              <Field label="Full Name" required>
                <input
                  type="text"
                  value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                />
              </Field>
              <Field label="Company / Organization">
                <input
                  type="text"
                  value={form.customer_company}
                  onChange={(e) => set("customer_company", e.target.value)}
                  placeholder="Acme Foods Ltd."
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                />
              </Field>
              <Field label="Email Address" required>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => set("customer_email", e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                />
              </Field>
              <Field label="Phone Number">
                <input
                  type="tel"
                  value={form.customer_phone}
                  onChange={(e) => set("customer_phone", e.target.value)}
                  placeholder="+1 (416) 555-0100"
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                />
              </Field>
            </div>

            {/* Section: Inquiry Details */}
            <div className="border-b border-t border-slate-100 bg-slate-50 px-6 py-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Inquiry Details
              </h2>
            </div>
            <div className="grid gap-5 p-6 sm:grid-cols-2">
              <Field label="Inquiry Type" required>
                <select
                  value={form.inquiry_type}
                  onChange={(e) => set("inquiry_type", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                >
                  {INQUIRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Product (if applicable)">
                <select
                  value={form.product}
                  onChange={(e) => set("product", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                >
                  <option value="">— Select a product —</option>
                  {PRODUCTS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date of Incident" hint="Leave blank if not applicable">
                <input
                  type="date"
                  value={form.incident_date}
                  onChange={(e) => set("incident_date", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Subject" required>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => set("subject", e.target.value)}
                    placeholder="Brief description of your inquiry"
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Message" required hint="Please include as much detail as possible — lot numbers, purchase dates, store locations, etc.">
                  <textarea
                    rows={5}
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder="Describe your inquiry in detail…"
                    className="w-full resize-y rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/10"
                  />
                </Field>
              </div>
            </div>

            {/* Error + Submit */}
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-5">
              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <p className="text-xs text-slate-400">
                  Your information will be kept confidential and used only to process your inquiry.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[#0B3EAF] bg-[#0B3EAF] px-8 py-2.5 text-sm font-bold text-white transition hover:bg-[#082d82] disabled:opacity-60 sm:w-auto"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Submitting…
                    </>
                  ) : (
                    "Submit Inquiry"
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
        <img src="/amir-group-logo.png" alt="Amir Group of Companies" className="h-10 w-auto" />
        <div className="h-7 w-px bg-slate-200" />
        <div>
          <div className="text-sm font-bold text-slate-900">Customer Inquiries</div>
          <div className="text-xs text-slate-400">Chicken Processing Division</div>
        </div>
        <div className="ml-auto hidden items-center gap-1.5 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            FSQA Monitored
          </span>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-400">
      © {new Date().getFullYear()} Amir Group of Companies · All rights reserved
    </footer>
  );
}
