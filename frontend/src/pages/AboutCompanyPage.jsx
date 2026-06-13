import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { companySectionByRouteParam } from "../constants/companyContentConfig";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function DocumentCard({ item }) {
  const fileUrl = item.file_url ? resolvePublicMediaUrl(item.file_url) : "";
  return (
    <div className="card flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <h3 className="text-base font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{item.title}</h3>
        {item.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {item.description}
          </p>
        ) : null}
        {item.created_at ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Updated {formatDate(item.updated_at || item.created_at)}</p>
        ) : null}
      </div>
      {fileUrl ? (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center rounded-lg border border-[#0B3EAF]/20 bg-[#eef3ff] px-4 py-2 text-sm font-semibold text-[#0B3EAF] transition hover:bg-[#dfe8ff] dark:border-[#A7D344]/25 dark:bg-[#0B3EAF]/15 dark:text-[#A7D344] dark:hover:bg-[#0B3EAF]/25"
        >
          Download / open
        </a>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Document coming soon.</p>
      )}
    </div>
  );
}

function LinkCard({ item }) {
  const href = String(item.link_url || "").trim();
  const inner = (
    <>
      <h3 className="text-base font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{item.title}</h3>
      {item.description ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
      ) : null}
    </>
  );

  if (!href) {
    return (
      <div className="card p-4 sm:p-5">
        {inner}
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Link coming soon.</p>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="card block p-4 transition hover:border-[#0B3EAF]/30 hover:shadow-md dark:hover:border-[#A7D344]/30 sm:p-5"
    >
      {inner}
      <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">{href}</p>
    </a>
  );
}

function AboutCompanyAboutPage() {
  const [intro, setIntro] = useState("");
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get("/company-content/about-page")
      .then(({ data }) => {
        setIntro(String(data?.intro || ""));
        setForms(Array.isArray(data?.forms) ? data.forms : []);
      })
      .catch((err) => setError(friendlyErrorMessage(err, "Could not load about page.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={PAGE_SHELL}>
      <PageHeader title="About the company" subtitle="Learn about Amir Group of Companies and access additional forms." />
      {error ? <p className="mb-4 text-sm text-[#E02B20]">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="card p-4 sm:p-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {intro || "Company information will appear here soon."}
            </p>
          </div>
          {forms.length > 0 ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Forms</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {forms.map((item) => (
                  <DocumentCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AboutCompanySectionPage({ meta }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!meta) return undefined;
    setLoading(true);
    api
      .get(`/company-content/section/${meta.key}`)
      .then(({ data }) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(friendlyErrorMessage(err, "Could not load content.")))
      .finally(() => setLoading(false));
  }, [meta]);

  if (!meta) {
    return (
      <div className={PAGE_SHELL}>
        <PageHeader title="About Company" subtitle="Section not found." />
        <Link to="/about-company/policy" className="text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">
          Back to Company policy
        </Link>
      </div>
    );
  }

  const isLinks = meta.key === "links";

  return (
    <div className={PAGE_SHELL}>
      <PageHeader title={meta.pageTitle} subtitle={meta.pageIntro} />
      {error ? <p className="mb-4 text-sm text-[#E02B20]">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>
      ) : items.length === 0 ? (
        <div className="card p-4 sm:p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">No items have been published yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (isLinks ? <LinkCard key={item.id} item={item} /> : <DocumentCard key={item.id} item={item} />))}
        </div>
      )}
    </div>
  );
}

export default function AboutCompanyPage() {
  const { section: sectionParam } = useParams();
  const meta = companySectionByRouteParam(sectionParam);

  if (meta?.isAboutPage) {
    return <AboutCompanyAboutPage />;
  }

  return <AboutCompanySectionPage meta={meta} />;
}
