"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TagOption = { value: string; label: string };

export function availableTagOptions(
  options: readonly TagOption[],
  selected: readonly string[],
  query: string,
) {
  const normalizedQuery = query.toLowerCase();
  return options.filter(
    (option) =>
      !selected.includes(option.value) && option.label.toLowerCase().includes(normalizedQuery),
  );
}

export function addTagValue(selected: readonly string[], option: string) {
  return selected.includes(option) ? [...selected] : [...selected, option];
}

export function removeTagValue(selected: readonly string[], option: string) {
  return selected.filter((value) => value !== option);
}

export function moveTagActiveIndex(current: number, key: string, length: number) {
  return key === "ArrowDown"
    ? Math.min(current + 1, Math.max(length - 1, 0))
    : Math.max(current - 1, 0);
}

export function TagSelect({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly TagOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  className?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.filter((option) => value.includes(option.value));
  const available = availableTagOptions(options, value, query);

  function add(option: TagOption) {
    if (value.includes(option.value)) return;
    onChange(addTagValue(value, option.value));
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => moveTagActiveIndex(current, event.key, available.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => moveTagActiveIndex(current, event.key, available.length));
    } else if (event.key === "Enter" && open && available[active]) {
      event.preventDefault();
      add(available[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Backspace" && !query && selected.length) {
      onChange(removeTagValue(value, selected[selected.length - 1].value));
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap gap-2" aria-label={`${label} selected`}>
        {selected.map((option) => (
          <span
            key={option.value}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-950"
          >
            {option.label}
            <button
              type="button"
              aria-label={`Remove ${option.label}`}
              className="rounded-full p-0.5 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              onClick={() => onChange(value.filter((item) => item !== option.value))}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <input
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-autocomplete="list"
        aria-activedescendant={open && available[active] ? `${id}-option-${active}` : undefined}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-600"
        placeholder={`Search/add ${label.toLowerCase()}…`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null))
            setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label={`${label} options`}
          className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-sm"
        >
          {available.length ? (
            available.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100",
                    index === active && "bg-slate-100",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(option)}
                >
                  {option.label}
                </button>
              </li>
            ))
          ) : (
            <li className="px-2 py-1.5 text-sm text-slate-500" role="status">
              No matching options.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
