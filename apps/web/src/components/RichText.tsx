'use client';

import { Fragment } from 'react';

/**
 * Safe rich text for user content: **bold**, *italic*, `code`, ```blocks```,
 * links, and mention tokens (`<@id>`, `<@&roleId>`, `<#channelId>`). Everything
 * renders as React elements — there is no HTML injection path at all.
 */
export interface MentionResolver {
  user?: (id: string) => string | undefined;
  role?: (id: string) => { name: string; color?: string } | undefined;
  channel?: (id: string) => string | undefined;
  selfId?: string;
}

const TOKEN = /(```[\s\S]+?```|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|<@&?[a-f0-9]{24}>|<#[a-f0-9]{24}>|https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

function renderInline(text: string, resolver: MentionResolver, keyPrefix: string) {
  const parts = text.split(TOKEN);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (part.startsWith('```') && part.endsWith('```')) {
      return <pre key={key} className="rt-pre"><code>{part.slice(3, -3).replace(/^\w*\n/, '')}</code></pre>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key} className="rt-code">{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.startsWith('<@&')) {
      const role = resolver.role?.(part.slice(3, -1));
      return <span key={key} className="rt-mention" style={role?.color ? { color: role.color } : undefined}>@{role?.name ?? 'role'}</span>;
    }
    if (part.startsWith('<@')) {
      const id = part.slice(2, -1);
      return <span key={key} className={id === resolver.selfId ? 'rt-mention rt-mention-self' : 'rt-mention'}>@{resolver.user?.(id) ?? 'member'}</span>;
    }
    if (part.startsWith('<#')) return <span key={key} className="rt-mention">#{resolver.channel?.(part.slice(2, -1)) ?? 'channel'}</span>;
    if (/^https?:\/\//.test(part)) {
      return <a key={key} href={part} target="_blank" rel="noopener noreferrer nofollow" className="rt-link">{part.length > 60 ? `${part.slice(0, 57)}…` : part}</a>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export default function RichText({ text, resolver = {} }: { text: string; resolver?: MentionResolver }) {
  // Code blocks may span lines, so split on them before splitting lines.
  const blocks = text.split(/(```[\s\S]+?```)/g);
  return (
    <>
      {blocks.map((block, b) =>
        block.startsWith('```') ? (
          <Fragment key={b}>{renderInline(block, resolver, `b${b}`)}</Fragment>
        ) : (
          block.split('\n').map((line, l, all) => (
            <Fragment key={`${b}-${l}`}>
              {line.startsWith('> ') ? <span className="rt-quote">{renderInline(line.slice(2), resolver, `${b}-${l}`)}</span> : renderInline(line, resolver, `${b}-${l}`)}
              {l < all.length - 1 && <br />}
            </Fragment>
          ))
        )
      )}
    </>
  );
}
