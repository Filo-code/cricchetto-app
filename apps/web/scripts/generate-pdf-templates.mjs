#!/usr/bin/env node
/**
 * Generates AcroForm PDF templates for the Cricchetto document system.
 *
 * Each template has properly sized multiline fields — legal_text is 510pt
 * tall on page 2, reported_issue is 90pt, items/parts/labor are 80/72/72pt.
 * All templates use a 2-page layout.
 *
 * Usage (from monorepo root):
 *   node apps/web/scripts/generate-pdf-templates.mjs [output-dir]
 *
 * Default output: apps/web/templates/generated/
 *   intake_acceptance.pdf
 *   estimate.pdf
 *   final_summary.pdf
 *
 * After generating, upload via Cricchetto dashboard > Impostazioni > Documenti
 * or directly to Supabase Storage bucket "document-templates" at path:
 *   {workshopId}/templates/{document_type}/template-{timestamp}.pdf
 * then set is_active = true in workshop_document_templates.
 */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb } = require("../../../node_modules/pdf-lib/cjs/index.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(process.argv[2] ?? join(__dirname, "..", "templates", "generated"));
mkdirSync(outputDir, { recursive: true });

// ─── Layout constants ────────────────────────────────────────────────────────

const PAGE_W = 595;
const PAGE_H = 842;
const M = 50;          // margin
const W = 495;         // content width
const C_TEXT  = rgb(0.10, 0.10, 0.10);
const C_LABEL = rgb(0.50, 0.50, 0.50);
const C_SEP   = rgb(0.82, 0.82, 0.82);
const C_BORD  = rgb(0.72, 0.72, 0.72);
const C_BG    = rgb(0.975, 0.975, 0.975);
const C_BGML  = rgb(0.96,  0.96,  0.96);

// ─── Template builder ────────────────────────────────────────────────────────

async function buildTemplate(docType) {
  const pdfDoc  = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form    = pdfDoc.getForm();

  const isIntake   = docType === "intake_acceptance";
  const isEstimate = docType === "estimate";
  const isFinal    = docType === "final_summary";

  const TITLE = isIntake ? "ACCETTAZIONE VEICOLO"
              : isEstimate ? "PREVENTIVO"
              : "RIEPILOGO FINALE";

  // ── Helpers ──────────────────────────────────────────────────────────────

  const lbl = (page, text, x, y, size = 7, font = regular, color = C_LABEL) =>
    page.drawText(text, { x, y, size, font, color });

  const hline = (page, y) =>
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: C_SEP });

  // y = bottom of field (PDF coordinate)
  const field = (name, page, x, y, w, h, fontSize = 10) => {
    const tf = form.createTextField(name);
    tf.addToPage(page, {
      x, y, width: w, height: h,
      font: regular,
      borderColor: C_BORD,
      borderWidth: 0.5,
      backgroundColor: C_BG,
    });
    tf.setFontSize(fontSize);
  };

  const mlfield = (name, page, x, y, w, h, fontSize = 9) => {
    const tf = form.createTextField(name);
    tf.enableMultiline();
    tf.enableScrolling();
    tf.addToPage(page, {
      x, y, width: w, height: h,
      font: regular,
      borderColor: C_BORD,
      borderWidth: 0.5,
      backgroundColor: C_BGML,
    });
    tf.setFontSize(fontSize);
  };

  // ── Page 1 ───────────────────────────────────────────────────────────────

  const p1 = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Title
  lbl(p1, TITLE, M, 810, 14, bold, C_TEXT);
  hline(p1, 804);

  // Workshop row 1: name + date
  lbl(p1, "Officina",        M,   793, 7);
  lbl(p1, "Data documento",  390, 793, 7);
  field("workshop_name",  p1, M,   771, 285, 20, 11);
  field("document_date",  p1, 390, 771, 155, 20, 10);

  // Workshop row 2: address / phone / email
  lbl(p1, "Indirizzo", M,   763, 7);
  lbl(p1, "Telefono",  230, 763, 7);
  lbl(p1, "Email",     330, 763, 7);
  field("workshop_address", p1, M,   746, 175, 15, 8);
  field("workshop_phone",   p1, 230, 746, 95,  15, 8);
  field("workshop_email",   p1, 330, 746, 215, 15, 8);

  // Workshop row 3: VAT + code
  lbl(p1, "P.IVA",         M,   738, 7);
  lbl(p1, "Codice scheda", 180, 738, 7);
  field("workshop_vat",  p1, M,   721, 125, 15, 8);
  field("public_code",   p1, 180, 721, 185, 15, 10);

  hline(p1, 714);

  // Client section
  lbl(p1, "CLIENTE", M, 706, 9, bold, C_TEXT);
  lbl(p1, "Nome cliente",  M,   696, 7);
  lbl(p1, "Telefono",      340, 696, 7);
  field("customer_name",  p1, M,   677, 285, 17, 10);
  field("customer_phone", p1, 340, 677, 205, 17, 10);

  hline(p1, 670);

  // Vehicle section
  lbl(p1, "VEICOLO", M, 662, 9, bold, C_TEXT);
  lbl(p1, "Targa",   M,   652, 7);
  lbl(p1, "Modello", 148, 652, 7);
  lbl(p1, "Km",      388, 652, 7);
  field("plate",         p1, M,   633, 93,  17, 10);
  field("vehicle_model", p1, 148, 633, 235, 17, 10);
  field("kilometers",    p1, 388, 633, 157, 17, 10);

  hline(p1, 626);

  // ── Type-specific content ────────────────────────────────────────────────

  if (isIntake) {
    lbl(p1, "PROBLEMA RIPORTATO", M, 617, 9, bold, C_TEXT);
    mlfield("reported_issue", p1, M, 524, W, 91, 10);

    hline(p1, 517);

    lbl(p1, "IMPORTI PREVENTIVATI", M, 508, 9, bold, C_TEXT);
    lbl(p1, "Subtotale ricambi:",   296, 494, 7, regular, C_LABEL);
    lbl(p1, "TOTALE:",              296, 469, 9, bold, C_TEXT);
    field("subtotal", p1, 400, 477, 145, 15, 10);
    field("total",    p1, 400, 454, 145, 18, 12);

    hline(p1, 447);

    lbl(p1, "AUTORIZZAZIONE", M, 438, 9, bold, C_TEXT);
    lbl(p1, "Il sottoscritto autorizza l'officina a procedere con le lavorazioni indicate.", M, 425, 8, regular, C_TEXT);
    lbl(p1, "Firma cliente: ___________________________________________", M,   390, 9, regular, C_TEXT);
    lbl(p1, "Data: ____________________", 365, 390, 9, regular, C_TEXT);

  } else {
    // estimate / final_summary
    lbl(p1, "VOCI DI COSTO", M, 617, 9, bold, C_TEXT);
    lbl(p1, "Riepilogo (ricambi + manodopera):", M, 607, 7);
    mlfield("items_text",  p1, M, 524, W, 81, 9);

    lbl(p1, "RICAMBI",     M, 516, 8, bold, C_TEXT);
    mlfield("parts_text",  p1, M, 441, W, 73, 9);

    lbl(p1, "MANODOPERA",  M, 433, 8, bold, C_TEXT);
    mlfield("labor_text",  p1, M, 358, W, 73, 9);

    hline(p1, 351);

    lbl(p1, "Subtotale:",  296, 339, 7, regular, C_LABEL);
    lbl(p1, "TOTALE:",     296, 315, 9, bold, C_TEXT);
    field("subtotal", p1, 370, 322, 175, 15, 10);
    field("total",    p1, 370, 298, 175, 18, 12);

    if (isFinal) {
      hline(p1, 290);
      lbl(p1, "PROBLEMA RIPORTATO", M, 281, 8, bold, C_TEXT);
      mlfield("reported_issue", p1, M, 225, W, 54, 9);
      hline(p1, 218);
      lbl(p1, "Firma per ricevuta ritiro: _________________________________", M, 198, 9, regular, C_TEXT);
      lbl(p1, "Data: ____________________", 365, 198, 9, regular, C_TEXT);
    } else {
      hline(p1, 290);
      lbl(p1, "Firma cliente per accettazione preventivo: _________________", M, 270, 9, regular, C_TEXT);
      lbl(p1, "Data: ____________________", 365, 270, 9, regular, C_TEXT);
    }
  }

  // Page 1 footer
  hline(p1, 68);
  lbl(p1, "Documento generato da Cricchetto  \xB7  Powered by Fil\xF2", M, 55, 7, regular, C_LABEL);

  // ── Page 2 ───────────────────────────────────────────────────────────────

  const p2 = pdfDoc.addPage([PAGE_W, PAGE_H]);

  lbl(p2, "CONDIZIONI GENERALI E NOTE", M, 810, 12, bold, C_TEXT);
  hline(p2, 803);

  // legal_text: large multiline — 510pt tall
  lbl(p2, "Condizioni:", M, 793, 8, bold, C_TEXT);
  mlfield("legal_text", p2, M, 278, W, 512, 9);

  hline(p2, 270);

  // footer_text: 180pt tall
  lbl(p2, "Note / Footer documento:", M, 260, 8, bold, C_TEXT);
  mlfield("footer_text", p2, M, 75, W, 182, 9);

  hline(p2, 67);
  lbl(p2, "Documento generato da Cricchetto  \xB7  Powered by Fil\xF2", M, 54, 7, regular, C_LABEL);

  return Buffer.from(await pdfDoc.save());
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  for (const docType of ["intake_acceptance", "estimate", "final_summary"]) {
    const bytes = await buildTemplate(docType);
    const outPath = join(outputDir, `${docType}.pdf`);
    writeFileSync(outPath, bytes);
    console.log(`  ${outPath}  (${bytes.length} bytes)`);
  }
  console.log("\nDone. Upload via Cricchetto dashboard > Impostazioni > Documenti");
  console.log("or directly to Supabase Storage bucket \x22document-templates\x22.");
}

main().catch((err) => {
  console.error("Template generation failed:", err.message);
  process.exit(1);
});
