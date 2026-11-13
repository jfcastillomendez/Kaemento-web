# Presentación final de Boquilla Mágica — 13 de noviembre de 2026

Rama: `codex/boquilla-presentacion-final`, desde `origin/main` 5cbddbe.
Vista previa: http://localhost:8024/productos/boquilla-magica.html

Se incorporan los PDF frontal y trasero de 13 × 8 cm enviados por KAEMENTO y la fotografía del frente/reverso del envase blanco. Las imágenes WebP de las etiquetas proceden del render de esos mismos PDF; no se reinterpretó el diseño. Los PDF descargables son copias exactas de los originales.

La subpágina y la consulta por WhatsApp muestran el kit en polvo de 1 kg con espátula plástica y toalla de microfibra. Se actualiza también la imagen de la tarjeta del catálogo de productos. Se conservan las galerías de ambientes y comparaciones existentes.

Verificación: recursos locales de ambas páginas resuelven; `git diff --check` correcto; PDF originales y copias idénticos. En navegador, la selección Beige × 2 prepara una consulta de dos kits de 1 kg, sin enviar mensajes. Revisión visual a 1280 y 390 px; a 390 px, ancho del documento 390 px y etiquetas de 350 px sin desbordamiento. Capturas en `output/boquilla-final-2026-11-13` del espacio de trabajo.

Publicación autorizada por KAEMENTO el 13 de noviembre de 2026. Este documento registra la verificación previa; el despliegue se comprueba después del push a main. No se modificaron precios, pagos, analítica, secretos ni configuración de Vercel.

## Portada y orden comercial

Se sustituye el anterior gran bloque de etiqueta por una portada comercial a todo el ancho, inspirada en la etiqueta aprobada: antes/después de juntas y una persona satisfecha aplicando con espátula plástica. Imagen generada con la herramienta integrada; prompts guardados junto a este documento. Imagen horizontal en escritorio y variante vertical en móvil, ambas completas sin recorte. Se identifica como visualización de referencia.

El envase oficial pasa a la segunda sección (`consultar-boquilla`), junto a la selección del kit y el acceso a WhatsApp. Se elimina el bloque duplicado del envase más abajo. Se conservan etiquetas, PDF y galerías existentes. En navegador se confirmó que la imagen del envase está en la segunda sección y no en la portada; anchuras 1280/390 px sin desbordamiento. Recursos y anclas internas correctos; `git diff --check` sin errores.

Comprobación previa a publicación: suite de Node con 104 pruebas aprobadas, 0 fallos y 13 omitidas por ausencia de Redis local. El binario temporal de Redis usado en octubre ya no está disponible. Las dependencias se reutilizaron del checkout principal durante la ejecución, sin cambios de versión. Los cambios publicados son visuales y de contenido; no alteran la lógica de pagos.
