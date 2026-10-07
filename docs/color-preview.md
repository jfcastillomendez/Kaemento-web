# Vista de colores: paredes y piso

Disponible en los configuradores existentes de Inicio y Producto Microcemento. No crea un producto, precio, tipo de mezcla ni endpoint nuevo.

## Funcionamiento

- `microcemento-preview.js` reutiliza los selectores existentes y conserva un borrador por superficie durante la visita. Cambiar de superficie restaura su color, proporción, sellador y cantidad.
- «Elige tu espacio» permite alternar Sala, Baño, Cocina, Dormitorio, Comedor y Balcón/terraza sin cambiar la configuración de compra ni los elementos del carrito. Solo se descarga la imagen elegida. El renderizador anterior se libera al cambiar de ambiente y no puede pintar sobre una imagen posterior.
- Debajo de «Paredes» y «Piso» queda visible un resumen compacto: `Arena 70% + Gris Cemento 30%`, o `Extra Blanco 100%`. Mantiene los nombres completos y separa la indicación «En carrito» para que la fórmula siempre sea legible.
- Cada superficie muestra también su sellador. Mate mantiene la apariencia difusa de la imagen base; Brillante añade un reflejo suave orientado hacia la fuente de luz del ambiente. El efecto es independiente por superficie y reversible; no altera los valores RGB de referencia, porcentajes ni el sellador enviado al pedido.
- «Usar el mismo tono en ambos» enlaza únicamente el color y la proporción. Sellador y kits siguen independientes. Los cambios se añaden al carrito de uno en uno mediante el botón existente.
- Tras añadir, los controles vuelven a cero. La última selección aceptada de esa superficie permanece como referencia visual marcada «En carrito». Quitar esa configuración elimina su referencia visual. Configuraciones iguales siguen agrupándose con la regla existente del carrito.
- Durante una edición del carrito o preparación del pago se bloquea el cambio de superficie. La navegación o recarga borra el estado de la vista y del carrito, conservando el comportamiento anterior.
- Dos eventos locales de presentación (`kaemento:cart-updated`, `kaemento:configuration-added`) comunican las selecciones aceptadas a la vista. No son eventos de analítica y no añaden campos al pedido.

## Imagen y precisión

`assets/microcemento/visualizador/sala-base.webp` proviene de la sala generada y aprobada en este chat. Es una visualización conceptual, no la fotografía de una obra ejecutada. Se convirtió a WebP sin cambiar dimensiones ni composición: 1536 × 1024, aproximadamente 164 KiB.

El renderizador aplica el color solo a la pared principal y al piso con geometría asociada a esa imagen, conservando luminancia y textura. Las siluetas del mobiliario y los detalles de plantas y lámpara tienen exclusiones. Si se cambia la imagen, debe actualizarse y verificarse la geometría del renderizador.

Las cinco nuevas imágenes fueron creadas con la herramienta integrada `image_gen` el 7 de octubre de 2026. Son ambientes residenciales ilustrativos de proporciones habituales. Se convirtieron a WebP sin modificar composición ni dimensiones, 1536 × 1024. `microcemento-preview-scenes.js` contiene una geometría y normalización propias para cada archivo:

| Ambiente | Archivo en `assets/microcemento/visualizador/` | Tamaño |
| --- | --- | --- |
| Baño | `bano-base.webp` | 120902 bytes |
| Cocina | `cocina-base.webp` | 152310 bytes |
| Dormitorio principal o auxiliar | `dormitorio-base.webp` | 147510 bytes |
| Comedor | `comedor-base.webp` | 159390 bytes |
| Balcón/terraza | `terraza-base.webp` | 190214 bytes |

Regiones usadas para normalizar el brillo de las nuevas escenas, en el mismo formato de coordenadas descrito abajo:

| Ambiente | Pared | Piso |
| --- | --- | --- |
| Baño | (820, 120, 1050, 380) | (400, 800, 1100, 980) |
| Cocina | (600, 30, 820, 250) | (350, 770, 1100, 980) |
| Dormitorio | (550, 50, 1050, 320) | (430, 940, 1100, 1010) |
| Comedor | (430, 80, 620, 350) | (560, 930, 1040, 1010) |
| Balcón/terraza | (650, 120, 1200, 390) | (450, 790, 1180, 980) |

Los cinco valores RGB de partida se midieron en las muestras de la pieza oficial de lanzamiento, confirmada por el usuario como referencia el 7 de octubre de 2026. Se utiliza la mediana de cada canal sRGB en una región interior para reducir la influencia de la textura, sin incluir bordes ni etiquetas. No se modifica la pieza original. La tabla conserva estos valores de origen, anteriores al ajuste visual de Gris Cemento descrito a continuación.

Fuente: `assets/microcemento/microcemento-lanzamiento-2026.webp`, 1024 × 1536; SHA-256 `5c63695bef8f15dff7e594f04046ed97c3d07f975aa9f8d16376b90e5d65ee48`. Regiones `(x inicial, y inicial, x final exclusivo, y final exclusivo)`:

| Tono | Región de muestreo | RGB | Hex |
| --- | --- | --- | --- |
| Extra Blanco | (38, 1212, 124, 1277) | 230, 225, 220 | #e6e1dc |
| Arena | (149, 1212, 236, 1277) | 191, 172, 154 | #bfac9a |
| Gris Cemento | (261, 1212, 349, 1277) | 120, 118, 116 | #787674 |
| Negro Profundo | (375, 1212, 463, 1277) | 43, 43, 42 | #2b2b2a |
| Terracota | (488, 1212, 576, 1277) | 160, 97, 69 | #a06145 |

