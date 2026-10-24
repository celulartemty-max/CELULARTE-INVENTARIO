import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
type Line = {
  model_reference: string | null;
  quantity: number;
  color_id: string | null;
  color_name: string | null;
};
type Snapshot = {
  boxes: Array<{ box: { box_number: number }; lines: Line[] }>;
};
export async function buildReceptionXlsx(snapshot: Snapshot) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CELULARTE Inventario";
  for (const item of snapshot.boxes) {
    const lines = item.lines ?? [];
    const colors = [
      ...new Map(
        lines.map((l) => [
          l.color_id ?? "__NO_COLOR__",
          l.color_name?.trim() || "SIN COLOR",
        ]),
      ).entries(),
    ].sort((a, b) => a[1].localeCompare(b[1], "es"));
    const models = [
      ...new Set(
        lines.map(
          (l) => l.model_reference?.trim().toUpperCase() || "SIN MODELO",
        ),
      ),
    ].sort((a, b) => a.localeCompare(b, "es"));
    const ws = workbook.addWorksheet(`Caja ${item.box.box_number}`, {
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    ws.addRow([
      "MODELO",
      ...colors.map(([, name]) => name.toUpperCase()),
      "TOTAL",
    ]);
    for (const model of models) {
      const values = colors.map(([id]) =>
        lines
          .filter(
            (l) =>
              (l.model_reference?.trim().toUpperCase() || "SIN MODELO") ===
                model &&
              (l.color_id ?? "__NO_COLOR__") === id,
          )
          .reduce((sum, l) => sum + Number(l.quantity), 0),
      );
      ws.addRow([model, ...values, values.reduce((a, b) => a + b, 0)]);
    }
    const totals = colors.map(([id]) =>
      lines
        .filter((l) => (l.color_id ?? "__NO_COLOR__") === id)
        .reduce((sum, l) => sum + Number(l.quantity), 0),
    );
    ws.addRow(["TOTAL", ...totals, totals.reduce((a, b) => a + b, 0)]);
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
    ws.getRow(1).font = { bold: true };
    ws.getRow(ws.rowCount).font = { bold: true };
    ws.getColumn(1).width = 24;
    for (let i = 2; i <= ws.columnCount; i++) ws.getColumn(i).width = 14;
    ws.pageSetup.printArea = `A1:${ws.getColumn(ws.columnCount).letter}${ws.rowCount}`;
    ws.pageSetup.margins = {
      left: 0.25,
      right: 0.25,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    };
  }
  const data = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(data);
  return { buffer, sha256: createHash("sha256").update(buffer).digest("hex") };
}
