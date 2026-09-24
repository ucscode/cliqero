"use client";

import {
  useCallback,
  useEffect,
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
import { ApiClientError } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { EmptyState } from "../empty-state";
import { Skeleton } from "../ui/skeleton";
import { Toast } from "../toast";
import { CopyValue } from "../copy-value";

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

export function WithdrawalMethodsPanel() {
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [destinations, setDestinations] = useState<WithdrawalDestination[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [editing, setEditing] = useState<WithdrawalDestination | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextMethods, nextDestinations] = await Promise.all([
        apiFetch<WithdrawalMethod[]>("/api/withdrawal-methods"),
        apiFetch<WithdrawalDestination[]>("/api/withdrawal-destinations"),
      ]);
      setMethods(nextMethods);
      setDestinations(nextDestinations);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Withdrawal methods could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const method = methods.find((item) => item.id === selectedMethod) ?? null;
  function beginAdd() {
    setFormOpen(true);
    setEditing(null);
    setSelectedMethod("");
    setName("");
    setValues({});
    setError(null);
    setSuccess(null);
  }
  function beginEdit(destination: WithdrawalDestination) {
    const definition = methods.find((item) => item.id === destination.method.id);
    if (!definition || !destination.method.available) return;
    setEditing(destination);
    setFormOpen(true);
    setSelectedMethod(definition.id);
    setName(destination.name);
    setValues(
      Object.fromEntries(
        destination.fields
          .filter((field) => field.type !== "fixed")
          .map((field) => [field.name, field.value]),
      ),
    );
    setError(null);
    setSuccess(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!method) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editing) {
        await apiFetch(`/api/withdrawal-destinations/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, values }),
        });
        setSuccess("Withdrawal destination updated.");
      } else {
        await apiFetch("/api/withdrawal-destinations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: method.id, name, values }),
        });
        setSuccess("Withdrawal destination saved.");
      }
      setEditing(null);
      setFormOpen(false);
      setSelectedMethod("");
      setName("");
      setValues({});
      await load();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Destination could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(destination: WithdrawalDestination) {
    if (!window.confirm(`Remove “${destination.name}” from your selectable withdrawal methods?`))
      return;
    setError(null);
    try {
      await apiFetch(`/api/withdrawal-destinations/${destination.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      setSuccess("Withdrawal destination archived.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Destination could not be removed.",
      );
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="withdrawal-methods-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Money</p>
          <h2 id="withdrawal-methods-heading">Withdrawal methods</h2>
          <p className="mt-2 text-sm text-slate-500">
            Save destinations for future manual withdrawals.
          </p>
        </div>
        <Button type="button" onClick={beginAdd}>
          Add withdrawal method
        </Button>
      </div>
      {error && <Toast>{error}</Toast>}
      {success && <Toast tone="success">{success}</Toast>}
      {loading ? (
        <Card>
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : destinations.length ? (
        <div className="grid gap-3">
          {destinations.map((destination) => (
            <Card key={destination.id} className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {destination.method.image_url && (
                    <img
                      src={destination.method.image_url}
                      alt=""
                      className="h-6 w-6 object-contain"
                    />
                  )}
                  <h3>{destination.name}</h3>
                  <span className="text-sm text-slate-500">{destination.method.display_name}</span>
                  {!destination.method.available && (
                    <span className="text-xs font-semibold text-amber-700">
                      Unavailable for new withdrawals
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {destination.fields.map((field) => (
                    <div key={field.name} className="min-w-0">
                      <dt className="text-xs text-slate-500">{field.label}</dt>
                      <dd className="break-all text-sm font-medium">
                        {field.copyable ? (
                          <CopyValue
                            label={field.label}
                            value={field.value}
                            displayValue={field.displayValue}
                          />
                        ) : (
                          field.displayValue ?? field.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex items-start gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!destination.method.available}
                  onClick={() => beginEdit(destination)}
                >
                  Edit
                </Button>
                <Button type="button" variant="ghost" onClick={() => void archive(destination)}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No withdrawal methods saved"
            description="Add a bank account or wallet destination before requesting a withdrawal."
          />
        </Card>
      )}

      {formOpen && (
        <Card className="grid gap-4 p-5">
          <div>
            <h3>{editing ? "Edit withdrawal method" : "Add withdrawal method"}</h3>
            {method && <p className="mt-1 text-sm text-slate-500">{method.description}</p>}
          </div>
          {!editing && (
            <div className="grid gap-2">
              <Label htmlFor="withdrawal-method-choice">Method</Label>
              <Select
                id="withdrawal-method-choice"
                value={selectedMethod}
                onChange={(event) => {
                  setSelectedMethod(event.target.value);
                  setValues({});
                }}
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
          {method && (
            <form className="grid gap-4" onSubmit={(event) => void save(event)}>
              <div className="grid gap-2">
                <Label htmlFor="withdrawal-destination-name">Name</Label>
                <Input
                  id="withdrawal-destination-name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. My primary account"
                />
              </div>
              {method.fields.map((field) => {
                const fieldId = `withdrawal-field-${field.name}`;

                if (field.type === "fixed")
                  return (
                    <div key={field.name} className="grid gap-2">
                      <Label>{field.label}</Label>
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        {field.value}
                      </p>
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
                        {...htmlAttrs<SelectHTMLAttributes<HTMLSelectElement>>(
                          field.attrs,
                        )}
                        id={fieldId}
                        required={field.required}
                        value={values[field.name] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
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
                        {...htmlAttrs<TextareaHTMLAttributes<HTMLTextAreaElement>>(
                          field.attrs,
                        )}
                        id={fieldId}
                        required={field.required}
                        value={values[field.name] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
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
                      {...htmlAttrs<InputHTMLAttributes<HTMLInputElement>>(
                        field.attrs,
                      )}
                      id={fieldId}
                      required={field.required}
                      pattern={field.regex}
                      list={listId}
                      value={values[field.name] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                    />
                    {listId ? (
                      <datalist id={listId}>
                        {field.enum?.map((value) => <option key={value} value={value} />)}
                      </datalist>
                    ) : null}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Save method"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </section>
  );
}
