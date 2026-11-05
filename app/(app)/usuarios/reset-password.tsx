'use client';
import { useRef, useState } from 'react';

export default function ResetPassword({ user }: { user: { id: string; name: string; email: string } }) {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const inFlight = useRef(false);
    const trigger = useRef<HTMLButtonElement>(null);
    function close() {
        if (inFlight.current) return;
        setOpen(false); setPassword(''); setConfirmation(''); setMessage('');
        trigger.current?.focus();
    }
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (inFlight.current) return;
        if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
            setMessage('Usa mínimo 8 caracteres y máximo 72 bytes.'); return;
        }
        if (password !== confirmation) { setMessage('Las contraseñas no coinciden.'); return; }
        inFlight.current = true; setBusy(true); setMessage('');
        try {
            const response = await fetch('/api/users', {
                method: 'PATCH', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: user.id, password }),
            });
            const result = await response.json();
            if (!response.ok) { setMessage(result.error || 'No se pudo restablecer. Intenta nuevamente.'); return; }
            setPassword(''); setConfirmation(''); setOpen(false);
            setMessage('Contraseña restablecida. Comparte la nueva contraseña con el colaborador por un medio privado.');
            trigger.current?.focus();
        } catch { setMessage('No se pudo confirmar el cambio. Revisa tu conexión e intenta nuevamente.'); }
        finally { inFlight.current = false; setBusy(false); }
    }
    return <div className="passwordReset">
        <button ref={trigger} type="button" onClick={() => { setMessage(''); setOpen(true); }}>Restablecer contraseña</button>
        {!open && message && <p role="status">{message}</p>}
        {open && <form className="editPanel" onSubmit={submit} aria-label={`Restablecer contraseña de ${user.name}`}>
            <h3>Restablecer contraseña</h3>
            <p>{user.name} · {user.email}</p>
            <p>Solo cambia su contraseña. Sus permisos y movimientos se conservan.</p>
            <div className="usersForm">
                <label>Nueva contraseña<input autoFocus type="password" autoComplete="new-password" required minLength={8} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
                <label>Confirmar contraseña<input type="password" autoComplete="new-password" required value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} /></label>
            </div>
            {message && <p role="alert">{message}</p>}
            <div className="userActions" style={{ marginTop: 12 }}>
                <button type="button" disabled={busy} onClick={close}>Cancelar</button>
                <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar nueva contraseña'}</button>
            </div>
        </form>}
    </div>;
}
