"use client";

import {
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  apiFetch,
  type WithdrawalDestination,
  type WithdrawalFieldAttrs,
  type WithdrawalMethod,
} from "@/lib/api-client";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { Toast } from "../../toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";

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

export function DestinationDialog({
  open,
  onOpenChange,
  methods,
  destination,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: WithdrawalMethod[];
  destination: WithdrawalDestination | null;
  onSaved: () => Promise<void>;
}) {
  const [methodId, setMethodId] = useState(destination?.method.id ?? methods[0]?.id ?? "");
  const [name, setName] = useState(destination?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    destinationValues(destination),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const method = methods.find((item) => item.id === methodId) ?? null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!method || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (destination) {
        await apiFetch(`/api/withdrawal-destinations/${destination.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, values }),
        });
      } else {
        await apiFetch("/api/withdrawal-destinations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: method.id, name, values }),
        });
      }
      await onSaved();
    } catch {
      setError("The destination could not be saved. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto text-left">
        <DialogHeader>
          <DialogTitle>{destination ? "Edit destination" : "Add destination"}</DialogTitle>
          {method && <p className="text-sm text-slate-500">{method.description}</p>}
        </DialogHeader>
        {error && <Toast>{error}</Toast>}
        {!destination && (
          <div className="grid gap-2">
            <Label htmlFor="purse-method-choice">Method</Label>
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
          </div>
        )}
        {destination && method && (
          <div className="grid gap-2">
            <Label>Method</Label>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {method.display_name}
            </p>
          </div>
        )}
        {method && (
          <form className="grid gap-4" onSubmit={(event) => void save(event)}>
            <div className="grid gap-2">
              <Label htmlFor="purse-destination-name">Name</Label>
              <Input
                id="purse-destination-name"
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : destination ? "Save changes" : "Save destination"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
