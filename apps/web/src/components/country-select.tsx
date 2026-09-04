"use client";

import { getData } from "country-list";
import { Label } from "./ui/label";
import { Select } from "./ui/select";

const countries = getData().sort((a, b) => a.name.localeCompare(b.name));

export function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="country">Country (optional)</Label>
      <Select id="country" value={value} onChange={(event) => onChange(event.target.value)}>
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
