import math
import pathlib
import re
import shutil
import sys
from collections import Counter

import yaml
from PIL import Image

EXPORT = pathlib.Path("dataset/roboflow_export")
OUT = pathlib.Path("dataset/split")
TEST_PEOPLE = {"p04", "p05"}   # people kept out of training completely
VAL_FRACTION = 0.15            # share of p01's photos (latest ones) used for validation

yaml_files = list(EXPORT.rglob("data.yaml"))
if not yaml_files:
    sys.exit("data.yaml not found under dataset/roboflow_export")
root = yaml_files[0].parent
meta = yaml.safe_load(yaml_files[0].read_text())
print("export folder:", root)
print("classes:", meta["names"])

for r in root.glob("README.roboflow*"):
    txt = r.read_text(errors="ignore")
    print("README mentions a resize step: CHECK IT" if "esize" in txt else "README: no resize step")

pat = re.compile(r"^(p\d+)_(polo|civ|neg)_(\d+)")
items = []
for split in ("train", "valid", "test"):
    for img in sorted((root / split / "images").glob("*")):
        if img.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        m = pat.match(img.name)
        if not m:
            print("skipping (unexpected name):", img.name)
            continue
        lbl = root / split / "labels" / (img.stem + ".txt")
        if not lbl.exists():
            print("no label file, skipping:", img.name)
            continue
        items.append(dict(img=img, lbl=lbl, person=m[1], tag=m[2], num=int(m[3])))

print("images found:", len(items))
print("most common image sizes:", Counter(Image.open(i["img"]).size for i in items[:100]).most_common(3))

for it in items:
    it["split"] = "test" if it["person"] in TEST_PEOPLE else "train"

for tag in ("polo", "civ", "neg"):
    mine = sorted([i for i in items if i["person"] == "p01" and i["tag"] == tag], key=lambda i: i["num"])
    n_val = math.ceil(len(mine) * VAL_FRACTION)
    for it in mine[len(mine) - n_val:]:
        it["split"] = "val"

if OUT.exists():
    shutil.rmtree(OUT)
for it in items:
    for kind, src in (("images", it["img"]), ("labels", it["lbl"])):
        d = OUT / kind / it["split"]
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, d / src.name)

data = {"path": str(OUT.resolve()), "train": "images/train", "val": "images/val",
        "test": "images/test", "names": meta["names"]}
(OUT / "data.yaml").write_text(yaml.safe_dump(data, sort_keys=False))

for s in ("train", "val", "test"):
    c = Counter(i["tag"] for i in items if i["split"] == s)
    print(s, sum(c.values()), dict(c), "people:", sorted({i["person"] for i in items if i["split"] == s}))
print("wrote", OUT / "data.yaml")