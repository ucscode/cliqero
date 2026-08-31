import { z } from "zod";
import { apiError } from "../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema = z.object({
  email: z.email(),
  handle: z.string().min(3).max(32),
  password: z.string().min(12),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
});
export async function POST(request: Request) {
  try {
    const account = await getContainer().authentication.register(
      bodySchema.parse(await request.json()),
    );
    return Response.json(
      { id: account.id, email: account.email, handle: account.handle, country: account.country },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
