# Recepciones por pedido

Ruta: /entradas/pedidos. Las recepciones anteriores se conservan en /entradas y /entradas/[id]. El enlace Nueva recepción dirige al nuevo flujo. TikTok no se modifica.

## Estructura

### Captura por bonches / pedido (2026-10-25)

Aplicar `migrations/20261026_receiving_batches.sql` antes de desplegar. Conserva pedidos previos y registros ajenos anteriores.

1. Crear la recepción con su total físico (ej. 200).
2. Agregar cada bonche como un pedido único: referencia, producto, SEA/AIR, marca manual, propias/ajenas, total marcado en cajas (ej. 20), recibidas hoy (18) y números/rangos (1-12,15-20). No se suponen números faltantes.
3. El servidor genera cajas independientes 1..20 y asigna únicamente las 18 indicadas a esta recepción. Las otras dos permanecen pendientes del mismo pedido. Ninguna cantidad de piezas se precarga.
4. Subir/leer/revisar el packing list seleccionando ese pedido propio ya creado. Se agrega contenido a cajas vacías del pedido, sin crear pedidos ni sumar cajas. No se sobrescriben líneas o conteos existentes. Se aceptan números simples y `1/20` con denominador validado. Los originales se conservan por pedido y acompañan llegadas posteriores.
5. En otra recepción usar «Recibir faltantes de un pedido ya registrado» y rangos, o selección individual solo para formatos especiales. Evita duplicados, números fuera de rango, superposición y cantidades discrepantes.

Los pedidos ajenos usan el mismo control de cajas/llegadas parciales, pero el servidor prohíbe packing lists, alta de modelos y conteo de piezas para ellos. No bloquean el cierre: este exige solo el conteo de las propias recibidas. Exclusivamente ajenas → ARCHIVED sin POS. El total físico/flete incluye ambas clases.

La tabla muestra total del pedido, recibidas aquí, acumuladas y pendientes. El Excel añade «Pedidos por bonche» y mantiene ajenas separadas. Los registros ajenos anteriores permanecen archivados en su tabla original.

- receiving_sessions: llegada física por sucursal, fecha, total de cajas, costo opcional y moneda. Estado DRAFT → CLOSED → POS_REGISTERED, o DRAFT → ARCHIVED si solo hay ajenas.
- receiving_orders: pedido único por referencia (sin distinguir mayúsculas) y sucursal. Producto, AIR/SEA y marca libre confirmados por encargado.
- receiving_cartons: caja única por pedido y número del proveedor. session_id nulo significa pendiente; se asigna una sola vez al llegar. Un pedido puede repartirse entre recepciones.
- receiving_items: modelos/colores por caja. expected es referencia del documento, counted empieza nulo. Cero explícito no equivale a nulo.
- receiving_documents: archivos privados, asociados exclusivamente a un pedido o recepción, hasta 5 de 2 MB cada uno. Imágenes PNG/JPEG, PDF y Excel .xlsx. Los comprobantes no se prorratean automáticamente.

## Permisos y seguridad

Se exige ENTRADAS y acceso vigente a la sucursal. MASTER y MANAGER preparan pedidos y documentos, confirman llegadas y registran el cierre/POS. OPERATIVE cuenta las cajas asignadas sin recibir expected, archivos ni costos en las propiedades RSC ni endpoints de descarga. Los encargados ven las diferencias únicamente después de terminar la caja. Solo MASTER puede autorizar reconteo mientras la recepción siga abierta; se conserva el anterior en auditoría. Cierres/POS son inmutables en esta versión.

Los documentos originales se descargan como attachment, no se sirven públicamente. Los nuevos movimientos y cambios se auditan en audit_events (sin borrar historial). El nuevo flujo no crea registros en las tablas legacy receptions: los listados anteriores no contabilizan estas llegadas; el nuevo panel tiene su propio estado y registro POS manual. No hay sincronización automática de existencias de un POS externo.

## IA

La clave OPENAI_API_KEY se usa solo en servidor. Se llama directamente a OpenAI, conforme al saldo contratado por el usuario. No se usa Vercel AI Gateway. Modelo inicial gpt-4.1-mini, store:false, máximo 12000 tokens de salida, timeout 45s y sin reintentos automáticos. Los documentos se envían a OpenAI solo al pulsar Leer con IA. No hay aprobación ni inserción de cajas automática. Los datos dudosos quedan pendientes de revisión; no hay aprendizaje persistente automático de formatos.

Límites iniciales para capacitación: 20 solicitudes/día/usuario, 50/día global y 100/mes global. Cada intento reserva una solicitud antes de llamar a OpenAI, incluso si falla. No son un límite monetario garantizado. Mantener la recarga automática de OpenAI desactivada según la decisión del usuario.

Excel se extrae como texto; las imágenes se envían como entrada visual. PDF se admite como adjunto, no se interpreta automáticamente en esta versión. Máximo 100000 caracteres extraídos y límites de ZIP. Si la lectura no valida, no se crea ningún pedido. La vista previa admite correcciones de cajas/modelos/colores y captura manual sin archivo.

## Despliegue y verificación

Aplicar migrations/20261025_receiving_orders.sql primero en una rama Neon de prueba, ejecutar tests/receiving-orders-db.sql y después aplicar en producción con respaldo previo. La migración es aditiva. No se puede habilitar el nuevo enlace sin migración.

Ejecutar npm run typecheck y npm test. La prueba SQL simula 9 de 10 cajas, llegada posterior bajo el mismo pedido, cero, nulo y restricciones de duplicados/negativos; revierte sus fixtures. La lectura real con OpenAI debe validarse en Production porque la clave fue configurada solo ahí; Preview debe mostrar falta de configuración, nunca usar credenciales productivas por defecto.

## Cajas ajenas (2026-10-26)

Aplicar `migrations/20261026_receiving_foreign_cartons.sql` antes del despliegue. Probar primero en la rama aislada.

- La sucursal de recepción es el lugar físico de llegada. El total físico incluye cajas propias y ajenas; el costo y sus comprobantes cubren la recepción completa.
- Dos pestañas: propias con pedidos/packing lists/conteo; ajenas como registro manual de producto, cantidad de cajas, SEA/AIR, marca libre y observaciones. No se fusionan registros automáticamente.
- Las ajenas no tienen items, pedidos ni packing lists: no se pueden contar ni registran piezas de inventario. No escribirlas en la pestaña propia.
- Marcas libres hasta 160 caracteres; las propias permiten una marca inicial por pedido y corrección independiente por caja recibida. Nunca se deduce el destino de una marca.
- El cierre exige total físico exacto y conteo terminado solo de las propias. Una recepción exclusivamente ajena queda ARCHIVED sin pendiente POS. Si es mixta, el registro POS corresponde solo a las cajas propias.
- Solo MASTER/MANAGER pueden guardar/editar/anular registros ajenos o marcas. Edición solo en DRAFT; anulación lógica y auditoría preservan el historial.
- El Excel separa recepción general, detalle de propias y registro de ajenas. Las etiquetas TikTok y el inventario anterior no se modifican.
