import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import { USER_ME_PROFILE } from "../services/userMeClient";
import { formatDepartments } from "../utils/userDepts";
import { friendlyErrorMessage } from "../services/friendlyError";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function profileInitials(name, email) {
  const source = String(name || email || "U").trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function birthDateLabel(month, day) {
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return "Not added";
  return `${MONTHS[m - 1]} ${d}`;
}

function joinDateLabel(month, day, year) {
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) {
    return "Not added";
  }
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const JOIN_YEAR_OPTIONS = (() => {
  const end = new Date().getFullYear();
  const years = [];
  for (let y = end; y >= 1980; y -= 1) years.push(y);
  return years;
})();

function displayValue(value) {
  const text = String(value ?? "").trim();
  return text || "Not added";
}

function ProfileDetail({ label, value, className = "", fromAdp = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        {fromAdp && (
          <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">
            ✦ ADP
          </span>
        )}
      </div>
      <div className="mt-1 font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

// ─── ADP locked field notice ──────────────────────────────────────────────────

function AdpLocked() {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-[#0B3EAF] dark:text-[#A7D344]">
      <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">✦ ADP</span>
      Managed in ADP — edit there to update
    </p>
  );
}

// ─── ADP status badge ─────────────────────────────────────────────────────────

function AdpStatusBadge({ status }) {
  if (!status) return null;
  const active = status.toLowerCase() === "active";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {status}
    </span>
  );
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, refreshMe } = useAuth();

  const [me, setMe] = useState(null);
  const [adp, setAdp] = useState(null);
  const [adpLoading, setAdpLoading] = useState(true);
  const [adpError, setAdpError] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    designation: "",
    phone: "",
    address: "",
    password: "",
    birth_month: "",
    birth_day: "",
    join_month: "",
    join_day: "",
    join_year: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const editSectionRef = useRef(null);

  const syncFormFromProfile = useCallback((profile) => {
    setForm({
      name: profile?.name ?? "",
      email: profile?.email ?? "",
      designation: profile?.designation ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
      password: "",
      birth_month: profile?.birth_month != null ? String(profile.birth_month) : "",
      birth_day: profile?.birth_day != null ? String(profile.birth_day) : "",
      join_month: profile?.join_month != null ? String(profile.join_month) : "",
      join_day: profile?.join_day != null ? String(profile.join_day) : "",
      join_year: profile?.join_year != null ? String(profile.join_year) : "",
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    setMe((prev) => prev ?? user);
    syncFormFromProfile(user);

    let cancelled = false;

    // Fetch portal profile + ADP data in parallel
    api
      .get("/users/me", USER_ME_PROFILE)
      .then((res) => {
        if (cancelled) return;
        setMe(res.data);
        syncFormFromProfile(res.data);
        setError("");
      })
      .catch((e) => {
        if (cancelled) return;
        if (!user) setError(friendlyErrorMessage(e, "Failed to load profile"));
      });

    setAdpLoading(true);
    setAdpError(null);
    api
      .get("/adp/me")
      .then((res) => {
        if (cancelled) return;
        setAdp(res.data);
        setAdpLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setAdp(null);
        setAdpError({
          status: e?.response?.status ?? 0,
          message: e?.response?.data?.message || e?.message,
          needs_oid: e?.response?.data?.needs_oid === true,
        });
        setAdpLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, syncFormFromProfile]);

  const fetchAdp = useCallback(() => {
    setAdpLoading(true);
    setAdpError(null);
    api
      .get("/adp/me")
      .then((res) => {
        setAdp(res.data);
        setAdpLoading(false);
      })
      .catch((e) => {
        setAdp(null);
        setAdpError({
          status: e?.response?.status ?? 0,
          message: e?.response?.data?.message || e?.message,
          needs_oid: e?.response?.data?.needs_oid === true,
        });
        setAdpLoading(false);
      });
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    const birthMonthRaw = String(form.birth_month ?? "").trim();
    const birthDayRaw = String(form.birth_day ?? "").trim();
    const includeDob = birthMonthRaw !== "" && birthDayRaw !== "";
    const birth_month = includeDob ? Number(birthMonthRaw) : undefined;
    const birth_day = includeDob ? Number(birthDayRaw) : undefined;
    if (includeDob && (!Number.isFinite(birth_month) || !Number.isFinite(birth_day))) {
      setError("Invalid date of birth. Please select a month and day.");
      return;
    }

    const joinMonthRaw = String(form.join_month ?? "").trim();
    const joinDayRaw = String(form.join_day ?? "").trim();
    const joinYearRaw = String(form.join_year ?? "").trim();
    const allJoinEmpty = joinMonthRaw === "" && joinDayRaw === "" && joinYearRaw === "";
    const allJoinFilled = joinMonthRaw !== "" && joinDayRaw !== "" && joinYearRaw !== "";
    if (!allJoinEmpty && !allJoinFilled) {
      setError("Date of joining needs month, day, and year — or leave all three blank.");
      return;
    }
    const join_month = allJoinFilled ? Number(joinMonthRaw) : null;
    const join_day = allJoinFilled ? Number(joinDayRaw) : null;
    const join_year = allJoinFilled ? Number(joinYearRaw) : null;
    if (allJoinFilled && (!Number.isFinite(join_month) || !Number.isFinite(join_day) || !Number.isFinite(join_year))) {
      setError("Invalid date of joining. Please select month, day, and year.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.put("/users/me", {
        name: form.name,
        email: form.email,
        designation: form.designation,
        phone: form.phone,
        address: form.address,
        ...(includeDob ? { birth_month, birth_day } : {}),
        join_month,
        join_day,
        join_year,
        ...(form.password ? { password: form.password } : {}),
      });

      await refreshMe();
      const updatedRes = await api.get("/users/me", USER_ME_PROFILE);
      setMe(updatedRes.data);
      syncFormFromProfile(updatedRes.data);

      setSuccess("Profile updated");
      setEditing(false);
      setAvatarFile(null);
    } catch (e2) {
      setError(friendlyErrorMessage(e2, "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return;
    setAvatarUploading(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("avatar", avatarFile);
      await api.post("/avatar/me", fd);
      await refreshMe();
      const updatedRes = await api.get("/users/me", USER_ME_PROFILE);
      setMe(updatedRes.data);
      setSuccess("Profile image updated");
      setAvatarFile(null);
    } catch (e2) {
      setError(friendlyErrorMessage(e2, "Failed to upload image"));
    } finally {
      setAvatarUploading(false);
    }
  };

  const startEditing = () => {
    syncFormFromProfile(profile);
    setAvatarFile(null);
    setError("");
    setSuccess("");
    setEditing(true);
    setTimeout(() => {
      editSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const cancelEditing = () => {
    syncFormFromProfile(profile);
    setAvatarFile(null);
    setError("");
    setEditing(false);
  };

  const profile = me || user;
  if (!profile) return <div className={PAGE_PADDING}>Loading profile…</div>;

  const formatAdpDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    if (d.getFullYear() < 1900) return d.toLocaleDateString("en-CA", { month: "long", day: "numeric" });
    return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  };

  const avatarUrl = resolvePublicMediaUrl(profile.profile_image_url);
  const facilities =
    Array.isArray(profile.facilities) && profile.facilities.length > 0
      ? profile.facilities
      : [profile.business_unit].filter(Boolean);

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-3 text-2xl font-bold text-[#000000] dark:text-white">Your Profile</h1>
      </section>

      <section className="card">
        {error && <div className="mb-4 rounded bg-rose-100 p-2 text-sm text-rose-700">{error}</div>}
        {success && <div className="mb-4 rounded bg-emerald-100 p-2 text-sm text-emerald-700">{success}</div>}

        <div className="flex flex-col items-center text-center">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-brand-blue-soft text-brand-blue ring-4 ring-white shadow-md dark:bg-white/10 dark:text-brand-green dark:ring-white/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold">
                {profileInitials(profile.name, profile.email)}
              </div>
            )}
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950 dark:text-white">{profile.name}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{profile.email}</p>
          {String(adp?.job_title || profile.designation || "").trim() ? (
            <p className="mt-1 text-sm font-medium text-[#0B3EAF] dark:text-[#A7D344]">{adp?.job_title || profile.designation}</p>
          ) : null}
          {!editing ? (
            <button type="button" className="btn-primary mt-4" onClick={startEditing}>
              Edit Profile
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {/* Work identity */}
          <ProfileDetail label="Role" value={displayValue(profile.role)} />
          <ProfileDetail
            label="Department"
            value={displayValue(adp?.department || formatDepartments(profile))}
            fromAdp={!!adp?.department}
          />
          <ProfileDetail
            label="Job Title"
            value={displayValue(adp?.job_title || profile.designation)}
            fromAdp={!!adp?.job_title}
          />
          {adp?.worker_id && <ProfileDetail label="Employee ID" value={adp.worker_id} fromAdp />}
          {adp?.employment_type && <ProfileDetail label="Employment Type" value={adp.employment_type} fromAdp />}
          {adp?.employment_status && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Employment Status</span>
                <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">✦ ADP</span>
              </div>
              <div className="mt-1"><AdpStatusBadge status={adp.employment_status} /></div>
            </div>
          )}
          <ProfileDetail
            label="Date of Joining"
            value={adp?.hire_date ? formatAdpDate(adp.hire_date) : joinDateLabel(profile.join_month, profile.join_day, profile.join_year)}
            fromAdp={!!adp?.hire_date}
          />
          {/* Contact */}
          <ProfileDetail label="Email" value={displayValue(profile.email)} />
          {adp?.work_email && <ProfileDetail label="Work Email" value={adp.work_email} fromAdp />}
          <ProfileDetail
            label="Phone"
            value={displayValue(adp?.work_phone || profile.phone)}
            fromAdp={!!adp?.work_phone}
          />
          {adp?.work_location && <ProfileDetail label="Work Location" value={adp.work_location} fromAdp />}
          {/* Personal */}
          <ProfileDetail
            label="Date of Birth"
            value={adp?.birth_date ? formatAdpDate(adp.birth_date) : birthDateLabel(profile.birth_month, profile.birth_day)}
            fromAdp={!!adp?.birth_date}
          />
          <ProfileDetail label="Address" value={displayValue(adp?.home_address || profile.address)} className="sm:col-span-2" fromAdp={!!adp?.home_address} />
          {facilities.length > 0 ? (
            <ProfileDetail label="Facilities" value={facilities.join(", ")} className="sm:col-span-2" />
          ) : null}
        </div>

        {!adpLoading && adpError?.status === 404 && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Your work email address is not on file in ADP. Please contact HR or update it in your ADP self-service portal so your employment details can be pulled here automatically.
            </p>
          </div>
        )}

        {adp && (
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">✦ ADP</span>
            {" "}Fields marked ADP are sourced directly from ADP Workforce Now and update automatically.
          </p>
        )}
      </section>

      {editing ? (
        <section className="card" ref={editSectionRef}>
          <h2 className="mb-4 text-lg font-semibold">Edit Profile</h2>

          <div className="mb-6 rounded-2xl border p-4 dark:border-slate-700">
            <div className="mb-3 text-sm font-semibold">Profile image</div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-200 text-sm font-bold text-brand-blue ring-1 ring-slate-300 dark:bg-slate-700 dark:text-brand-green dark:ring-slate-600">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">{profileInitials(profile.name, profile.email)}</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={uploadAvatar}
                  disabled={!avatarFile || avatarUploading}
                  className="btn-primary"
                >
                  {avatarUploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>

          <form className="agc-form space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <input className="w-full rounded border p-2 dark:bg-slate-700" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input className="w-full rounded border p-2 dark:bg-slate-700" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Phone {adp?.work_phone ? "" : "(optional)"}</label>
                <input
                  className={`w-full rounded border p-2 dark:bg-slate-700 ${adp?.work_phone ? "cursor-not-allowed opacity-60" : ""}`}
                  type="tel"
                  value={adp?.work_phone || form.phone}
                  onChange={(e) => { if (!adp?.work_phone) setForm({ ...form, phone: e.target.value }); }}
                  readOnly={!!adp?.work_phone}
                  placeholder="e.g. (555) 123-4567"
                />
                {adp?.work_phone && <AdpLocked />}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Designation {adp?.job_title ? "" : "(optional)"}</label>
                <input
                  className={`w-full rounded border p-2 dark:bg-slate-700 ${adp?.job_title ? "cursor-not-allowed opacity-60" : ""}`}
                  value={adp?.job_title || form.designation}
                  onChange={(e) => { if (!adp?.job_title) setForm({ ...form, designation: e.target.value }); }}
                  readOnly={!!adp?.job_title}
                  placeholder="e.g. Safety Officer, Supervisor"
                />
                {adp?.job_title && <AdpLocked />}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Address {adp?.home_address ? "" : "(optional)"}</label>
                <textarea
                  className={`min-h-[88px] w-full rounded border p-2 dark:bg-slate-700 ${adp?.home_address ? "cursor-not-allowed opacity-60" : ""}`}
                  value={adp?.home_address || form.address}
                  onChange={(e) => { if (!adp?.home_address) setForm({ ...form, address: e.target.value }); }}
                  readOnly={!!adp?.home_address}
                  placeholder="Street, city, province/state, postal code"
                />
                {adp?.home_address && <AdpLocked />}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">New Password (optional)</label>
                <input className="w-full rounded border p-2 dark:bg-slate-700" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep current password" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Date of birth {adp?.birth_date ? "" : "(optional)"}</label>
                {adp?.birth_date ? (
                  <>
                    <input
                      className="w-full cursor-not-allowed rounded border p-2 opacity-60 dark:bg-slate-700"
                      readOnly
                      value={formatAdpDate(adp.birth_date)}
                    />
                    <AdpLocked />
                  </>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={form.birth_month}
                      onChange={(e) => setForm({ ...form, birth_month: e.target.value })}
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={String(idx + 1)}>{m}</option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={form.birth_day}
                      onChange={(e) => setForm({ ...form, birth_day: e.target.value })}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={String(d)}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Date of joining {adp?.hire_date ? "" : "(optional)"}</label>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Used for work anniversary celebrations on your joining date each year.
                </p>
                {adp?.hire_date ? (
                  <>
                    <input
                      className="w-full cursor-not-allowed rounded border p-2 opacity-60 dark:bg-slate-700"
                      readOnly
                      value={formatAdpDate(adp.hire_date)}
                    />
                    <AdpLocked />
                  </>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={form.join_month}
                      onChange={(e) => setForm({ ...form, join_month: e.target.value })}
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={String(idx + 1)}>{m}</option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={form.join_day}
                      onChange={(e) => setForm({ ...form, join_day: e.target.value })}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={String(d)}>{d}</option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={form.join_year}
                      onChange={(e) => setForm({ ...form, join_year: e.target.value })}
                    >
                      <option value="">Year</option>
                      {JOIN_YEAR_OPTIONS.map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" className="btn-secondary" onClick={cancelEditing} disabled={saving || avatarUploading}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
