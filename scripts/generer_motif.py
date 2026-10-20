"""Génère le motif en bandeau du style « Terre » (inspiration bogolan : losanges, triangles, filets).

Motif original, dessiné par code : aucune reprise d'un visuel existant.
Sortie : ressources/motif_bande.png (2560 x 40 px, affiché à 1280 x 20 dans le rapport).
"""
from pathlib import Path

from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / 'ressources'
OUT.mkdir(exist_ok=True)

W, H = 2560, 40
BRUN, BRUN_CLAIR = (74, 46, 16), (107, 68, 22)
OCRE, ORANGE, CREME, TURQUOISE = (217, 162, 27), (200, 87, 31), (247, 242, 232), (31, 102, 112)
img = Image.new('RGB', (W, H), BRUN)
d = ImageDraw.Draw(img)

# Filets du haut et du bas
for x in range(0, W, 16):
    d.rectangle([x, 2, x + 7, 4], fill=CREME)
    d.rectangle([x + 8, H - 5, x + 15, H - 3], fill=OCRE)

# Frise : un losanges toutes les 48 px, couleurs en alternance, triangles entre les losanges
couleurs = [OCRE, CREME, ORANGE, TURQUOISE]
pas = 48
for i, x in enumerate(range(0, W + pas, pas)):
    cx, cy = x + pas // 2, H // 2
    c = couleurs[i % 4]
    d.polygon([(cx, cy - 14), (cx + 14, cy), (cx, cy + 14), (cx - 14, cy)], fill=c)
    d.polygon([(cx, cy - 6), (cx + 6, cy), (cx, cy + 6), (cx - 6, cy)], fill=BRUN_CLAIR)
    # triangles entre deux losanges
    tx = x + pas
    d.polygon([(tx - 6, cy - 8), (tx + 6, cy - 8), (tx, cy)], fill=OCRE if i % 2 == 0 else ORANGE)
    d.polygon([(tx - 6, cy + 8), (tx + 6, cy + 8), (tx, cy)], fill=OCRE if i % 2 == 1 else ORANGE)

img.save(OUT / 'motif_bande.png', optimize=True)
print('ok', (OUT / 'motif_bande.png').stat().st_size, 'octets')
