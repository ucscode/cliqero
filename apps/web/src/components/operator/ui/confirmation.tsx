"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type PendingConfirmation = ConfirmationOptions;
type ConfirmationContextValue = { confirm: (options: ConfirmationOptions) => Promise<boolean> };

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function useOperatorConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context)
    throw new Error("useOperatorConfirmation must be used within OperatorConfirmationProvider");
  return context.confirm;
}

export function OperatorConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const confirm = useCallback((options: ConfirmationOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setPending(options);
    });
  }, []);

  const finish = useCallback((accepted: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    resolve?.(accepted);
  }, []);

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && finish(false)}>
        {pending && (
          <DialogContent aria-describedby="operator-confirmation-description">
            <DialogHeader>
              <DialogTitle>{pending.title}</DialogTitle>
              <p id="operator-confirmation-description" className="text-sm text-slate-600">
                {pending.description}
              </p>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => finish(false)}>
                {pending.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={pending.destructive ? "destructive" : "default"}
                onClick={() => finish(true)}
              >
                {pending.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmationContext.Provider>
  );
}
