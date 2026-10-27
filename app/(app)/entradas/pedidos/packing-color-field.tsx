'use client';
import { useState } from 'react';

export default function PackingColorField({colors,disabled=false}:{colors:string[];disabled?:boolean}){
    const [choice,setChoice]=useState('');
    const options=Array.from(new Set(colors.filter(Boolean)));
    return <div className="receivingField">
        <label>Color (opcional)<select name={choice==='__new__'?undefined:'color'} value={choice} disabled={disabled} onChange={e=>setChoice(e.target.value)}>
            <option value="">Sin color</option>
            {options.map(color=><option key={color} value={color}>{color}</option>)}
            <option value="__new__">＋ Añadir otro color</option>
        </select></label>
        {choice==='__new__'&&<label>Nuevo color<input name="color" maxLength={160} required disabled={disabled} placeholder="Ej. AZUL MARINO" autoFocus/></label>}
        <small>Colores de este pedido. Un color nuevo se añade solo al conteo de esta caja.</small>
    </div>;
}
