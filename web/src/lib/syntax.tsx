import React from 'react';

interface Token {
  type: 'plain' | 'kw' | 'str' | 'num' | 'prop' | 'tag' | 'comment' | 'punct';
  text: string;
}

const KEYWORDS = new Set([
  'import', 'export', 'from', 'function', 'return', 'const', 'let', 'var',
  'interface', 'type', 'struct', 'class', 'extends', 'override', 'fun',
  'super', 'new', 'true', 'false', 'null', 'undefined', 'some', 'View',
  'Widget', 'BuildContext', 'StatelessWidget', 'Composable', 'script', 'setup'
]);

function tokenizeLine(line: string): Token[] {
  const out: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Line comment // or /* ... */ or <!-- ... -->
    if (line.startsWith('//', i) || line.startsWith('/*', i) || line.startsWith('<!--', i)) {
      out.push({ type: 'comment', text: line.slice(i) });
      break;
    }

    // Strings
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(line.length, j + 1);
      out.push({ type: 'str', text: line.slice(i, j) });
      i = j;
      continue;
    }

    // HTML / JSX tags
    if (line[i] === '<' && /^<\/?[A-Za-z][A-Za-z0-9_-]*/.test(line.slice(i))) {
      const m = line.slice(i).match(/^<\/?[A-Za-z][A-Za-z0-9_-]*/)!;
      out.push({ type: 'tag', text: m[0] });
      i += m[0].length;
      continue;
    }

    // Hex colors (#10B981)
    if (line[i] === '#' && /^#[0-9a-fA-F]{3,8}\b/.test(line.slice(i))) {
      const m = line.slice(i).match(/^#[0-9a-fA-F]{3,8}/)!;
      out.push({ type: 'str', text: m[0] });
      i += m[0].length;
      continue;
    }

    // CSS property or object key before :
    if (/^[a-zA-Z_-][a-zA-Z0-9_-]*\s*:/.test(line.slice(i))) {
      const m = line.slice(i).match(/^([a-zA-Z_-][a-zA-Z0-9_-]*)/)!;
      out.push({ type: 'prop', text: m[1] });
      i += m[1].length;
      continue;
    }

    // Numbers with units (16px, 1.5rem, 400, 12.dp)
    if (/^\d+(\.\d+)?(px|rem|em|%|dp|sp)?\b/.test(line.slice(i))) {
      const m = line.slice(i).match(/^\d+(\.\d+)?(px|rem|em|%|dp|sp)?/)!;
      out.push({ type: 'num', text: m[0] });
      i += m[0].length;
      continue;
    }

    // Words / keywords / JSX attributes
    if (/^[A-Za-z_@$][A-Za-z0-9_-]*/.test(line.slice(i))) {
      const m = line.slice(i).match(/^[A-Za-z_@$][A-Za-z0-9_-]*/)!;
      const word = m[0];
      const nextChar = line[i + word.length];
      if (KEYWORDS.has(word) || word.startsWith('@')) {
        out.push({ type: 'kw', text: word });
      } else if (nextChar === '=') {
        out.push({ type: 'prop', text: word });
      } else {
        out.push({ type: 'plain', text: word });
      }
      i += word.length;
      continue;
    }

    // Punctuation
    if (/[{}()[\];:,=<>/.+-]/.test(line[i])) {
      out.push({ type: 'punct', text: line[i] });
      i++;
      continue;
    }

    // Whitespace or other
    let j = i + 1;
    while (j < line.length && /\s/.test(line[j])) j++;
    out.push({ type: 'plain', text: line.slice(i, j) });
    i = j;
  }

  return out;
}

export const SyntaxCode: React.FC<{ code: string; showLineNumbers?: boolean }> = ({
  code,
  showLineNumbers = true
}) => {
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <div className="syn-code mono">
      {lines.map((line, idx) => (
        <div key={idx} className="syn-row">
          {showLineNumbers && <span className="syn-ln">{idx + 1}</span>}
          <span className="syn-line">
            {tokenizeLine(line).map((tok, ti) => (
              <span key={ti} className={`tok-${tok.type}`}>
                {tok.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
};
