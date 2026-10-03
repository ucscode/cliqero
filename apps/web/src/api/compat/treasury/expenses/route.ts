export async function POST() {
  return Response.json(
    { error: "Use the Treasury adjustment workflow.", code: "gone" },
    { status: 410 },
  );
}
