# Navegación y compra — revisión comercial

Vista previa pendiente de aprobación y publicación. Base: 53a10d1.

- Menú principal consistente: Inicio, Servicios, Comprar productos, Proyectos y Cotizar. Galería, catálogos y vinculación siguen en el pie.
- Inicio abre con dos decisiones: comprar productos o cotizar una obra. Los proyectos documentados aparecen después del hero. El bloque de equipo deja de mostrar retratos conceptuales y enlaza a empresa y experiencia real.
- Cotización general y de Microcemento: cuatro campos iniciales y detalles opcionales plegados. Se mantiene consentimiento, preparación de WhatsApp y contexto del servicio/producto. El formulario general omite datos opcionales vacíos del mensaje.
- Carrito de Microcemento en localStorage: versión 2, caducidad de siete días, solo selección normalizada. No almacena clientes, precios ni tokens. Recalcula importes; checkout mantiene revisión del precio y validación del servidor. Un pago confirmado limpia únicamente un carrito coincidente. Los borradores del simulador mantienen su ciclo independiente.
- Envío: consulta previa por WhatsApp con ciudad y producto, sin tarifas ni fechas inventadas. El usuario confirmó que está preparando la integración de una transportadora; no hay cálculo automático todavía.
- Boquilla Mágica: venta por cotización con presentación, color y unidades. No se añade precio ni rendimiento sin validar.
- Carta de Microcemento: identifica las referencias personalizadas y los cinco estándares que se compran en línea. El catálogo distingue compra directa y cotización.
- Los accesos persistentes de Microcemento se limitan a Inicio y su ficha; no distraen en otros productos y servicios.
- Documentos de Pintura: siguen solicitándose al equipo hasta tener fichas vigentes. La simulación fotográfica aprobada no cambia.

Verificación: 131 pruebas Node aprobadas; navegación comercial a 320, 390 y 1440 px; regreso desde WhatsApp en ambas entradas y cinco anchos; Pintura y compra simulada a 390 y 1440 px. Proveedores externos bloqueados, sin mensajes, pedidos ni pagos reales. Capturas y resultados en outputs/revision-comercial del chat.
