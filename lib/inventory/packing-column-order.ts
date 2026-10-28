import type { withTransaction } from '@/lib/db';
type Client = Parameters<Parameters<typeof withTransaction>[0]>[0];

// Keep only colours used in the current view, in the source header order.
// Older/manual data without header metadata keeps its existing encounter order.
export function orderedPackingColors(used: readonly string[], preferred: readonly string[] = []): string[] {
    const present = new Set(used);
    return [...new Set([...preferred.filter(color => present.has(color)), ...used])];
}

export function packingColorOrder(packing: { colors?: string[]; boxes: { items: { color: string }[] }[] }): string[] {
    const normalize = (color: string) => color.trim().toUpperCase();
    const used = packing.boxes.flatMap(box => box.items.map(item => normalize(item.color)));
    return [...new Set([...(packing.colors?.map(normalize) ?? []),...used])];
}

// Call inside the import transaction, after locking the order.
export async function savePackingColorOrder(c: Client, orderId: string, packing: Parameters<typeof packingColorOrder>[0]) {
    const previous = (await c.query('SELECT color_order FROM receiving_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0]?.color_order ?? [];
    const next = [...new Set<string>([...previous,...packingColorOrder(packing)])];
    await c.query('UPDATE receiving_orders SET color_order=$1::text[] WHERE id=$2',[next,orderId]);
}

export async function appendPackingColor(c: Client, orderId: string, color: string) {
    const stored: string[]=(await c.query('SELECT color_order FROM receiving_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0]?.color_order ?? [];
    // Preserve the legacy display order before adding the first new colour.
    const previous: string[]=stored.length ? stored : (await c.query('SELECT DISTINCT l.color FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.order_id=$1 ORDER BY l.color',[orderId])).rows.map(row=>row.color);
    const next=[...new Set([...previous,color])];
    if(stored.length===next.length&&stored.every((value,index)=>value===next[index]))return;
    await c.query('UPDATE receiving_orders SET color_order=$1::text[] WHERE id=$2',[next,orderId]);
}
