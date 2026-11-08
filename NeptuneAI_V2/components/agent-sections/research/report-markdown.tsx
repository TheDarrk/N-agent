import React from "react";
import type { SourceCitation } from "../research-panel";

const CITATION_PATTERN = /(\[S\d+(?:\s*,\s*S?\d+)*\])/g;
const CITATION_MATCH = /^\[S(\d+(?:\s*,\s*S?\d+)*)\]$/;

const chipClass =
  "mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-purple-500/15 px-1 align-text-top text-[10px] font-semibold text-purple-700 no-underline transition-colors hover:bg-purple-500/30 dark:text-purple-300";

export function renderInline(text: string, sources: SourceCitation[] = []) {
  return text.split(CITATION_PATTERN).map((part, index) => {
    const citation = part.match(CITATION_MATCH);
    if (citation) {
      return citation[1].split(/\s*,\s*/).map((raw, citationIndex) => {
        const sourceNumber = Number(raw.replace(/^S/, ""));
        const source = sources.find((item) => item.index === sourceNumber) ?? sources[sourceNumber - 1];
        const key = `${index}-${citationIndex}`;
        if (!source) {
          return (
            <span key={key} className={chipClass}>
              {sourceNumber}
            </span>
          );
        }
        return (
          <a
            key={key}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            aria-label={`Source ${sourceNumber}: ${source.title}`}
            className={chipClass}
          >
            {sourceNumber}
          </a>
        );
      });
    }

    return part.split(/(\*\*[^*]+\*\*)/g).map((piece, pieceIndex) =>
      piece.startsWith("**") && piece.endsWith("**") ? (
        <strong key={`${index}-${pieceIndex}`} className="font-semibold text-foreground">
          {piece.slice(2, -2)}
        </strong>
      ) : (
        <React.Fragment key={`${index}-${pieceIndex}`}>{piece}</React.Fragment>
      ),
    );
  });
}

export function FormattedMarkdown({ text, sources = [] }: { text: string; sources?: SourceCitation[] }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-muted-foreground">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const isTableStart =
          trimmed.startsWith("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1]);
        if (isTableStart) {
          const headers = trimmed.split("|").slice(1, -1).map((cell) => cell.trim());
          let end = index + 2;
          while (end < lines.length && lines[end].trim().startsWith("|")) end += 1;
          const rows = lines
            .slice(index + 2, end)
            .map((row) => row.trim().split("|").slice(1, -1).map((cell) => cell.trim()));
          return (
            <div key={index} className="overflow-x-auto rounded-lg border border-border/70">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-secondary/70">
                  <tr>
                    {headers.map((header, h) => (
                      <th key={h} className="px-3 py-2 font-semibold text-foreground">
                        {renderInline(header, sources)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r} className="border-t border-border/60">
                      {row.map((cell, c) => (
                        <td key={c} className="px-3 py-2 align-top">
                          {renderInline(cell, sources)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (trimmed.startsWith("|")) return null;
        if (/^\s*\|?\s*:?-{2,}/.test(trimmed) && lines[index - 1]?.trim().startsWith("|")) return null;

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          const isMajor = heading[1].length <= 2;
          const Heading = isMajor ? "h3" : "h4";
          return (
            <Heading
              key={index}
              className={`${isMajor ? "pt-4 text-lg" : "pt-3 text-base"} font-bold text-foreground text-balance`}
            >
              {renderInline(heading[2], sources)}
            </Heading>
          );
        }
        if (/^[-*] /.test(trimmed)) {
          return (
            <li key={index} className="ml-4 list-disc">
              {renderInline(trimmed.slice(2), sources)}
            </li>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote key={index} className="border-l-2 border-purple-400/60 pl-3 italic">
              {renderInline(trimmed.slice(2), sources)}
            </blockquote>
          );
        }
        return <p key={index}>{renderInline(trimmed, sources)}</p>;
      })}
    </div>
  );
}
