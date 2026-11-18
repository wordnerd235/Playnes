# diffsheet.py out.jpg a.cmp.jpg ... : photo panel + difference panel for each, two pairs per row
import sys
from PIL import Image
out = sys.argv[1]; tiles = []
for f in sys.argv[2:]:
    im = Image.open(f).convert("RGB"); w3 = im.width // 3
    a = im.crop((0, 0, w3, im.height)); c = im.crop((2 * w3, 0, 3 * w3, im.height))
    t = Image.new("RGB", (2 * w3, im.height)); t.paste(a, (0, 0)); t.paste(c, (w3, 0))
    tiles.append(t.resize((800, int(800 * t.height / t.width))))
rows = [tiles[i:i + 2] for i in range(0, len(tiles), 2)]
H = sum(max(t.height for t in r) for r in rows)
s = Image.new("RGB", (1600, H), "white"); y = 0
for r in rows:
    for k, t in enumerate(r): s.paste(t, (k * 800, y))
    y += max(t.height for t in r)
s.save(out, quality=82)
