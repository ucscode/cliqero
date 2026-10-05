import { POST as verifyDevelopmentFunding } from "@/api/compat/funding/development/verify/route";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";

export function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Promise.resolve(
      Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 }),
    );
  return verifyDevelopmentFunding(request);
}
