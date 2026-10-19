# Calculador y simulador de Pintura de Tráfico

Revisión: 18 de octubre de 2026. Base: main `5aa7f7c`.
Rama de entrega: `codex/ajustes-pendientes-octubre`.

## Resultado

El visitante empieza con un espacio sin demarcaciones y puede activar o quitar varios colores de forma acumulativa. Las dos filas de botones comparten selección; el formulario indica «Varios» cuando se combinan colores. «Ver sin demarcación» muestra el fondo limpio y permite volver a la combinación previa. Cambiar de ambiente conserva los colores.

Hay diez ambientes: parqueadero, zonas comunes exteriores, cocina industrial, columnas y sardineles, bodega logística, planta industrial, taller mecánico, rampa vehicular, pasillos peatonales y colegio. Los diez fondos sin marcas se editaron con la herramienta integrada image_gen; los prompts y rutas están en `simulador-trafico-fondos.json`. Se conservan las fotografías aprobadas, usadas como referencia para las capas fotográficas.

El renderizador mantiene la geometría de cada foto y utiliza regiones por ambiente para las capas de blanco y negro. El negro tiene zonas de contraste independientes y una comprobación de diferencia de píxeles frente al fondo limpio. El azul de estacionamiento accesible restaura también el símbolo blanco y su contraste. Cuando un color no tiene una aplicación en el ambiente, se informa y se mantiene su selección para el siguiente espacio. La caché se limita a dos ambientes y una respuesta tardía no puede reemplazar una selección más reciente.

Los usos mostrados son orientativos, con referencias consultadas a ISO 3864-1 para lugares de trabajo y MUTCD para demarcación vial. No se declara certificación ni cumplimiento normativo de un proyecto a partir de fotografías; dimensiones, ubicación y norma local aplicable requieren diseño técnico. Referencias: https://www.iso.org/standard/51021.html y https://mutcd.fhwa.dot.gov/kno_11th_Editionr1.htm .

El calculador admite metros de franja de 10 cm o m² efectivamente pintados. Utiliza la referencia suministrada de 70 metros lineales o 7 m² por galón y redondea hacia arriba por color. Amarillo, blanco, negro y azul pasan a la compra con el mismo precio de $108.885 IVA incluido por galón. Los campos vacíos conservan las cantidades existentes y un cero explícito reemplaza el color correspondiente cuando se aplica un cálculo válido. Cambiar de unidad limpia las medidas para evitar reinterpretarlas. La recarga limpia medidas y cantidades.

El botón de pago dice «COMPRAR». Los accesos flotantes se ocultan mientras la sección de compra es visible en móvil, evitando que reaparezcan sobre el botón al perder foco un campo. El calculador sigue el bloqueo temporal de cantidades durante el formulario de compra y vuelve a habilitarse al cerrarlo.

Se habilita azul en la validación compartida de variantes de compra y en la página de resultado; los cuatro colores cuestan $108.885 IVA incluido. No se modifican endpoints, firmas de pago, IDs de analítica, contactos ni configuración de despliegue.

## Verificación

- Suite de Node con Redis local aislado: 126 pruebas aprobadas, cero fallos y cero omisiones.
- Navegador Chrome: 320, 390, 768, 1024 y 1440 px; diez ambientes, selección acumulativa de los cuatro colores, fondo sin demarcación, sincronización con formulario, cálculo por longitud y área, redondeo, medida negativa, conservación de un color vacío, reemplazo por cero, cierre y reapertura de comprador, restablecimiento al recargar.
- Cinco pedidos simulados: 7 m² amarillos + 7,01 m² blancos + 14 m² azules = 1 galón amarillo + 2 blancos + 2 azules; total $544.425. La selección del request y el importe entregado al SDK simulado coinciden.
- Recursos de imagen cargados en los cinco tamaños, sin desbordamientos horizontales ni errores de JavaScript. Capturas de calculador y simulador revisadas visualmente.
- Proveedores externos bloqueados en la prueba; no se enviaron pagos, correos, mensajes ni conversiones reales. El servidor estático local permite revisar la interfaz; las Functions requieren un entorno desplegado.
- Sintaxis de scripts y `git diff --check` correctos.

## Entrega

Preview local: http://localhost:8000/pintura-de-trafico.html
No publicado desde esta rama. Las capturas y `resultado.json` se guardan en los outputs del chat del relevo. Se conserva la regla de publicación de `AGENTS.md`.
