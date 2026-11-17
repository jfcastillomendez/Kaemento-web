# Boquilla Mágica: precio y compra online

Precio regular: $51.900 COP por kit de 1 kg. Lanzamiento: 15% ($44.115), redondeado a favor del cliente a **$44.000 COP**, IVA incluido. Sin plazo inventado. Mismo precio en los cinco colores oficiales.

El carrito de Boquilla conserva solamente colores y cantidades en su propia clave local, permite combinar colores, editar cantidades y quitar líneas. No modifica el carrito de microcemento. Los datos personales se solicitan en el diálogo de compra existente y no se guardan en el navegador.

El backend valida estrictamente las variantes y establece $44.000 en la transacción atómica de Redis; nunca acepta un precio o total propuesto por el navegador. Los pedidos usan referencia KAE-BOQUILLA, firma de integridad Bold, token privado de consulta e idempotencia del checkout existentes. Solamente el webhook autenticado aprueba el pago y genera los trabajos de correo. No consume cupos de la promoción de microcemento.

Resultado, correos y autorización de Google Ads reconocen Boquilla. La acción Compra conserva exactamente su send_to oficial y sus controles de pago real y emisión única. Pendiente, rechazado, retorno de Bold o clic en pagar no autorizan Compra. El carrito coincidente se limpia solamente tras la confirmación pagada del backend.

Validación: 140 pruebas aprobadas, sin omisiones. Pruebas unitarias, navegador con carrito multicolor y conservación al recargar, Redis local aislado, webhook HMAC sintético, rechazo de montos alterados, concurrencia e idempotencia de pedido/conversión, contenido de correos y limpieza de carrito. Sin pagos, correos ni conversiones reales.

## Presentación vigente desde 17 de noviembre
Kit de 1 kg de polvo en bolsa interior, aditivo de 30 ml, espátula plástica y toalla de microfibra. La etiqueta indica 450 ml de agua + 30 ml de aditivo por 1 kg de polvo. Se actualizaron inicio (ambos bloques), catálogo web, subpágina, galería y visor, buscador, etiquetas descargables, ficha del catálogo PDF, descripción del pedido y correos. Precio $44.000 COP y validación de pagos sin cambios. Fuentes: las tres etiquetas oficiales entregadas por KAEMENTO el 17 de noviembre. La imagen comercial es un mockup ilustrativo de esa presentación.
