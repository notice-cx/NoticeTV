import { useId, type ReactNode } from 'react';

export function Field({
  label,
  children,
  hint,
  required = false,
  group = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  group?: boolean;
}) {
  const id = useId();
  const Tag = group ? 'div' : 'label';
  return (
    <Tag
      className="field"
      role={group ? 'group' : undefined}
      aria-labelledby={group ? id : undefined}
    >
      <span id={group ? id : undefined}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </Tag>
  );
}
