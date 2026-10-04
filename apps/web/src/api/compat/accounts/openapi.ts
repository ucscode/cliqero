import { defineCompatibilityContracts } from "@/api/openapi/compatibility";

export const compatibilityContracts = defineCompatibilityContracts({
  "POST /api/accounts": {
    successStatus: "201",
  },
});
