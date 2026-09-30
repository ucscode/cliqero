"use client";

import Select, { type MultiValue, type StylesConfig } from "react-select";

export type MultiSelectOption = Readonly<{ value: string; label: string }>;

const styles: StylesConfig<MultiSelectOption, true> = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderColor: state.isFocused ? "#059669" : "#cbd5e1",
    boxShadow: state.isFocused ? "0 0 0 2px rgb(5 150 105 / 18%)" : "none",
    ":hover": { borderColor: state.isFocused ? "#059669" : "#94a3b8" },
  }),
  multiValue: (base) => ({ ...base, backgroundColor: "#f1f5f9", borderRadius: 4 }),
  multiValueLabel: (base) => ({ ...base, color: "#334155", fontSize: 12, padding: "2px 4px" }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#64748b",
    ":hover": { backgroundColor: "#e2e8f0", color: "#0f172a" },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? "#e2e8f0" : state.isFocused ? "#f1f5f9" : "white",
    color: "#0f172a",
  }),
};

export function MultiSelect({
  label,
  inputId,
  options,
  value,
  onChange,
}: {
  label: string;
  inputId?: string;
  options: readonly MultiSelectOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const optionByValue = new Map(options.map((option) => [option.value, option]));
  const selected = value.flatMap((item) => {
    const option = optionByValue.get(item);
    return option ? [option] : [];
  });
  return (
    <Select<MultiSelectOption, true>
      aria-label={label}
      inputId={inputId}
      isMulti
      closeMenuOnSelect={false}
      hideSelectedOptions
      options={options}
      value={selected}
      onChange={(next: MultiValue<MultiSelectOption>) => onChange(next.map(({ value }) => value))}
      styles={styles}
      classNamePrefix="cliqero-select"
      noOptionsMessage={() => "No matching options."}
    />
  );
}
