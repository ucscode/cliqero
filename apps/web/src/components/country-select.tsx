"use client";

import { getData } from "country-list";
import { Label } from "./ui/label";
import { Select } from "./ui/select";

const countries = getData().sort((a, b) => a.name.localeCompare(b.name));

export function CountrySelect({
  value,
  onChange,
  id = "country",
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Country</Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">Select a country</option>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
