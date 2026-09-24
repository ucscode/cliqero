export function configurationEnvelope(parameters: string, imports?: string): string {
  const body = parameters
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
  const importSection = imports === undefined ? "" : `imports:${imports}\n`;
  return `${importSection}parameters:\n${body}\n`;
}
