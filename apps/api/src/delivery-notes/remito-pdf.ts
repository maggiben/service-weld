import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";
import type { PrintCopyKind, RemitoLine } from "@weld/schemas";
import { REMITO_ISSUER, type RemitoIssuer } from "./remito-issuer";

export interface RemitoPdfClientSnapshot {
  name: string | null;
  cuit: string | null;
  address: string | null;
}

export interface RemitoPdfInput {
  remitoNumber: string;
  remitoType: string;
  status: string;
  issuedDate: string | null;
  scheduledAt: string | null;
  observations: string | null;
  driverName: string | null;
  helperName: string | null;
  vehiclePlate: string | null;
  warehouseName: string | null;
  client: RemitoPdfClientSnapshot;
  lines: RemitoLine[];
  copyKind: PrintCopyKind;
  reprintSeq: number | null;
  reprintReason: string | null;
  printedAt: Date;
  issuer?: RemitoIssuer;
}

export interface RemitoPdfResult {
  buffer: Buffer;
  filename: string;
  copyBanner: string;
}

function copyBanner(
  copyKind: PrintCopyKind,
  reprintSeq: number | null,
): string {
  if (copyKind === "REIMPRESION") {
    return `REIMPRESIÓN #${reprintSeq ?? 1}`;
  }
  return copyKind;
}

function formatCapacity(line: RemitoLine): string {
  if (line.capacity_value == null) return "—";
  const unit = line.capacity_unit ?? "";
  return `${line.capacity_value}${unit ? ` ${unit}` : ""}`;
}

async function barcodePng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 2,
    height: 10,
    includetext: false,
  });
}

async function qrPng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "qrcode",
    text,
    scale: 3,
    includetext: false,
  });
}

