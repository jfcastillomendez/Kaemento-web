# Vista de colores: paredes y piso

Disponible en los configuradores existentes de Inicio y Producto Microcemento. No crea un producto, precio, tipo de mezcla ni endpoint nuevo.

## Funcionamiento

- `microcemento-preview.js` reutiliza los selectores existentes y conserva un borrador por superficie durante la visita. Cambiar de superficie restaura su color, proporción, sellador y cantidad.
- Debajo de «Paredes» y «Piso» queda visible un resumen compacto: `Arena 70% + Gris Cemento 30%`, o `Extra Blanco 100%`. Mantiene los nombres completos y separa la indicación «En carrito» para que la fórmula siempre sea legible.
- «Usar el mismo tono en ambos» enlaza únicamente el color y la proporción. Sellador y kits siguen independientes. Los cambios se añaden al carrito de uno en uno mediante el botón existente.
- Tras añadir, los controles vuelven a cero. La última selección aceptada de esa superficie permanece como referencia visual marcada «En carrito». Quitar esa configuración elimina su referencia visual. Configuraciones iguales siguen agrupándose con la regla existente del carrito.
- Durante una edición del carrito o preparación del pago se bloquea el cambio de superficie. La navegación o recarga borra el estado de la vista y del carrito, conservando el comportamiento anterior.
- Dos eventos locales de presentación (`kaemento:cart-updated`, `kaemento:configuration-added`) comunican las selecciones aceptadas a la vista. No son eventos de analítica y no añaden campos al pedido.

## Imagen y precisión

`assets/microcemento/visualizador/sala-base.webp` proviene de la sala generada y aprobada en este chat. Es una visualización conceptual, no la fotografía de una obra ejecutada. Se convirtió a WebP sin cambiar dimensiones ni composición: 1536 × 1024, aproximadamente 164 KiB.

El renderizador aplica el color solo a la pared principal y al piso con geometría asociada a esa imagen, conservando luminancia y textura. Las siluetas del mobiliario y los detalles de plantas y lámpara tienen exclusiones. Si se cambia la imagen, debe actualizarse y verificarse la geometría del renderizador.

Los cinco valores RGB se midieron en las muestras de la pieza oficial de lanzamiento, confirmada por el usuario como referencia el 7 de octubre de 2026. Se utiliza la mediana de cada canal sRGB en una región interior para reducir la influencia de la textura, sin incluir bordes ni etiquetas. No se modifica la pieza original.

Fuente: `assets/microcemento/microcemento-lanzamiento-2026.webp`, 1024 × 1536; SHA-256 `5c63695bef8f15dff7e594f04046ed97c3d07f975aa9f8d16376b90e5d65ee48`. Regiones `(x inicial, y inicial, x final exclusivo, y final exclusivo)`:

| Tono | Región de muestreo | RGB | Hex |
| --- | --- | --- | --- |
| Extra Blanco | (38, 1212, 124, 1277) | 230, 225, 220 | #e6e1dc |
| Arena | (149, 1212, 236, 1277) | 191, 172, 154 | #bfac9a |
| Gris Cemento | (261, 1212, 349, 1277) | 120, 118, 116 | #787674 |
| Negro Profundo | (375, 1212, 463, 1277) | 43, 43, 42 | #2b2b2a |
| Terracota | (488, 1212, 576, 1277) | 160, 97, 69 | #a06145 |

La iluminación relativa se conserva mediante la luminancia de la imagen base dividida por la mediana de una zona sin mobiliario: pared `(550, 140, 980, 340)`, `0.6122007843137255`; piso `(450, 750, 1250, 930)`, `0.6884298039215687`. Se usa la misma suma ponderada de canales sRGB del renderizador (`0.2126 R + 0.7152 G + 0.0722 B`, dividida por 255). Es una normalización visual, no una medición fotométrica ni una calibración física. Evita un oscurecimiento global añadido; las zonas con distinta luz conservan diferencias de brillo. Los indicadores de color muestran el tono de referencia sin esa iluminación.

### Cálculo y límite de precisión

Para cada canal digital: `round((canal1 × porcentaje1 + canal2 × porcentaje2) / 100)`. Solo admite las proporciones existentes (10–90%, en pasos de 10), que suman exactamente 100%. Por ejemplo, Arena 70% + Gris Cemento 30% da RGB `(170, 156, 143)`, `#aa9c8f`. El redondeo final de 8 bits introduce como máximo medio nivel por canal. Invertir colores y porcentajes da el mismo resultado.

Esta interpolación es reproducible y respeta matemáticamente la selección, pero **no predice con exactitud una mezcla física de pigmentos**. No se inventan coeficientes de absorción, dispersión ni fuerza tintórea a partir de una fotografía. Para una predicción física se necesitan muestras medidas de los materiales y sus mezclas; los modelos de pigmentos utilizan propiedades espectrales ([referencia de investigación](https://doi.org/10.1364/AO.41.005969)). La interfaz indica expresamente que la vista es orientativa y requiere una muestra física. El sellador sigue siendo una elección de compra; la imagen no simula su brillo.

No se solicita una imagen a IA en cada cambio. El cálculo ocurre en el navegador, sin nuevas librerías ni servicios. La imagen se carga de forma diferida, tiene dimensiones reservadas y conserva una alternativa estática si falla el lienzo. Los colores se comunican también con texto. El enlace para volver a la imagen respeta movimiento reducido.

## Validación

- `node --test tests/*.test.cjs` (con `REDIS_SERVER_BIN` apuntando al Redis local de pruebas para ejecutar toda la suite).
- `node tests/color-preview-browser.cjs` (requiere Playwright y Chrome; `CHROME_BIN` y `TEST_OUTPUT_DIR` son opcionales).
- La prueba de navegador sirve un fixture local, bloquea los proveedores externos de pago/medición y simula la respuesta del checkout. Verifica ambas páginas en 1440, 1024, 768, 390 y 320 px; independencia, vinculación, carrito, fórmula final, preservación del mobiliario, reinicio y movimiento reducido.
- No se ejecuta una transacción real ni se envía una conversión de Google Ads.
