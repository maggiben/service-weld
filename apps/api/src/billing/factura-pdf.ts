import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";
import {
  cbteTipoLetter,
  formatCbteNumber,
  type ArcaFiscalAmounts,
} from "@weld/domain";

export interface FacturaPdfLine {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

export interface FacturaPdfIssuer {
  legalName: string;
  cuit: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  iibb?: string | null;
  ivaConditionLabel?: string;
}

export interface FacturaPdfClient {
  name: string;
  cuit: string | null;
  address: string | null;
  locality: string | null;
}

export interface FacturaPdfInput {
  issuer: FacturaPdfIssuer;
  client: FacturaPdfClient;
  letter: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  periodStart: string;
  periodEnd: string;
  lines: FacturaPdfLine[];
  amounts: ArcaFiscalAmounts;
  cae: string;
  caeDueDate: string;
  qrUrl: string;
  environment: "HOMOLOGATION" | "PRODUCTION";
  printedAt: Date;
}

export interface FacturaPdfResult {
  buffer: Buffer;
  filename: string;
}

function money(value: number): string {
  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function unitLabel(unit: string): string {
  if (unit === "day") return "día";
  if (unit === "fill") return "recarga";
  if (unit === "unit") return "u.";
  if (unit === "loan") return "préstamo";
  return unit;
}

async function qrPng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "qrcode",
    text,
    scale: 3,
    includetext: false,
  });
}

