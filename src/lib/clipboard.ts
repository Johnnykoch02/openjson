export function formatValueForClipboard(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export async function copyValueToClipboard(value: unknown): Promise<void> {
  const text = formatValueForClipboard(value);
  await navigator.clipboard.writeText(text);
}
