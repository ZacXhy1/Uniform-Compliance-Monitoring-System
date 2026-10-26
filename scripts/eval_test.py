import pathlib
from collections import Counter

import cv2
from ultralytics import YOLO

MODEL = "models/best.pt"
IMG_DIR = pathlib.Path("dataset/split/images/test")
LBL_DIR = pathlib.Path("dataset/split/labels/test")
OUT = pathlib.Path("runs/test_errors")
CONF = 0.25
NAMES = {0: "civilian_shirt", 1: "prescribed_polo"}

OUT.mkdir(parents=True, exist_ok=True)
model = YOLO(MODEL)
table = Counter()
wrong = []
total = 0

for img in sorted(IMG_DIR.glob("*.jpg")):
    lbl = LBL_DIR / (img.stem + ".txt")
    gt = {int(l.split()[0]) for l in lbl.read_text().splitlines() if l.strip()}
    r = model.predict(str(img), conf=CONF, verbose=False)[0]
    pred = None
    if len(r.boxes) > 0:
        pred = int(r.boxes.cls[int(r.boxes.conf.argmax())])
    gt_name = NAMES[min(gt)] if len(gt) == 1 else "mixed"
    pred_name = NAMES[pred] if pred is not None else "NO DETECTION"
    table[(gt_name, pred_name)] += 1
    total += 1
    if pred not in gt:
        wrong.append((img.name, gt_name, pred_name))
        cv2.imwrite(str(OUT / img.name), r.plot())

print("\nreal -> predicted")
for (g, p), n in sorted(table.items()):
    print(f"  {g:16s} -> {p:16s} {n}")
print(f"\nper-photo accuracy: {total - len(wrong)}/{total} = {(total - len(wrong)) / total:.1%}")
print("\nmistakes:")
for name, g, p in wrong:
    print(f"  {name[:40]:40s} real={g}  predicted={p}")
print("\nannotated mistakes saved in", OUT)