/** Professional Factura B PDF with ARCA CAE + fiscal QR (RG 4291). */
export async function buildFacturaPdf(
  input: FacturaPdfInput,
): Promise<FacturaPdfResult> {
  const letter = input.letter || cbteTipoLetter(input.cbteTipo);
  const numberLabel = formatCbteNumber(input.ptoVta, input.cbteNro);
  const qr = await qrPng(input.qrUrl);

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: `Factura ${letter} ${numberLabel}`,
        Author: input.issuer.legalName,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const usable = right - left;

    if (input.environment === "HOMOLOGATION") {
      doc
        .fontSize(11)
        .fillColor("#b45309")
        .font("Helvetica-Bold")
        .text("COMPROBANTE DE HOMOLOGACIÓN — SIN VALIDEZ FISCAL", left, 28, {
          width: usable,
          align: "center",
        });
    }

    const headerY = input.environment === "HOMOLOGATION" ? 48 : 36;

    // Issuer
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#111827")
      .text(input.issuer.legalName, left, headerY, { width: usable * 0.55 });
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(`CUIT ${input.issuer.cuit}`, left, doc.y + 2);
    if (input.issuer.address) doc.text(input.issuer.address);
    if (input.issuer.iibb) doc.text(`IIBB ${input.issuer.iibb}`);
    doc.text(input.issuer.ivaConditionLabel ?? "IVA Responsable Inscripto");
    const contact = [input.issuer.phone, input.issuer.email]
      .filter(Boolean)
      .join(" · ");
    if (contact) doc.text(contact);

    // Letter box + voucher number
    const boxX = left + usable * 0.62;
    const boxW = usable * 0.38;
    doc
      .roundedRect(boxX, headerY, boxW, 78, 4)
      .strokeColor("#111827")
      .lineWidth(1.2)
      .stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#111827")
      .text(letter, boxX, headerY + 8, { width: boxW, align: "center" });
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`FACTURA ${letter}`, boxX, headerY + 40, {
        width: boxW,
        align: "center",
      });
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(`N° ${numberLabel}`, boxX, headerY + 54, {
        width: boxW,
        align: "center",
      });

    let cursorY = Math.max(doc.y, headerY + 90) + 8;
    doc
      .moveTo(left, cursorY)
      .lineTo(right, cursorY)
      .strokeColor("#d1d5db")
      .lineWidth(0.8)
      .stroke();
    cursorY += 10;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
    doc.text("Cliente", left, cursorY);
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(input.client.name, left, cursorY + 14);
    doc.text(`CUIT: ${input.client.cuit ?? "—"}`, left, cursorY + 26);
    const addressLine = [input.client.address, input.client.locality]
      .filter(Boolean)
      .join(" · ");
    doc.text(addressLine || "—", left, cursorY + 38, {
      width: usable * 0.55,
    });

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
    doc.text("Comprobante", left + usable * 0.58, cursorY);
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(`Fecha: ${input.cbteFch}`, left + usable * 0.58, cursorY + 14);
    doc.text(
      `Período: ${input.periodStart} → ${input.periodEnd}`,
      left + usable * 0.58,
      cursorY + 26,
    );
    doc.text(
      `Cod. comprobante: ${input.cbteTipo}`,
      left + usable * 0.58,
      cursorY + 38,
    );

    cursorY += 70;
    doc
      .moveTo(left, cursorY)
      .lineTo(right, cursorY)
      .strokeColor("#d1d5db")
      .stroke();
    cursorY += 10;

    // Table header
    const cols = {
      desc: left,
      qty: left + usable * 0.52,
      unit: left + usable * 0.62,
      price: left + usable * 0.72,
      amount: left + usable * 0.86,
    };
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#6b7280");
    doc.text("Descripción", cols.desc, cursorY);
    doc.text("Cant.", cols.qty, cursorY, { width: 40, align: "right" });
    doc.text("U.", cols.unit, cursorY, { width: 36, align: "right" });
    doc.text("P. unit.", cols.price, cursorY, { width: 55, align: "right" });
    doc.text("Importe", cols.amount, cursorY, {
      width: usable * 0.14,
      align: "right",
    });
    cursorY += 12;
    doc
      .moveTo(left, cursorY)
      .lineTo(right, cursorY)
      .strokeColor("#e5e7eb")
      .stroke();
    cursorY += 6;

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    for (const line of input.lines) {
      if (cursorY > doc.page.height - 180) {
        doc.addPage();
        cursorY = doc.page.margins.top;
      }
      const descHeight = doc.heightOfString(line.description, {
        width: usable * 0.5,
      });
      doc.text(line.description, cols.desc, cursorY, { width: usable * 0.5 });
      doc.text(String(line.quantity), cols.qty, cursorY, {
        width: 40,
        align: "right",
      });
      doc.text(unitLabel(line.unit), cols.unit, cursorY, {
        width: 36,
        align: "right",
      });
      doc.text(money(line.unit_price), cols.price, cursorY, {
        width: 55,
        align: "right",
      });
      doc.text(money(line.amount), cols.amount, cursorY, {
        width: usable * 0.14,
        align: "right",
      });
      cursorY += Math.max(descHeight, 12) + 4;
    }

    cursorY += 8;
    doc
      .moveTo(left, cursorY)
      .lineTo(right, cursorY)
      .strokeColor("#d1d5db")
      .stroke();
    cursorY += 12;

    // Totals
    const totalsX = left + usable * 0.55;
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text("Neto gravado", totalsX, cursorY);
    doc.text(`${money(input.amounts.impNeto)} ARS`, totalsX, cursorY, {
      width: usable * 0.45,
      align: "right",
    });
    cursorY += 14;
    doc.text("IVA 21%", totalsX, cursorY);
    doc.text(`${money(input.amounts.impIva)} ARS`, totalsX, cursorY, {
      width: usable * 0.45,
      align: "right",
    });
    cursorY += 16;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
    doc.text("Total", totalsX, cursorY);
    doc.text(`${money(input.amounts.impTotal)} ARS`, totalsX, cursorY, {
      width: usable * 0.45,
      align: "right",
    });

    // Footer: CAE + QR
    const footerY = doc.page.height - 150;
    doc
      .moveTo(left, footerY)
      .lineTo(right, footerY)
      .strokeColor("#d1d5db")
      .stroke();

    doc.image(qr, left, footerY + 12, { width: 90, height: 90 });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#111827")
      .text("Autorización ARCA", left + 110, footerY + 18);
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(`CAE: ${input.cae}`, left + 110, footerY + 36);
    doc.text(`Vto. CAE: ${input.caeDueDate}`, left + 110, footerY + 50);
    doc.text(
      `Comprobante ${letter} ${numberLabel} · ${input.cbteFch}`,
      left + 110,
      footerY + 64,
    );
    doc
      .fontSize(7)
      .fillColor("#6b7280")
      .text(
        "Escaneá el código QR para verificar el comprobante en ARCA (RG 4291).",
        left + 110,
        footerY + 82,
        { width: usable - 120 },
      );
    doc.text(
      `Impreso: ${input.printedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`,
      left + 110,
      footerY + 96,
    );

    doc.end();
  });

  const filename = `factura-${letter}-${formatCbteNumber(input.ptoVta, input.cbteNro).replace("-", "")}.pdf`;
  return { buffer, filename };
}
