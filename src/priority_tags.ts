import type { RichTextInterface } from '@remnote/plugin-sdk';

export type PriorityKey = 'VITAL' | 'IMPORTANT' | 'DETAIL';

export const PRIORITIES = [
  { key: 'VITAL', tagName: 'vital' },
  { key: 'IMPORTANT', tagName: 'important' },
  { key: 'DETAIL', tagName: 'detail' },
] as const;

const PRIORITY_PREFIX = /^\s*\[(VITAL|IMPORTANT|DETAIL)\](?=\s|$)/i;

export function priorityFromText(text: string): PriorityKey | undefined {
  const match = PRIORITY_PREFIX.exec(text);
  return match?.[1].toUpperCase() as PriorityKey | undefined;
}

export function richTextToPlainText(richText: RichTextInterface | undefined): string {
  if (!richText) return '';
  return richText
    .map((element) => {
      if (typeof element === 'string') return element;
      if ('text' in element && typeof element.text === 'string') return element.text;
      return '';
    })
    .join('');
}
