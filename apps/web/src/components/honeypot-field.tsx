import { useId } from "react";
import { HONEYPOT_FIELD_NAME } from "@/lib/honeypot";

export function HoneypotField() {
  const id = `${HONEYPOT_FIELD_NAME}-${useId().replace(/:/g, "")}`;
  return (
    <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
      <label htmlFor={id}>Leave this field empty</label>
      <input
        id={id}
        name={HONEYPOT_FIELD_NAME}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
    </div>
  );
}
