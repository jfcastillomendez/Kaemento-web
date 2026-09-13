# Repository Guidelines

## Identidad y reglas permanentes

Este proyecto es la web oficial de KAEMENTO. El remoto es `jfcastillomendez/Kaemento-web` (`https://github.com/jfcastillomendez/Kaemento-web.git`), la rama de producción es `main` y el dominio final es `https://kaemento.com`. Vercel despliega automáticamente producción al hacer push a `main`.

**NUNCA hacer push, merge ni commit de publicación a `main` sin que el usuario ordene literalmente PUBLICAR KAEMENTO.** La frase citada en documentación o al configurar estas reglas no constituye autorización. Antes de cada publicación, resumir los cambios y esperar esa orden literal para la publicación concreta.

## Flujo de trabajo y publicación

Para cambios normales, consultar el estado de Git y el remoto, obtener la última versión de `main` y crear desde ella una rama `codex/<descripcion-corta>`. Conservar cualquier trabajo local existente; no sobrescribirlo ni descartarlo. Realizar los cambios en esa rama y ofrecer una vista previa local antes de publicar.

Iniciar desde la raíz `python3 -m http.server 8000 --bind 127.0.0.1` y proporcionar `http://localhost:8000` al usuario. El trabajo y la publicación deben realizarse con Git y las herramientas disponibles, sin exigir abrir manualmente GitHub Desktop ni Vercel.

Después del resumen y de recibir la orden literal **PUBLICAR KAEMENTO**:

1. Verificar que no haya errores con las comprobaciones de este documento. Ejecutar `git diff --check`, revisar `git status`, los archivos cambiados y el diff completo, incluidos archivos nuevos y cambios preparados. Confirmar que no haya `.DS_Store` en el proyecto ni en los archivos que se publicarán.
2. Hacer commit de los cambios revisados en la rama de trabajo con un mensaje descriptivo. No incluir cambios ajenos a la publicación.
3. Con el árbol de trabajo limpio, cambiar a `main` y ejecutar `git pull --ff-only origin main`. Si hay conflictos, divergencias o el remoto cambió inesperadamente respecto de la base revisada, **DETENERSE**, explicar la situación y pedir instrucciones. Nunca forzar ni descartar trabajo.
4. Integrar la rama únicamente si es seguro, preferiblemente con `git merge --ff-only codex/<descripcion-corta>`. Si no es posible avanzar de forma segura, detenerse. Revisar nuevamente el resultado y ejecutar `git diff --check` antes de `git push origin main`. Nunca usar force push.
5. Esperar el despliegue automático y comprobar que `https://kaemento.com` responde correctamente, muestra los cambios publicados y conserva las funciones afectadas. Si falla, informar del problema; no afirmar que la publicación terminó correctamente.
6. No borrar la rama de trabajo hasta comprobar que la publicación funciona.

## Marca, configuración y archivos protegidos

- Mantener Google Analytics `G-XYVF450MJE`, Google Ads `AW-18358591293`, el seguimiento de clics de WhatsApp y el número `573003671548`, salvo instrucción expresa del usuario.
- Conservar responsive, navegación, formularios, WhatsApp, SEO, catálogos y enlaces existentes salvo que el cambio solicitado implique modificarlos.
- La marca actual es **Microcemento KAEMENTO**. No reintroducir referencias comerciales a Zebra Easy Concrete.
- No modificar configuración de dominios, Vercel ni analítica sin autorización expresa. No almacenar contraseñas, tokens ni secretos en el repositorio.
- Mantener `.DS_Store` en `.gitignore` y eliminar cualquier `.DS_Store` no rastreado dentro del proyecto. Si alguno está rastreado, señalarlo y resolverlo antes de publicar.

## Project Structure & Module Organization

KAEMENTO is a Spanish-language static website deployed at the hosting root. Edit HTML, CSS, and JavaScript directly; there is no application framework or package manifest.

- Root HTML files contain the homepage, company, projects, and gallery pages.
- `productos/` and `servicios/` contain listing and detail pages. `products/` holds assets, not product page routes.
- `index.html` loads `home-original.css`; interior pages generally load `site.css`. Shared interactions live in `site.js`; gallery additions use `gallery.css` and `gallery.js`.
- `styles.css`, `script.js`, and `product-stories.css` also exist. Check actual page references before editing or removing them.
- `assets/`, `images/`, `products/`, `projects/`, and `concepts/` hold visual assets; `catalogos/` contains downloadable PDFs and cover images.
- `robots.txt` and `sitemap.xml` support search indexing.

## Build, Test, and Development Commands

- `python3 -m http.server 8000 --bind 127.0.0.1`: serve the repository root, then offer `http://localhost:8000`. Python 3 is required. HTTP preview preserves root-relative asset paths.
- `node --check site.js`: check JavaScript syntax when Node.js is available; repeat for other changed scripts.
- `git diff --check`: catch whitespace errors before committing.

There is no build step, dependency installation, or configured test runner. Keep the static directory structure intact. Follow the authorized Git/Vercel publication workflow above; manual upload is not the normal publication process.

## Coding Style & Naming Conventions

Follow surrounding formatting and avoid reformatting unrelated compact HTML/CSS. Use two-space indentation for new multiline blocks, descriptive camelCase JavaScript identifiers, and lowercase hyphenated filenames and CSS classes. No formatter or linter is configured.

Keep public copy in Spanish. Preserve semantic headings, image alternative text, keyboard navigation, and accurate `aria-expanded` states. Reuse existing CSS variables and components.

## Testing Guidelines

No automated coverage threshold exists. Check changed pages at desktop and mobile widths, including nested routes. Exercise menus, submenus, filters, gallery controls, catalog downloads, and WhatsApp form/link behavior where affected. Inspect the browser console and network panel for errors or missing assets.

## Commit & Pull Request Guidelines

History uses short descriptive subjects in Spanish and English, without a consistent prefix convention. Write a specific action-oriented subject, such as `Corregir menú móvil de servicios`.

For pull requests, describe affected pages and behavior, list manual checks, link any relevant issue, and include desktop/mobile screenshots for visual changes. Update sitemap entries and canonical metadata when adding or renaming pages; preserve analytics and contact configuration unless the change explicitly requires updating them.
