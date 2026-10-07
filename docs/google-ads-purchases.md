# Medición de Compra en Google Ads

Destino oficial confirmado por KAEMENTO el 7 de octubre de 2026:
`AW-18358591293/UeCLCJPZtpQdEL2-h7JE`.

Se reutiliza la Google tag existente (`G-XYVF450MJE` y `AW-18358591293`) en
`analytics-bridge.html`. No se instala otra etiqueta global ni se habilita un evento
genérico `purchase`/`conversion` en `kaementoTrack`.

## Condición de pago

El webhook existente verifica la firma Bold sobre el cuerpo original codificado en
base64, el monto, la moneda y la referencia. Su transacción Redis conserva el pedido
pagado y el registro privado `purchase:<orderId>`. Esta integración no modifica esa
lógica, el checkout, los correos ni las facturas.

`pagos/resultado.js` solicita medición solo después de recibir `paymentStatus=paid`
del endpoint autenticado `/api/bold/status`. Ningún parámetro del redirect, clic,
importe enviado por el navegador o visita autoriza una compra.

## Autorización e idempotencia

1. La página espera a que cargue la Google tag existente. Si está bloqueada, no
   consume la autorización.
2. `POST /api/bold/conversion` con `action=prepare`, `orderId` y el token privado de
   consulta comprueba en una operación Redis el acceso vigente, el pedido pagado y
   el registro creado por el webhook. Devuelve un ticket limitado a esta medición,
   válido durante cinco minutos. El token del comprador nunca pasa al documento de Google.
3. El documento de medición presenta ese ticket con `action=consume`. Redis vuelve
   a comprobar el pago, la referencia, el importe COP y la coincidencia con el
   registro privado. Una anulación entre los dos pasos bloquea la conversión.
4. Una única operación atómica cambia
   `kaemento:<BOLD_STORAGE_NAMESPACE>:ads-conversion:<orderId>` a `status=issued`,
   sin expiración, antes de devolver los parámetros autorizados. Solo una solicitud
   simultánea puede recibirlos. El pedido y los trabajos de correo no se modifican.
5. El navegador ejecuta `gtag('event','conversion', ...)` con el destino oficial,
   `value` leído del total validado por Bold, `currency=COP` y
   `transaction_id=orderId`. Nunca calcula ese importe multiplicando un precio fijo.

Recargas, otras pestañas, navegación atrás/adelante, nuevas instancias de la Function
y reintentos del webhook no vuelven a autorizar el envío. El `transaction_id` también
permite la deduplicación de Google para la misma acción.

La marca `issued` demuestra una autorización entregada una sola vez, **no** que Google
recibió, atribuyó o contabilizó la conversión. Se prioriza no duplicar: si la respuesta
se pierde después de consumirse, o se cierra el navegador antes del envío, no hay
reintento automático. Tampoco hay envío si el comprador no vuelve con su sesión
de consulta válida, bloquea Google o la carga del tag tarda más de 15 segundos.

## Entornos y privacidad

Solo `VERCEL_ENV=production` y `BOLD_CONFIRMATION_ENABLED=true` permiten autorizar.
Preview y desarrollo responden `disabled`. Se utilizan las mismas variables Redis
ya existentes y el namespace obligatorio; no se requiere una nueva variable ni secreto.

La etiqueta recibe exclusivamente los cuatro parámetros comerciales. No recibe
nombre, identificación, correo, teléfono, entrega, token de consulta, firma Bold,
datos de tarjeta ni `paymentId`. Los identificadores publicitarios opacos
`gclid`/`gbraid`/`wbraid` de la entrada se pasan de forma acotada a la misma Google
tag para permitir atribución; otros parámetros y la URL del pedido no se copian.

## Validación sin contaminar Ads

- `node --test tests/*.test.cjs` con `REDIS_SERVER_BIN` apuntando a un Redis local.
- `node tests/ads-conversion-browser.cjs` con Playwright y el mismo Redis efímero.
  Este navegador intercepta **todas** las conexiones externas, sustituye Google por
  un script vacío e inspecciona solo la cola local de `gtag`. Los pedidos, firmas,
  credenciales y webhooks son sintéticos. No se llama a Bold, Resend, Google ni Redis real.
- No crear pedidos de prueba ni consumir tickets de pedidos reales durante el despliegue.

## Próxima compra real

1. Confirmar que Bold registró la venta, que el pedido quedó pagado y que el comprador
   regresó a su resultado. Verificar el total COP y el `orderId` en KAEMENTO.
2. En una sesión de compra real que pueda observarse, usar Tag Assistant o la pestaña
   Network para comprobar el evento, su destino, total e identificador. **No** invocar
   `gtag` manualmente ni recargar para intentar forzar otra conversión.
3. Revisar en Google Ads → Objetivos → Conversiones → Compra su diagnóstico y actividad;
   contrastar el valor y la hora tras el procesamiento de Google. Las columnas de
   conversiones de campañas requieren atribución a un anuncio: una venta orgánica no
   garantiza una conversión atribuida en Ads. El ID de transacción no se muestra como
   una lista de pedidos en sus informes.
4. No borrar la marca `issued` ni cambiar el ID para forzar el conteo.

Referencias oficiales:
- https://support.google.com/google-ads/answer/6386790?hl=es
- https://support.google.com/google-ads/answer/7548399?hl=es
- https://developers.google.com/tag-platform/gtagjs/reference/parameters
