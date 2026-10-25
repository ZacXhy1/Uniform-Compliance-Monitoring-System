import pathlib
import re
from PIL import Image, ImageOps

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    print("note: run 'pip install pillow-heif' if any photos are HEIC")

SRC = pathlib.Path("dataset/incoming")
OUT = pathlib.Path("dataset/curated")
OUT.mkdir(parents=True, exist_ok=True)
MAX_SIDE = 1280
TAGS = {"polo": "polo", "civilian": "civ", "lookalike": "neg"}
EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

for person_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
    m = re.match(r"p\s*(\d+)", person_dir.name, re.I)
    if not m:
        print("skipping (no pN in name):", person_dir.name)
        continue
    code = f"p{int(m.group(1)):02d}"
    for sub in sorted(person_dir.iterdir()):
        tag = TAGS.get(sub.name.strip().lower())
        if not sub.is_dir() or tag is None:
            print("skipping:", sub)
            continue
        n = len(list(OUT.glob(f"{code}_{tag}_*.jpg")))
        for f in sorted(sub.iterdir()):
            if f.suffix.lower() not in EXT:
                print("skipped:", f)
                continue
            try:
                img = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
            except Exception as e:
                print("could not read:", f, e)
                continue
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            img.save(OUT / f"{code}_{tag}_{n:04d}.jpg", quality=92)
            n += 1
        print(code, tag, "->", n, "photos so far")