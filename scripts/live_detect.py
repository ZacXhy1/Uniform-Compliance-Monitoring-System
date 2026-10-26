import pathlib
import time

import cv2
from ultralytics import YOLO

MODEL = "models/best.pt"
CAM = 0
CONF = 0.25         # minimum confidence for any detection
POLO_CONF = 0.60    # a polo must be at least this confident to count
FRAMES = 10         # frames examined per check
COLORS = {"COMPLIANT": (0, 180, 0), "NON-COMPLIANT": (0, 0, 220),
          "NO RESULT - RETRY": (0, 160, 255)}

OUT = pathlib.Path("captures")
OUT.mkdir(exist_ok=True)
model = YOLO(MODEL)
cap = cv2.VideoCapture(CAM)


def top(r):
    if len(r.boxes) == 0:
        return None, 0.0
    i = int(r.boxes.conf.argmax())
    return int(r.boxes.cls[i]), float(r.boxes.conf[i])


def decide(votes):
    n = len(votes)
    polo = sum(1 for c, p in votes if c == 1 and p >= POLO_CONF)
    civ = sum(1 for c, p in votes if c == 0)
    if polo >= 0.7 * n:
        return "COMPLIANT"
    if civ >= 0.5 * n:
        return "NON-COMPLIANT"
    return "NO RESULT - RETRY"


votes, collecting, result, until = [], False, "", 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    r = model.predict(frame, conf=CONF, verbose=False)[0]
    view = r.plot()
    if collecting:
        votes.append(top(r))
        if len(votes) >= FRAMES:
            result = decide(votes)
            collecting, until = False, time.time() + 3
            name = f"{time.strftime('%Y%m%d_%H%M%S')}_{result.split()[0]}.jpg"
            cv2.imwrite(str(OUT / name), frame)
            print(result, votes)
    if result and time.time() < until:
        cv2.putText(view, result, (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.4, COLORS[result], 4)
    elif not collecting:
        cv2.putText(view, "SPACE = check   Q = quit", (20, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.imshow("uniform check", view)
    k = cv2.waitKey(1) & 0xFF
    if k == ord(" ") and not collecting:
        votes, collecting, result = [], True, ""
    elif k == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()