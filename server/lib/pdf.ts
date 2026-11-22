/**
 * Minimal PDF 1.4 writer (P4.4) — text-only, A4, Helvetica, automatic page breaks. No dependency, no network.
 * Standard Type1 fonts cannot render Devanagari, so non-Latin-1 characters are transliterated to "?"; the
 * JSON version of the same report keeps the original text.
 */
export interface PdfLine { text: string; size?: number; bold?: boolean; gap?: number }

const esc = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?").replace(/([\\()])/g, "\\$1");

export function renderPdf(lines: PdfLine[]): Buffer {
  const W = 595, H = 842, M = 50;
  const pages: string[] = [];
  let y = H - M, cur = "";
  const wrap = (t: string, size: number) => {
    const max = Math.floor((W - 2 * M) / (size * 0.5));
    const out: string[] = [];
    for (const para of t.split("\n")) {
      let line = "";
      for (const w of para.split(" ")) {
        if ((line + " " + w).trim().length > max) { out.push(line); line = w; } else line = (line + " " + w).trim();
      }
      out.push(line);
    }
    return out;
  };
  for (const l of lines) {
    const size = l.size ?? 10;
    for (const t of wrap(l.text, size)) {
      if (y < M + size) { pages.push(cur); cur = ""; y = H - M; }
      cur += `BT /${l.bold ? "F2" : "F1"} ${size} Tf ${M} ${y} Td (${esc(t)}) Tj ET\n`;
      y -= size * 1.35;
    }
    y -= l.gap ?? 2;
  }
  pages.push(cur);
  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((content, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`);
  });
  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(body, "latin1")); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
