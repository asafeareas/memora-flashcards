import type { ReactNode } from "react";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: ReactNode; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="14" width="40" height="40" rx="10" fill="#b9b5ff" />
      <rect x="18" y="8" width="40" height="40" rx="10" fill="var(--primary)" />
      <path d="M28 36V22l10 9 10-9v14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A settings row: label + description on the left, control on the right. */
export function SettingRow({ title, description, children, onClick, danger }: { title: ReactNode; description?: ReactNode; children?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`setting-row${onClick ? " setting-row--btn" : ""}${danger ? " setting-row--danger" : ""}`} onClick={onClick}>
      <div className="setting-row__text">
        <div className="setting-row__title">{title}</div>
        {description && <div className="setting-row__desc">{description}</div>}
      </div>
      {children}
    </Tag>
  );
}
