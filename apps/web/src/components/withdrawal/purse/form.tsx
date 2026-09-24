"use client";

import {
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type {
  WithdrawalDestination,
  WithdrawalFieldAttrs,
  WithdrawalMethod,
} from "@/lib/api-client";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { Toast } from "../../toast";

const reactAttrNames: Record<string, string> = {
  autocomplete: "autoComplete",
  autocapitalize: "autoCapitalize",
  inputmode: "inputMode",
  maxlength: "maxLength",
  minlength: "minLength",
  readonly: "readOnly",
  spellcheck: "spellCheck",
  tabindex: "tabIndex",
};

function htmlAttrs<T>(attrs?: WithdrawalFieldAttrs) {
  return Object.fromEntries(
    Object.entries(attrs ?? {}).map(([name, value]) => [
      reactAttrNames[name.toLowerCase()] ?? name,
      value,
    ]),
  ) as unknown as T;
}

function destinationValues(destination: WithdrawalDestination | null) {
  return Object.fromEntries(
    (destination?.fields ?? [])
      .filter((field) => field.type !== "fixed")
      .map((field) => [field.name, field.value]),
  );
}

export function PurseForm({
  methods,
  destination = null,
  saving,
  error,
  onSave,
  onCancel,
}: {
  methods: WithdrawalMethod[];
  destination?: WithdrawalDestination | null;
  saving: boolean;
  error: string | null;
  onSave: (input: { methodId: string; name: string; values: Record<string, string> }) => void;
  onCancel: () => void;
}) {
  // New purses intentionally start without a selected method.
  const [methodId, setMethodId] = useState(destination?.method.id ?? "");
  const [name, setName] = useState(destination?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    destinationValues(destination),
  );
  const method = methods.find((item) => item.id === methodId) ?? null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!method || saving) return;
    onSave({ methodId, name, values });
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {error && <Toast>{error}</Toast>}
      <div className="grid gap-2">
        <Label htmlFor="purse-method-choice">Method</Label>
        {destination ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            {destination.method.display_name}
          </p>
        ) : (
          <Select
            id="purse-method-choice"
            value={methodId}
            onChange={(event) => {
              setMethodId(event.target.value);
              setValues({});
            }}
            required
          >
            <option value="">Choose a method</option>
            {methods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {method && (
        <>
          <p className="text-sm text-slate-500">{method.description}</p>
          <div className="grid gap-2">
            <Label htmlFor="purse-name">Name</Label>
            <Input
              id="purse-name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. My primary account"
            />
          </div>
          {method.fields.map((field) => {
            const fieldId = `purse-field-${field.name}`;
            if (field.type === "fixed")
              return (
                <div key={field.name} className="grid gap-2">
                  <Label htmlFor={fieldId}>{field.label}</Label>
                  <Input id={fieldId} value={field.value} readOnly />
                </div>
              );

            if (field.type === "select")
              return (
                <div key={field.name} className="grid gap-2">
                  <Label htmlFor={fieldId}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Select
                    {...htmlAttrs<SelectHTMLAttributes<HTMLSelectElement>>(field.attrs)}
                    id={fieldId}
                    required={field.required}
                    value={values[field.name] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                  >
                    <option value="">Choose {field.label.toLowerCase()}</option>
                    {field.options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              );

            if (field.type === "textarea")
              return (
                <div key={field.name} className="grid gap-2">
                  <Label htmlFor={fieldId}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Textarea
                    {...htmlAttrs<TextareaHTMLAttributes<HTMLTextAreaElement>>(field.attrs)}
                    id={fieldId}
                    required={field.required}
                    value={values[field.name] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                  />
                  {field.enum?.length ? (
                    <p className="text-xs text-slate-500">
                      Allowed values: {field.enum.join(", ")}
                    </p>
                  ) : null}
                </div>
              );

            const listId = field.enum?.length ? `${fieldId}-values` : undefined;
            return (
              <div key={field.name} className="grid gap-2">
                <Label htmlFor={fieldId}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                <Input
                  {...htmlAttrs<InputHTMLAttributes<HTMLInputElement>>(field.attrs)}
                  id={fieldId}
                  required={field.required}
                  pattern={field.regex}
                  list={listId}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
                {listId && (
                  <datalist id={listId}>
                    {field.enum?.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                )}
              </div>
            );
          })}
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {method && (
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save purse"}
          </Button>
        )}
      </div>
    </form>
  );
}
