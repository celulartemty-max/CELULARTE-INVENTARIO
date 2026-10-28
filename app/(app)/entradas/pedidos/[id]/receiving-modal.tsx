'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
export default function ReceivingModal({title,busy,onClose,children,className=''}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode;className?:string}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();return()=>{dialog?.close()}},[]);
 return <dialog className={`receivingModal receivingOrders ${className}`} ref={ref} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();if(!busy)onClose()}}><header className="receivingModalHeader"><h2 id={titleId}>{title}</h2><button type="button" disabled={busy} aria-label="Cerrar ventana" onClick={onClose}>✕</button></header>{children}</dialog>;
}
