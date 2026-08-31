import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { formatMinorUsd } from "@/lib/api-client";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return <button className={`button button-${variant} ${className}`.trim()} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

export function Select({ className = "", ...props }: InputHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${className}`.trim()} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={`card ${className}`.trim()}>{children}</article>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Money({ minor, currency = "USD" }: { minor: string | bigint; currency?: string }) {
  return (
    <span className="money">
      {currency === "USD" ? formatMinorUsd(minor) : `${currency} ${minor}`}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">◌</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="menu">
      <summary>
        {label}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="menu-popover">{children}</div>
    </details>
  );
}

export function Tabs({
  items,
  active,
}: {
  items: Array<{ label: string; href: string }>;
  active?: string;
}) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((item) => (
        <a className={item.href === active ? "tab active" : "tab"} href={item.href} key={item.href}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  );
}

export function Toast({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <div className={`toast toast-${tone}`} role="status">
      {children}
    </div>
  );
}
