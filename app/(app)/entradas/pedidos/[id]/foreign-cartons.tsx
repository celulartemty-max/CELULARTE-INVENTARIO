'use client';
import { useState } from 'react';
import {SHIPPING_MARKS} from '@/lib/inventory/shipping-marks';
export type ForeignCarton = { id: string; product: string; carton_count: number; shipping: string; marking: string; notes: string };
export default function ForeignCartons({ rows, editable, busy, save, voidRecord }: {
    rows: ForeignCarton[]; editable: boolean; busy: boolean;
    save: (value: Record<string, unknown>) => Promise<boolean>;
    voidRecord: (id: string) => void;
}) {
    const [editing, setEditing] = useState<ForeignCarton | null>(null);
    const [formKey, setFormKey] = useState(0);
    return <section className="card pad"><h2>Cajas ajenas · solo registro</h2>
        <p>No se abren ni se cuentan sus piezas. Se incluyen en el total físico y el flete, pero no en el inventario ni en el registro pendiente en sistema de esta sucursal.</p>
        <div className="receivingTable"><table><thead><tr><th>Producto</th><th>Cajas</th><th>SEA / AIR</th><th>Marca escrita</th><th>Observaciones</th>{editable && <th>Acciones</th>}</tr></thead><tbody>
            {rows.map(r => <tr key={r.id}><td>{r.product}</td><td>{r.carton_count}</td><td>{r.shipping}</td><td>{r.marking}</td><td>{r.notes || '—'}</td>{editable && <td><button disabled={busy} onClick={() => { setEditing(r); setFormKey(k => k + 1); }}>Editar</button> <button disabled={busy} onClick={() => { if (confirm('¿Anular este registro de cajas ajenas? Se conservará en auditoría.')) voidRecord(r.id); }}>Anular</button></td>}</tr>)}
        </tbody><tfoot><tr><th>Total ajenas</th><td>{rows.reduce((n,r) => n + r.carton_count, 0)}</td><td colSpan={editable ? 4 : 3}/></tr></tfoot></table></div>
        {!rows.length && <p>Aún no hay cajas ajenas registradas.</p>}
        {editable && <form key={formKey} className="formGrid" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const ok = await save({ action: 'foreign', ...(editing ? { recordId: editing.id } : {}), product: f.get('product'), quantity: Number(f.get('quantity')), shipping: f.get('shipping'), marking: f.get('marking'), notes: f.get('notes') }); if (ok) { setEditing(null); setFormKey(k => k + 1); } }}>
            <h3>{editing ? 'Editar registro' : 'Agregar registro de cajas ajenas'}</h3>
            <label>Tipo de producto (según etiqueta)<input name="product" required maxLength={160} defaultValue={editing?.product ?? ''} placeholder="Ej. PREMIUM LENS"/></label>
            <label>Cantidad de cajas<input name="quantity" type="number" min={1} max={1000} step={1} required defaultValue={editing?.carton_count ?? ''}/></label>
            <label>Transporte<select name="shipping" required defaultValue={editing?.shipping ?? ''}><option value="" disabled>Selecciona…</option><option>SEA</option><option>AIR</option></select></label>
            <label>Shipping Mark<select name="marking" required defaultValue={editing?.marking ?? ''}><option value="" disabled>Selecciona…</option>{SHIPPING_MARKS.map(mark=><option key={mark}>{mark}</option>)}</select></label>
            <label>Observaciones<textarea name="notes" maxLength={2000} defaultValue={editing?.notes ?? ''}/></label>
            <div className="actions"><button disabled={busy}>{editing ? 'Guardar cambios' : 'Registrar cajas ajenas'}</button>{editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setFormKey(k => k + 1); }}>Cancelar edición</button>}</div>
            <small>Cada registro se conserva por separado; no se combina automáticamente con otros.</small>
        </form>}
    </section>;
}
