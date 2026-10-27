'use client';

import { useId, useState } from 'react';
import ReceivingModal from './receiving-modal';

type Props = {
    file: File | null;
    busy: boolean;
    attached: boolean;
    onChange: (file: File | null) => void;
    onInterpret: () => void;
    onAttach: () => void;
};

function FileIcon({ kind = 'file' }: { kind?: 'file' | 'camera' | 'photo' | 'plus' | 'sparkles' }) {
    const paths = {
        file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
        camera: 'M14.5 4h-5L7 7H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-4z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
        photo: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1 M3 16l6-6 5 5 3-3 4 4 M16 7h.01',
        plus: 'M12 5v14 M5 12h14',
        sparkles: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 2v4 M18 4h4',
    };
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}

export default function PackingUpload({ file, busy, attached, onChange, onInterpret, onAttach }: Props) {
    const [choosing, setChoosing] = useState(false);
    const [error, setError] = useState('');
    const helpId = useId();
    const pdf = Boolean(file && (/\.pdf$/i.test(file.name) || file.type === 'application/pdf'));
    function select(next: File | undefined) {
        // Canceling the native picker must not clear a file already selected.
        if (!next) return;
        if (!next.size || next.size > 2 * 1024 * 1024) { setError('Elige un archivo de hasta 2 MB que no esté vacío.'); return; }
        if (!/\.(xlsx|png|jpe?g|pdf)$/i.test(next.name)) { setError('Usa Excel .xlsx, una foto JPG/PNG o un PDF.'); return; }
        setError(''); onChange(next); setChoosing(false);
    }
    return <div className="packingUpload" aria-busy={busy}>
        {!file ? <div className="packingUploadEmpty"><span className="packingUploadIllustration"><FileIcon/></span><p>Tu packing list, en un solo lugar</p><span>Sube el archivo o toma una foto.</span>
            <button type="button" className="packingUploadAdd" disabled={busy} onClick={() => { setError(''); setChoosing(true); }}><FileIcon kind="plus"/>Agregar archivo</button>
        </div> : <>
            <div className="packingUploadSelected"><span className="packingUploadFileIcon"><FileIcon/></span><div className="packingUploadFileInfo"><strong title={file.name}>{file.name}</strong><span>{pdf ? 'PDF' : /\.xlsx$/i.test(file.name) ? 'Excel' : 'Foto'} · {file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span></div>
                <button type="button" className="packingUploadChange" disabled={busy} onClick={() => { setError(''); setChoosing(true); }}>Cambiar</button>
            </div>
            <div className="packingUploadActions">{!pdf && <button type="button" className="packingUploadRead" disabled={busy} onClick={onInterpret}><FileIcon kind="sparkles"/>Leer con IA</button>}
                <button type="button" className="packingUploadStore" disabled={busy || attached} onClick={onAttach}>{attached ? '✓ Original guardado' : pdf ? 'Guardar comprobante' : 'Guardar original'}</button>
            </div>
            <p className="packingUploadHint" role="status">{busy ? 'Procesando… No cierres esta pantalla.' : pdf ? 'El PDF se guarda como comprobante, sin lectura con IA.' : 'Revisarás los modelos y colores antes de confirmar.'}</p>
        </>}
        <small id={helpId} className="packingUploadFormats">Excel .xlsx, JPG, PNG o PDF · Máximo 2 MB</small>
        {error && !choosing && <p className="receivingError" role="alert">{error}</p>}
        {choosing && <ReceivingModal title="Agregar archivo" busy={busy} onClose={() => { setChoosing(false); setError(''); }}>
            <p className="packingUploadModalHint">¿De dónde lo agregamos?</p>
            <div className="packingUploadChoices">{([
                { title: 'Tomar foto', hint: 'Abrir la cámara', kind: 'camera', accept: 'image/*', camera: true },
                { title: 'Elegir foto', hint: 'Desde tu galería', kind: 'photo', accept: 'image/*', camera: false },
                { title: 'Seleccionar archivo', hint: 'Excel, PDF o imagen', kind: 'file', accept: '.xlsx,.pdf,.png,.jpg,.jpeg', camera: false },
            ] as const).map(option => <label className="packingUploadChoice" key={option.kind}><span className="packingUploadChoiceIcon"><FileIcon kind={option.kind}/></span><span><b>{option.title}</b><small>{option.hint}</small></span><span className="packingUploadChoiceArrow" aria-hidden="true">›</span>
                <input aria-label={option.title} aria-describedby={helpId} type="file" accept={option.accept} capture={option.camera ? 'environment' : undefined} disabled={busy} onChange={e => { select(e.target.files?.[0]); e.target.value = ''; }}/>
            </label>)}</div>
            {error && <p className="receivingError" role="alert">{error}</p>}
        </ReceivingModal>}
    </div>;
}