/** Build an A4 remito PDF (docs/specs/remitos.md §15). */
export async function buildRemitoPdf(
  input: RemitoPdfInput,
): Promise<RemitoPdfResult> {
  const issuer = input.issuer ?? REMITO_ISSUER;
  const banner = copyBanner(input.copyKind, input.reprintSeq);
  const barcode = await barcodePng(input.remitoNumber);
  const qr = await qrPng(`remito:${input.remitoNumber}`);

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: `Remito ${input.remitoNumber}`,
        Author: issuer.legalName,
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

    // Copy banner
    doc
      .fontSize(14)
      .fillColor("#b45309")
      .font("Helvetica-Bold")
      .text(banner, left, 36, { width: usable, align: "center" });
    if (input.copyKind === "REIMPRESION" && input.reprintReason) {
      doc
        .fontSize(9)
        .fillColor("#7c2d12")
        .font("Helvetica")
        .text(
          `${input.printedAt.toISOString().slice(0, 10)} — ${input.reprintReason}`,
          left,
          doc.y,
          { width: usable, align: "center" },
        );
    }

    doc.moveDown(0.6);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(16);
    doc.text(issuer.legalName, left, doc.y, { width: usable * 0.62 });
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(`CUIT ${issuer.cuit}`);
    doc.text(issuer.address);
    if (issuer.iibb) doc.text(`IIBB ${issuer.iibb}`);
    doc.text(`${issuer.phone} · ${issuer.email}`);

    const headerTop = 70;
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827");
    doc.text("REMITO", left + usable * 0.62, headerTop, {
      width: usable * 0.38,
      align: "right",
    });
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text(input.remitoNumber, left + usable * 0.62, headerTop + 22, {
      width: usable * 0.38,
      align: "right",
    });
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(
      `Tipo: ${input.remitoType}`,
      left + usable * 0.62,
      headerTop + 40,
      {
        width: usable * 0.38,
        align: "right",
      },
    );
    doc.text(
      `Emisión: ${input.issuedDate ?? "—"}`,
      left + usable * 0.62,
      headerTop + 52,
      { width: usable * 0.38, align: "right" },
    );
    doc.text(`Estado: ${input.status}`, left + usable * 0.62, headerTop + 64, {
      width: usable * 0.38,
      align: "right",
    });

    doc.moveDown(1.2);
    let cursorY = Math.max(doc.y, headerTop + 90);
    doc
      .moveTo(left, cursorY)
      .lineTo(right, cursorY)
      .strokeColor("#d1d5db")
      .stroke();
    cursorY += 12;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
    doc.text("Cliente", left, cursorY);
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(input.client.name ?? "—", left, cursorY + 14);
    doc.text(`CUIT: ${input.client.cuit ?? "—"}`, left, cursorY + 26);
    doc.text(input.client.address ?? "—", left, cursorY + 38, {
      width: usable * 0.55,
    });

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
    doc.text("Flota / depósito", left + usable * 0.58, cursorY);
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    doc.text(
      `Depósito: ${input.warehouseName ?? "—"}`,
      left + usable * 0.58,
      cursorY + 14,
    );
    doc.text(
      `Chofer: ${input.driverName ?? "—"}`,
      left + usable * 0.58,
      cursorY + 26,
    );
    doc.text(
      `Ayudante: ${input.helperName ?? "—"}`,
      left + usable * 0.58,
      cursorY + 38,
    );
    doc.text(
      `Vehículo: ${input.vehiclePlate ?? "—"}`,
      left + usable * 0.58,
      cursorY + 50,
    );
    if (input.scheduledAt) {
      doc.text(
        `Previsto: ${input.scheduledAt}`,
        left + usable * 0.58,
        cursorY + 62,
      );
    }

    cursorY += 90;
    doc
      .moveTo(left, cursorY)
      .lineTo(right, cursorY)
      .strokeColor("#d1d5db")
      .stroke();
    cursorY += 14;

    const cylinders = input.lines.filter(
      (line) => line.item_kind === "CYLINDER",
    );
    const accessories = input.lines.filter(
      (line) => line.item_kind === "ACCESSORY",
    );

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
    doc.text("Cilindros", left, cursorY);
    cursorY = doc.y + 6;

    const col = {
      serial: left,
      gas: left + 95,
      capacity: left + 145,
      condition: left + 210,
      rental: left + 280,
      notes: left + 330,
    };
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#6b7280");
    doc.text("Serie", col.serial, cursorY);
    doc.text("Gas", col.gas, cursorY);
    doc.text("Cap.", col.capacity, cursorY);
    doc.text("Cond.", col.condition, cursorY);
    doc.text("Alq.", col.rental, cursorY);
    doc.text("Notas", col.notes, cursorY);
    cursorY += 12;
    doc
      .moveTo(left, cursorY)
      .lineTo(right, cursorY)
      .strokeColor("#e5e7eb")
      .stroke();
    cursorY += 6;

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    if (cylinders.length === 0) {
      doc.text("Sin líneas de cilindro", left, cursorY);
      cursorY += 14;
    } else {
      for (const line of cylinders) {
        if (cursorY > doc.page.height - 160) {
          doc.addPage();
          cursorY = doc.page.margins.top;
          doc
            .fontSize(10)
            .fillColor("#b45309")
            .font("Helvetica-Bold")
            .text(`${banner} — continuación`, left, cursorY, {
              width: usable,
              align: "center",
            });
          cursorY = doc.y + 10;
          doc.font("Helvetica").fontSize(8).fillColor("#111827");
        }
        doc.text(line.serial_number ?? "—", col.serial, cursorY, {
          width: 90,
        });
        doc.text(line.gas_code ?? "—", col.gas, cursorY, { width: 45 });
        doc.text(formatCapacity(line), col.capacity, cursorY, { width: 60 });
        doc.text(line.condition ?? "—", col.condition, cursorY, { width: 65 });
        doc.text(line.is_rental ? "Sí" : "No", col.rental, cursorY, {
          width: 40,
        });
        doc.text(line.notes ?? "", col.notes, cursorY, {
          width: right - col.notes,
        });
        cursorY += 14;
      }
    }

    cursorY += 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
    doc.text("Accesorios", left, cursorY);
    cursorY = doc.y + 6;
    doc.font("Helvetica").fontSize(8);
    if (accessories.length === 0) {
      doc.fillColor("#6b7280").text("Sin accesorios", left, cursorY);
      cursorY += 14;
    } else {
      for (const line of accessories) {
        doc
          .fillColor("#111827")
          .text(
            `#${line.line_no}  id ${line.accessory_id ?? "—"}  qty ${line.qty}${
              line.is_rental ? "  (alquiler)" : ""
            }${line.notes ? `  — ${line.notes}` : ""}`,
            left,
            cursorY,
            { width: usable },
          );
        cursorY = doc.y + 4;
      }
    }

    const bultos = input.lines.reduce((sum, line) => sum + Number(line.qty), 0);
    const weight = input.lines.reduce(
      (sum, line) =>
        sum + (line.weight_kg == null ? 0 : Number(line.weight_kg)),
      0,
    );
    cursorY += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
    doc.text(
      `Total bultos: ${bultos}    Peso: ${weight > 0 ? `${weight} kg` : "—"}`,
      left,
      cursorY,
    );

    if (input.observations) {
      cursorY += 18;
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("Observaciones", left, cursorY);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#374151")
        .text(input.observations, left, cursorY + 14, { width: usable });
      cursorY = doc.y + 8;
    } else {
      cursorY += 24;
    }

    const sigY = Math.min(cursorY + 20, doc.page.height - 200);
    doc.font("Helvetica").fontSize(9).fillColor("#111827");
    doc.text("Firma cliente", left, sigY);
    doc
      .moveTo(left, sigY + 40)
      .lineTo(left + 180, sigY + 40)
      .strokeColor("#9ca3af")
      .stroke();
    doc.text("Aclaración / DNI", left, sigY + 46);

    doc.text("Firma chofer", left + 260, sigY);
    doc
      .moveTo(left + 260, sigY + 40)
      .lineTo(left + 440, sigY + 40)
      .strokeColor("#9ca3af")
      .stroke();
    doc.text("Aclaración", left + 260, sigY + 46);

    const mediaY = doc.page.height - 130;
    doc.image(barcode, left, mediaY, { width: 160, height: 40 });
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(input.remitoNumber, left, mediaY + 42, {
        width: 160,
        align: "center",
      });
    doc.image(qr, right - 70, mediaY - 10, { width: 70, height: 70 });

    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(issuer.legalLegend, left, doc.page.height - 50, {
        width: usable,
        align: "center",
      });
    doc.text(`Página 1`, left, doc.page.height - 36, {
      width: usable,
      align: "right",
    });

    doc.end();
  });

  const safeNumber = input.remitoNumber.replace(/[^\w.-]+/g, "_");
  const filename = `remito-${safeNumber}-${input.copyKind.toLowerCase()}.pdf`;
  return { buffer, filename, copyBanner: banner };
}
