import { z } from 'zod';
export const SHIPPING_MARKS = ['PER','JAPS','GAL','AD','JAPU','JACG','ASL','MCFE'] as const;
export const shippingMarkSchema = z.enum(SHIPPING_MARKS);
export function destinationName(mark: string): string | null {
    return mark === 'PER' ? 'Treviño' : mark === 'JAPS' ? 'Plaza del Audio' : null;
}
