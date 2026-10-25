import cv2
import pathlib

PERSON = "p01"   # change for each student

out = pathlib.Path("dataset/raw")
out.mkdir(parents=True, exist_ok=True)

def next_index(tag):
    return len(list(out.glob(f"{PERSON}_{tag}_*.jpg")))

counts = {"polo": next_index("polo"), "civ": next_index("civ"), "neg": next_index("neg")}
keys = {ord("p"): "polo", ord("c"): "civ", ord("n"): "neg"}

cap = cv2.VideoCapture(0)
while True:
    ok, frame = cap.read()
    if not ok:
        break
    view = frame.copy()
    msg = f"{PERSON}  P=polo({counts['polo']})  C=civilian({counts['civ']})  N=hard negative({counts['neg']})  Q=quit"
    cv2.putText(view, msg, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
    cv2.imshow("collect", view)
    k = cv2.waitKey(1) & 0xFF
    if k in keys:
        tag = keys[k]
        cv2.imwrite(str(out / f"{PERSON}_{tag}_{counts[tag]:04d}.jpg"), frame)
        counts[tag] += 1
    elif k == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()