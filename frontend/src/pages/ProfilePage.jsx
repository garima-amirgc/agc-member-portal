import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import ProgressBar from "../components/ProgressBar";
import LeaveRequestPanel from "../components/LeaveRequestPanel";
import ManagerEmployeeManagement from "../components/ManagerEmployeeManagement";
import { isSupervisor } from "../utils/supervisorAccess";
import ReportingHierarchyTree from "../components/ReportingHierarchyTree";
import { useAuth } from "../context/AuthContext";
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

export default function ProfilePage() {
  const { user, refreshMe } = useAuth();

  const [me, setMe] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    designation: "",
    password: "",
    birth_month: "",
    birth_day: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editing, setEditing] = useState(false);

  const syncFormFromProfile = (profile) => {
    setForm({
      name: profile?.name ?? "",
      email: profile?.email ?? "",
      designation: profile?.designation ?? "",
      password: "",
      birth_month: profile?.birth_month != null ? String(profile.birth_month) : "",
      birth_day: profile?.birth_day != null ? String(profile.birth_day) : "",
    });
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [meRes, assignmentsRes] = await Promise.all([api.get("/users/me"), api.get("/assignments/me")]);
      setMe(meRes.data);
      setAssignments(assignmentsRes.data);
      syncFormFromProfile(meRes.data);
    })().catch((e) => setError(friendlyErrorMessage(e, "Failed to load profile")));
  }, [user]);

  const overallProgress = useMemo(() => {
    if (!assignments || assignments.length === 0) return 0;
    const total = assignments.reduce((sum, a) => sum + (a.progress ?? 0), 0);
    return Math.round(total / assignments.length);
  }, [assignments]);

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

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.put("/users/me", {
        name: form.name,
        email: form.email,
        designation: form.designation,
        ...(includeDob ? { birth_month, birth_day } : {}),
        ...(form.password ? { password: form.password } : {}),
      });

      await refreshMe();
      const updatedRes = await api.get("/users/me");
      setMe(updatedRes.data);
      syncFormFromProfile(updatedRes.data);

      const assignmentsRes = await api.get("/assignments/me");
      setAssignments(assignmentsRes.data);

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
      const updatedRes = await api.get("/users/me");
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
    syncFormFromProfile(me);
    setAvatarFile(null);
    setError("");
    setSuccess("");
    setEditing(true);
  };

  const cancelEditing = () => {
    syncFormFromProfile(me);
    setAvatarFile(null);
    setError("");
    setEditing(false);
  };

  if (!me) return <div className={PAGE_PADDING}>Loading profile…</div>;

  const avatarUrl = resolvePublicMediaUrl(me.profile_image_url);
  const facilities = Array.isArray(me.facilities) && me.facilities.length > 0 ? me.facilities : [me.business_unit].filter(Boolean);

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
                {profileInitials(me.name, me.email)}
              </div>
            )}
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950 dark:text-white">{me.name}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{me.email}</p>
          {String(me.designation || "").trim() ? (
            <p className="mt-1 text-sm font-medium text-[#0B3EAF] dark:text-[#A7D344]">{me.designation}</p>
          ) : null}
          {!editing ? (
            <button type="button" className="btn-primary mt-4" onClick={startEditing}>
              Edit Profile
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Role</div>
            <div className="mt-1 font-semibold text-slate-900 dark:text-white">{me.role || "Not added"}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Departments</div>
            <div className="mt-1 font-semibold text-slate-900 dark:text-white">{formatDepartments(me)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Date of birth</div>
            <div className="mt-1 font-semibold text-slate-900 dark:text-white">{birthDateLabel(me.birth_month, me.birth_day)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Overall Progress</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{overallProgress}%</div>
            </div>
            <div className="mt-2">
              <ProgressBar value={overallProgress} />
            </div>
          </div>
        </div>

        {facilities.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {facilities.map((f) => (
              <span key={f} className="rounded-sm bg-brand-blue-soft px-2 py-1 text-xs font-bold text-brand-blue dark:bg-white/10 dark:text-brand-green">
                {f}
              </span>
            ))}
          </div>
        )}
      </section>

      <ReportingHierarchyTree hierarchy={me.reporting_hierarchy} currentUserId={me.id} />

      {editing ? (
      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Edit Profile</h2>

        <div className="mb-6 rounded-2xl border p-4 dark:border-slate-700">
          <div className="mb-3 text-sm font-semibold">Profile image</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-200 text-sm font-bold text-brand-blue ring-1 ring-slate-300 dark:bg-slate-700 dark:text-brand-green dark:ring-slate-600">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">{profileInitials(me.name, me.email)}</div>
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

        <form className="agc-form space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input className="w-full rounded border p-2 dark:bg-slate-700" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input className="w-full rounded border p-2 dark:bg-slate-700" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Designation (optional)</label>
            <input
              className="w-full rounded border p-2 dark:bg-slate-700"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              placeholder="e.g. Safety Officer, Supervisor"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">New Password (optional)</label>
            <input className="w-full rounded border p-2 dark:bg-slate-700" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep current password" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Date of birth (optional)</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="w-full rounded border p-2 dark:bg-slate-700"
                value={form.birth_month}
                onChange={(e) => setForm({ ...form, birth_month: e.target.value })}
              >
                <option value="">Month</option>
                {[
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
                ].map((m, idx) => (
                  <option key={m} value={String(idx + 1)}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded border p-2 dark:bg-slate-700"
                value={form.birth_day}
                onChange={(e) => setForm({ ...form, birth_day: e.target.value })}
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>
                    {d}
                  </option>
                ))}
              </select>
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

      {isSupervisor(user) && <ManagerEmployeeManagement />}

      {user?.role !== "Admin" && (
        <details className="group card rounded-portal border border-stone-200/90 p-4 open:ring-1 open:ring-brand-blue/20 dark:border-stone-700 dark:open:ring-brand-blue/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 font-semibold text-slate-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden dark:text-slate-100">
            <span>Leave requests</span>
            <svg
              className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180 dark:text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </summary>
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
            <LeaveRequestPanel embedded />
          </div>
        </details>
      )}

      <section>
        <h2 className="mb-3 text-xl font-semibold">Your Course Progress</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => (
            <div key={a.id} className="card">
              <h3 className="font-semibold">{a.course_title}</h3>
              <p className="mb-2 text-sm text-slate-500">{a.course_business_unit} facility</p>
              <ProgressBar value={a.progress} />
              <p className="mt-2 text-sm">
                {a.progress}% - {a.status}
              </p>
            </div>
          ))}

          {assignments.length === 0 && (
            <div className="card border-dashed text-slate-600 dark:text-slate-400">
              <p>No assigned courses found.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

