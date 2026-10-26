import { z } from 'zod';
const text = z.string().trim().max(160);
export const markingSchema = text.min(1, 'Escribe la marca de la caja.');
export function parseCartonNumbers(value: string, total: number): string[] {
    if (!Number.isInteger(total) || total < 1 || total > 1000) throw new Error('Total del pedido no válido.');
    const numbers = new Set<number>();
    const parts = value.trim().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').split(/[,;\s]+/).filter(Boolean);
    if (!parts.length) throw new Error('Indica cuáles cajas llegaron, por ejemplo 1-18 o 1-12,15-20.');
    for (const part of parts) {
        if (!/^\d+(?:-\d+)?$/.test(part)) throw new Error('Usa números y rangos: 1-12,15-20.');
        const [start, end = start] = part.split('-').map(Number);
        if (start < 1 || end < start || end > total) throw new Error(`Los números deben estar entre 1 y ${total}.`);
        for (let n = start; n <= end; n++) {
            if (numbers.has(n)) throw new Error(`La caja ${n} está repetida.`);
            numbers.add(n);
        }
    }
    return Array.from(numbers).sort((a,b) => a-b).map(String);
}
export const batchSchema = z.object({
    reference: text.min(1), productId: z.string().uuid().nullable(), productLabel: text.default(''),
    shipping: z.enum(['SEA','AIR']), marking: markingSchema, isForeign: z.boolean(),
    total: z.number().int().min(1).max(1000), received: z.number().int().min(1).max(1000), numbers: z.string().trim().max(6000)
}).superRefine((x,ctx) => {
    if (!x.productId && (!x.isForeign || !x.productLabel)) ctx.addIssue({code:'custom',message:'Selecciona el producto; para ajenas puedes escribirlo manualmente.'});
    if (x.received > x.total) ctx.addIssue({code:'custom',message:'No pueden llegar más cajas que el total del pedido.'});
    try { if (parseCartonNumbers(x.numbers,x.total).length !== x.received) ctx.addIssue({code:'custom',message:'Los números de caja no coinciden con la cantidad recibida hoy.'}); }
    catch(e) { ctx.addIssue({code:'custom',message:e instanceof Error ? e.message : 'Números de caja no válidos.'}); }
});
export const foreignCartonSchema = z.object({
    product: text.min(1), quantity: z.number().int().min(1).max(1000),
    shipping: z.enum(['SEA', 'AIR']), marking: markingSchema,
    notes: z.string().trim().max(2000).default('')
});
export const packingSchema = z.object({
    reference: text, warnings: z.array(z.string().max(500)).max(100),
    boxes: z.array(z.object({ number: text.min(1), items: z.array(z.object({
            model: text, color: text, expected: z.number().int().min(0).max(1000000).nullable()
        })).min(1).max(500) })).min(1).max(1000)
}).superRefine((p, ctx) => {
    const boxes = new Set<string>();
    p.boxes.forEach((b, i) => {
        if (boxes.has(b.number))
            ctx.addIssue({ code: 'custom', message: 'Número de caja repetido', path: ['boxes', i] });
        boxes.add(b.number);
        const items = new Set<string>();
        b.items.forEach((l, j) => {
            const key = JSON.stringify([l.model.toUpperCase(), l.color.toUpperCase()]);
            if (items.has(key))
                ctx.addIssue({ code: 'custom', message: 'Modelo/color repetido en la misma caja', path: ['boxes', i, 'items', j] });
            items.add(key);
        });
    });
});
export const arrivalSchema = z.array(z.string().uuid()).min(1).max(1000).refine(v => new Set(v).size === v.length, 'Cajas repetidas');
export const countSchema = z.array(z.object({ id: z.string().uuid(), quantity: z.number().int().min(0).max(1000000) })).min(1).max(500).refine(v => new Set(v.map(x => x.id)).size === v.length, 'Líneas repetidas');
export function isReviewer(role: string) { return role === 'MASTER' || role === 'MANAGER'; }
