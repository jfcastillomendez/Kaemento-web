# KAEMENTO · Pedidos persistentes y correos de confirmación

Rama de trabajo: `codex/pedidos-confirmados-correos`. Implementación para Preview; **no merge ni Production**.

## Flujo y fuente oficial

1. El configurador existente conserva los cinco colores, las nueve proporciones entre tonos distintos, Mate / Brillante, 1–20 kits y COP 365.500 IVA incluido por kit.
2. COMPRAR AHORA abre un diálogo accesible con nombre/razón social, tipo y número de identificación, email, teléfono, ciudad, dirección y autorización para gestionar el pedido. No se solicitan tarjetas ni RUT.
3. `POST /api/bold/checkout` recibe la configuración original y un objeto `customer`. Normaliza y valida ambos en servidor, rechaza campos extra (incluidos precio/total) y calcula el importe. **Guarda el pedido completo en Upstash antes de generar la firma**. Si la confirmación persistente está desactivada o Redis no está disponible, devuelve 503 sin firma: esta rama no conserva el antiguo bypass sin persistencia.
4. El SDK y sus parámetros Bold permanecen iguales; la descripción solo incluye producto, fórmula, sellador y cantidad. La referencia Bold es el `orderId` guardado. Ningún dato personal se pasa al SDK o a Analytics desde esta integración.
5. El retorno del navegador no aprueba pagos. `/pagos/resultado` sigue mostrando el estado pendiente de verificación y puede recuperar solo la selección no personal de sessionStorage. El registro oficial es el servidor; no existe una consulta pública de datos del comprador por número de pedido.
6. El webhook verifica los bytes originales → Base64 → HMAC-SHA256 con la llave Bold, referencia existente, importe, COP y conflictos de orden/pago/evento. Una transacción Lua actualiza el pago y crea sus dos trabajos de correo. Rechazos tardíos no rebajan una venta aprobada; las anulaciones quedan separadas como pago reembolsado/pedido cancelado.
7. Vercel `waitUntil` procesa los correos después de esa confirmación sin bloquear el ACK del webhook. Si la Function se interrumpe, los trabajos permanecen en Redis para reintento protegido. **No hay un cron automático nuevo**.
8. Un trabajo administrativo se dirige a **ambos** correos internos; el otro se dirige exclusivamente al email de ese comprador. `sent` significa aceptado por Resend, no una certificación de entrega al buzón.

## Pedido almacenado

Esquema `schemaVersion: 2`, en `kaemento:<namespace>:order:<orderId>`:

| Grupo | Campos |
|---|---|
| Identidad | orderId, createdAt, updatedAt, productId, productName, quantity |
| Configuración | colorMode, standardColor, color1, color1Percentage, color2, color2Percentage, sealer |
| Importe | unitPrice, subtotal, total, currency |
| Comprador | customerName, customerDocumentType, customerDocument, customerEmail, customerPhone |
| Entrega | shippingCity, shippingAddress |
| Estados | orderStatus, paymentStatus, fulfillmentStatus, invoiceStatus, emailStatus |
| Pago | paidAt, boldPaymentId, boldStatus, paymentMethod |
| Consentimiento | privacyAcceptedAt, privacyPolicyUrl |
| Origen | source=kaemento-web, promotion=microcemento_kaemento_launch_2026 |
| Facturación | invoiceNumber, cufe, invoicePdfUrl, invoiceXmlUrl (null) |

`subtotal` y `total` son producto con IVA incluido; no se inventa tarifa de transporte. Fechas en milisegundos Unix; emails muestran hora de Bogotá.
Se conservan `selection`, `amount`, `status`, `paymentId`, `confirmedAt` y `campaign` como compatibilidad con el adaptador de pagos ya existente. `status` es un alias interno de pago, no el estado logístico.

Estados independientes:
- Pedido: created / paid / cancelled.
- Pago: pending / paid / failed / refunded.
- Logística: pending / processing / dispatched / delivered. Esta entrega lo inicia en pending; no incluye panel logístico.
- Facturación: pending / issued / failed. Esta entrega nunca emite facturas.
- Correo agregado: pending / sent / failed. Cada trabajo tiene además sending o manual_review.

Los pedidos antiguos sin datos de comprador conservan su confirmación de pago, pero no se inventan destinatarios: se indica `legacy_order_missing_customer`.

## Persistencia y privacidad

