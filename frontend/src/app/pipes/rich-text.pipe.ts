import { Pipe, PipeTransform } from '@angular/core';

const TAG_RE = /<\/?[a-z][^>]*>/i;

/** True when the string contains at least one HTML tag. */
export function hasHtmlTags(value: string | null | undefined): boolean {
  return !!value && TAG_RE.test(value);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Strips HTML to plain text (block ends / <br> become spaces) without touching
 * the DOM, so it is safe to use for previews. Plain-text input is unchanged.
 */
export function stripHtml(value: string | null | undefined): string {
  if (!value) return '';
  if (!hasHtmlTags(value) && !value.includes('&')) return value;
  const withBreaks = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n');
  const noTags = withBreaks.replace(/<[^>]*>/g, '');
  return decodeEntities(noTags).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Plain-text preview: strip tags, collapse newlines to spaces, truncate with an ellipsis. */
export function previewText(value: string | null | undefined, max: number): string {
  const text = stripHtml(value).replace(/\s*\n\s*/g, ' ');
  return text.length > max ? text.slice(0, max).trimEnd() + '...' : text;
}

/**
 * True when rich-text editor output has no visible text. Quill yields
 * '<p><br></p>' for an empty editor; whitespace-only counts as empty too.
 */
export function isEmptyRichText(value: string | null | undefined): boolean {
  return stripHtml(value).trim() === '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Prepares a stored message for [innerHTML]. Messages that already contain HTML
 * are returned as-is; legacy plain-text messages are escaped and their newlines
 * kept as <br>. Angular's built-in sanitizer still runs on the result.
 */
export function toDisplayHtml(value: string | null | undefined): string {
  if (!value) return '';
  if (hasHtmlTags(value)) return value;
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

@Pipe({ name: 'stripHtml' })
export class StripHtmlPipe implements PipeTransform {
  /** Usage: {{ msg | stripHtml }} or {{ msg | stripHtml:80 }} (truncated preview). */
  transform(value: string | null | undefined, max?: number): string {
    return max ? previewText(value, max) : stripHtml(value);
  }
}

@Pipe({ name: 'richText' })
export class RichTextPipe implements PipeTransform {
  /** Usage: <div [innerHTML]="msg | richText"></div> */
  transform(value: string | null | undefined): string {
    return toDisplayHtml(value);
  }
}
