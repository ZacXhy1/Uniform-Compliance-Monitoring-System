import cv2
import pathlib
import shutil

src = pathlib.Path("dataset/raw")
dst = pathlib.Path("dataset/curated")
dst.mkdir(parents=True, exist_ok=True)

THRESHOLD = 12   # raise to keep fewer photos, lower to keep more

for tag in ("polo", "civ", "neg"):
    last = None
    kept = 0
    files = sorted(src.glob(f"*_{tag}_*.jpg"))
    for f in files:
        img = cv2.imread(str(f))
        small = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (32, 32)).astype("float")
        if last is None or abs(small - last).mean() > THRESHOLD:
            shutil.copy(f, dst / f.name)
            last = small
            kept += 1
    print(tag, "kept", kept, "of", len(files))