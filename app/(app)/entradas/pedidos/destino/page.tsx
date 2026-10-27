import { redirect } from 'next/navigation';

// Preserve existing bookmarks, but keep a single receipt-based entry point.
export default function Page() {
    redirect('/entradas/pedidos');
}
