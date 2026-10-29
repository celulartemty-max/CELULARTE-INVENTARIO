import { requireUser, hasModulePermission } from "@/lib/auth/authorization";
import { listProducts } from "@/lib/inventory/products";
import ProductAdmin,{type ProductAdminRow} from "./product-admin";
import './products.css';

export default async function Products(){
  const user=await requireUser();
  if(!await hasModulePermission(user,'PRODUCTOS'))return <section className="card pad"><h1>Productos</h1><p>No tienes permiso para acceder al catálogo de productos. Solicita al administrador que active el permiso de Productos.</p></section>;
  const products=await listProducts();
  return <><header className="productPageHeader"><h1>Productos</h1><p>Modelos y colores se agregan en el packing list.</p></header><ProductAdmin initial={products as unknown as ProductAdminRow[]} canEdit={user.role==='MASTER'}/></>;
}
