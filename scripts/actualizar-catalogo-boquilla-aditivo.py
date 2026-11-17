"""Replace only Boquilla's obsolete product sheet, preserving the other catalog pages."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'catalogos/catalogo-productos-kaemento-2026.pdf'
ASSET = ROOT / 'assets/boquilla/presentacion-2026-11-aditivo/kit-aditivo.webp'

def update():
    # Run once against the pre-update catalog; save the source outside published assets.
    backup = ROOT / 'tmp/pdfs/catalogo-productos-antes-aditivo.pdf'
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists():
        backup.write_bytes(SOURCE.read_bytes())
    stream = BytesIO()
    c = canvas.Canvas(stream, pagesize=(864, 576))
    navy, gold, ink = '#073777', '#ac8847', '#252b31'
    c.setFillColor(HexColor('#faf7f0'))
    c.rect(0, 0, 864, 576, fill=1, stroke=0)
    def text(x, y, value, size=12, color=ink, bold=False):
        c.setFillColor(HexColor(color))
        c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
        c.drawString(x, y, value)
    def paragraph(x, top, value, width=310, size=11):
        p = Paragraph(value, ParagraphStyle('body', fontName='Helvetica', fontSize=size,
            leading=size*1.45, textColor=HexColor(ink)))
        _, height = p.wrap(width, 500)
        p.drawOn(c, x, top-height)
        return height
    text(36, 540, 'KAEMENTO', 19, gold, True)
    text(605, 542, 'PRODUCT SYSTEMS 2026', 10, gold)
    text(36, 492, 'BOQUILLA MÁGICA', 31, navy, True)
    text(36, 465, 'Volver a estrenar empieza entre tus baldosas.', 12)
    c.drawImage(str(ASSET), 30, 136, width=430, height=287,
        preserveAspectRatio=True, mask='auto')
    text(490, 424, 'KIT COMPLETO DE 1 kg', 20, navy, True)
    paragraph(490, 401, '<b>Incluye:</b> 1 kg de polvo en bolsa interior, aditivo de 30 ml, '
        'espátula plástica y toalla de microfibra.')
    text(490, 334, 'JUNTAS COMO NUEVAS', 13, navy, True)
    paragraph(490, 318, 'Renueva juntas firmes y compatibles sin retirar completamente '
        'la boquilla existente. Para pisos y paredes, interiores y exteriores, baños, '
        'cocinas, terrazas y zonas húmedas.')
    text(490, 236, 'MEZCLA POR CADA 1 kg DE POLVO', 12, navy, True)
    paragraph(490, 219, '<b>450 ml de agua + 30 ml de aditivo.</b> Mezcla el aditivo con '
        'el agua, incorpora al polvo y mezcla hasta obtener una pasta homogénea, sin grumos.')
    paragraph(490, 150, '<b>Piscinas y jacuzzis:</b> antes del llenado, confirma con KAEMENTO '
        'el curado y el sistema de protección para inmersión.', size=10)
    text(36, 115, 'CINCO TONOS PARA RENOVAR TUS JUNTAS', 10, navy, True)
    tones = [('EXTRA BLANCA','#f3e6e4'),('BEIGE','#fecea2'),('CHOCOLATE','#8b6041'),
        ('NEGRA','#232323'),('GRIS','#c5aca9')]
    for i, (label, color) in enumerate(tones):
        x = 36 + i*85
        c.setFillColor(HexColor(color)); c.roundRect(x, 78, 68, 23, 4, fill=1, stroke=0)
        text(x, 66, label, 7)
    c.setStrokeColor(HexColor('#ded4c4')); c.line(36, 50, 828, 50)
    text(36, 32, 'kaemento.com  |  +57 300 367 1548', 9, navy)
    text(490, 32, 'Imagen y tonos de referencia. Confirma con muestra física.', 8)
    c.showPage(); c.save(); stream.seek(0)
    replacement = PdfReader(stream).pages[0]
    source = PdfReader(backup); writer = PdfWriter()
    for i, page in enumerate(source.pages):
        writer.add_page(replacement if i == 3 else page)
    writer.add_metadata({'/Title':'Catálogo de productos KAEMENTO 2026',
        '/Subject':'Boquilla Mágica actualizada: kit de 1 kg con aditivo de 30 ml'})
    with SOURCE.open('wb') as file:
        writer.write(file)

if __name__ == '__main__':
    update()
