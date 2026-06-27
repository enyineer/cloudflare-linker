import type { ReactNode } from "react";

export function EmptyState({
  icon = "✨",
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="empty__title">{title}</div>
      <p className="empty__text">{text}</p>
      {action}
    </div>
  );
}
