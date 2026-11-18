# getbig.py <id> <i> [i...]  -> <id>/b###.jpg (1280 px wide versions of chosen thumbnails)
import sys, json, re, subprocess, time, os
from PIL import Image
UA = "PlaynesModelCheck/1.0 (reference-photo lookup)"
tid = sys.argv[1]; idx = json.load(open(f"{tid}/index.json"))
for s in sys.argv[2:]:
    i = int(s); fn = f"{tid}/b{i:03d}.jpg"
    if os.path.exists(fn) and os.path.getsize(fn) > 20000: continue
    url = re.sub(r"/\d+px-", "/1280px-", idx[i]["thumb"])
    for a in range(4):
        subprocess.run(["curl", "-sS", "-m", "60", "-A", UA, "-o", fn, url]); time.sleep(3)
        try: Image.open(fn).verify(); break
        except Exception: time.sleep(25)
    print(fn, os.path.getsize(fn))
