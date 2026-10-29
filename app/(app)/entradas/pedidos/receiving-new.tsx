'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function ReceivingNew({ branches,canFreight=false,expanded=false }: {
    canFreight?:boolean;
    expanded?:boolean;
    branches: {
        id: string;
        name: string;
    }[];
}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const router = useRouter();
    return <details className="receivingCreate" open={expanded}><summary>+ Nueva recepción</summary><form className="formGrid card pad receivingCompactForm" style={{ marginTop: 16 }} onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const f = new FormData(e.currentTarget);
            try {
                const reference = `Recepción ${f.get('date')} · ${crypto.randomUUID().slice(0,8)}`;
                const r = await fetch('/api/receiving', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', branchId: f.get('branch'), reference, date: f.get('date'), total: Number(f.get('total')), cost: !canFreight || !f.get('cost') ? null : Number(f.get('cost')), currency: 'MXN', notes: '', carrier: f.get('carrier'), tracking: '' }) });
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
 <label>Sucursal de recepción<select name="branch" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
 <label>Fecha<input name="date" type="date" required defaultValue={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date())}/></label>
 <label>Transportista (opcional)<input name="carrier" maxLength={160} placeholder="Ej. Castores"/></label>
 <label>Número de cajas<input name="total" type="number" min={1} max={1000} step={1} required placeholder="80"/></label>
 {canFreight&&<label>Costo en MXN (opcional)<input name="cost" type="number" min={0} max={999999999} step="0.01" placeholder="0.00"/></label>}
 {error && <p role="alert">{error}</p>}<button className="receivingSave" disabled={busy || !branches.length}>{busy ? 'Creando…' : 'Guardar recepción'}</button>
 </form></details>;
}
