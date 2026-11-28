/**
 * proposalRenderer.ts — turns one lead plus the operator's offer into a client
 * proposal, rendered to PDF and DOCX.
 *
 * Design rules:
 *   - The content is built from data that already exists: the lead row, the
 *     Places record (name/address/phone/website), and the operator's service
 *     list. Nothing is invented; an unknown field is left out, not filled in.
 *   - The rendered file is a DRAFT until the owner approves it. The footer says
 *     so, and the row is saved with status DRAFT.
 *   - PDF is produced by Puppeteer from the same HTML a browser would show, so
 *     Arabic wording keeps its joined letters and brand fonts apply.
 *   - DOCX is written as a minimal OOXML package (stored, not compressed), so the
 *     file opens in Word and Google Docs without adding a dependency.
 */

import fs from "fs";
import path from "path";

export interface ProposalLead {
  lead_id?: string;
  name?: string;
  title?: string;
  company?: string;
  industry?: string;
  website?: string;
  email?: string;
  phone?: string;
  city?: string;
}

export interface ProposalService {
  name: string;
  description: string;
  amount?: string;
}

export interface ProposalContent {
  title: string;
  intro: string;
  scope: string[];
  services: ProposalService[];
  pricing: { item: string; amount: string; note?: string }[];
  terms: string;
  footer: string;
  locale: "en" | "ar";
  draft: boolean;
  brand?: { name?: string; tagline?: string; email?: string; phone?: string; website?: string; address?: string; logo?: string };
  vision2030: string | null;
  majlisTips: string[];
}

export interface ProposalInput {
  lead: ProposalLead;
  operator: { name?: string; email?: string; service?: string };
  locale?: "en" | "ar";
  services?: ProposalService[];
  brand?: { name?: string; tagline?: string; email?: string; phone?: string; website?: string; address?: string; logo?: string };
  vision2030?: string;
  majlisTips?: string[];
}

const DEFAULT_SERVICES_EN: ProposalService[] = [
  { name: "Lead discovery", description: "Verified companies matching your ideal customer profile in your city and sector." },
  { name: "Contact verification", description: "Every email checked before it reaches your team; failed contacts are replaced." },
  { name: "Outreach", description: "Arabic and English first-touch messages with a consent and suppression check on every send." },
  { name: "Reporting", description: "A weekly view of leads found, contacts verified and replies received." },
];

const DEFAULT_SERVICES_AR: ProposalService[] = [
  { name: "اكتشاف العملاء", description: "شركات موثقة تطابق ملفكم المثالي في مدينتكم وقطاعكم." },
  { name: "التحقق من جهات الاتصال", description: "نفحص كل بريد قبل وصوله لفريقكم، ونستبدل أي جهة غير صالحة." },
  { name: "التواصل", description: "رسائل أولى بالعربية والإنجليزية مع فحص الموافقة وقائمة الاستبعاد قبل كل إرسال." },
  { name: "التقارير", description: "تقرير أسبوعي بالعملاء المكتشفين وجهات الاتصال الموثقة والردود." },
];

