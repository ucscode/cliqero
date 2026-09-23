import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";
import { CommissionPolicy } from "@/modules/referral/commission";

const percentageValue = z.number().int().min(0).max(100);
export function commissionPolicyFromYaml(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("distribution.commission.levels configuration is required");
  const distribution = (value as Record<string, unknown>).distribution;
  if (!distribution || typeof distribution !== "object" || Array.isArray(distribution))
    throw new Error("distribution configuration is required");
  const platform = (distribution as Record<string, unknown>).platform;
  if (!platform || typeof platform !== "object" || Array.isArray(platform))
    throw new Error("distribution.platform configuration is required");
  if (!Object.prototype.hasOwnProperty.call(platform, "percentage"))
    throw new Error("distribution.platform.percentage configuration is required");
  const platformPercentage = percentageValue.parse(
    (platform as Record<string, unknown>).percentage,
  );
  const commission = (distribution as Record<string, unknown>).commission;
  if (!commission || typeof commission !== "object" || Array.isArray(commission))
    throw new Error("distribution.commission configuration is required");
  if (!Object.prototype.hasOwnProperty.call(commission, "levels"))
    throw new Error("distribution.commission.levels configuration is required");
  const levels = (commission as Record<string, unknown>).levels;
  if (levels === null) return new CommissionPolicy([], "percentage", platformPercentage);
  if (typeof levels !== "object" || Array.isArray(levels))
    throw new Error("distribution.commission.levels must be a YAML mapping");
  const entries = Object.entries(levels)
    .map(([key, raw]) => {
      if (!/^\d+$/.test(key) || Number(key) < 1)
        throw new Error("Commission levels must be positive integers starting at 1");
      return { level: Number(key), percentage: percentageValue.parse(raw) };
    })
    .sort((a, b) => a.level - b.level);
  return CommissionPolicy.fromPercentages(entries, platformPercentage);
}
export function loadYamlCommissionPolicy(path = "config/hierarchy/distribution.yaml") {
  return commissionPolicyFromYaml(loadYamlConfiguration(path, process.env, { required: true }));
}
