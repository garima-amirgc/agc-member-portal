import { ADMIN_GRANT_OPTION_GROUPS } from "../constants/adminGrants";

export default function AdminGrantCheckboxGroups({ selectedKeys = [], onToggle }) {
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
      {ADMIN_GRANT_OPTION_GROUPS.map((group) => (
        <div key={group.groupKey}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {group.label}
          </p>
          <div className="mt-1.5 space-y-2">
            {group.options.map((opt) => {
              const checked = selectedKeys.includes(opt.key);
              return (
                <label key={opt.key} className="flex cursor-pointer items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={() => onToggle(opt.key)}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
