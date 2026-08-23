import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

const FIELD =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-[#0B3EAF] focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-[#A7D344] dark:focus:ring-[#A7D344]/20";

function IconFolder({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function IconFile({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m1-13H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V8l-5-5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
    </svg>
  );
}

function IconSearch({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconDownload({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />
    </svg>
  );
}

function IconUpload({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21V9m0 0l-4 4m4-4l4 4M5 5h14" />
    </svg>
  );
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export default function SharePointPage() {
  const [configured, setConfigured] = useState(true);
  const [checkingConfig, setCheckingConfig] = useState(true);

  const [siteQuery, setSiteQuery] = useState("");
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesSearched, setSitesSearched] = useState(false);

  const [selectedSite, setSelectedSite] = useState(null);
  const [drives, setDrives] = useState([]);
  const [drivesLoading, setDrivesLoading] = useState(false);

  const [selectedDrive, setSelectedDrive] = useState(null);
  const [path, setPath] = useState([]); // [{ id, name }] — id null means the library root
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [error, setError] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/sharepoint/status");
        setConfigured(Boolean(data?.configured));
      } catch {
        setConfigured(true); // don't block the page on a status-check failure — real errors surface on use
      } finally {
        setCheckingConfig(false);
      }
    })();
  }, []);

  const runSiteSearch = useCallback(async (e) => {
    e?.preventDefault?.();
    setSitesLoading(true);
    setError("");
    try {
      const { data } = await api.get("/sharepoint/sites", { params: { q: siteQuery } });
      setSites(Array.isArray(data) ? data : []);
      setSitesSearched(true);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not search SharePoint sites."));
    } finally {
      setSitesLoading(false);
    }
  }, [siteQuery]);

  const openSite = useCallback(async (site) => {
    setSelectedSite(site);
    setSelectedDrive(null);
    setDrives([]);
    setItems([]);
    setPath([]);
    setError("");
    setDrivesLoading(true);
    try {
      const { data } = await api.get(`/sharepoint/sites/${encodeURIComponent(site.id)}/drives`);
      setDrives(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not list document libraries for that site."));
    } finally {
      setDrivesLoading(false);
    }
  }, []);

  const loadFolder = useCallback(async (drive, folderPath) => {
    setItemsLoading(true);
    setError("");
    try {
      const target = folderPath[folderPath.length - 1];
      const { data } = await api.get("/sharepoint/browse", {
        params: { driveId: drive.id, itemId: target?.id || undefined },
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load that folder."));
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const openDrive = useCallback(
    async (drive) => {
      setSelectedDrive(drive);
      const rootPath = [{ id: null, name: drive.name }];
      setPath(rootPath);
      await loadFolder(drive, rootPath);
    },
    [loadFolder]
  );

  const openFolder = useCallback(
    async (item) => {
      const nextPath = [...path, { id: item.id, name: item.name }];
      setPath(nextPath);
      await loadFolder(selectedDrive, nextPath);
    },
    [path, selectedDrive, loadFolder]
  );

  const goToBreadcrumb = useCallback(
    async (index) => {
      const nextPath = path.slice(0, index + 1);
      setPath(nextPath);
      await loadFolder(selectedDrive, nextPath);
    },
    [path, selectedDrive, loadFolder]
  );

  const currentFolderId = path[path.length - 1]?.id || null;

  const downloadItem = useCallback(
    async (item) => {
      setError("");
      try {
        const res = await api.get("/sharepoint/download", {
          params: { driveId: selectedDrive.id, itemId: item.id },
          responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = item.name || "file";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        setError(friendlyErrorMessage(err, "Could not download that file."));
      }
    },
    [selectedDrive]
  );

  const handleFilePicked = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!file || !selectedDrive) return;
      setUploadBusy(true);
      setError("");
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("driveId", selectedDrive.id);
        if (currentFolderId) fd.append("parentItemId", currentFolderId);
        await api.post("/sharepoint/upload", fd);
        await loadFolder(selectedDrive, path);
      } catch (err) {
        setError(friendlyErrorMessage(err, "Could not upload that file to SharePoint."));
      } finally {
        setUploadBusy(false);
      }
    },
    [selectedDrive, currentFolderId, path, loadFolder]
  );

  const createFolder = useCallback(
    async (e) => {
      e.preventDefault();
      const name = newFolderName.trim();
      if (!name || !selectedDrive) return;
      setFolderBusy(true);
      setError("");
      try {
        await api.post("/sharepoint/folders", {
          driveId: selectedDrive.id,
          parentItemId: currentFolderId || undefined,
          name,
        });
        setNewFolderName("");
        setNewFolderOpen(false);
        await loadFolder(selectedDrive, path);
      } catch (err) {
        setError(friendlyErrorMessage(err, "Could not create that folder."));
      } finally {
        setFolderBusy(false);
      }
    },
    [newFolderName, selectedDrive, currentFolderId, path, loadFolder]
  );

  if (checkingConfig) {
    return (
      <div className={PAGE_SHELL}>
        <PageHeader title="SharePoint Files" subtitle="Browse, download, and upload company files from SharePoint." />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className={PAGE_SHELL}>
        <PageHeader title="SharePoint Files" subtitle="Browse, download, and upload company files from SharePoint." />
        <div className="card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          SharePoint isn't connected yet. An administrator needs to add the SharePoint credentials to the server
          settings before this page can be used.
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader title="SharePoint Files" subtitle="Browse, download, and upload company files from SharePoint." />

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {/* ── Step 1: pick a site ─────────────────────────────────────────── */}
      <div className="card p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#000000] dark:text-white">Site</h2>
          {selectedSite ? (
            <button
              type="button"
              onClick={() => {
                setSelectedSite(null);
                setDrives([]);
                setSelectedDrive(null);
                setItems([]);
                setPath([]);
              }}
              className="text-sm font-medium text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
            >
              Change site
            </button>
          ) : null}
        </div>

        {!selectedSite ? (
          <>
            <form onSubmit={runSiteSearch} className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${FIELD} w-full pl-9`}
                  placeholder="Search SharePoint sites by name…"
                  value={siteQuery}
                  onChange={(e) => setSiteQuery(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={sitesLoading}
                className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {sitesLoading ? "Searching…" : "Search"}
              </button>
            </form>

            {sitesSearched && !sitesLoading ? (
              sites.length ? (
                <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {sites.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => openSite(s)}
                        className="flex w-full items-center gap-3 rounded px-2 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/10 dark:text-[#A7D344]">
                          <IconFolder className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{s.name}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{s.webUrl}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm italic text-slate-500 dark:text-slate-400">
                  No sites found. Try a different search term.
                </p>
              )
            ) : null}
          </>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/10 dark:text-[#A7D344]">
              <IconFolder className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800 dark:text-slate-100">{selectedSite.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{selectedSite.webUrl}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: pick a document library ─────────────────────────────── */}
      {selectedSite ? (
        <div className="card p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#000000] dark:text-white">Document library</h2>
            {selectedDrive ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedDrive(null);
                  setItems([]);
                  setPath([]);
                }}
                className="text-sm font-medium text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
              >
                Change library
              </button>
            ) : null}
          </div>

          {drivesLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : !selectedDrive ? (
            drives.length ? (
              <ul className="flex flex-wrap gap-2">
                {drives.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => openDrive(d)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#A7D344] dark:hover:text-[#A7D344]"
                    >
                      {d.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">
                This site has no document libraries this app can see.
              </p>
            )
          ) : (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{selectedDrive.name}</p>
          )}
        </div>
      ) : null}

      {/* ── Step 3: browse & act on files ───────────────────────────────── */}
      {selectedDrive ? (
        <div className="card p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap items-center gap-1 text-sm">
              {path.map((p, i) => (
                <span key={`${p.id || "root"}-${i}`} className="flex items-center gap-1">
                  {i > 0 ? <span className="text-slate-400">/</span> : null}
                  <button
                    type="button"
                    onClick={() => goToBreadcrumb(i)}
                    className={
                      i === path.length - 1
                        ? "font-semibold text-slate-800 dark:text-slate-100"
                        : "text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
                    }
                  >
                    {p.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setNewFolderOpen((v) => !v)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                + New folder
              </button>
              <button
                type="button"
                disabled={uploadBusy}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded bg-[#0B3EAF] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                <IconUpload />
                {uploadBusy ? "Uploading…" : "Upload file"}
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePicked} />
            </div>
          </div>

          {newFolderOpen ? (
            <form onSubmit={createFolder} className="mb-4 flex flex-wrap gap-2">
              <input
                className={`${FIELD} flex-1 min-w-[200px]`}
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                disabled={folderBusy || !newFolderName.trim()}
                className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {folderBusy ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                Cancel
              </button>
            </form>
          ) : null}

          {itemsLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Modified</th>
                    <th className="py-2 pr-3 font-semibold">Modified by</th>
                    <th className="py-2 pr-3 font-semibold">Size</th>
                    <th className="py-2 pr-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 pr-3">
                        {it.isFolder ? (
                          <button
                            type="button"
                            onClick={() => openFolder(it)}
                            className="flex items-center gap-2 font-medium text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
                          >
                            <IconFolder className="h-4 w-4 shrink-0" />
                            <span className="truncate">{it.name}</span>
                          </button>
                        ) : (
                          <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                            <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate">{it.name}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{formatDate(it.lastModifiedDateTime)}</td>
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{it.lastModifiedBy || "—"}</td>
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                        {it.isFolder ? "—" : formatSize(it.size)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {!it.isFolder ? (
                          <button
                            type="button"
                            onClick={() => downloadItem(it)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60"
                          >
                            <IconDownload />
                            Download
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm italic text-slate-500 dark:text-slate-400">This folder is empty.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
