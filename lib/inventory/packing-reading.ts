import { packingSchema } from './receiving-validation';

// Constrain AI transport types; business limits and duplicates are still checked below.
export const packingResponseFormat = {
    type: 'json_schema',
    json_schema: {
        name: 'packing_list', strict: true,
        schema: {
            type: 'object', additionalProperties: false,
            required: ['reference', 'colors', 'warnings', 'boxes'],
            properties: {
                reference: { type: 'string' },
                colors: { type: 'array', items: { type: 'string' } },
                warnings: { type: 'array', items: { type: 'string' } },
                boxes: { type: 'array', items: {
                    type: 'object', additionalProperties: false, required: ['number', 'items'],
                    properties: {
                        number: { type: 'string' },
                        items: { type: 'array', items: {
                            type: 'object', additionalProperties: false, required: ['model', 'color', 'expected'],
                            properties: { model: { type: 'string' }, color: { type: 'string' }, expected: { type: ['integer', 'null'] } }
                        } }
                    }
                } }
            }
        }
    }
} as const;

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function label(value: unknown) {
    return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
}
function quantity(value: unknown) {
    // Never coerce blanks, booleans, decimal notation, totals or unknown text into zero.
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
}
export function parsePackingReading(content: unknown) {
    let value: unknown;
    try { value = typeof content === 'string' ? JSON.parse(content) : content; }
    catch { throw new Error('La IA devolvió una lectura incompleta o con formato inválido. No se importó nada.'); }
    if (record(value)) {
        value = {
            ...value,
            reference: value.reference == null ? '' : label(value.reference),
            warnings: value.warnings == null ? [] : value.warnings,
            boxes: Array.isArray(value.boxes) ? value.boxes.map(box => !record(box) ? box : {
                ...box, number: label(box.number),
                items: Array.isArray(box.items) ? box.items.map(item => !record(item) ? item : {
                    ...item, model: label(item.model), expected: quantity(item.expected)
                }) : box.items
            }) : value.boxes
        };
    }
    const parsed = packingSchema.safeParse(value);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const boxIndex = issue.path[0] === 'boxes' && typeof issue.path[1] === 'number' ? issue.path[1] + 1 : null;
        const location = boxIndex ? ` en la caja de la posición ${boxIndex}` : '';
        const reason = issue.code === 'custom' ? issue.message : issue.path.includes('expected') ? 'Cantidad de referencia inválida' : 'Formato de lectura inválido';
        throw new Error(`${reason}${location}. No se importó nada. Revisa la lectura o captura el contenido manualmente.`);
    }
    return parsed.data;
}