export function buildProposalContent(input: ProposalInput): ProposalContent {
  const { lead, operator, brand, vision2030, majlisTips } = input;
  const locale = input.locale === "ar" ? "ar" : "en";
  const company = (lead.company || lead.name || "your company").trim();
  const sector = (lead.industry || "").trim();
  const city = (lead.city || "").trim();
  const services = input.services?.length
    ? input.services
    : locale === "ar"
      ? DEFAULT_SERVICES_AR
      : DEFAULT_SERVICES_EN;

  const title =
    locale === "ar"
      ? `عرض استقطاب العملاء المحتملين — ${company}`
      : `Lead generation proposal — ${company}`;

  const intro =
    locale === "ar"
      ? `نشكر لكم اهتمامكم. أعددنا لكم هذا العرض لـ ${company}${sector ? ` في قطاع ${sector}` : ""}${city ? ` في مدينة ${city}` : ""}. الهدف بسيط: عملاء محتملون من مصادر عامة موثقة، ولا يُرسل أي تواصل قبل التحقق من الموافقة.`
      : `This proposal is prepared for ${company}${sector ? ` in ${sector}` : ""}${city ? `, ${city}` : ""}. The aim is simple: prospects from recorded public sources, and no outreach before a consent check.`;

  const scope =
    locale === "ar"
      ? [
          "تحديد ملف العميل المثالي وتأكيده معك قبل أول بحث.",
          "اكتشاف الشركات من مصادر عامة موثقة وإرفاق رابط المصدر لكل صف.",
          "التحقق من جهات الاتصال قبل تسليمها، واستبدال أي جهة غير صالحة.",
          "تسليم قائمة العملاء وقنوات التواصل المقترحة.",
        ]
      : [
          "Agree your ideal customer profile with you before the first search.",
          "Discover companies from public, attributable sources with a source link per row.",
          "Verify contacts before delivery, and replace any that fail.",
          "Hand over the lead list with the suggested outreach channel per contact.",
        ];

  const pricing = locale === "ar"
    ? [
        { item: "باقة البداية", amount: "يُحدد عند الاعتماد", note: "قائمة أسعار قيد الاعتماد" },
        { item: "باقة الفريق", amount: "يُحدد عند الاعتماد", note: "تشمل مقاعد وقنوات إضافية" },
      ]
    : [
        { item: "Starter plan", amount: "to be confirmed", note: "pricing pending owner approval" },
        { item: "Team plan", amount: "to be confirmed", note: "adds seats and channels" },
      ];

  const terms =
    locale === "ar"
      ? "المصادر عامة ومسجلة، ولا يُرسل أي تواصل دون أساس موافقة مسجل. يمكنكم طلب استبعاد أي جهة في أي وقت."
      : "Sources are public and recorded, and no message is sent without a recorded consent basis. You can request exclusion of any contact at any time.";

  const brandName = brand?.name?.trim() || operator.name?.trim() || "LeadJin";

  const footer =
    locale === "ar"
      ? `مسودة — بانتظار اعتماد الأسعار. أُعدت بواسطة ${brandName}.`
      : `Draft — pricing pending approval. Prepared by ${brandName}.`;

  return {
    title, intro, scope, services, pricing, terms, footer, locale, draft: true,
    brand: {
      name: brand?.name?.trim() || undefined,
      tagline: brand?.tagline?.trim() || undefined,
      email: brand?.email?.trim() || undefined,
      phone: brand?.phone?.trim() || undefined,
      website: brand?.website?.trim() || undefined,
      address: brand?.address?.trim() || undefined,
      logo: brand?.logo?.trim() || undefined,
    },
    vision2030: vision2030?.trim() || null,
    majlisTips: majlisTips?.length ? majlisTips : [],
  };
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderProposalHtml(content: ProposalContent, lead: ProposalLead): string {
  const rtl = content.locale === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const brandName = content.brand?.name?.trim() || "LeadJin";
  const row = (k: string, v?: string) =>
    v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : "";

  return `<!doctype html><html lang="${content.locale}" dir="${dir}"><head><meta charset="utf-8">
<style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: "Questrial", "Noto Naskh Arabic", "Amiri", "Helvetica", Arial, sans-serif; color:#141414; font-size:11.5pt; line-height:1.55; }
.band { background:#0A0A0A; color:#F5F3EF; padding:22px 26px; border-bottom:3px solid #3290ED; }
.brand { font-size:10pt; letter-spacing:.28em; text-transform:uppercase; color:#9ec7f5; }
.brand-logo { max-height:36px; display:block; margin-bottom:6px; }
h1 { font-family:"Playfair Display", Georgia, serif; font-size:23pt; margin:8px 0 0; line-height:1.2; }
h2 { font-family:"Playfair Display", Georgia, serif; font-size:14pt; margin:22px 0 6px; }
p { margin:8px 0; }
ul { margin-block:6px 0; margin-inline-start:18px; padding:0; }
li { margin:5px 0; }
table { width:100%; border-collapse:collapse; margin:8px 0; font-size:10.5pt; }
th, td { text-align:${rtl ? "right" : "left"}; padding:6px 8px; border-bottom:1px solid #e6e0d3; vertical-align:top; }
th { width:34%; color:#6b6b6b; font-weight:400; }
.svc { border:1px solid #e6e0d3; border-radius:9px; padding:10px 12px; margin:8px 0; }
.svc b { display:block; margin-bottom:3px; }
.foot { margin-top:26px; border-top:1px solid #e6e0d3; padding-top:8px; font-size:9pt; color:#6b6b6b; }
.draft { display:inline-block; background:#fdecea; color:#a3341f; font-size:8.5pt; letter-spacing:.08em; text-transform:uppercase; padding:3px 9px; border-radius:999px; margin-top:6px; }
</style></head><body>
<div class="band">
  ${
    (content.brand?.logo && content.brand.logo.startsWith("data:"))
      ? `<img class="brand-logo" src="${esc(content.brand.logo)}" alt="${esc(content.brand.name || brandName)}">`
      : `<div class="brand">${esc(content.brand?.name || brandName)}</div>`
  }
  <h1>${esc(content.title)}</h1>
  ${content.draft ? '<div class="draft">Draft</div>' : ""}
</div>
<p>${esc(content.intro)}</p>
${content.vision2030 ? `<h2>${rtl ? "توافق رؤية 2030" : "Vision 2030 alignment"}</h2><p>${esc(content.vision2030)}</p>` : ""}
<h2>${rtl ? "نطاق العمل" : "Scope"}</h2>
<ul>${content.scope.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
<h2>${rtl ? "الخدمات" : "Services"}</h2>
${content.services.map((s) => `<div class="svc"><b>${esc(s.name)}</b>${esc(s.description)}</div>`).join("")}
<h2>${rtl ? "الأسعار" : "Pricing"}</h2>
<table>${content.pricing.map((p) => `<tr><th>${esc(p.item)}</th><td>${esc(p.amount)}${p.note ? ` — ${esc(p.note)}` : ""}</td></tr>`).join("")}</table>
<h2>${rtl ? "الشروط" : "Terms"}</h2>
<p>${esc(content.terms)}</p>
<h2>${rtl ? "بيانات العميل" : "Prepared for"}</h2>
<table>
${row(rtl ? "الشركة" : "Company", lead.company)}
${row(rtl ? "القطاع" : "Sector", lead.industry)}
${row(rtl ? "الموقع الإلكتروني" : "Website", lead.website)}
${row(rtl ? "الهاتف" : "Phone", lead.phone)}
${row(rtl ? "المدينة" : "City", lead.city)}
</table>
<div class="foot">${esc(content.footer)}</div>
</body></html>`;
}

/** Render the HTML to a PDF buffer with the local Chrome Puppeteer ships with. */
export async function renderProposalPdf(html: string): Promise<Buffer> {
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Minimal OOXML package (stored zip, no external dependency)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, f.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(f.data.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + f.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals), centralBuf, end]);
}

