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
        const summary = w.addWorksheet('Recepción general');
        summary.columns = [{header:'Dato',key:'key',width:32},{header:'Valor',key:'value',width:65}];
        const foreignTotal = data.foreignBoxes.length + data.foreign.reduce((n,r)=>n+Number(r.carton_count),0);
        for (const [key,value] of Object.entries({Referencia:data.session.reference,Fecha:data.session.arrival_date,Transportista:data.session.carrier,Guía:data.session.tracking,'Total físico':data.session.total_boxes,'Cajas de esta sucursal':data.boxes.length,'Cajas ajenas':foreignTotal,'Costo total de flete':data.cost?.cost ?? '',Moneda:data.cost?.currency ?? '',Estado:data.session.status})) summary.addRow({key,value});
        summary.getRow(1).font = {bold:true};
        const foreign = w.addWorksheet('Cajas ajenas');
        foreign.columns = [{header:'Producto',key:'product',width:32},{header:'Cajas',key:'carton_count',width:12},{header:'SEA / AIR',key:'shipping',width:14},{header:'Marca',key:'marking',width:28},{header:'Observaciones',key:'notes',width:45}];
        for(const r of data.foreign) foreign.addRow(r);
        const foreignOrders = new Set(data.foreignBoxes.map(b=>b.order_id));
        for(const orderId of foreignOrders){const boxes=data.foreignBoxes.filter(b=>b.order_id===orderId);foreign.addRow({product:boxes[0].product,carton_count:boxes.length,shipping:boxes[0].shipping,marking:boxes[0].marking,notes:`Pedido ${boxes[0].reference} · Cajas: ${boxes.map(b=>b.carton_number).join(', ')}`});}
        foreign.addRow({product:'TOTAL AJENAS',carton_count:foreignTotal});
        foreign.getRow(1).font={bold:true};
        foreign.views=[{state:'frozen',ySplit:1}];
        foreign.autoFilter=`A1:E${Math.max(1,data.foreign.length+foreignOrders.size+1)}`;
        const batches = w.addWorksheet('Pedidos por bonche');
        batches.columns=[{header:'Pedido',key:'reference',width:28},{header:'Producto',key:'product',width:30},{header:'Transporte',key:'shipping',width:14},{header:'Marca',key:'marking',width:24},{header:'Destino',key:'destination',width:22},{header:'Total del pedido',key:'total',width:20},{header:'En esta recepción',key:'received_here',width:22},{header:'Recibidas acumuladas al descargar',key:'received_total',width:25},{header:'Pendientes de llegar',key:'remaining',width:22}];
        for(const b of data.batches.filter(b=>Number(b.received_here)>0))batches.addRow({...b,destination:b.is_foreign?'Ajenas':'Esta sucursal'});
        batches.getRow(1).font={bold:true};batches.views=[{state:'frozen',ySplit:1}];
        const s = w.addWorksheet('Detalle por caja');
        s.columns = [{ header: 'Pedido', key: 'order', width: 25 }, { header: 'Caja', key: 'box', width: 12 }, { header: 'Producto', key: 'product', width: 30 }, { header: 'Transporte', key: 'shipping', width: 12 }, { header: 'Marca', key: 'marking', width: 12 }, { header: 'Modelo', key: 'model', width: 25 }, { header: 'Color', key: 'color', width: 22 }, { header: 'Contado', key: 'counted', width: 12 }, { header: 'Esperado', key: 'expected', width: 12 }, { header: 'Diferencia', key: 'diff', width: 12 }];
        for (const box of data.boxes) {
            if(!data.items.some(l=>l.carton_id===box.id))s.addRow({order:box.reference,box:box.carton_number,product:box.product,shipping:box.shipping,marking:box.marking});
            for (const item of data.items.filter(l => l.carton_id === box.id)) {
                const expected = 'expected' in item ? item.expected : null;
                const row = s.addRow({ order: box.reference, box: box.carton_number, product: box.product, shipping: box.shipping, marking: box.marking, model: item.model, color: item.color, counted: item.counted, expected: box.counted_at ? expected : null });
                if (box.counted_at && expected !== null)
                    row.getCell('diff').value = { formula: `H${row.number}-I${row.number}` };
            }
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
