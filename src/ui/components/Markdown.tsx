import { Fragment, type ReactNode } from 'react';

/** Render inline **bold** segments. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Minimal markdown: paragraphs, **bold**, and `-`/`1.` lists. Not a full parser. */
export function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n\n+/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isBullet = lines.every((l) => /^- /.test(l));
        const isNumbered = lines.every((l) => /^\d+\.\s/.test(l));

        if (isBullet) {
          return (
            <ul key={bi} className="md-list">
              {lines.map((l, i) => <li key={i}>{inline(l.replace(/^- /, ''))}</li>)}
            </ul>
          );
        }
        if (isNumbered) {
          return (
            <ol key={bi} className="md-list">
              {lines.map((l, i) => <li key={i}>{inline(l.replace(/^\d+\.\s/, ''))}</li>)}
            </ol>
          );
        }
        return <p key={bi} className="md-p">{inline(block)}</p>;
      })}
    </>
  );
}
