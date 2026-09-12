import PDFDocument from "pdfkit"

import { getStockTakeReport } from "@/lib/stock-takes/report"
import type { StockTakeCountLine, StockTakeMissingLine } from "@/lib/stock-takes/report"

// pdfkit reads its bundled AFM font metrics from disk, so this needs the
// Node.js runtime, not Edge.
export const runtime = "nodejs"

const PAGE_MARGIN = 40
const PAGE_BOTTOM = 792 - PAGE_MARGIN // A4-ish (points), leaves room before the edge

type Column = { header: string; width: number; align?: "left" | "right" }

const ROW_PADDING = 5 // extra vertical breathing room below each row's text
const COLUMN_GAP = 8 // horizontal gap reserved at the end of each column, so a
// right-aligned value (e.g. "Diff") doesn't sit flush against the next
// column's text (e.g. "Applied") — without this they visually run
// together as "DiffApplied".

/**
 * Draws a simple table. Rewritten Sept 2026 — the previous version had
 * two alignment bugs that made real reports look broken:
 *
 * 1. The header row printed each column via `doc.text(header, x, doc.y,
 *    ...)`, re-reading `doc.y` on every iteration. `.text()` advances
 *    `doc.y` after printing, so each header column landed a line lower
 *    than the last — headers staircased down the page instead of forming
 *    a row. Fixed by printing every header at one fixed `headerY`.
 * 2. Data rows used a fixed `rowY`, so columns within a row *did* line up
 *    with each other — but a long name (common for real stock items/tyre
 *    descriptions) wraps to 2-3 lines at these column widths, and the
 *    fixed `doc.moveDown(1.1)` step to the next row didn't account for
 *    that — the next row started before the wrapped text finished and
 *    overlapped it. Fixed by capping every cell to a single line with
 *    `height` + `ellipsis: true` (truncates with "…" instead of
 *    wrapping), so every row has the same, predictable height.
 */
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

    doc.font("Helvetica-Bold").fontSize(18).text("Stocktake Report")
    doc.moveDown(0.3)
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#444444")
      .text(`Stocktake ID: ${stockTake.id}`)
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

    const discrepancyLines = counted.filter((c) => c.difference !== 0)
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        `Counted: ${counted.length}    Discrepancies: ${discrepancyLines.length}    Not yet counted: ${missing.length}`
      )
    doc.moveDown(0.8)

    // Adjustments: just the discrepancies, worst losses first, with a
    // gained/lost/net summary — the "easy to review" cut of the same
    // data the Counted table below has, for when all that's wanted is
    // what this stock take found rather than the full count list.
    if (discrepancyLines.length > 0) {
      const sorted = [...discrepancyLines].sort((a, b) => a.difference - b.difference)
      const totalGained = sorted.filter((c) => c.difference > 0).reduce((s, c) => s + c.difference, 0)
      const totalLost = sorted.filter((c) => c.difference < 0).reduce((s, c) => s + c.difference, 0)

      doc.font("Helvetica-Bold").fontSize(13).text(`Stock adjustments (${sorted.length})`)
      doc.moveDown(0.2)
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(`Gained: +${totalGained}    Lost: ${totalLost}    Net: ${totalGained + totalLost > 0 ? "+" : ""}${totalGained + totalLost}`)
      doc.moveDown(0.4)
      drawTable(
        doc,
        [
          { header: "ID", width: 80 },
          { header: "Name", width: 160 },
          { header: "Expected", width: 60, align: "right" },
          { header: "Counted", width: 60, align: "right" },
          { header: "Diff", width: 50, align: "right" },
          { header: "Applied", width: 55 },
        ],
        sorted.map((c) => [
          c.id_number,
          c.name,
          String(c.expected_quantity),
          String(c.counted_quantity),
          c.difference > 0 ? `+${c.difference}` : String(c.difference),
          c.reconciled_at ? "Yes" : "Not yet",
        ]),
        "No discrepancies."
      )
      doc.moveDown(0.6)
    }

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

    // Once a stocktake is completed, "not yet counted" is frozen and no
    // longer actionable — the completed report only needs to show what
    // was actually counted and checked. Still included while in progress
    // (it's the to-do list) or cancelled (context for what was left).
    if (stockTake.status !== "completed") {
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
    }

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
    return new Response("Stocktake not found", { status: 404 })
  }

  const pdfBuffer = await buildPdf(report.stockTake, report.counted, report.missing)

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="stocktake-${report.stockTake.id}.pdf"`,
      "Content-Length": String(pdfBuffer.byteLength),
    },
  })
}
