import { z } from 'zod';
const text = z.string().trim().max(160);
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
