import { useAuth } from "../context/AuthContext";

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function PageHeader({ title = "Dashboard", subtitle, sectionTitle, showGreeting = false }) {
  const { user } = useAuth();
  const first = user?.name?.split(/\s+/)[0] || "there";

  return (
    <section>
      <h1 className="mb-3 text-2xl font-bold text-[#000000] dark:text-white">{title}</h1>
      {showGreeting ? (
        <p className="-mt-2 mb-3 text-sm text-[#0B3EAF] dark:text-[#A7D344]">
          {greetingForNow()},{" "}
          <span className="font-semibold">{first}</span>
        </p>
      ) : null}
      {subtitle != null && subtitle !== "" ? (
        <p className="text-sm text-[#0B3EAF] dark:text-[#A7D344]">{subtitle}</p>
      ) : null}
      {sectionTitle ? (
        <p className="mt-4 text-lg font-semibold text-[#000000] dark:text-white">{sectionTitle}</p>
      ) : null}
    </section>
  );
}
