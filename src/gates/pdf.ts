/**
 * The page count of an uncompressed-object PDF, as Typst writes it: one `/Type /Page` dictionary per page. Read
 * from the bytes so the gate needs no system tool in CI. A PDF that hides its objects in compressed object streams
 * cannot be counted this way and fails loudly rather than passing.
 */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString('latin1');
  if (!text.startsWith('%PDF-')) throw new Error('not a PDF');
  if (/\/Type\s*\/ObjStm\b/.test(text)) throw new Error('the PDF keeps its objects in compressed streams; count its pages another way');
  const pages = text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
  if (pages === 0) throw new Error('the PDF has no page objects');
  return pages;
}
