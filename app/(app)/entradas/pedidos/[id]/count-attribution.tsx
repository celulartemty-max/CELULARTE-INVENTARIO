export default function CountAttribution({name,at}:{name?:string|null;at:string|null}){
 if(!name||!at)return null;
 const date=new Date(at),valid=!Number.isNaN(date.getTime());
 return <p className="receivingMuted">Contada por <b>{name}</b>{valid&&<> · <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date)}</time></>}</p>;
}
