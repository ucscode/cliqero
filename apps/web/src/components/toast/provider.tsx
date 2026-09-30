"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { ToastStore, type ToastKind } from "./store";

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};
const ToastContext = createContext<ToastApi | null>(null);

const styles: Record<ToastKind, { icon: typeof Info; classes: string; role: "status" | "alert" }> =
  {
    success: {
      icon: CheckCircle2,
      classes: "border-emerald-200 bg-white text-emerald-950",
      role: "status",
    },
    info: { icon: Info, classes: "border-sky-200 bg-white text-sky-950", role: "status" },
    error: { icon: XCircle, classes: "border-rose-200 bg-white text-rose-950", role: "alert" },
  };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new ToastStore());
  const messages = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [api] = useState<ToastApi>(() => ({
    success: (message) => store.push("success", message),
    error: (message) => store.push("error", message),
    info: (message) => store.push("info", message),
  }));

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        aria-label="Notifications"
      >
        {messages.map((toast) => {
          const presentation = styles[toast.kind];
          const Icon = presentation.icon;
          return (
            <div
              key={toast.id}
              role={presentation.role}
              aria-live={toast.kind === "error" ? "assertive" : "polite"}
              className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 text-sm shadow-lg ${presentation.classes}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1 leading-5">{toast.message}</p>
              <button
                type="button"
                className="rounded p-1 text-current/70 hover:bg-slate-100 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label="Dismiss notification"
                onClick={() => store.dismiss(toast.id)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside ToastProvider");
  return toast;
}
