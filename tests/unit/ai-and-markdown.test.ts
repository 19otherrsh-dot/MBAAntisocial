import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from '@/components/ui/Markdown';
import { streamAsText } from '@/lib/ai';
import { ApiError } from '@/lib/api/errors';

type Part = { type: string; text?: string; error?: unknown };

function source(parts: Part[]) {
  return {
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
  };
}

test('streamAsText sends model text as plain text', async () => {
  const response = await streamAsText(
    source([
      { type: 'start' },
      { type: 'text-delta', text: 'Size the market ' },
      { type: 'text-delta', text: 'in ₹.' },
      { type: 'finish' },
    ])
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/plain/);
  assert.equal(await response.text(), 'Size the market in ₹.');
});

test('a model failure before any text becomes a real error status', async () => {
  // A retired model id or a bad key used to produce a 200 with an empty body.
  await assert.rejects(
    streamAsText(source([{ type: 'start' }, { type: 'error', error: new Error('model not found') }])),
    (error: unknown) => error instanceof ApiError && error.status === 502
  );
  await assert.rejects(streamAsText(source([{ type: 'finish' }])), ApiError);
});

test('Markdown renders structure and never injects HTML', () => {
  const html = renderToStaticMarkup(
    createElement(
      Markdown,
      null,
      '## Fix these\n- **Quantify** it\n- <img src=x onerror=alert(1)>\n\n`code` and *em*'
    )
  );
  assert.match(html, /<h4>Fix these<\/h4>/);
  assert.match(html, /<li><strong>Quantify<\/strong> it<\/li>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<em>em<\/em>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
