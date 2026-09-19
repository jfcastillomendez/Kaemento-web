# Bold · Microcemento KAEMENTO — confirmación de pagos

## Estado de esta entrega

Rama `codex/microcemento-audit-payment-confirmation`. Solo Preview; no merge ni Production.
El checkout, el SDK, las variantes y el precio de COP 365500 IVA incluido por kit se conservan.
`begin_checkout` continúa como antes. `generate_lead` y `purchase` siguen bloqueados en el navegador y en el puente de Analytics.

La fase de confirmación está implementada y probada, pero **apagada por defecto**. No hay una base persistente conectada a esta entrega. No se ha registrado un webhook en el panel del comercio ni se ha realizado un cobro.

## Flujo y límites de confianza

1. `POST /api/bold/checkout` valida catálogo cerrado, mezcla, sellador y cantidad 1–20, y calcula el importe en el servidor.
2. Cuando `BOLD_CONFIRMATION_ENABLED=true`, guarda la orden y su selección en Redis **antes de crear/devolver la firma**. Si no puede guardarla, devuelve 503 sin firma. Con la función apagada conserva el checkout previamente aprobado.
3. El SDK existente abre Bold. La página `/pagos/resultado` conserva cantidad, fórmula y sellador locales, pero ningún parámetro del retorno confirma un pago. Incluso `bold-tx-status=approved` muestra “Pago pendiente de verificación”.
4. `POST /api/bold/webhook` recibe el cuerpo crudo mediante Web Request de Vercel. El procedimiento oficial de Bold es: bytes originales → Base64 → HMAC-SHA256 con la llave secreta del botón → comparación en tiempo constante contra `x-bold-signature`. No reserializa el JSON para verificarlo.
5. Solo acepta `SALE_APPROVED`, `SALE_REJECTED`, `VOID_APPROVED`, `VOID_REJECTED`; verifica referencia backend, importe y COP. Las órdenes previas a la activación que no estén guardadas no se confirman automáticamente.
6. Una única operación Lua atómica guarda el evento y cambia el estado. Deduplica por notificación, pago y orden entre procesos concurrentes. Rechazos tardíos no rebajan una venta aprobada; anulaciones aprobadas retiran la orden del conjunto de confirmadas y cancelan su registro pendiente de Analytics.
7. `SALE_APPROVED` crea una sola entrada persistente `purchase:<orderId>`, con selección y `analyticsStatus=awaiting_configuration`. El constructor `purchaseEvent` solo produce el evento para una orden aprobada. **No se envía aún a GA4**: falta decidir/configurar el transporte server-to-server y la asociación técnica y consentimiento correspondiente. No se inventa un identificador de visitante ni se cambia la configuración de Google.
8. El conjunto `campaign:confirmed-orders` prepara la contabilización futura. Son **órdenes confirmadas, no personas únicas**; no permite afirmar “30 clientes” sin una regla de identidad comercial. No se muestra contador ni se cambia el precio automáticamente.

## Variables (solo servidor; valores reales en Vercel, nunca en Git)

```dotenv
BOLD_IDENTITY_KEY=
BOLD_SECRET_KEY=
BOLD_CONFIRMATION_ENABLED=false
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BOLD_STORAGE_NAMESPACE=
```

- Las dos llaves Bold existentes permanecen sin cambios. La llave de identidad es pública para el SDK; la secreta nunca se devuelve.
- El adaptador persistente preparado utiliza Upstash Redis REST por HTTPS, sin dependencias nuevas. No se ha creado ni contratado una base. Si ya existe otro motor, adaptar la capa de persistencia antes de activarla.
- Usar bases/credenciales separadas para Preview y Production y un namespace dedicado. En Preview debe ser estable durante la prueba, por ejemplo `preview-payment-audit`; Production requerirá otro.
- Las órdenes, confirmaciones y llaves de deduplicación no expiran automáticamente; no se borran en esta implementación. Definir retención/archivo antes de una explotación prolongada. No guardar en Redis el JSON original de Bold: contiene datos del pagador.
- Solo se guardan identificadores técnicos de orden/pago/evento, importe, moneda, configuración y fechas. No nombres, correos, teléfonos, tarjetas, mensajes ni formularios. No se escriben payloads, llaves ni firmas en logs.
- La operación de almacenamiento tiene timeout de 1.2 s. Se responde 200 solo después de escritura duradera; si falla se responde 503 para permitir reintentos. Medir también latencia real y arranque en frío contra el límite de 2 s de Bold antes de activar.

