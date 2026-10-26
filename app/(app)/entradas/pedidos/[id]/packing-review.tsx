'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { packingSchema } from '@/lib/inventory/receiving-validation';

type Packing = z.infer<typeof packingSchema>;
type PackingBox = Packing['boxes'][number];

// Keep original line indexes: a grid must never sum or merge duplicate readings.
export function boxGrid(box: PackingBox) {
    const models = Array.from(new Set(box.items.map(item => item.model)));
    const colors = Array.from(new Set(box.items.map(item => item.color)));
    const cells = new Map<string, number[]>();
    box.items.forEach((item, index) => {
        const key = JSON.stringify([item.model, item.color]);
        cells.set(key, [...(cells.get(key) ?? []), index]);
    });
    return { models, colors, cells };
}

export default function PackingReview({ packing, busy, onChange }: {
    packing: Packing; busy: boolean; onChange: (packing: Packing) => void;
}) {
    const [selected, setSelected] = useState(0);
    const [reviewed, setReviewed] = useState<number[]>([]);
    const [pendingOnly, setPendingOnly] = useState(false);
    const [newModel, setNewModel] = useState('');
    const [newColor, setNewColor] = useState('');
    const visible = packing.boxes.map((_, index) => index).filter(index => !pendingOnly || !reviewed.includes(index));
    const index = visible.includes(selected) ? selected : (visible[0] ?? -1);
    const box = packing.boxes[index];
    const position = visible.indexOf(index);
    const grid = box ? boxGrid(box) : null;
    const missing = box?.items.filter(item => item.expected === null).length ?? 0;
    const total = box?.items.reduce((sum, item) => sum + (item.expected ?? 0), 0) ?? 0;

    function changeBox(next: PackingBox) {
        setReviewed(previous => previous.filter(value => value !== index));
        onChange({ ...packing, boxes: packing.boxes.map((value, i) => i === index ? next : value) });
    }
    function removeLine(lineIndex: number) {
        if (!box || box.items.length === 1 || !confirm('¿Quitar esta combinación de modelo y color de la lectura?')) return;
        changeBox({ ...box, items: box.items.filter((_, i) => i !== lineIndex) });
    }
    function addLine(model: string, color: string) {
        if (!box || box.items.length >= 500) return;
        changeBox({ ...box, items: [...box.items, { model, color, expected: null }] });
    }
    function addBox() {
        const used = new Set(packing.boxes.map(value => value.number));
        let number = 1;
        while (used.has(String(number))) number++;
        onChange({ ...packing, boxes: [...packing.boxes, { number: String(number), items: [{ model: '', color: '', expected: null }] }] });
        setPendingOnly(false);
        setSelected(packing.boxes.length);
    }

    return <fieldset className="packingReview" disabled={busy}>
        <div className="packingReviewTop">
            <div><h3>Revisión por caja</h3><p>{packing.boxes.length} cajas · {reviewed.length} revisadas · {packing.boxes.length - reviewed.length} pendientes</p></div>
            <label className="packingPendingFilter"><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />Solo pendientes de revisar</label>
        </div>
        <div className="packingNavigation">
            <button type="button" className="receivingSecondary" disabled={position <= 0} onClick={() => setSelected(visible[position - 1])}>← Anterior</button>
            <label>Caja<select aria-label="Seleccionar caja para revisar" value={index} onChange={event => setSelected(Number(event.target.value))}>
                {!visible.length && <option value={-1}>Todas revisadas</option>}
                {visible.map(i => <option key={i} value={i}>Caja {packing.boxes[i].number} · {reviewed.includes(i) ? 'Revisada' : 'Pendiente'}</option>)}
            </select></label>
            <button type="button" className="receivingSecondary" disabled={position < 0 || position >= visible.length - 1} onClick={() => setSelected(visible[position + 1])}>Siguiente →</button>
        </div>
        {box && grid ? <>
            <div className="packingSheetTitle"><b>Caja {box.number}</b><span>{grid.models.length} modelos · {grid.colors.length} colores</span><span>{total.toLocaleString('es-MX')} piezas de referencia{missing > 0 ? ' conocidas' : ''}</span></div>
            <p className="packingSheetHelp">Cantidades del packing list, no del conteo real. Edita una celda para corregirla. Amarillo = cantidad sin identificar; — = combinación no incluida.</p>
            <div className="packingSheetScroll" role="region" aria-label={`Hoja de la caja ${box.number}`} tabIndex={0}>
                <table className="packingSheet">
                    <caption>Caja {box.number}: modelos en filas y colores en columnas</caption>
                    <thead><tr><th scope="col">Modelo / Color</th>{grid.colors.map(color => <th scope="col" key={color}>{color || 'Sin color'}</th>)}</tr></thead>
                    <tbody>{grid.models.map(model => <tr key={model}><th scope="row">{model || 'Sin modelo'}</th>{grid.colors.map(color => {
                        const lines = grid.cells.get(JSON.stringify([model, color])) ?? [];
                        return <td key={color} className={lines.some(i => box.items[i].expected === null) ? 'packingUnclear' : ''}>
                            {lines.length ? lines.map((lineIndex, duplicate) => <div className="packingCell" key={lineIndex}>
                                {lines.length > 1 && <small>Duplicado {duplicate + 1}: corrige en “Ajustar”</small>}
                                <input type="number" inputMode="numeric" min={0} max={1000000} step={1} placeholder="Revisar" aria-label={`Caja ${box.number}, ${model || 'sin modelo'}, ${color || 'sin color'}${lines.length > 1 ? `, línea ${duplicate + 1}` : ''}`} value={box.items[lineIndex].expected ?? ''}
                                    onChange={event => changeBox({ ...box, items: box.items.map((item, i) => i === lineIndex ? { ...item, expected: event.target.value === '' ? null : Number(event.target.value) } : item) })} />
                            </div>) : <button type="button" className="packingAbsent" aria-label={`Agregar ${model || 'sin modelo'}, ${color || 'sin color'} a caja ${box.number}`} title="Agregar esta combinación" disabled={box.items.length >= 500} onClick={() => addLine(model, color)}>—</button>}
                        </td>;
                    })}</tr>)}</tbody>
                </table>
            </div>
            <div className="packingReviewBottom"><span>{missing > 0 ? `${missing} cantidades sin identificar. Puedes conservarlas vacías.` : 'Todas las cantidades de referencia tienen un valor.'}</span>
                <button type="button" className="receivingPrimary" disabled={reviewed.includes(index)} onClick={() => { setReviewed(previous => [...previous, index]); if (position < visible.length - 1) setSelected(visible[position + 1]); }}>{reviewed.includes(index) ? '✓ Caja revisada' : '✓ Marcar caja revisada'}</button>
            </div>
            <details className="packingAdjust"><summary>Ajustar modelos, colores o número de caja</summary>
                <label className="receivingField">Número de caja<input required maxLength={160} value={box.number} onChange={event => changeBox({ ...box, number: event.target.value })} /></label>
                <div className="packingLineAdjustments">{box.items.map((item, lineIndex) => <div className="packingAdjustLine" key={lineIndex}>
                    <input aria-label={`Modelo de línea ${lineIndex + 1}`} placeholder="Modelo" maxLength={160} value={item.model} onChange={event => changeBox({ ...box, items: box.items.map((value, i) => i === lineIndex ? { ...value, model: event.target.value } : value) })} />
                    <input aria-label={`Color de línea ${lineIndex + 1}`} placeholder="Color (opcional)" maxLength={160} value={item.color} onChange={event => changeBox({ ...box, items: box.items.map((value, i) => i === lineIndex ? { ...value, color: event.target.value } : value) })} />
                    <button type="button" className="receivingSecondary" disabled={box.items.length === 1} onClick={() => removeLine(lineIndex)}>Quitar línea {lineIndex + 1}</button>
                </div>)}</div>
                <div className="packingAdjustLine">
                    <input aria-label="Nuevo modelo" placeholder="Nuevo modelo" maxLength={160} value={newModel} onChange={event => setNewModel(event.target.value)} />
                    <input aria-label="Nuevo color" placeholder="Color (opcional)" maxLength={160} value={newColor} onChange={event => setNewColor(event.target.value)} />
                    <button type="button" className="receivingSecondary" disabled={!newModel.trim() || box.items.length >= 500} onClick={() => { addLine(newModel.trim(), newColor.trim()); setNewModel(''); setNewColor(''); }}>+ Modelo / color</button>
                </div>
                <button type="button" className="packingDanger" disabled={packing.boxes.length === 1} onClick={() => { if (!confirm(`¿Quitar la caja ${box.number} de la lectura?`)) return; onChange({ ...packing, boxes: packing.boxes.filter((_, i) => i !== index) }); setReviewed([]); setSelected(0); }}>Quitar esta caja de la lectura</button>
            </details>
        </> : <div className="receivingEmpty">Todas las cajas están marcadas como revisadas. Desactiva el filtro para volver a verlas.</div>}
        <div className="actions"><button type="button" className="receivingSecondary" disabled={packing.boxes.length >= 1000} onClick={addBox}>+ Otra caja independiente</button></div>
        <small className="receivingMuted">Las marcas de revisión son de esta vista previa; el contenido se guarda al confirmar el pedido.</small>
    </fieldset>;
}
