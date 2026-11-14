# Simulador de Boquilla Mágica

Integrado en la tercera sección de productos/boquilla-magica.html: portada, producto/compra y simulador. La portada tiene un acceso directo «Prueba tu boquilla».

Seis ambientes: cocina, baño, balcón, piscina, jacuzzi y un panel de seis enchapes. Cada uno permite visualizar cinco tonos (30 combinaciones), elegir antes, comparar deslizando sobre la imagen o ver el resultado completo. La elección de ambiente/tono/vista se conserva localmente. «Elegir este tono para mi kit» lleva al producto con el mismo color, sin añadir ni pagar automáticamente.

## Imágenes y máscaras

Las fotografías base y las anotaciones de juntas fueron creadas con imagegen. Prompts, referencias y fuentes de cada generación se conservan en generacion.json y anotaciones.json. Las fotografías originales no se reescriben. El render copia la foto base y cambia exclusivamente los píxeles delimitados por la máscara; muebles, plantas, arquitectura y caras de baldosas fuera de ella permanecen idénticos. Las máscaras son ilustrativas y se revisaron visualmente; no se presentan como registros de obra.

scripts/boquilla-preview-masks.cjs compila las anotaciones de imagegen en máscaras alfa WebP sin pérdida. Las fotos de anotación completas quedan en la carpeta original de imágenes generadas y no se distribuyen en la web. Las seis máscaras suman aproximadamente 843 KB y solo se carga la del ambiente elegido. Caché de dos ambientes para limitar memoria.

Los RGB se muestrearon como promedio sRGB de cuadrados de 20×20 px en el centro de las cinco muestras de la etiqueta frontal aprobada (1700×1047): centros x=940,1090,1240,1390,1550; y=818. Esto reproduce esa referencia gráfica, no constituye una medición física del producto. El texto de la herramienta invita a confirmar con muestra física y explica la variación por aplicación, luz y pantalla.

El panel de seis estilos reúne cerámica blanca rectangular, porcelanato beige, porcelanato carbón, cerámica terracota, porcelanato tipo terrazo gris y mosaico azul cobalto. El jacuzzi tiene mosaico azul cobalto y está vacío para apreciar las juntas interiores. Para inmersión se mantiene la recomendación de confirmar curado y protección con KAEMENTO.

## Validación

140 pruebas aprobadas sin omisiones, incluidas las pruebas previas del checkout con Redis local. Las nuevas pruebas verifican píxeles fuera de máscara intactos, conservación de la fuente, cinco resultados distintos, sombras y rechazo de tonos desconocidos, orden de las secciones y correspondencia con los cinco colores vendibles. En navegador se comprobaron las 30 combinaciones, comparador, traslado del color al kit y adición al carrito a $44.000. Sin transacciones, correos ni conversiones reales.

## Revisión de continuidad de juntas

Se amplió la detección a las anotaciones de junta en sombra, manteniendo la discriminación frente a rojos naturales. Se cierran pequeños cortes y huecos en cruces mediante cierre morfológico de 1–2 píxeles; no se aplica un ensanchamiento general. Se recompilaron y revisaron visualmente las seis máscaras, incluidos los escalones de piscina, el mosaico de ducha y el jacuzzi. La versión de los recursos se incrementó para evitar caché anterior. Pasaron las cuatro pruebas del simulador, incluida una nueva para juntas en sombra.

Campaña incorporada en portada con el texto completo suministrado por el usuario y repetición de las dos frases principales junto al simulador: «LA BOQUILLA HACE LA DIFERENCIA. KAEMENTO HACE LA MAGIA.»

Chocolate ajustado visualmente a marrón más neutro a petición de KAEMENTO (RGB 139,96,65). Las versiones azules y sus prompts se documentan en azules-v2.json.