## Activación y prueba manual en Preview (pendiente)

1. Confirmar/provisionar almacenamiento persistente y configurar las tres variables Redis/namespace solo para esta rama Preview. No pegar secretos en el chat.
2. Configurar `BOLD_CONFIRMATION_ENABLED=true` solo en esa Preview y redeploy. Mantener llaves de prueba para las pruebas de pago; no usar tarjetas de prueba contra llaves de producción.
3. El webhook debe ser accesible por Bold sin login de Vercel. Si la Preview tiene protección, configurar una excepción/bypass de alcance limitado para webhooks, previa revisión de seguridad; no desproteger el proyecto entero. No añadir tokens a documentación.
4. En Panel Bold: **Integraciones → Webhooks → Configurar webhook → URL HTTPS de la Preview + `/api/bold/webhook` → Crear webhook**. Registrar únicamente el endpoint de prueba en esta fase. Confirmar que la llave secreta corresponda al Botón de pagos usado por esta integración.
5. Abrir el configurador de la Preview, completar una compra en **Modo de pruebas**, y utilizar “Probar el webhook” en Bold: los pagos online de prueba no generan automáticamente todas las notificaciones. Revisar el registro guardado y la respuesta 200.
6. Repetir el mismo evento: debe responder `duplicate`, sin segunda compra. Probar aprobado, rechazo, anulación, monto alterado y firma incorrecta. Los dos últimos deben ser rechazados sin registrar compra.
7. Validar apertura/retorno del SDK y latencia real. La suite local simula el SDK; no equivale a esta prueba del proveedor.
8. Acordar la medición server-to-server de `purchase` y sus permisos antes de conectar el envío. Debe leer exclusivamente órdenes aprobadas, mantener `transaction_id` estable, usar una cola persistente con reintentos/deduplicación y nunca basarse en el retorno del navegador. No se activa `generate_lead`, no se importan conversiones ni se modifica Ads/GTM.
9. No activar Production ni registrar su webhook hasta la aprobación de la entrega y de la prueba técnica.

## Pruebas reproducibles

No hay build de frontend ni package.json: es un sitio HTML/CSS/JS con Vercel Functions.

```sh
node --test tests/*.test.cjs
node --check api/bold/checkout.js
node --check api/bold/_lib/payments.cjs
node --check api/bold/webhook.mjs
node --check pagos/resultado.js
node --check scripts/bold-preview.cjs
git diff --check
```

Para ejecutar también la prueba de concurrencia real, instalar Redis local temporal y pasar su binario (no se conecta al Redis de producción):

```sh
REDIS_SERVER_BIN=/ruta/local/redis-server node --test tests/*.test.cjs
```

La integración lanza Redis solo sobre un socket local temporal, sin puerto público, y lo cierra al terminar. Comprueba veinte entregas concurrentes mediante dos instancias del adaptador, reinicio lógico, replays, conflictos, rechazo tardío, anulación, persistencia previa a la firma y fallo de almacenamiento. Sin `REDIS_SERVER_BIN` ese grupo se marca explícitamente como omitido.

El servidor auxiliar `scripts/bold-preview.cjs` debe iniciarse como proceso separado en segundo plano. Sirve AVIF con MIME correcto, redirección `/index.html` → `/` y los dos endpoints. No se despliega.

## Fuentes oficiales

- Firma, tipos de evento, panel y pruebas: https://developers.bold.co/webhook
- Checkout conservado: https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-personalizada
- Web Request de Vercel: https://vercel.com/docs/functions/runtimes/node-js
- Almacenamiento atómico preparado: https://upstash.com/docs/redis/features/restapi y https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval
- Requisitos pendientes de Measurement Protocol: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference

## Condición de lanzamiento y pendientes comerciales

“Promoción válida por 30 días o para los primeros 30 clientes, lo que ocurra primero.”
Se conservan COP 430000 regular, COP 365500 lanzamiento, IVA incluido y 15%. No hay cierre automático ni contador artificial. El equipo debe controlar vigencia y cupos hasta implementar una regla comercial persistente y aprobada.

Existen política de datos y textos de despacho/transporte. No se encontraron documentos independientes de condiciones de compra, envíos, garantías ni cambios/devoluciones; deben ser suministrados/aprobados por KAEMENTO. No se redactaron condiciones legales nuevas.
