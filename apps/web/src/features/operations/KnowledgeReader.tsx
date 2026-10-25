import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { KnowledgeDocument } from '@asterbyte/contracts';

const DocumentText = ({ text }: { text: string }) => (
  <article className="knowledge-prose">
    {text
      .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
      .split(/\n\s*\n/)
      .map((block, index) => {
        if (/^#{1,2} /.test(block)) return <h3 key={index}>{block.replace(/^#+ /, '')}</h3>;
        if (/^#{3,6} /.test(block)) return <h4 key={index}>{block.replace(/^#+ /, '')}</h4>;
        if (block.startsWith('|')) {
          const rows = block.split('\n').filter((row) => !/^\|[\s:|-]+\|$/.test(row));
          return (
            <div className="table-scroll" key={index}>
              <table>
                {rows.map((row, i) => (
                  <tbody key={i}>
                    <tr>
                      {row
                        .split('|')
                        .slice(1, -1)
                        .map((cell, j) =>
                          i === 0 ? <th key={j}>{cell.trim()}</th> : <td key={j}>{cell.trim()}</td>,
                        )}
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>
          );
        }
        if (block.split('\n').every((line) => /^[-*] /.test(line)))
          return (
            <ul key={index}>
              {block.split('\n').map((line, i) => (
                <li key={i}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        return <p key={index}>{block}</p>;
      })}
  </article>
);
export const KnowledgeReader = ({
  id,
  load,
}: {
  id: string;
  load: (id: string, signal: AbortSignal) => Promise<KnowledgeDocument>;
}) => {
  const [document, setDocument] = useState<KnowledgeDocument | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setDocument(value);
          setError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load this document.');
      });
    return () => controller.abort();
  }, [id, load, attempt]);
  const download = () => {
    if (!document) return;
    const url = URL.createObjectURL(
      new Blob([document.content_markdown], { type: 'text/markdown;charset=utf-8' }),
    );
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${document.document_key.replace(/[^a-z0-9_-]/gi, '-')}-v${document.version.replace(/[^a-z0-9_.-]/gi, '-')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="document-reader">
      <div className="document-reader-heading">
        <h3>Document</h3>
        <button type="button" className="detail-link" disabled={!document} onClick={download}>
          <Download size={15} /> Download Markdown
        </button>
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="detail-link" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : document ? (
        <>
          <DocumentText text={document.content_markdown} />
          <details className="technical-details">
            <summary>File checksum</summary>
            <p className="mono">SHA-256: {document.content_sha256}</p>
          </details>
        </>
      ) : (
        <p role="status">Loading document…</p>
      )}
    </section>
  );
};
