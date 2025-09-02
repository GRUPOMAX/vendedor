export default function SelectField({
  label,
  value,
  onChange,
  options,
  className = "",
  allowEmpty = false,
  highlight = false,
  disabled = false,
}) {
  return (
    <label className={`block ${className} ${disabled ? "opacity-60" : ""}`}>
      <span className="text-xs text-text dark:text-dark-text">{label}</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 text-text dark:text-dark-text
          bg-background dark:bg-dark-background
          border-border dark:border-dark-border
          ${highlight ? "border-red-500 animate-pulse ring-1 ring-red-500" : ""}
        `}
      >
        {allowEmpty && <option value="">—</option>}
        {options.map((opt, i) => (
          <option key={i} value={opt ?? ""}>
            {opt ?? "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