Se reutiliza el único adaptador Upstash Redis REST existente, por HTTPS. Pedidos, idempotencia, cola y snapshots de emails persisten entre instancias y redeploys. No hay pedidos almacenados en archivos temporales, memoria ni localStorage en ejecución real.

Las claves de eventos y pagos no expiran automáticamente. La cola `email:due` contiene referencias; cada `email:<orderId>:sales|customer` conserva su estado, intentos, lease y payload privado. El JSON del email se guarda como cadena exacta antes del primer intento para conservar los mismos bytes en todos los reintentos.

Redis contiene datos personales operativos necesarios, accesibles solo en servidor. El webhook original, tarjetas, datos bancarios y logs con PII no se guardan. La API pública no devuelve comprador, dirección ni documentos. La política pública no se cambió: antes de activar operativamente esta nueva recogida de identificación/dirección, revisar que su alcance contemple pedidos, despacho y proveedores de almacenamiento/correo. Establecer retención y acceso del equipo sin borrar indiscriminadamente las claves de deduplicación.

## Variables de entorno

Configurar solo en **Preview de esta rama** en esta fase. Nunca compartir valores secretos en chat, Git o código frontend.

```dotenv
BOLD_IDENTITY_KEY=
BOLD_SECRET_KEY=
BOLD_CONFIRMATION_ENABLED=false
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
KV_REST_API_URL=
KV_REST_API_TOKEN=
BOLD_STORAGE_NAMESPACE=
KAEMENTO_EMAIL_ENABLED=false
RESEND_API_KEY=
KAEMENTO_EMAIL_FROM=
KAEMENTO_SALES_EMAIL=kaemento@gmail.com,admin.kaemento@gmail.com
KAEMENTO_EMAIL_RETRY_SECRET=
```

- Mantener las llaves existentes sin alterarlas. Para pruebas de pago usar el entorno de prueba de Bold, nunca tarjetas de prueba contra llaves reales.
- Redis: se aceptan las variables creadas por Vercel `KV_REST_API_URL` y `KV_REST_API_TOKEN`. Los nombres antiguos `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` tienen prioridad, cada uno de forma independiente; no es necesario duplicar las variables. No se usa el token de solo lectura, `KV_URL` ni `REDIS_URL`.
- `BOLD_STORAGE_NAMESPACE` es obligatorio, sin valor por defecto: `preview-pedidos` en Preview y `production-pedidos` cuando se configure Production. Si falta o es inválido, no se guarda ningún pedido ni se emite una firma de pago. Los namespaces separan los registros; para aislamiento de acceso usar bases/credenciales independientes.
- `BOLD_CONFIRMATION_ENABLED=true` solo cuando la persistencia y el webhook estén configurados. Esta rama bloquea el nuevo pago si falta esa condición.
- Resend: verificar primero el dominio remitente con los registros DNS que indique Resend. Un ejemplo, **solo después de verificarlo**, es `KAEMENTO <pedidos@kaemento.com>`. No se usa Gmail como remitente autenticado de Resend.
- `KAEMENTO_SALES_EMAIL` acepta destinatarios separados por coma (máximo cinco); la selección aprobada son los dos correos anteriores.
- `KAEMENTO_EMAIL_ENABLED=true` únicamente tras verificar el remitente y probar Resend. Antes, el pago permanece paid y emailStatus pasa a failed con código email_not_configured; no se simula envío.
- `KAEMENTO_EMAIL_RETRY_SECRET`: valor aleatorio independiente de al menos 32 caracteres, solo servidor/operador. No usar la llave Bold como token de reintento.

## Idempotencia y reintento seguro

Una transacción Lua deduplica evento, pago y orden y crea exactamente dos trabajos; dos destinatarios internos pertenecen a un único trabajo sales. Los correos terminados quedan registrados sin expiración. Un webhook repetido no vuelve a enviarlos.

Cada trabajo obtiene un lease de 60 segundos mediante operación atómica; solicitudes al proveedor tienen timeout de 8 segundos. Reintentos usan siempre el mismo payload y `Idempotency-Key: kaemento-paid/<orderId>/<sales|customer>/v1`. Un cambio posterior de destinatarios/remitente no cambia mensajes que ya comenzaron a enviarse.

