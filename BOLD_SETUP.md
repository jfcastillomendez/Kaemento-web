# Bold · lanzamiento de Microcemento KAEMENTO

## Estado y alcance

Implementación en rama `codex/bold-microcemento-launch`. **No publicar producción todavía.**
Arquitectura conservada: HTML/CSS/JS estático, sin framework, sin instalación de dependencias ni migración. Una Vercel Function Node.js firma cada orden. No hay base de datos, inventario ni confirmación definitiva de pagos.

## Archivos

- `api/bold/checkout.js`: endpoint POST y catálogo fijo de servidor.
- `bold-checkout.js`, `bold-checkout.css`: selector, precio, carga única del SDK, checkout y estados accesibles.
- `index.html`, `productos/microcemento-kaemento.html`: bloque de compra añadido sin reemplazar CTAs existentes.
- `pagos/resultado.html`, `pagos/resultado.js`: estados informativos del retorno.
- `vercel.json`: conserva redirects y añade solo el rewrite `/pagos/resultado`.
- `analytics.js`, `analytics-bridge.js`, `analytics-bridge.html`: permiten exclusivamente `begin_checkout` con datos comerciales controlados, conservando etiquetas y eventos anteriores. Cache de los scripts actualizada.
- `.env.example`, `.gitignore`, `.vercelignore`: variables vacías y exclusión de configuración privada, documentación y pruebas del despliegue.
- `scripts/bold-preview.cjs`: servidor local auxiliar sin dependencias; no se despliega.
- `tests/bold-checkout.test.cjs`: pruebas unitarias con fixtures efímeros, no válidos en Bold.
- `BOLD_SETUP.md`: esta guía; no se publica como recurso del sitio.

## Flujo

1. El visitante selecciona de 1 a 20 kits. Precio regular por kit: COP 430000; lanzamiento: COP 365500 (15 % menos), IVA incluido.
2. El navegador carga una sola vez `https://checkout.bold.co/library/boldPaymentButton.js` y envía únicamente `{productId: "microcemento-kaemento-launch", quantity: 1}` a `POST /api/bold/checkout`.
3. El servidor rechaza producto desconocido, cantidades que no sean enteros de 1 a 20 y campos adicionales (incluido `amount`). Calcula `365500 * quantity` y crea una referencia `KAE-MICRO-<timestamp>-<random>` menor de 60 caracteres.
4. Firma SHA-256 de `orderId + amount + "COP" + BOLD_SECRET_KEY`, sin separadores. No se vuelve a sumar IVA. `tax` es `vat-19`.
5. Devuelve exclusivamente orderId, amount, currency, apiKey (identidad pública), integritySignature, tax y description. Respuesta sin caché.
6. `BoldCheckout` abre con `renderMode: "embedded"`. Si el método falla, se intenta el modo estándar documentado, omitiendo renderMode y reutilizando la misma orden firmada. Sin eventos de cierre inventados ni lógica apoyada en el DOM interno de Bold.
7. Si `open()` termina sin error se registra una vez `begin_checkout`. Esto mide apertura solicitada del checkout; no prueba que Bold haya aprobado el pago. Los errores posteriores internos de la pasarela y el cierre no tienen callback documentado utilizado por esta implementación.
8. Bold retorna a `window.location.origin + "/pagos/resultado"`. Se reconocen approved, pending/processing, rejected/failed y un estado neutral para valores desconocidos. No se interpreta ni se envía el orderId a Google.

Los estados de la URL son **informativos y manipulables**, no una autorización de despacho. Confirmar siempre el pago en Bold antes de atender una orden. No se registra `purchase` ni se reactiva `generate_lead`.

## Variables y seguridad

Únicamente:

```dotenv
BOLD_IDENTITY_KEY=
BOLD_SECRET_KEY=
```

`BOLD_SECRET_KEY` se lee solo en la Function y nunca aparece en HTML, JS público, respuesta HTTP ni logs. No se ha introducido ninguna llave real en el repositorio. La llave de identidad sí debe llegar al SDK: no es la llave secreta.

La falta de alguna variable produce HTTP 503 y un mensaje amable; no se sustituye por llaves ficticias. `.env` y `.env.*` están ignorados por Git y excluidos de Vercel (solo `.env.example` vacío se versiona). No usar un servidor estático genérico para servir un directorio que contenga archivos con secretos. El servidor auxiliar bloquea dotfiles, código de API, pruebas y documentación.

## Configurar Preview / Development en Vercel

1. Abrir el proyecto **kaemento-web** → Settings → Environment Variables.
2. Añadir `BOLD_IDENTITY_KEY` y `BOLD_SECRET_KEY` con el par de **PRUEBA** obtenido en el panel oficial de Bold.
3. Seleccionar solamente Preview y Development para ese par. No pegarlas en el chat ni en archivos públicos.
4. Crear/recrear un deployment Preview de esta rama para que reciba las variables. No promover ni publicar en Production.
5. Confirmar que el checkout real muestra **Modo de pruebas** antes de introducir cualquier dato o simular una transacción. Si no aparece, detener la prueba.

