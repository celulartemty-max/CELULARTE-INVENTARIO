/** Use the calendar date, not server/device timezone, for the arrival weekday. */
export function receiptTitle(arrivalDate:string,totalBoxes:number){
  const date=new Date((arrivalDate||'').slice(0,10)+'T12:00:00Z');
  const day=Number.isNaN(date.getTime())?'RECEPCIÓN':new Intl.DateTimeFormat('es-MX',{weekday:'long',timeZone:'UTC'}).format(date).toLocaleUpperCase('es-MX');
  return `${day} - ${totalBoxes} Cajas`;
}
