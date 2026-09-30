"use client";

import type { ReactNode } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer position="top-right" newestOnTop closeOnClick pauseOnFocusLoss />
    </>
  );
}

export function useToast() {
  return toast;
}
