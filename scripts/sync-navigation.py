"""Regenerate the shared static header: python3 scripts/sync-navigation.py.
No runtime JS dependency: navigation links remain available without JavaScript.
"""
import json,re
from pathlib import Path
r=Path(__file__).resolve().parents[1];data=json.loads((r/'data/site.json').read_text())
def group(folder,items):
 label={'servicios':'Servicios','productos':'Productos'}[folder]
 return f'<div class="nav-group"><a href="/{folder}/index.html">{label}</a><button type="button" class="submenu-toggle" aria-label="Desplegar {folder}" aria-controls="menu-{folder}" aria-expanded="false">⌄</button><div class="submenu" id="menu-{folder}">'+''.join(f'<a href="/{folder}/{slug}.html">{text}</a>' for slug,text in items)+'</div></div>'
header='<header class="nav"><a class="brand" href="/index.html"><span class="brand-mark">K</span><span>KAEMENTO</span></a><button type="button" class="menu" aria-label="Abrir menú" aria-controls="main-menu" aria-expanded="false"><span></span><span></span></button><nav id="main-menu" aria-label="Navegación principal"><a href="/index.html">Inicio</a>'+group('servicios',data['services'])+group('productos',data['products'])+'<a href="/proyectos.html">Proyectos</a><a href="/index.html#catalogos">Catálogos</a><a href="/galeria.html">Galería</a><a class="nav-cta" href="/index.html#cotizar">Cotizar proyecto</a></nav></header>'
(r/'partials/header.html').write_text(header+'\n')
for p in list(r.glob('*.html'))+list((r/'productos').glob('*.html'))+list((r/'servicios').glob('*.html')):
 route='/'+p.relative_to(r).as_posix();local=header.replace(f'href="{route}"',f'aria-current="page" href="{route}"')
 if route=='/productos/microcemento-kaemento.html':local=local.replace('href="/index.html#cotizar"','href="#cotizar-microcemento" id="micro-nav-cotizar" data-microcemento-cta="true"')
 p.write_text(re.sub(r'<header class="nav">.*?</header>',lambda m:local,p.read_text(),count=1,flags=re.S))

# The future address remains inactive until the owner confirms it works.
email = data["futureEmail"] if data.get("futureEmailEnabled") else data["email"]
for p in list(r.glob("*.html")) + list((r/"productos").glob("*.html")) + list((r/"servicios").glob("*.html")):
    p.write_text(p.read_text().replace("kaemento@gmail.com", email).replace("comercial@kaemento.com", email))
