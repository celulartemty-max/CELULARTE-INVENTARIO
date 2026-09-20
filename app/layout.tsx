import type { Metadata } from "next";
import "./globals.css";
import "./reception-mobile.css";
export const metadata:Metadata={title:"CELULARTE Inventario",description:"Control operativo de movimientos de inventario"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
