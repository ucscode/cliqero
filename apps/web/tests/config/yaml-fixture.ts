export function configurationEnvelope(parameters: string, imports = ""): string {
  const body = parameters
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
  return `imports:${imports}\nparameters:\n${body}\n`;
}
