# Calculador y simulador de Pintura de Tráfico

Revisión: 18 de octubre de 2026. Base: main `5aa7f7c`.
Rama de entrega: `codex/ajustes-pendientes-octubre`.

## Resultado

El visitante puede explorar la renovación del mismo parqueadero por color y alternar con el estado anterior. Los selectores nuevos y las tarjetas existentes comparten la selección del formulario. Se conservan las imágenes aprobadas y se añaden nueve aplicaciones en un desplegable. Las 14 imágenes WebP nuevas tienen sus prompts de origen en `senalizacion-trafico-prompts.json`; son visualizaciones de referencia.

El calculador admite metros de franja de 10 cm o m² efectivamente pintados. Utiliza la referencia suministrada de 70 metros lineales o 7 m² por galón y redondea hacia arriba por color. Amarillo, blanco y negro pasan a la compra; azul prepara una consulta de WhatsApp. Los campos vacíos conservan las cantidades existentes y un cero explícito reemplaza el color correspondiente cuando se aplica un cálculo válido. Cambiar de unidad limpia las medidas para evitar reinterpretarlas. La recarga limpia medidas y cantidades.

El botón de pago dice «COMPRAR». Los accesos flotantes se ocultan mientras la sección de compra es visible en móvil, evitando que reaparezcan sobre el botón al perder foco un campo. El calculador sigue el bloqueo temporal de cantidades durante el formulario de compra y vuelve a habilitarse al cerrarlo.

No hay modificaciones en los endpoints de pagos, precios, IDs de analítica, contactos ni configuración de despliegue.

## Verificación

- Suite de Node con Redis local aislado: 126 pruebas aprobadas, cero fallos y cero omisiones.
- Navegador Chrome: 320, 390, 768, 1024 y 1440 px; cuatro colores y antes/después, sincronización con formulario, cálculo por longitud y área, redondeo, medida negativa, conservación de un color vacío, reemplazo por cero, cierre y reapertura de comprador, restablecimiento al recargar.
- Cinco pedidos simulados: 7 m² amarillos + 7,01 m² blancos = 1 galón amarillo + 2 blancos; total $326.655. La selección del request y el importe entregado al SDK simulado coinciden.
- Recursos de imagen cargados en los cinco tamaños, sin desbordamientos horizontales ni errores de JavaScript. Capturas de calculador y simulador revisadas visualmente.
- Proveedores externos bloqueados en la prueba; no se enviaron pagos, correos, mensajes ni conversiones reales. El servidor estático local permite revisar la interfaz; las Functions requieren un entorno desplegado.
- Sintaxis de scripts y `git diff --check` correctos.

## Entrega

Preview local: http://localhost:8000/pintura-de-trafico.html
No publicado desde esta rama. Las capturas y `resultado.json` se guardan en los outputs del chat del relevo. Se conserva la regla de publicación de `AGENTS.md`.
