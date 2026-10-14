# Consulta de aplicación y cálculo de kits

Disponibles junto al simulador de Inicio y Producto Microcemento. No cambian la contratación del servicio, precios, rendimiento declarado en las fichas, condiciones de transporte ni la validación server-side del pedido.

## Área → cantidad

- «Calcular kits por área» está junto al selector de ambientes. Calcula `ceil(m² / 10)` con hasta dos decimales y rellena el campo de cantidad de la superficie activa. Por ejemplo, 26 m² → 3 kits, 10 m² → 1 kit, 10,01 m² → 2 kits.
- Piso y muros mantienen áreas, tonalidades, mezclas, acabados y cantidades independientes. El cliente puede modificar manualmente la cantidad sugerida. No se añade nada al carrito automáticamente.
- Área vacía, cero, negativa o inválida borra la sugerencia de cantidad. No hay tope comercial de 20 kits: por ejemplo, 200,01 m² completa 21 kits y 510 m² completa 51. Se pueden ajustar, combinar y pagar cantidades superiores a 20, y la consulta por WhatsApp las conserva. La validación compartida exige enteros positivos y totales representables con precisión; el servidor conserva el límite de tamaño de solicitud y las validaciones de precio.
- Añadir al carrito reinicia el área y los controles de esa superficie. Su referencia visual sigue marcada «En carrito». Editar una configuración no reutiliza el área de otra elección.

## Consulta → WhatsApp → regreso

- «Cotizar material + aplicación por WhatsApp» prepara un enlace al número comercial existente. El cliente revisa y envía el mensaje; pulsar el enlace no envía un mensaje ni constituye una compra o una venta confirmada.
- Incluye el ambiente, configuraciones del carrito y borradores del simulador identificados por separado. Se detallan superficie, tono/mezcla, porcentajes, sellador y cantidad. El área es orientativa; las selecciones aún no añadidas se identifican explícitamente.
- Abre una pestaña/app externa con `noopener noreferrer`. Se conserva el documento original y se crea un respaldo exclusivo de esta consulta en `sessionStorage`, por ruta y pestaña, con caducidad de dos horas. Se consume al regresar; continuar interactuando en el sitio cancela la excepción. Las recargas y salidas normales siguen vaciando el carrito.
- `microcemento-consultation.js` coordina los adaptadores del carrito y simulador. El regreso con historial restaura el estado validado, incluyendo ambiente, superficie activa y referencias visuales. No vuelve a emitir `add_to_cart`. Nunca persiste precios, datos personales, tokens, pedidos ni estados de pago; los totales se recalculan con la configuración vigente.
- Si el navegador impide el almacenamiento, la pestaña original sigue disponible. La recuperación tras descartar el documento depende de que el navegador conserve su almacenamiento de sesión.
- Durante edición del carrito o preparación del pago se bloquean la consulta y el cálculo de área. El inicio del checkout cancela cualquier respaldo pendiente; Bold y el backend mantienen sus validaciones.

## Verificación

`node --test tests/*.test.cjs` conserva las pruebas de pedidos y pagos. `node tests/color-preview-browser.cjs` cubre el simulador y checkouts sintéticos. `node tests/consultation-browser.cjs` comprueba en ambas páginas: límites y redondeo, edición manual, independencia, contenido del mensaje, apertura en otra pestaña, regreso con historial, consumo/caducidad del respaldo, recarga y navegación normales, almacenamiento bloqueado y anchos de 320, 390, 768, 1024 y 1440 px.

Las pruebas de navegador sirven contenido local e interceptan los destinos externos. No envían mensajes de WhatsApp, conversiones ni pagos reales.