function docxParagraph(text: string, opts: { bold?: boolean; heading?: boolean; rtl?: boolean } = {}): string {
  const pPr = `<w:pPr>${opts.heading ? '<w:pStyle w:val="Heading1"/>' : ""}${opts.rtl ? '<w:bidi/>' : ""}<w:spacing w:after="120"/></w:pPr>`;
  const rPr = `<w:rPr>${opts.bold ? "<w:b/>" : ""}${opts.rtl ? '<w:rtl/>' : ""}<w:sz w:val="${opts.heading ? 30 : 22}"/></w:rPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

export function renderProposalDocx(content: ProposalContent, lead: ProposalLead): Buffer {
  const rtl = content.locale === "ar";
  const body: string[] = [];
  body.push(docxParagraph(content.title, { bold: true, heading: true, rtl }));
  if (content.draft) body.push(docxParagraph(rtl ? "مسودة — بانتظار اعتماد الأسعار" : "Draft — pricing pending approval", { rtl }));
  body.push(docxParagraph(content.intro, { rtl }));
  body.push(docxParagraph(rtl ? "نطاق العمل" : "Scope", { bold: true, heading: true, rtl }));
  for (const s of content.scope) body.push(docxParagraph("• " + s, { rtl }));
  if (content.vision2030) {
    body.push(docxParagraph(rtl ? "توافق رؤية 2030" : "Vision 2030 alignment", { bold: true, heading: true, rtl }));
    body.push(docxParagraph(content.vision2030, { rtl }));
  }
  body.push(docxParagraph(rtl ? "الخدمات" : "Services", { bold: true, heading: true, rtl }));
  for (const s of content.services) body.push(docxParagraph(`${s.name} — ${s.description}`, { rtl }));
  body.push(docxParagraph(rtl ? "الأسعار" : "Pricing", { bold: true, heading: true, rtl }));
  for (const p of content.pricing) body.push(docxParagraph(`${p.item}: ${p.amount}${p.note ? " — " + p.note : ""}`, { rtl }));
  body.push(docxParagraph(rtl ? "الشروط" : "Terms", { bold: true, heading: true, rtl }));
  body.push(docxParagraph(content.terms, { rtl }));
  body.push(docxParagraph(rtl ? "بيانات العميل" : "Prepared for", { bold: true, heading: true, rtl }));
  for (const [k, v] of Object.entries({
    Company: lead.company, Sector: lead.industry, Website: lead.website, Phone: lead.phone, City: lead.city,
  })) {
    if (v) body.push(docxParagraph(`${k}: ${v}`, { rtl }));
  }
  body.push(docxParagraph(content.footer, { rtl }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
    { name: "word/styles.xml", data: Buffer.from(stylesXml, "utf8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(docRels, "utf8") },
  ]);
}

/** Write both files beside the runtime and return their absolute paths. */
export async function writeProposalFiles(
  content: ProposalContent,
  lead: ProposalLead,
  opts: { dir?: string; stem: string },
): Promise<{ pdfPath: string; docxPath: string; pdfBytes: number; docxBytes: number }> {
  const dir = opts.dir || process.env.PROPOSAL_DIR || path.join(process.cwd(), "proposals");
  fs.mkdirSync(dir, { recursive: true });
  const html = renderProposalHtml(content, lead);
  const pdf = await renderProposalPdf(html);
  const docx = renderProposalDocx(content, lead);
  const pdfPath = path.join(dir, `${opts.stem}.pdf`);
  const docxPath = path.join(dir, `${opts.stem}.docx`);
  fs.writeFileSync(pdfPath, pdf);
  fs.writeFileSync(docxPath, docx);
  fs.writeFileSync(path.join(dir, `${opts.stem}.html`), html, "utf8");
  return { pdfPath, docxPath, pdfBytes: pdf.length, docxBytes: docx.length };
}
