# Acceso a promoción y simulador

## Recorrido

`site.js` carga `commercial-access.js` y su hoja de estilos en páginas comerciales, excluyendo el resultado de pago. La franja permanece debajo de la navegación en escritorio y abajo en pantallas de hasta 900 px. Se oculta ante un diálogo, menú abierto y, en móvil, al escribir en un campo o ver el carrito. WhatsApp conserva un espacio independiente.

Home reutiliza el bloque de lanzamiento después del hero institucional. Muestra la oferta disponible y una imagen fija de la sala, sin cambios de tonalidad ni controles sobre la primera imagen. El botón dorado «PRUEBA TU TONALIDAD» conduce al simulador completo con paredes y piso independientes. La franja utiliza el mismo nombre. Las subpáginas llevan al simulador de Producto Microcemento. Los cambios de tonalidad ocurren únicamente dentro del simulador; los accesos no seleccionan productos ni agregan al carrito.

El hero institucional, las piezas aprobadas de Producto y Servicio, el checkout, los precios del servidor, Redis, Bold y Resend no cambian.

## Disponibilidad

`launch-availability.js` comparte una consulta pública a `/api/bold/promotion` entre los contadores y la franja. Solo anuncia el descuento cuando la respuesta válida confirma `active`. Ante `ended`, `sold_out`, `upcoming` o error, retira el descuento de los nuevos espacios comerciales. La fecha del servidor también limita la presentación si vence entre consultas. No se inventan cupos. Una sola solicitud puede estar en curso y no se consulta con el documento oculto.

## Medición

Los eventos atraviesan las listas permitidas existentes de `analytics.js` y `analytics-bridge.js`, conservando la eliminación de datos personales y los IDs existentes:

- `view_promotion`: una vez por página, únicamente con oferta activa y franja visible.
- `select_promotion`: clic hacia una oferta activa.
- `microcemento_simulator_open`: clic en un nuevo acceso al simulador.
- `microcemento_simulator_start`: primera elección válida de color o mezcla realizada por el usuario después de ver el simulador completo.

Los últimos dos no son eventos de compra ni contienen importe, referencia de pedido o datos personales. La conversión de Google Ads continúa exclusivamente en el flujo existente de pago verificado.

## Validación

- Suite completa: `node --test tests/*.test.cjs`, usando Redis aislado mediante `REDIS_SERVER_BIN`.
- `tests/commercial-access-browser.cjs`: cinco anchos entre 320 y 1440 px, rutas cruzadas, teclado, carrito, menú, disponibilidad, ausencia de overflow y distinción entre abrir/utilizar. Todos los proveedores externos están bloqueados.
- `tests/color-preview-browser.cjs`: ambos configuradores, seis ambientes, variantes, mezclas, acabados, carrito y dos checkouts exclusivamente simulados.
- `tests/launch-availability-client.test.cjs`: deduplicación de solicitudes, pausas, errores y caducidad. Se conservan las pruebas originales de cuotas basadas en pagos reales.

Revisión de color del 10 de octubre de 2026: se volvieron a medir las cinco regiones de la pieza oficial documentadas en `color-preview.md`. Extra Blanco, Arena, Negro Profundo y Terracota coinciden con sus medianas originales. Gris Cemento conserva el ajuste aprobado de +32 por canal. Se revisaron diez representaciones Mate/Brillante y los seis ambientes frente a las fotos de terrazas entregadas. Posteriormente el usuario solicitó aclarar nuevamente el Gris Cemento y hacer su veta algo más visible: el ajuste de Preview se documenta en `color-preview.md`. La fórmula de mezcla no cambia; las fotografías no permiten demostrar igualdad colorimétrica con muestras físicas.
