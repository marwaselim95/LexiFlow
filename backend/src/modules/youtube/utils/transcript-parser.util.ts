// Transcript XML parsing (srv3 and classic formats) and HTML entity decoding.

import { CaptionLine } from '../types/caption-line.interface';

export function parseTranscriptXml(xml: string): CaptionLine[] {
  const results: CaptionLine[] = [];

  // srv3 format first: <p t="ms" d="ms">...<s>word</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];

    let text = '';
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) text = inner.replace(/<[^>]+>/g, '');

    text = decodeEntities(text).replace(/\n/g, ' ').trim();
    if (text) results.push({ startMs, endMs: startMs + durMs, text });
  }

  if (results.length > 0) return results;

  // Classic format fallback
  const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  while ((match = textRegex.exec(xml)) !== null) {
    const startSec = parseFloat(match[1]);
    const durSec = parseFloat(match[2]);
    const startMs = Math.round(startSec * 1000);
    const endMs = Math.round((startSec + durSec) * 1000);
    const text = decodeEntities(match[3]).replace(/\n/g, ' ').trim();
    if (text) results.push({ startMs, endMs, text });
  }

  return results;
}

export function decodeEntities(text: string): string {
  // This function decodes HTML entities in the provided text string. It replaces common HTML entity representations with their corresponding characters. For example, it converts "&amp;" to "&", "&lt;" to "<", and so on.
  // It also handles numeric character references in both decimal and hexadecimal formats, converting them to their respective Unicode characters. The function returns the decoded string.
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}
