import pathlib
import shutil

src = pathlib.Path("dataset/curated")
dst = pathlib.Path("dataset/to_label")
dst.mkdir(parents=True, exist_ok=True)
P01_KEEP = {"civ": 370, "neg": 200}   # polo: keep all

for tag in ("polo", "civ", "neg"):
    files = sorted(src.glob(f"*_{tag}_*.jpg"))
    mine = [f for f in files if f.name.startswith("p01_")]
    others = [f for f in files if not f.name.startswith("p01_")]
    keep = mine
    n = P01_KEEP.get(tag)
    if n and len(mine) > n:
        step = len(mine) / n
        keep = [mine[int(i * step)] for i in range(n)]
    for f in keep + others:
        shutil.copy(f, dst / f.name)
    print(tag, len(keep) + len(others))