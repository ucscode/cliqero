"use client";

import { useId } from "react";
import { OperatorFilterField } from "../operator/ui/toolbar";
import { Select } from "../ui/select";

export type CrudSortOption = {
  value: string;
  label: string;
  sort: string;
  direction: "asc" | "desc";
};

export function CrudSortSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly CrudSortOption[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <OperatorFilterField label="Sort" htmlFor={id}>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </OperatorFilterField>
  );
}
