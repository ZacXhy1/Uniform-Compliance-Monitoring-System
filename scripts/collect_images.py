import cv2
import pathlib

PERSON = "p01"   # change for each student so you can split by person later

out = pathlib.Path("dataset/raw")
out.mkdir(parents=True, exist_ok=True)
n = len(list(out.glob(f"{PERSON}_*.jpg")))

cap = cv2.VideoCapture(0)
while True:
    ok, frame = cap.read()
    if not ok:
        break
    cv2.imshow("SPACE = save, Q = quit", frame)
    k = cv2.waitKey(1) & 0xFF
    if k == ord(" "):
        cv2.imwrite(str(out / f"{PERSON}_{n:04d}.jpg"), frame)
        n += 1
    elif k == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
