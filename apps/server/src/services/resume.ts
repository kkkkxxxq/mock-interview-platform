import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export type ResumeParseResult = { text: string; encoding: string };

export function parseResume(fileName: string, buffer: Buffer): Promise<ResumeParseResult> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return parsePdf(buffer);
  if (lower.endsWith(".docx")) return parseDocx(buffer);
  if (lower.endsWith(".doc")) return Promise.reject(new Error("暂不支持旧版 .doc，请另存为 .docx 或 .pdf"));
  return Promise.reject(new Error("仅支持 PDF 与 Word（.docx）格式"));
}

async function parsePdf(buffer: Buffer): Promise<ResumeParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result?.text ?? result?.toString?.() ?? "";
    if (!text.trim()) throw new Error("该 PDF 无可提取的文本（可能是扫描件/图片型简历，需 OCR 支持）");
    return { text: text.trim(), encoding: "pdf" };
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer: Buffer): Promise<ResumeParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = (result?.value ?? "").trim();
  if (!text) throw new Error("该 Word 文件无可提取的文本");
  return { text, encoding: "docx" };
}