## Pruebas y preview local

No hay build de frontend ni linter configurado en este sitio. Node.js 20+ permite ejecutar:

```sh
node --test tests/bold-checkout.test.cjs
node --check api/bold/checkout.js
node --check bold-checkout.js
node --check pagos/resultado.js
node --check analytics.js
node --check analytics-bridge.js
git diff --check
```

Preview visual local sin llaves:

```sh
PORT=8137 node scripts/bold-preview.cjs
```

En una terminal manual ese comando mantiene el servidor; desde Codex se inicia siempre como proceso separado en segundo plano. Abrir:

- `http://localhost:8137/index.html#comprar-microcemento`
- `http://localhost:8137/productos/microcemento-kaemento.html#comprar-microcemento`
- `http://localhost:8137/pagos/resultado`

Sin variables, comprar muestra el error controlado. Este adaptador no sustituye la prueba de despliegue con Vercel Functions. Preferir la URL HTTPS Preview para la transacción real de pruebas; Bold indica usar localhost, no 127.0.0.1, si se prueba localmente.

### Matriz ejecutada localmente

- Unitarias: 7 grupos aprobados (precios 1/2/20, IVA incluido, SHA-256 exacto, 100 referencias únicas, validaciones, variables ausentes y filtrado de ambos niveles de Analytics).
- Navegador: 8 combinaciones de Inicio/Microcemento × 320/390/768/1440; sin overflow ni errores JavaScript.
- SDK simulado: envío solo productId/quantity; cantidades 1 y 2; doble clic sin doble orden/evento; una carga de SDK por documento; fallback estándar reutiliza la orden; recuperación de errores; fallo al cargar SDK no crea orden.
- Retorno simulado: approved, rejected, failed, pending, processing y parámetros desconocidos/maliciosos. No `purchase`, no `generate_lead`, no datos del query string en Analytics.

**Pendiente:** pagos reales simulados por Bold, etiqueta Modo de pruebas, retorno real del proveedor y comportamiento embedded en dispositivos reales. No equivalen a los escenarios de SDK simulado. Requieren el par de llaves de prueba del comercio.

### Transacción de prueba en Bold

1. Abrir la landing de Microcemento en el dominio Preview HTTPS.
2. Comprar 1 kit y comprobar COP 365500; repetir con 2 para COP 731000. IVA incluido, sin transporte.
3. Verificar **Modo de pruebas**.
4. Dentro del entorno de pruebas exclusivamente, usar VISA `4111111111111111` para aprobado, `4970110000000062` para rechazado y `5204730000008404` para fallido. Completar los demás campos de prueba requeridos por Bold.
5. Volver a la tienda y revisar `/pagos/resultado`, tanto en desktop como móvil. Comprobar en la respuesta del endpoint que cada nuevo intento tiene referencia distinta.
6. Revisar Network, fuente, consola y archivos públicos: ninguna respuesta debe contener BOLD_SECRET_KEY. No copiar capturas o logs de las variables de Vercel.
7. Revisar `begin_checkout` en la capa/puente existente; no configurar conversiones nuevas en Ads. Nunca disparar purchase usando el query string.

## Paso posterior a producción

Solo después de completar las pruebas y de recibir autorización expresa:

1. Configurar el par de llaves **PRODUCCIÓN** con los mismos nombres, únicamente en el Environment Production de Vercel.
2. Mantener el par de prueba en Preview/Development.
3. Revisar diff y pruebas, integrar la rama aprobada en main y comprobar el deployment.
4. Verificar la oferta, cantidades, términos de transporte y disponibilidad del checkout. No simular tarjetas de prueba en producción ni hacer cargos reales de prueba sin autorización.

## Pendientes de fase 2

- Webhook autenticado e idempotente / consulta segura para la confirmación definitiva.
- Pedido persistente, gestión de reintentos y conciliación; actualmente solo existe una referencia firmada por intento, no un pedido guardado.
- Control automático de los primeros 30 pedidos/cupos y caducidad de la promoción. Sin contador; no se promete exclusividad automáticamente.
- Cálculo de transporte (hoy se coordina después y lo paga el comprador).
- Evento GA4 `purchase` únicamente tras confirmación verificable, con deduplicación.
- Límite de intentos duradero si se necesita; el bloqueo del frontend evita doble clic, no sustituye una política de servidor ni impide varias compras voluntarias.
- Comprobar en el panel del comercio si permite el monto de 20 kits (COP 7310000).

## Fuentes oficiales consultadas

- https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
- https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-personalizada
- https://developers.bold.co/pagos-en-linea/boton-de-pagos/ambiente-pruebas
- https://developers.bold.co/pagos-en-linea/llaves-de-integracion
- https://vercel.com/docs/functions/runtimes/node-js

No se cambiaron formularios, WhatsApp, imágenes, SEO de las páginas existentes, sitemap, robots, navegación, campañas ni configuración de Google Ads/GA4/GTM. Única extensión de medición: `begin_checkout` filtrado por el puente actual.
