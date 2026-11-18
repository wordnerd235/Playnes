# fetchcat.py <id> <max> "<Commons category name>" [more]
# Finds photos in a Commons category and its subcategories (deepcat search), downloads 420 px
# thumbnails to <id>/t###.jpg, and writes <id>/index.json and a numbered contact sheet.
import json, subprocess, sys, time, urllib.parse, os, random
from PIL import Image, ImageDraw
UA = "PlaynesModelCheck/1.0 (reference-photo lookup)"
tid, mx, cats = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
os.makedirs(tid, exist_ok=True)
def api(p):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**p, "format": "json"})
    for a in range(10):
        out = subprocess.run(["curl", "-sS", "-m", "40", "-A", UA, url], capture_output=True, text=True).stdout
        try: return json.loads(out)
        except Exception: time.sleep(30)
    return None
files = {}
for cat in cats:
    off = 0
    while off < 250:
        r = api({"action": "query", "generator": "search", "gsrsearch": (cat[2:] + ' filetype:bitmap') if cat.startswith('q:') else f'deepcat:"{cat}" filetype:bitmap', "gsrnamespace": 6, "gsrlimit": 50, "gsroffset": off, "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 420})
        if not r: print("failed", cat); break
        for p in (r.get("query", {}).get("pages", {}) or {}).values():
            ii = p.get("imageinfo", [{}])[0]
            if p["title"].lower().endswith((".jpg", ".jpeg")) and ii.get("thumburl"):
                files[p["title"]] = ii["thumburl"].replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/").split("?")[0]
        time.sleep(6)
        if "continue" not in r: break
        off += 50
titles = sorted(files)
random.seed(1)
if len(titles) > mx: titles = sorted(random.sample(titles, mx))
idx = []
for i, t in enumerate(titles):
    fn = f"{tid}/t{i:03d}.jpg"
    if not os.path.exists(fn) or os.path.getsize(fn) < 3000:
        for a in range(3):
            subprocess.run(["curl", "-sS", "-m", "60", "-A", UA, "-o", fn, files[t]])
            time.sleep(2)
            try: Image.open(fn).verify(); break
            except Exception: time.sleep(20)
    idx.append({"i": i, "title": t, "thumb": files[t]})
json.dump(idx, open(f"{tid}/index.json", "w"), indent=1)
ims = []
for e in idx:
    try: im = Image.open(f"{tid}/t{e['i']:03d}.jpg").convert("RGB"); im.thumbnail((240, 170)); ims.append((e["i"], im))
    except Exception: pass
if ims:
    cols = 8; rows = (len(ims) + cols - 1) // cols
    s = Image.new("RGB", (cols * 240, rows * 170), "white"); d = ImageDraw.Draw(s)
    for k, (i, im) in enumerate(ims):
        x, y = (k % cols) * 240, (k // cols) * 170
        s.paste(im, (x, y)); d.rectangle((x, y, x + 26, y + 14), fill="yellow"); d.text((x + 2, y + 2), str(i), fill="black")
    s.save(f"{tid}/sheet.jpg", quality=80)
print(tid, len(files), "files;", len(ims), "on sheet", flush=True)
