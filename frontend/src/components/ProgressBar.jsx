export default function ProgressBar({ value = 0 }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-[rgba(11,62,175,0.12)] dark:bg-[rgba(11,62,175,0.35)]">
      <div
        className="h-2.5 rounded-full bg-[#A7D344] transition-all duration-500 dark:shadow-[0_0_8px_rgba(167,211,68,0.45)]"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
