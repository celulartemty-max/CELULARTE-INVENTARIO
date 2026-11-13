import type ExcelJS from 'exceljs';
import { orderedPackingColors } from './packing-column-order';

type Box = { id: string; reference: string; product: string; carton_number: string; color_order?: string[] };
type Item = { carton_id: string; model: string; color: string; counted: number | null; product_id?: string; product_label?: string };
export function addPackingCountSheet(workbook: ExcelJS.Workbook, boxes: Box[], items: Item[]) {
    const sheet=workbook.addWorksheet('Conteo por caja');
    sheet.getColumn(1).width=30;
    for(const box of boxes) {
        const boxLines=items.filter(item=>item.carton_id===box.id);
        const groups=[...new Set(boxLines.map(item=>item.product_id||item.product_label||''))];
        for(const group of groups.length?groups:['']) {
        const lines=boxLines.filter(item=>(item.product_id||item.product_label||'')===group);
        const colors=orderedPackingColors(lines.map(item=>item.color),box.color_order);
        const title=sheet.addRow([`${lines[0]?.product_label||box.product} · Caja ${box.carton_number} · ${box.reference}`]);
        sheet.mergeCells(title.number,1,title.number,Math.max(2,colors.length+1));
        title.font={bold:true,size:12};title.height=28;
        const header=sheet.addRow(['Modelo / Color',...colors.map(color=>color||'Sin color')]);
        header.font={bold:true};header.height=32;
        header.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF4EF'}};cell.alignment={vertical:'middle',wrapText:true};});
        colors.forEach((_,i)=>{sheet.getColumn(i+2).width=22;});
        const models=[...new Set(lines.map(item=>item.model))];
        for(const model of models) {
            const row=sheet.addRow([model||'Sin modelo',...colors.map(color=>{
                const item=lines.find(item=>item.model===model&&item.color===color);
                return item ? item.counted : '—';
            })]);
            row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:true};cell.numFmt='#,##0';});
        }
        if(!lines.length)sheet.addRow(['Sin contenido cargado']);
        sheet.addRow([]);
        }
    }
    return sheet;
}