Resend deduplica durante 24 horas. Para no prometer una garantía imposible después de ese límite, **el sistema detiene automáticamente reintentos ambiguos a las 23 horas del primer intento** y marca `manual_review`. Hay que revisar ese mensaje en Resend antes de cualquier recuperación; no se renuevan claves ni se reenvía ciegamente. Fallos de email nunca revierten el pago.

Endpoint exclusivo de operación:

```sh
# Variables cargadas por el operador en su entorno privado; no escribir valores en Git.
curl --request POST "$KAEMENTO_PREVIEW_URL/api/bold/retry-emails" \
  --header "Authorization: Bearer $KAEMENTO_EMAIL_RETRY_SECRET" \
  --header 'Content-Type: application/json' \
  --data '{"orderId":"KAE-MICRO-REFERENCIA-DEL-PEDIDO"}'
```

Con `{}` toma un pedido pendiente cuyo backoff haya vencido (60 s, hasta 1 h). Con orderId válido permite revisión inmediata, siempre respetando lease, sent y ventana de deduplicación. Responde estados técnicos, nunca datos del comprador. No permite modificar importe, destinatario ni cuerpo. Requiere acceso a la Preview si tiene protección Vercel. La automatización periódica queda fuera de esta entrega; una tarea de operaciones deberá invocar este endpoint si hay pendientes.

## Correos y facturación

- Administrativo: `NUEVA VENTA ONLINE — KAEMENTO — <orderId>`. Incluye producto, cantidad, fórmula, sellador, unitario, total, comprador, identificación, contacto, entrega, referencia y estado Bold y medio de pago disponible.
- Cliente: `Tu pedido KAEMENTO está confirmado — <orderId>`. Blanco/negro/dorado; incluye pedido, selección, importe y entrega, despacho máximo 48 horas hábiles, envío a Colombia, transporte a cargo del cliente y contacto oficial.
- `invoiceProvider.createInvoice(order)` es una interfaz desacoplada que devuelve un error explícito de proveedor no configurado. No se invoca en el webhook, no produce CUFE, números fiscales ni PDFs.

## Analytics

`begin_checkout` sigue disparándose una vez tras abrir Bold, solo con importe, cantidad, variantes y sellador. `generate_lead` y `purchase` continúan bloqueados en navegador/puente. La outbox `purchase:<orderId>` se crea una sola vez tras una aprobación auténtica; su estado es awaiting_configuration. No existe envío a GA4: falta asociación fiable, consentimiento y transporte server-to-server. No se inventan client_id ni conversiones y no se cambia Google Ads/GTM.

## Pruebas y Preview

Sitio estático; no hay compilación de frontend. El nuevo package.json fija únicamente la dependencia server-side @vercel/functions y la suite Node. Vercel empaqueta las Functions con el lockfile.

```sh
npm ci --ignore-scripts
REDIS_SERVER_BIN=/ruta/redis-server npm test
# Sin REDIS_SERVER_BIN, los grupos de integración se marcan explícitamente omitidos.
REDIS_SERVER_BIN=/ruta/redis-server PLAYWRIGHT_MODULE=/ruta/playwright CHROMIUM_PATH=/ruta/chrome node tests/orders-browser.cjs
git diff --check
```

Pruebas usan clientes sintéticos y un Redis real efímero sobre socket local. No usan servicios de producción ni envían emails reales. Cubren 370 combinaciones válidas de color/sellador, manipulación, cliente, consentimiento, firma, duplicados concurrentes, redis indisponible, correo fallido, respuesta perdida, caducidad de ventana y retry.

Para vista local, ejecutar `scripts/bold-preview.cjs` en **segundo plano**. No incluir claves reales en comandos/logs. Sin variables, el diálogo se muestra pero el servidor devuelve 503 al guardar; no es un cobro funcional ni una persistencia simulada.

Pasos de activación pendientes:
1. Configurar almacenamiento y remitente verificado en los entornos de prueba de Vercel/Upstash/Resend. Este código no los provisiona ni activa.
2. Configurar el webhook Bold de prueba hacia la Preview HTTPS + `/api/bold/webhook`; asegurar que Bold puede acceder a esa ruta pese a la protección de Preview sin desproteger todo el proyecto.
3. Redeploy de Preview; efectuar pago de prueba permitido por Bold y validar orden, referencia, monto y recepción de ambos avisos internos más la confirmación al cliente.
4. Repetir el mismo evento y comprobar ausencia de duplicados. Verificar latencia real/arranque en frío: Bold exige ACK en 2 segundos; la escritura Redis tiene timeout de 1.2 segundos y el envío usa waitUntil después de escribir.
5. Revisar campos operativos, política de datos y procedimiento de reintentos. Confirmar remitente, límites de envío y accesos antes de uso real.
6. Production, facturación real y purchase server-to-server requieren una etapa posterior. Ninguno se activa aquí.

