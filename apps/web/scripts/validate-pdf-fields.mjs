#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PDFDocument } = require("../../../node_modules/pdf-lib/cjs/index.js");
const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIRED_ALL = [
  "workshop_name","public_code","plate","vehicle_model","customer_name","customer_phone",
  "kilometers","document_date","legal_text","footer_text","workshop_vat",
  "workshop_address","workshop_phone","workshop_email","subtotal","total",
];
const REQUIRED_ITEMS = ["items_text","parts_text","labor_text"];
const REQUIRED_ISSUE = ["reported_issue"];

const templates = [
  { name: "intake_acceptance", requiredExtra: REQUIRED_ISSUE },
  { name: "estimate",          requiredExtra: REQUIRED_ITEMS },
  { name: "final_summary",     requiredExtra: [...REQUIRED_ITEMS, ...REQUIRED_ISSUE] },
];

let anyFail = false;
for (const { name, requiredExtra } of templates) {
  const path = join(__dirname, "..", "templates", "generated", `${name}.pdf`);
  const bytes = readFileSync(path);
  const doc = await PDFDocument.load(bytes);
  const fieldNames = doc.getForm().getFields().map((f) => f.getName());
  const required = [...REQUIRED_ALL, ...requiredExtra];
  const missing = required.filter((f) => !fieldNames.includes(f));

  console.log(`\n=== ${name} (${fieldNames.length} fields) ===`);
  console.log(`  ${fieldNames.join(", ")}`);
  if (missing.length) {
    console.log(`  MISSING: ${missing.join(", ")}`);
    anyFail = true;
  } else {
    console.log(`  OK — all ${required.length} required fields present`);
  }
}

if (anyFail) process.exit(1);
console.log("\nAll templates valid.");
