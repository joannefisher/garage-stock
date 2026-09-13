import PDFDocument from "pdfkit"

import { getReorderReport } from "@/lib/stock/reorder-report"
import type { ReorderReportSort } from "@/lib/stock/reorder-report"
import type { ReorderReportRow } from "@/types/database.types"

// pdfkit reads its bundled AFM font metrics from disk, so this needs the
// Node.js runtime, not Edge. See src/app/api/stock-takes/[id]/pdf/route.ts,
// which this route otherwise mirrors closely.
export const runtime = "nodejs"

const PAGE_MARGIN = 40
const PAGE_BOTTOM = 792 - PAGE_MARGIN // A4-ish (points), leaves room before the edge

type Column = { header: string; width: number; align?: "left" | "right" }

const ROW_PADDING = 5
const COLUMN_GAP = 8

// Same table-drawing routine as the stocktake PDF route (see its comment
// for the two alignment bugs this avoids: a fixed headerY so header
// columns don't staircase, and single-line/ellipsis cells so a long name
// can't overlap the next row). Kept as a separate copy rather than a
// shared helper — this is only the second use of the pattern, and the
// two reports' column sets/emptiness handling differ enough that sharing
// it would mean threading through more parameters than it saves.
function drawTable(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  rows: string[][],
  emptyMessage: string
) {
  const startX = doc.page.margins.left
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0)

  function drawHeader() {
    doc.font("Helvetica-Bold").fontSize(9)
    const headerY = doc.y
    const lineHeight = doc.currentLineHeight()
    let x = startX
    for (const col of columns) {
      doc.text(col.header, x, headerY, {
        width: col.width - COLUMN_GAP,
        align: col.align ?? "left",
        lineBreak: false,
      })
      x += col.width
    }
    doc.y = headerY + lineHeight + 4
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .strokeColor("#cccccc")
      .stroke()
    doc.moveDown(0.3)
  }

  drawHeader()
  doc.font("Helvetica").fontSize(9)
  const rowLineHeight = doc.currentLineHeight()
  const rowHeight = rowLineHeight + ROW_PADDING

  if (rows.length === 0) {
    doc.fillColor("#666666").text(emptyMessage, startX, doc.y)
    doc.fillColor("#000000")
    doc.moveDown(0.6)
    return
  }

  for (const row of rows) {
    if (doc.y + rowHeight > PAGE_BOTTOM) {
      doc.addPage()
      drawHeader()
      doc.font("Helvetica").fontSize(9)
    }
    const rowY = doc.y
    let x = startX
    for (let i = 0; i < columns.length; i++) {
      doc.text(row[i] ?? "", x, rowY, {
        width: columns[i].width - COLUMN_GAP,
        align: columns[i].align ?? "left",
        height: rowLineHeight,
        ellipsis: true,
      })
      x += columns[i].width
    }
    doc.y = rowY + rowHeight
  }
  doc.moveDown(0.4)
}

function buildPdf(rows: ReorderReportRow[], filters: { q?: string; supplierName?: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4" })
    const chunks: Buffer[] = []
    doc.on("data", (chunk) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    doc.font("Helvetica-Bold").fontSize(18).text("Reorder Report")
    doc.moveDown(0.3)
    doc.font("Helvetica").fontSize(10).fillColor("#444444")
    if (filters.q) doc.text(`Search: "${filters.q}"`)
    if (filters.supplierName) doc.text(`Supplier: ${filters.supplierName}`)
    doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`)
    doc.fillColor("#000000")
    doc.moveDown(0.6)

    const totalUnits = rows.reduce((sum, r) => sum + r.quantity_to_order, 0)
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`Items below ideal: ${rows.length}    Total units suggested to order: ${totalUnits}`)
    doc.moveDown(0.8)

    drawTable(
      doc,
      [
        { header: "Supplier", width: 110 },
        { header: "ID", width: 85 },
        { header: "Name", width: 165 },
        { header: "Qty on hand", width: 75, align: "right" },
        { header: "Ideal qty", width: 65, align: "right" },
        { header: "Suggested order qty", width: 90, align: "right" },
      ],
      rows.map((r) => [
        r.supplier_name ?? "—",
        r.id_number,
        r.name,
        String(r.quantity_on_hand),
        String(r.ideal_stock_level),
        String(r.quantity_to_order),
      ]),
      "Nothing is below its ideal stock level right now."
    )

    doc.end()
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams.get("q") ?? undefined
  const supplier_id = url.searchParams.get("supplier_id") ?? undefined
  const sort = (url.searchParams.get("sort") as ReorderReportSort | null) ?? undefined

  const { rows, error } = await getReorderReport({ q, supplier_id, sort })

  if (error) {
    return new Response(`Could not load the reorder report: ${error.message}`, { status: 500 })
  }

  const supplierName = supplier_id
    ? rows.find((r) => r.supplier_id === supplier_id)?.supplier_name ?? undefined
    : undefined

  const pdfBuffer = await buildPdf(rows, { q, supplierName })

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reorder-report-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf"`,
      "Content-Length": String(pdfBuffer.byteLength),
    },
  })
}
