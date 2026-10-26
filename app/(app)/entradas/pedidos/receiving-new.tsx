'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function ReceivingNew({ branches }: {
    branches: {
        id: string;
        name: string;
    }[];
}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const router = useRouter();
    return <details className="card pad"><summary>+ Crear recepción general</summary><form className="formGrid" style={{ marginTop: 16 }} onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const f = new FormData(e.currentTarget);
            try {
                const r = await fetch('/api/receiving', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', branchId: f.get('branch'), reference: f.get('reference'), date: f.get('date'), total: Number(f.get('total')), cost: f.get('cost') === '' ? null : Number(f.get('cost')), currency: f.get('currency'), notes: f.get('notes'), carrier: f.get('carrier'), tracking: f.get('tracking') }) });
                const j = await r.json();
                if (!r.ok)
                    throw new Error(j.error);
                router.push(`/entradas/pedidos/${j.id}`);
            }
            catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudo crear');
            }
            finally {
                setBusy(false);
            }
        }}>
 <label>Sucursal donde llega físicamente<select name="branch" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><small>Después separarás las cajas de esta sucursal y las ajenas.</small></label>
 <label>Referencia de la recepción<input name="reference" required maxLength={160} placeholder="Ej. Llegada del lunes"/></label>
 <label>Fecha de llegada<input name="date" type="date" required defaultValue={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date())}/></label>
 <label>Total físico de cajas (propias + ajenas)<input name="total" type="number" min={1} max={1000} step={1} required placeholder="80"/></label>
 <label>Transportista (opcional)<input name="carrier" maxLength={160} placeholder="Ej. Castores"/></label>
 <label>Número de guía (opcional)<input name="tracking" maxLength={160}/></label>
 <label>Costo total (opcional)<input name="cost" type="number" min={0} step="0.01"/></label>
 <label>Moneda<select name="currency"><option>MXN</option><option>USD</option><option>CNY</option></select></label>
 <label>Observaciones<textarea name="notes" maxLength={2000}/></label>
 {error && <p role="alert">{error}</p>}<button disabled={busy || !branches.length}>{busy ? 'Creando…' : 'Crear recepción'}</button>
 </form></details>;
}
