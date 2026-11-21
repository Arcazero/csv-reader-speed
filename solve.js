// csv-reader-speed: a faster drop-in for make.fun's own csv-reader 1.0.0.
//
// It answers exactly as csv-reader 1.0.0 does for every input {text, header}:
// {columns, rows, errors}. The reference reads one character at a time and
// builds every field a character at a time; this reader instead takes the
// fast road most lines allow and only falls back to a character-faithful
// reader for lines that hold a quote.
//
// Fast path (a line with no double quote in it): the whole line is sliced
// once and split on commas. A lone CR inside it is a stray CR (dropped, one
// stray_cr error each); a CR just before the line's LF is the CRLF ending.
// Slow path (a line holding a quote): a faithful port of csv-reader's
// reader, with its per-character scans replaced by indexOf jumps to the next
// delimiter or quote, so its answers stay identical on every broken case:
// doubled quotes, CRLF or lone CR inside quotes read as LF, junk after a
// closing quote, a quote that never closes read again as unquoted, short and
// long rows, blank lines holding no record.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. Dependency-free ES module, Node 22+.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let v = value;
    let added = 0;
    let p = pos;
    let ln = line;
    for (;;) {
      // The nearest of the three delimiters from p.
      let m = -1;
      let kind = 0;
      const c = text.indexOf(',', p);
      if (c !== -1) {
        m = c;
        kind = 1;
      }
      const n = text.indexOf('\n', p);
      if (n !== -1 && (m === -1 || n < m)) {
        m = n;
        kind = 2;
      }
      const r = text.indexOf('\r', p);
      if (r !== -1 && (m === -1 || r < m)) {
        m = r;
        kind = 3;
      }
      if (m === -1) {
        if (p < len) {
          v += text.slice(p);
          added += len - p;
        }
        pos = len;
        line = ln;
        return { value: v, ended: END, added };
      }
      if (kind === 1) {
        if (m > p) {
          v += text.slice(p, m);
          added += m - p;
        }
        pos = m + 1;
        line = ln;
        return { value: v, ended: COMMA, added };
      }
      if (kind === 2) {
        if (m > p) {
          v += text.slice(p, m);
          added += m - p;
        }
        pos = m + 1;
        line = ln + 1;
        return { value: v, ended: LINE_BREAK, added };
      }
      // A CR: a line break with the LF that follows it, else a stray CR.
      if (m + 1 < len && text.charCodeAt(m + 1) === 10) {
        if (m > p) {
          v += text.slice(p, m);
          added += m - p;
        }
        pos = m + 2;
        line = ln + 1;
        return { value: v, ended: LINE_BREAK, added };
      }
      if (m > p) {
        v += text.slice(p, m);
        added += m - p;
      }
      error('stray_cr');
      p = m + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let v = '';
    let p = pos + 1;
    let ln = line;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (q > p) {
        const seg = text.slice(p, q);
        if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) {
          v += seg;
        } else {
          // CRLF and a lone CR inside quotes are each one LF.
          let s = 0;
          for (let i = 0; i < seg.length; i++) {
            const ch = seg.charCodeAt(i);
            if (ch === 13) {
              v += seg.slice(s, i);
              v += '\n';
              ln += 1;
              if (i + 1 < seg.length && seg.charCodeAt(i + 1) === 10) i += 1;
              s = i + 1;
            } else if (ch === 10) {
              v += seg.slice(s, i);
              v += '\n';
              ln += 1;
              s = i + 1;
            }
          }
          if (s < seg.length) v += seg.slice(s);
        }
      }
      if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
        v += '"';
        p = q + 2;
        continue;
      }
      // The closing quote is at q.
      p = q + 1;
      if (p >= len) {
        pos = p;
        line = ln;
        return { value: v, ended: END, added: 0 };
      }
      const c = text.charCodeAt(p);
      if (c === 44) {
        pos = p + 1;
        line = ln;
        return { value: v, ended: COMMA, added: 0 };
      }
      if (c === 10) {
        pos = p + 1;
        line = ln + 1;
        return { value: v, ended: LINE_BREAK, added: 0 };
      }
      if (c === 13 && p + 1 < len && text.charCodeAt(p + 1) === 10) {
        pos = p + 2;
        line = ln + 1;
        return { value: v, ended: LINE_BREAK, added: 0 };
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      pos = p;
      line = ln;
      const junk = readUnquoted(v);
      if (junk.added > 0) error('quote_junk');
      return junk;
    }
  }

  while (pos < len) {
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // The end of this physical line (the LF is not part of it).
    const nl = text.indexOf('\n', pos);
    const hasNL = nl !== -1;
    const lineEnd = hasNL ? nl : len;
    let segEnd = lineEnd;
    // A CR just before the LF is the CRLF ending, not a stray CR.
    if (hasNL && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13) segEnd = lineEnd - 1;

    if (segEnd === pos) {
      // A line left with no characters is no record.
      if (hasNL) {
        line += 1;
        pos = nl + 1;
        continue;
      }
      break;
    }

    const q = text.indexOf('"', pos);
    let fields;
    let quoted = false;
    if (q !== -1 && q < segEnd) {
      // Slow path: this line holds a quote, read it field by field.
      fields = [];
      let field;
      do {
        quoted = text.charCodeAt(pos) === 34;
        field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);
    } else {
      // Fast path: no quote in the line, so commas are the only separators
      // and every CR left in it is a stray one.
      const segment = text.slice(pos, segEnd);
      fields = segment.split(',');
      if (segment.indexOf('\r') !== -1) {
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          if (f.indexOf('\r') === -1) continue;
          let out = '';
          let start = 0;
          let count = 0;
          for (let j = 0; j < f.length; j++) {
            if (f.charCodeAt(j) === 13) {
              out += f.slice(start, j);
              start = j + 1;
              count += 1;
            }
          }
          out += f.slice(start);
          fields[i] = out;
          for (let k = 0; k < count; k++) error('stray_cr');
        }
      }
      if (hasNL) {
        line += 1;
        pos = nl + 1;
      } else {
        pos = len;
      }
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