Revisión visual solicitada el 7 de octubre de 2026: Gris Cemento se aclara de `#787674` a `#989694` (RGB 152, 150, 148; +32 por canal), manteniendo su ligero matiz cálido. Es una corrección de representación para revisión, no una nueva medición del material físico. Solo cambia esta entrada de la paleta digital; sus mezclas y los indicadores utilizan el mismo valor corregido, sin ajustes ocultos después del cálculo.

Las medianas originales de luz, antes de reforzar la textura, se midieron en zonas sin mobiliario: pared `(550, 140, 980, 340)`, `0.6122007843137255`; piso `(450, 750, 1250, 930)`, `0.6884298039215687`. Para medir la luminancia se usa la misma suma ponderada de canales sRGB del renderizador (`0.2126 R + 0.7152 G + 0.0722 B`, dividida por 255). El renderizador separa las variaciones minerales existentes a dos escalas: marcas suaves de llana y grano fino. Suaviza el veteado amplio y conserva el detalle fino. Usa promedios locales ponderados por las máscaras; muebles y objetos quedan excluidos. Limita el ajuste en sombras fuertes y conserva la perspectiva de cada foto, sin añadir patrones repetidos ni ruido aleatorio. Después recalcula la mediana dentro de esas mismas regiones de referencia para mantener el tono digital elegido. El relieve modula suavemente el reflejo del sellador. El cálculo se hace una sola vez al cargar cada ambiente. Es una normalización visual, no una medición fotométrica ni una calibración física. Evita un oscurecimiento global añadido; las zonas con distinta luz conservan diferencias de brillo. Los indicadores de color muestran el tono de referencia sin esa iluminación.

Ajuste posterior de veteado: ambos acabados atenúan las marcas amplias de llana de la imagen original, conservando grano fino y sombras arquitectónicas. Mate atenúa más esas variaciones; Brillante resalta el grano fino y mantiene más detalle mineral, con un reflejo más visible sin recuperar el veteado exagerado. Se revisó visualmente frente a las fotos reales de terrazas terminadas aportadas por el usuario (2 de octubre de 2026), como orientación del acabado, no como calibración fotométrica. Se aplica a todos los tonos, incluido Gris Cemento, sin modificar la paleta aprobada ni la fórmula de mezcla. Ambos perfiles se normalizan por separado para conservar el tono central. Es una distinción visual, no una propiedad física medida del producto.

### Cálculo y límite de precisión

Para cada canal digital: `round((canal1 × porcentaje1 + canal2 × porcentaje2) / 100)`. Solo admite las proporciones existentes (10–90%, en pasos de 10), que suman exactamente 100%. Por ejemplo, Arena 70% + Gris Cemento 30% da RGB `(179, 165, 152)`, `#b3a598`, con el gris ajustado. El redondeo final de 8 bits introduce como máximo medio nivel por canal. Invertir colores y porcentajes da el mismo resultado.

Esta interpolación es reproducible y respeta matemáticamente la selección, pero **no predice con exactitud una mezcla física de pigmentos**. No se inventan coeficientes de absorción, dispersión ni fuerza tintórea a partir de una fotografía. Para una predicción física se necesitan muestras medidas de los materiales y sus mezclas; los modelos de pigmentos utilizan propiedades espectrales ([referencia de investigación](https://doi.org/10.1364/AO.41.005969)). La interfaz indica expresamente que la vista es orientativa y requiere una muestra física.

El brillo es igualmente una aproximación visual: un reflejo neutro y localizado de baja intensidad, calculado solo dentro de las máscaras de microcemento. Tras la revisión con las fotos reales, el coeficiente máximo es 0.40 en piso y 0.24 en pared, conservando extensión, dirección y suavidad del reflejo. Hace más visible la diferencia del acabado Brillante frente a Mate. No es una calibración del sellador real ni una simulación fotométrica. No se inventa un cambio permanente en la pigmentación por elegir sellador. Los muebles y objetos no reciben este efecto.

No se solicita una imagen a IA en cada cambio. El cálculo ocurre en el navegador, sin nuevas librerías ni servicios. La imagen se carga de forma diferida, tiene dimensiones reservadas y conserva una alternativa estática si falla el lienzo. Los colores se comunican también con texto. El enlace para volver a la imagen respeta movimiento reducido.

## Validación

- `node --test tests/*.test.cjs` (con `REDIS_SERVER_BIN` apuntando al Redis local de pruebas para ejecutar toda la suite).
- `node tests/color-preview-browser.cjs` (requiere Playwright y Chrome; `CHROME_BIN` y `TEST_OUTPUT_DIR` son opcionales).
- La prueba de navegador sirve un fixture local, bloquea los proveedores externos de pago/medición y simula la respuesta del checkout. Verifica ambas páginas en 1440, 1024, 768, 390 y 320 px; independencia, vinculación, carrito, fórmula final, preservación del mobiliario, reinicio y movimiento reducido.
- Verifica también los seis ambientes, conservación de selecciones, cambios rápidos de escena, conservación de píxeles del mobiliario y diferencia reversible Mate/Brillante por superficie.
- No se ejecuta una transacción real ni se envía una conversión de Google Ads.
