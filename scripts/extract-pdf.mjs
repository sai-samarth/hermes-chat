import { readFile } from "node:fs/promises";

import { PDFParse } from "pdf-parse";

const targetPath = process.argv[2];

if (!targetPath) {
  console.error("Usage: node scripts/extract-pdf.mjs <pdf-path>");
  process.exit(1);
}

const buffer = await readFile(targetPath);
const parser = new PDFParse({ data: buffer });

try {
  const result = await parser.getText();
  process.stdout.write(result.text || "");
} finally {
  await parser.destroy();
}
