import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

const HTML_TAG = /<\/?[a-z][\s\S]*>/i;
const MARKDOWN_HINT =
  /(^|\n)\s{0,3}#{1,6}\s|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|(^|\n)\s*[-*+]\s+|(^|\n)\s*\d+\.\s+|```/;
const URL_RE = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;
const DOMAINISH_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i;

export type RichKind = "html" | "markdown" | "url" | "multiline" | "text";

export function looksLikeHtml(value: string): boolean {
  return HTML_TAG.test(value);
}

export function looksLikeMarkdown(value: string): boolean {
  return MARKDOWN_HINT.test(value);
}

export function isUrl(value: string): boolean {
  return URL_RE.test(value.trim());
}

export function isDomainish(value: string): boolean {
  const v = value.trim();
  return DOMAINISH_RE.test(v) && !v.includes(" ");
}

export function classifyString(value: string): RichKind {
  if (isUrl(value)) return "url";
  if (looksLikeHtml(value)) return "html";
  if (looksLikeMarkdown(value)) return "markdown";
  if (value.includes("\n")) return "multiline";
  return "text";
}

/** Render markdown or raw HTML to a sanitized HTML string for safe display. */
export function toSafeHtml(value: string, kind: "html" | "markdown"): string {
  const raw = kind === "html" ? value : (marked.parse(value, { async: false }) as string);
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });
}
