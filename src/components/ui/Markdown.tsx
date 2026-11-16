import { Fragment, type ReactNode } from 'react';

/**
 * A deliberately small Markdown renderer for model output: headings, bullet
 * and numbered lists, block quotes, **bold**, *italic*, and `code`.
 *
 * Everything is built as React elements — nothing is ever injected as HTML —
 * so whatever a model (or a resume it is quoting) puts in the text is rendered
 * as text. That is the reason this exists instead of a Markdown library piped
 * through `dangerouslySetInnerHTML`.
 */

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (
      part.length > 2 &&
      ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))
    ) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote' | 'p'; text: string };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);

    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)![1];
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(text);
      else blocks.push({ kind, items: [text] });
    } else if (quote) {
      flush();
      blocks.push({ kind: 'quote', text: quote[1] });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      {parse(children).map((block, index) => {
        if (block.kind === 'heading') {
          // Model headings are demoted: this sits inside a page that has its own.
          const Tag = block.level <= 2 ? 'h4' : 'h5';
          return <Tag key={index}>{inline(block.text)}</Tag>;
        }
        if (block.kind === 'ul' || block.kind === 'ol') {
          const Tag = block.kind;
          return (
            <Tag key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </Tag>
          );
        }
        if (block.kind === 'quote') return <blockquote key={index}>{inline(block.text)}</blockquote>;
        if (block.kind === 'p') return <p key={index}>{inline(block.text)}</p>;
        return null;
      })}
    </div>
  );
}
