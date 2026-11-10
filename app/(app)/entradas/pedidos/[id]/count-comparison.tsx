import {countComparison,type ComparisonBox,type ComparisonItem} from '@/lib/inventory/count-comparison';
const number=new Intl.NumberFormat('es-MX');
export default function CountComparison({boxes,items}:{boxes:ComparisonBox[];items:ComparisonItem[]}){
 const summary=countComparison(boxes,items);if(!summary)return null;
 const fmt=(n:number|null)=>n===null?'—':number.format(n),delta=(n:number|null)=>n===null?'—':`${n>0?'+':''}${fmt(n)}`;
 return <section className="receivingComparison" aria-label="Comparación del conteo con packing list">
  <div className="receivingComparisonTotals"><span>Packing <b>{fmt(summary.expected)}</b></span><span>Contadas <b>{fmt(summary.counted)}</b></span><span>Diferencia neta <b>{delta(summary.difference)}</b></span></div>
  {summary.unknown>0&&<p className="receivingComparisonWarning">Packing incompleto: {summary.unknown} {summary.unknown===1?'cantidad sin identificar':'cantidades sin identificar'}. No se puede confirmar la diferencia total.</p>}
  {(summary.missing>0||summary.extra>0)?<p className="receivingComparisonWarning">⚠ Faltan {fmt(summary.missing)} · Sobran {fmt(summary.extra)}{summary.unknown?' en modelos con referencia completa':summary.difference===0?' · El total cuadra, pero hay diferencias por modelo/color.':''}</p>:summary.unknown===0&&<p className="receivingComparisonOk">✓ Sin diferencias por modelo/color</p>}
  {summary.rows.length>0&&<details><summary>Ver diferencias por modelo/color</summary><div className="receivingTable"><table><thead><tr><th>Modelo</th><th>Color</th><th>Packing</th><th>Contadas</th><th>Diferencia</th></tr></thead><tbody>{summary.rows.map(r=><tr key={JSON.stringify([r.model,r.color])}><td>{r.model||'Sin modelo'}</td><td>{r.color||'Sin color'}</td><td>{r.unknown?'Sin identificar':fmt(r.expected)}</td><td>{fmt(r.counted)}</td><td>{delta(r.difference)}</td></tr>)}</tbody></table></div></details>}
  <small>Solo las cajas recibidas de este pedido.</small>
 </section>;
}
