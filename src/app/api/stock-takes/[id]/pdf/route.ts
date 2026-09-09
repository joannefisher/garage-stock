import PDFDocument from "pdfkit"

import { getStockTakeReport } from "@/lib/stock-takes/report"
import type { StockTakeCountLine, StockTakeMissingLine } from "@/lib/stock-takes/report"

// pdfkit reads its bundled AFM font metrics from disk, so this needs the
// Node.js runtime, not Edge.
export const runtime = "nodejs"

const PAGE_MARGIN = 40
const PAGE_BOTTOM = 792 - PAGE_MARGIN // A4-ish (points), leaves room before the edge

type Column = { header: string; width: number; align?: "left" | "right" }

function drawTable(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  rows: string[][],
  emptyMessage: string
) {
  const startX = doc.page.margins.left

  function drawHeader() {
    doc.font("Helvetica-Bold").fontSize(9)
    let x = startX
    for (const col of columns) {
      doc.text(col.header, x, doc.y, { width: col.width, align: col.align ?? "left" })
      x += col.width
    }
    doc.moveDown(0.4)
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + columns.reduce((sum, c) => sum + c.width, 0), doc.y)
      .strokeColor("#cccccc")
      .stroke()
    doc.moveDown(0.3)
  }

  drawHeader()
  doc.font("Helvetica").fontSize(9)

  if (rows.length === 0) {
    doc.fillColor("#666666").text(emptyMessage, startX, doc.y)
    doc.fillColor("#000000")
    doc.moveDown(0.6)
    return
  }

  for (const row of rows) {
    if (doc.y > PAGE_BOTTOM) {
      doc.addPage()
      drawHeader()
      doc.font("Helvetica").fontSize(9)
    }
    const rowY = doc.y
    let x = startX
    for (let i = 0; i < columns.length; i++) {
      doc.text(row[i] ?? "", x, rowY, { width: columns[i].width, align: columns[i].align ?? "left" })
      x += columns[i].width
    }
    doc.y = rowY
    doc.moveDown(1.1)
  }
  doc.moveDown(0.4)
}

function buildPdf(
  stockTake: {
    id: string
    status: string
    started_at: string
    started_by_name: string | null
    completed_at: string | null
    completed_by_name: string | null
  },
  counted: StockTakeCountLine[],
  missing: StockTakeMissingLine[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4" })
    const chunks: Buffer[] = []
    doc.on("data", (chunk) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    doc.font("Helvetica-Bold").fontSize(18).text("Stock Take Report")
    doc.moveDown(0.3)
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#444444")
      .text(`Stock take ID: ${stockTake.id}`)
      .text(
        `Status: ${
          stockTake.status === "in_progress"
            ? "In progress"
            : stockTake.status === "cancelled"
              ? "Cancelled"
              : "Completed"
        }`
      )
      .text(
        `Started: ${new Date(stockTake.started_at).toLocaleString("en-GB")}` +
          (stockTake.started_by_name ? ` by ${stockTake.started_by_name}` : "")
      )
    if (stockTake.completed_at) {
      doc.text(
        `Completed: ${new Date(stockTake.completed_at).toLocaleString("en-GB")}` +
          (stockTake.completed_by_name ? ` by ${stockTake.completed_by_name}` : "")
      )
    }
    doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`)
    doc.fillColor("#000000")
    doc.moveDown(1)

    const discrepancies = counted.filter((c) => c.difference !== 0).length
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        `Counted: ${counted.length}    Discrepancies: ${discrepancies}    Not yet counted: ${missing.length}`
      )
    doc.moveDown(0.8)

    doc.font("Helvetica-Bold").fontSize(13).text(`Counted (${counted.length})`)
    doc.moveDown(0.4)
    drawTable(
      doc,
      [
        { header: "ID", width: 80 },
        { header: "Name", width: 140 },
        { header: "Expected", width: 55, align: "right" },
        { header: "Counted", width: 55, align: "right" },
        { header: "Diff", width: 50, align: "right" },
        { header: "Applied", width: 50 },
        { header: "Counted by", width: 85 },
      ],
      counted.map((c) => [
        c.id_number,
        c.name,
        String(c.expected_quantity),
        String(c.counted_quantity),
        c.difference > 0 ? `+${c.difference}` : String(c.difference),
        c.difference === 0 ? "—" : c.reconciled_at ? "Yes" : "No",
        c.counted_by_name ?? "—",
      ]),
      "Nothing counted yet."
    )

    doc.moveDown(0.6)
    doc.font("Helvetica-Bold").fontSize(13).text(`Not yet counted (${missing.length})`)
    doc.moveDown(0.4)
    drawTable(
      doc,
      [
        { header: "ID", width: 110 },
        { header: "Name", width: 280 },
        { header: "System quantity", width: 120, align: "right" },
      ],
      missing.map((m) => [m.id_number, m.name, String(m.quantity_on_hand)]),
      "Every active stock item has been counted."
    )

    doc.end()
  })
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/stock-takes/[id]/pdf">
) {
  const { id } = await ctx.params
  const report = await getStockTakeReport(id)

  if (!report) {
    return new Response("Stock take not found", { status: 404 })
  }

  const pdfBuffer = await buildPdf(report.stockTake, report.counted, report.missing)

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="stock-take-${report.stockTake.id}.pdf"`,
      "Content-Length": String(pdfBuffer.byteLength),
    },
  })
}
