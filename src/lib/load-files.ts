import type { DocumentMeta, FileLoadError, OpenFilesResult } from "../types";

function parseErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function formatLoadErrors(errors: FileLoadError[], openedCount: number): string {
  const details = errors.map((e) => `${e.name} (${e.message})`).join("; ");
  if (openedCount > 0) {
    const openedLabel = openedCount === 1 ? "1 file" : `${openedCount} files`;
    const failedLabel = errors.length === 1 ? "1 file" : `${errors.length} files`;
    return `Opened ${openedLabel}. Failed to load ${failedLabel}: ${details}`;
  }
  const failedLabel = errors.length === 1 ? "1 file" : `${errors.length} files`;
  return `Failed to load ${failedLabel}: ${details}`;
}

export async function loadBrowserFiles(
  loadOne: (file: File) => Promise<DocumentMeta>,
  files: File[],
): Promise<OpenFilesResult> {
  const opened: DocumentMeta[] = [];
  const errors: FileLoadError[] = [];

  for (const file of files) {
    try {
      opened.push(await loadOne(file));
    } catch (err) {
      errors.push({ name: file.name, message: parseErrorMessage(err) });
    }
  }

  return { opened, errors };
}

export async function loadBrowserTexts(
  loadOne: (name: string, text: string) => Promise<DocumentMeta>,
  files: File[],
): Promise<OpenFilesResult> {
  const opened: DocumentMeta[] = [];
  const errors: FileLoadError[] = [];

  for (const file of files) {
    try {
      const text = await file.text();
      opened.push(await loadOne(file.name, text));
    } catch (err) {
      errors.push({ name: file.name, message: parseErrorMessage(err) });
    }
  }

  return { opened, errors };
}