## Fuentes oficiales

- https://developers.bold.co/webhook
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/docs/dashboard/domains/introduction
- https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- https://upstash.com/docs/redis/features/restapi

## Seguimiento del pedido y recuperación de correos — auditoría septiembre 2026

- El checkout devuelve una credencial opaca limitada a consultar ese pedido durante 30 días. Se conserva en `sessionStorage`, nunca en la URL ni en Analytics. `/api/bold/status` recibe `orderId` y `token` por POST y solo devuelve estado, selección e importe; no datos del comprador. El redirect de Bold nunca confirma el pago.
- El frontend reutiliza una clave de idempotencia para reintentos de la misma configuración/comprador durante la sesión de página. Redis crea el pedido y registra la clave atómicamente, limita a 12 pedidos nuevos por origen de red y hora, y conserva las claves durante 24 horas. Los reintentos no consumen otro cupo. Pedidos pagados/anulados no emiten una nueva firma.
- El POST autenticado de `/api/bold/retry-emails` conserva `KAEMENTO_EMAIL_RETRY_SECRET`. La variante GET admite Vercel Cron con `CRON_SECRET`, independiente, de al menos 32 caracteres. Sin esa variable, falla de forma controlada. Procesa un pedido pendiente por ejecución para limitar la duración.
- El programador NO se activa en esta revisión: confirmar plan Vercel y crear `CRON_SECRET` en Production antes de configurar una frecuencia de cinco minutos. Una ejecución diaria no cubre de forma fiable la ventana de idempotencia de Resend. Referencia: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- No se han enviado correos de prueba ni modificado variables externas. Validar recepción en ambos buzones internos y en un buzón de comprador autorizado antes de dar por comprobado el circuito real.
- No se eliminan automáticamente pedidos abandonados: definir primero la retención aplicable a pedidos, pagos y datos de contacto.
- El cierre automático de la oferta requiere fecha de inicio confirmada, definición de cupo (compradores o kits) y consumo histórico. No se cambia el precio ni se presume una fecha de vencimiento mientras falten esos datos.

## Cupo público de lanzamiento y animación — 30 de septiembre de 2026

- `GET /api/bold/promotion` publica exclusivamente `{capacity, remaining}`. Consulta `SCARD` de `campaign:confirmed-orders` en el namespace del entorno, con las mismas variables Redis/KV existentes. No requiere variables nuevas y no expone pedidos ni compradores. Si falla la consulta, devuelve 503 sin inventar una cifra.
- Base conciliada: KAEMENTO informó seis pedidos el 30 de septiembre. La consulta de solo lectura a Production encontró dos pedidos confirmados en el conjunto automático. Se agregan cuatro pedidos históricos exclusivamente al cálculo del cupo; no se crean pedidos ni pagos ficticios. Por tanto, Production comienza con 24 cupos disponibles. Si posteriormente se importan esos cuatro pedidos históricos al conjunto, retirar el ajuste equivalente para no contarlos dos veces.
- Una orden aprobada consume un cupo, independientemente del número de kits. El conjunto existente del webhook evita duplicados y devuelve el cupo al recibir una anulación confirmada. Pedidos pendientes/rechazados no descuentan. El contador se limita a cero. Preview mantiene su propio namespace y puede mostrar un número distinto al de Production.
- El navegador consulta al entrar en pantalla y cada 60 segundos mientras el contador esté visible. La respuesta pública tiene caché CDN de 15 segundos; no implica actualización instantánea. No hay cambios de precio, cierre automático por fecha ni bloqueo de checkout al llegar a cero: este cambio añade el contador informativo solicitado.
- La animación del descuento se reinicia después de salir completamente del viewport o de volver a la pestaña. Cancela trabajos pendientes para impedir superposiciones, respeta movimiento reducido y no genera eventos Analytics adicionales.
- Validación: 62 pruebas automatizadas con Redis efímero; tres páginas en 1440/1024/768/390/320 px. No se generaron ventas ni correos reales.
