import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import ProgressBar from "../components/ProgressBar";
import LeaveRequestPanel from "../components/LeaveRequestPanel";
import ManagerEmployeeManagement from "../components/ManagerEmployeeManagement";
import ReportingHierarchyTree from "../components/ReportingHierarchyTree";
import { useAuth } from "../context/AuthContext";
import { formatDepartments } from "../utils/userDepts";

export default function ProfilePage() {
  const { user, refreshMe } = useAuth();

  const [me, setMe] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [meRes, assignmentsRes] = await Promise.all([api.get("/users/me"), api.get("/assignments/me")]);
      setMe(meRes.data);
      setAssignments(assignmentsRes.data);
      setForm({
        name: meRes.data?.name ?? "",
        email: meRes.data?.email ?? "",
        password: "",
      });
    })().catch((e) => setError(e?.message || "Failed to load profile"));
  }, [user]);

  const overallProgress = useMemo(() => {
    if (!assignments || assignments.length === 0) return 0;
    const total = assignments.reduce((sum, a) => sum + (a.progress ?? 0), 0);
    return Math.round(total / assignments.length);
  }, [assignments]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.put("/users/me", {
        name: form.name,
        email: form.email,
        ...(form.password ? { password: form.password } : {}),
      });

      const updated = await refreshMe();
      setMe(updated);

      const assignmentsRes = await api.get("/assignments/me");
      setAssignments(assignmentsRes.data);

      setSuccess("Profile updated");
      setForm((f) => ({ ...f, password: "" }));
    } catch (e2) {
      setError(e2?.response?.data?.message || e2?.message || "Failed to update profile");
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
      const updated = await refreshMe();
      setMe(updated);
      setSuccess("Profile image updated");
      setAvatarFile(null);
    } catch (e2) {
      setError(e2?.response?.data?.message || e2?.message || "Failed to upload image");
    } finally {
      setAvatarUploading(false);
    }
  };

  if (!me) return <div className={PAGE_PADDING}>Loading profile…</div>;

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-3 text-2xl font-bold text-[#000000] dark:text-white">Your Profile</h1>
        <p className="text-sm text-[#0B3EAF] dark:text-[#A7D344]">
          Update your details and track your learning progress.
          {user?.role === "Manager" &&
            " Employee management below lists your direct reports, their leave requests, and course progress. Use Leave requests for your own time off."}
          {user?.role !== "Admin" && user?.role !== "Manager" && " Open Leave requests below to apply for time off."}
        </p>
      </section>

      <section className="card">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Overall Progress</div>
            <div className="text-sm">{overallProgress}%</div>
          </div>
          <ProgressBar value={overallProgress} />
        </div>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold">Role:</span> {me.role}
          {" "}
          · <span className="font-semibold">Departments:</span> {formatDepartments(me)}
        </p>

        {me.facilities?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {me.facilities.map((f) => (
              <span key={f} className="rounded-sm bg-brand-blue-soft px-2 py-1 text-xs font-bold text-brand-blue dark:bg-white/10 dark:text-brand-green">
                {f}
              </span>
            ))}
          </div>
        )}
      </section>

      <ReportingHierarchyTree hierarchy={me.reporting_hierarchy} currentUserId={me.id} />

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Edit Profile</h2>
        {error && <div className="mb-3 rounded bg-rose-100 p-2 text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded bg-emerald-100 p-2 text-emerald-700">{success}</div>}

        <div className="mb-6 rounded-2xl border p-4 dark:border-slate-700">
          <div className="mb-3 text-sm font-semibold">Profile image</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-300 dark:bg-slate-700 dark:ring-slate-600">
                {me.profile_image_url ? (
                  <img src={me.profile_image_url} alt="Profile" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Upload a PNG/JPG/WebP (max 5MB).
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
            <label className="mb-1 block text-sm font-medium">New Password (optional)</label>
            <input className="w-full rounded border p-2 dark:bg-slate-700" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep current password" />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              New password: at least 10 characters, with at least one letter and one number.
            </p>
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </section>

      {user?.role === "Manager" && <ManagerEmployeeManagement />}

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

