'use client';

import { InlineText } from './RichText';
import styles from './Markdown.module.css';

type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'para'; text: string };

/** Splits model output into blocks. Unknown syntax degrades to a paragraph. */
function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') });
    para = [];
  };
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: Math.min(4, Math.max(2, heading[1].length + 1)) as 2 | 3 | 4, text: heading[2] });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flush();
      blocks.push({ kind: 'rule' });
    } else if (bullet || numbered) {
      flush();
      const ordered = !bullet;
      const text = (bullet ?? numbered)![1];
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(text);
      else blocks.push({ kind: 'list', ordered, items: [text] });
    } else if (line.startsWith('> ')) {
      flush();
      blocks.push({ kind: 'quote', text: line.slice(2) });
    } else {
      // A continuation line of a list item stays with that item.
      const last = blocks[blocks.length - 1];
      if (!para.length && last?.kind === 'list' && /^\s{2,}/.test(raw)) last.items[last.items.length - 1] += ` ${line.trim()}`;
      else para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/**
 * Markdown for AI output: headings, lists, quotes, rules, and the inline
 * formatting RichText supports. Renders React elements only — no HTML path.
 */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.md}>
      {parse(text).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4';
            return <Tag key={i}><InlineText text={block.text} /></Tag>;
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return <Tag key={i}>{block.items.map((item, j) => <li key={j}><InlineText text={item} /></li>)}</Tag>;
          }
          case 'quote':
            return <blockquote key={i}><InlineText text={block.text} /></blockquote>;
          case 'rule':
            return <hr key={i} />;
          default:
            return <p key={i}><InlineText text={block.text} /></p>;
        }
      })}
    </div>
  );
}
