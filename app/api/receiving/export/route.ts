import { requireUser } from '@/lib/auth/authorization';
import { receivingView, receivingAccess } from '@/lib/inventory/receiving';
import ExcelJS from 'exceljs';
import { z } from 'zod';
export async function GET(req: Request) {
    try {
        const u = await requireUser();
        await receivingAccess(u, true);
        const id = z.string().uuid().parse(new URL(req.url).searchParams.get('id'));
        const data = await receivingView(u, id);
        const w = new ExcelJS.Workbook();
        const s = w.addWorksheet('Detalle por caja');
        s.columns = [{ header: 'Pedido', key: 'order', width: 25 }, { header: 'Caja', key: 'box', width: 12 }, { header: 'Producto', key: 'product', width: 30 }, { header: 'Transporte', key: 'shipping', width: 12 }, { header: 'Marca', key: 'marking', width: 12 }, { header: 'Modelo', key: 'model', width: 25 }, { header: 'Color', key: 'color', width: 22 }, { header: 'Contado', key: 'counted', width: 12 }, { header: 'Esperado', key: 'expected', width: 12 }, { header: 'Diferencia', key: 'diff', width: 12 }];
        for (const box of data.boxes)
            for (const item of data.items.filter(l => l.carton_id === box.id)) {
                const expected = 'expected' in item ? item.expected : null;
                const row = s.addRow({ order: box.reference, box: box.carton_number, product: box.product, shipping: box.shipping, marking: box.marking, model: item.model, color: item.color, counted: item.counted, expected: box.counted_at ? expected : null });
                if (box.counted_at && expected !== null)
                    row.getCell('diff').value = { formula: `H${row.number}-I${row.number}` };
            }
        s.getRow(1).font = { bold: true };
        s.views = [{ state: 'frozen', ySplit: 1 }];
        s.autoFilter = 'A1:J1';
        return new Response(new Uint8Array(await w.xlsx.writeBuffer()), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="Recepcion-detalle-cajas.xlsx"', 'Cache-Control': 'private, no-store' } });
    }
    catch {
        return new Response('No disponible o sin permiso', { status: 403 });
    }
}
