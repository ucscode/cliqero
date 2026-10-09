import path from "node:path";

export function composeArgumentsForEnvironment(environment) {
  if (environment === "development") return ["compose"];
  if (environment === "production") return ["compose", "-p", "cliqero-prod", "-f", "compose.yaml"];
  throw new Error("Backup verification environment must be development or production.");
}

export function resolvePostgresImage(environment, run) {
  const composeArguments = composeArgumentsForEnvironment(environment);
  const output = run("docker", [...composeArguments, "config", "--format", "json"], {
    capture: true,
  });
  const configuration = JSON.parse(output);
  const expectedMode = environment;
  if (configuration.services?.postgres?.environment?.CLIQERO_DEPLOYMENT_MODE !== expectedMode)
    throw new Error("Selected Compose configuration does not match the verification environment.");
  const image = configuration.services?.postgres?.image;
  if (typeof image !== "string" || !image)
    throw new Error("Selected Compose configuration has no PostgreSQL utility image.");
  return image;
}

export function postgresArchiveInspectionArguments(directory, image) {
  return [
    "run",
    "--rm",
    "--network",
    "none",
    "-v",
    `${path.resolve(directory)}:/verify:ro`,
    "--entrypoint",
    "pg_restore",
    image,
    "--list",
    "/verify/postgres.dump",
  ];
}
