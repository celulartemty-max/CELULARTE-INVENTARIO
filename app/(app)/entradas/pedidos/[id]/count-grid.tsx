'use client';
import { orderedPackingColors } from '@/lib/inventory/packing-column-order';

type CountItem = { id: string; model: string; color: string; counted: number | null; expected?: number | null };

export default function CountGrid({ items, disabled, showReference, onAdd, colorOrder }: { items: CountItem[]; disabled: boolean; showReference: boolean; onAdd?: () => void; colorOrder?: string[] }) {
    const models = Array.from(new Set(items.map(item => item.model)));
    const colors = orderedPackingColors(items.map(item => item.color), colorOrder);
    return <div className="packingSheetScroll" role="region" aria-label="Tabla de conteo por modelo y color" tabIndex={0}>
        <table className="packingSheet"><caption>Conteo físico: modelos en filas y colores en columnas</caption>
            <thead><tr><th scope="col">Modelo / Color</th>{colors.map(color => <th scope="col" key={color}>{color || 'Sin color'}</th>)}</tr></thead>
            <tbody>{models.map(model => <tr key={model}><th scope="row">{model || 'Sin modelo'}</th>{colors.map(color => {
                const lines = items.filter(item => item.model === model && item.color === color);
                return <td key={color}>{lines.length ? lines.map(item => <div className="packingCell" key={item.id}>
                    <input aria-label={`Cantidad contada: ${model || 'sin modelo'}, ${color || 'sin color'}`} name={item.id} type="number" min={0} max={1000000} step={1} inputMode="numeric" required placeholder="Sin contar" defaultValue={item.counted ?? ''} disabled={disabled}/>
                    {showReference && <small>{item.expected == null ? 'Sin referencia' : `Esperado: ${item.expected} · Diferencia: ${Number(item.counted) - item.expected}`}</small>}
                </div>) : <span aria-label="Combinación no incluida">—</span>}</td>;
            })}</tr>)}</tbody>
            {onAdd && !disabled && <tfoot><tr><td colSpan={colors.length+1}><button type="button" className="countAddModel" onClick={onAdd}>＋ Añadir modelo</button></td></tr></tfoot>}
        </table>
    </div>;
}
