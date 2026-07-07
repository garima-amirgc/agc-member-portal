import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { resolvePublicMediaUrl } from "../../utils/mediaUrl";
import { IconSearch } from "./SidebarIcons";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const CATEGORY_COLORS = {
  "People": "text-[#0B3EAF]",
  "New Hires": "text-[#0B3EAF]",
  "Employee of the Month": "text-[#A7D344]",
  "Leadership Update": "text-[#0B3EAF]",
  "Customer Win": "text-[#A7D344]",
  "Community Involvement": "text-[#0B3EAF]",
  "Upcoming Event": "text-[#A7D344]",
  "IT Ticket": "text-slate-500",
};

function SearchResultItem({ result, onNavigate }) {
  const navigate = useNavigate();
  const img = result.image ? resolvePublicMediaUrl(result.image) : "";
  const initials = String(result.subtitle || result.title || "?")[0]?.toUpperCase() || "?";

  const handleClick = () => {
    navigate(result.link);
    onNavigate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-white/10"
    >
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[#0B3EAF]/10 dark:bg-white/10">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[#0B3EAF] dark:text-[#A7D344]">
            {initials}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-900 dark:text-white">{result.title}</p>
        {result.subtitle ? (
          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{result.subtitle}</p>
        ) : null}
      </div>
    </button>
  );
}

function SearchDropdown({ results, loading, query, onNavigate }) {
  if (!query || query.length < 2) return null;

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category).push(r);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#1a1a1a]">
      {loading ? (
        <p className="px-3 py-3 text-[11px] text-slate-500">Searching…</p>
      ) : grouped.length === 0 ? (
        <p className="px-3 py-3 text-[11px] text-slate-500">No results for "{query}"</p>
      ) : (
        <div className="p-1.5">
          {grouped.map(([category, items]) => (
            <div key={category} className="mb-2 last:mb-0">
              <p className={`px-2 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest ${CATEGORY_COLORS[category] || "text-slate-400"}`}>
                {category}
              </p>
              {items.map((r, i) => (
                <SearchResultItem key={`${category}-${i}`} result={r} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBarSearch() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchWrapRef = useRef(null);
  const debouncedQuery = useDebounce(query.trim(), 300);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }
    let alive = true;
    setSearchLoading(true);
    setDropdownOpen(true);
    api.get("/search", { params: { q: debouncedQuery } })
      .then((r) => {
        if (!alive) return;
        setSearchResults(Array.isArray(r.data?.results) ? r.data.results : []);
      })
      .catch(() => { if (alive) setSearchResults([]); })
      .finally(() => { if (alive) setSearchLoading(false); });
    return () => { alive = false; };
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setQuery("");
    setSearchResults([]);
  }, []);

  return (
    <div ref={searchWrapRef} className="relative w-3/4">
      <label className="relative block">
        <span className="sr-only">Search</span>
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (debouncedQuery.length >= 2) setDropdownOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") closeDropdown(); }}
          placeholder="Search…"
          className="h-9 w-full rounded-portal border border-slate-200 bg-slate-50 py-1 pl-9 pr-3 text-sm leading-tight text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-[#0B3EAF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40 dark:focus:border-[#A7D344] dark:focus:bg-white/10 dark:focus:ring-[#A7D344]/20"
        />
      </label>
      {dropdownOpen ? (
        <SearchDropdown
          results={searchResults}
          loading={searchLoading}
          query={debouncedQuery}
          onNavigate={closeDropdown}
        />
      ) : null}
    </div>
  );
}
