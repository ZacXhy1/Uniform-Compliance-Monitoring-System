"""FastAPI backend for the Uniform Compliance Monitoring System.

Run from the project root:
    uvicorn backend.main:app --host 0.0.0.0 --port 8000

Endpoints
    GET  /video_feed    MJPEG stream of the annotated webcam (use in an <img src>)
    POST /trigger       start one compliance check (dashboard button / later: RFID tap)
    GET  /api/status    {"state": "idle|collecting|cooldown", "model": ..., "camera": ...}
    GET  /api/logs      recent results (newest first)
    GET  /captures/<f>  saved snapshot images
    WS   /ws            pushes {"type": "state"|"result", ...} live
"""
import asyncio
import json
import os
import pathlib
import threading
import time
import urllib.request
from contextlib import asynccontextmanager
from typing import Optional

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ultralytics import YOLO
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse

load_dotenv()

# ---------- settings (same values as scripts/live_detect.py) ----------
MODEL_PATH = os.getenv("MODEL_PATH", "models/best.pt")
CAM_INDEX = int(os.getenv("CAM_INDEX", "0"))
CONF = 0.25          # minimum confidence for any detection
POLO_CONF = 0.60     # a polo must be at least this confident to count
FRAMES = 10          # frames examined per check
COOLDOWN_S = 3       # pause after a result so one student is not logged twice
ESP32_URL = os.getenv("ESP32_URL", "")        # e.g. http://192.168.1.50  (optional)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "compliance_logs")

CAPTURES = pathlib.Path("captures")
CAPTURES.mkdir(exist_ok=True)
LOG_FILE = CAPTURES / "log.jsonl"


# ---------- decision rule (identical to live_detect.py) ----------
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


def result_confidence(votes, result):
    """Average confidence (0 to 1) of the frames that produced the result."""
    if result == "COMPLIANT":
        picked = [p for c, p in votes if c == 1 and p >= POLO_CONF]
    elif result == "NON-COMPLIANT":
        picked = [p for c, p in votes if c == 0]
    else:
        picked = []   # retry: nothing clear was detected
    return round(sum(picked) / len(picked), 3) if picked else None


# ---------- optional integrations ----------
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:  # package missing or bad keys: keep running locally
        print("Supabase disabled:", e)


def save_to_supabase(entry):
    if not supabase:
        return
    try:
        supabase.table(SUPABASE_TABLE).insert({
            "result": entry["result"],
            "snapshot": entry["snapshot"],
            "capture_to_result_s": entry["seconds"],
            "confidence": entry.get("confidence"),
            "student_id": entry.get("student_id"),
        }).execute()
    except Exception as e:
        print("Supabase insert failed:", e)


def find_student(uid):
    """Look up an RFID UID in the students table. Returns a dict or None."""
    rows = (supabase.table("students").select("id,name,section")
            .eq("rfid_uid", uid).limit(1).execute().data)
    return rows[0] if rows else None


def notify_esp32(result):
    """Tell the ESP32 to light the LED / buzz. Fire and forget."""
    if not ESP32_URL:
        return
    status = {"COMPLIANT": "compliant", "NON-COMPLIANT": "noncompliant"}.get(result, "retry")
    try:
        urllib.request.urlopen(f"{ESP32_URL}/result?status={status}", timeout=2)
    except Exception as e:
        print("ESP32 notify failed:", e)


# ---------- shared state ----------
class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.jpeg = None            # latest annotated frame (bytes)
        self.mode = "idle"          # idle | collecting | cooldown
        self.votes = []
        self.t_start = 0.0
        self.cooldown_until = 0.0
        self.last_result = None
        self.student = None         # student for the check in progress (None = dashboard test)
        self.done = threading.Event()   # set when a check finishes (lets /trigger?wait=true reply)
        self.camera_ok = False
        self.logs = []
        self.clients = set()
        self.loop = None
        self.stop = False


S = State()
model = None


def broadcast(msg):
    """Called from the camera thread; delivers to all websocket clients."""
    if not S.loop:
        return

    async def send_all():
        dead = []
        for ws in list(S.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            S.clients.discard(ws)

    asyncio.run_coroutine_threadsafe(send_all(), S.loop)


def set_mode(mode):
    S.mode = mode
    broadcast({"type": "state", "state": mode})


def finish_check(frame):
    result = decide(S.votes)
    seconds = round(time.time() - S.t_start, 2)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    fname = f"{stamp}_{result.split()[0]}.jpg"
    cv2.imwrite(str(CAPTURES / fname), frame)
    entry = {
        "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "result": result,
        "compliant": result == "COMPLIANT",
        "snapshot": fname,
        "seconds": seconds,
        "confidence": result_confidence(S.votes, result),
        "student": S.student["name"] if S.student else None,
        "student_id": S.student["id"] if S.student else None,
    }
    S.last_result = entry
    S.logs.insert(0, entry)
    del S.logs[200:]
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    print(result, S.votes)
    broadcast({"type": "result", **entry})
    S.done.set()
    S.cooldown_until = time.time() + COOLDOWN_S
    set_mode("cooldown")
    # slow I/O off the camera thread so the stream does not freeze
    threading.Thread(target=lambda: (save_to_supabase(entry), notify_esp32(result)),
                     daemon=True).start()


def camera_loop():
    cap = cv2.VideoCapture(CAM_INDEX)
    print(f"Opening camera index {CAM_INDEX}: {'opened' if cap.isOpened() else 'FAILED to open'}")
    fails = 0
    while not S.stop:
        ok, frame = cap.read()
        if not ok:
            S.camera_ok = False
            fails += 1
            if fails in (1, 10) or fails % 60 == 0:   # keep the console readable
                print(f"Camera: no frame (attempt {fails}). Is another program using the webcam, "
                      f"or is CAM_INDEX={CAM_INDEX} the wrong camera?")
            time.sleep(0.5)
            cap.release()
            cap = cv2.VideoCapture(CAM_INDEX)   # try to reconnect
            continue
        fails = 0
        if not S.camera_ok:
            print("Camera ready")
        S.camera_ok = True
        r = model.predict(frame, conf=CONF, verbose=False)[0]
        view = r.plot()

        with S.lock:
            if S.mode == "collecting":
                S.votes.append(top(r))
                cv2.putText(view, f"checking {len(S.votes)}/{FRAMES}", (20, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                if len(S.votes) >= FRAMES:
                    finish_check(frame)
            elif S.mode == "cooldown" and time.time() >= S.cooldown_until:
                set_mode("idle")

        ok2, buf = cv2.imencode(".jpg", view, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok2:
            S.jpeg = buf.tobytes()
    cap.release()


# ---------- app ----------
@asynccontextmanager
async def lifespan(app):
    global model
    model = YOLO(MODEL_PATH)
    model.predict(np.zeros((480, 640, 3), dtype=np.uint8), verbose=False)  # warm-up: first real check is faster
    S.loop = asyncio.get_running_loop()
    if LOG_FILE.exists():   # reload recent history after a restart
        lines = LOG_FILE.read_text(encoding="utf-8").splitlines()[-200:]
        S.logs = [json.loads(l) for l in reversed(lines) if l.strip()]
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()
    yield
    S.stop = True


app = FastAPI(title="Uniform Compliance API", lifespan=lifespan)


class TriggerIn(BaseModel):
    uid: Optional[str] = None   # RFID UID from the ESP32; omit for the dashboard button


@app.post("/trigger")
def trigger(body: Optional[TriggerIn] = None, wait: bool = False):
    """Start one check. Dashboard button: no body. ESP32 RFID tap: {"uid": "..."}.
    With ?wait=true the reply is held until the result is ready (~1-2 s), so the
    ESP32 can drive its LEDs/buzzer straight from the response."""
    student = None
    uid = body.uid.strip().upper() if body and body.uid else None
    if uid:
        if not supabase:
            return JSONResponse({"ok": False, "status": "error",
                                 "error": "students database not configured"}, status_code=503)
        try:
            student = find_student(uid)
        except Exception as e:
            print("student lookup failed:", e)
            return JSONResponse({"ok": False, "status": "error",
                                 "error": "student lookup failed"}, status_code=503)
        if not student:
            broadcast({"type": "unregistered", "uid": uid})
            return JSONResponse({"ok": False, "status": "unregistered"}, status_code=404)

    with S.lock:
        if S.mode != "idle":
            return JSONResponse({"ok": False, "status": "busy", "state": S.mode}, status_code=409)
        if not S.camera_ok:
            return JSONResponse({"ok": False, "status": "error", "error": "camera not available"},
                                status_code=503)
        S.votes = []
        S.student = student
        S.done.clear()
        S.t_start = time.time()
        set_mode("collecting")

    if not wait:
        return {"ok": True, "state": "collecting"}
    if not S.done.wait(timeout=10):          # lock is released, camera thread keeps running
        return JSONResponse({"ok": False, "status": "timeout"}, status_code=504)
    e = S.last_result
    status = {"COMPLIANT": "compliant", "NON-COMPLIANT": "noncompliant"}.get(e["result"], "retry")
    return {"ok": True, "status": status, "student": e["student"], "seconds": e["seconds"]}


@app.get("/api/status")
def status():
    return {"state": S.mode, "camera": S.camera_ok, "model": MODEL_PATH,
            "last_result": S.last_result, "supabase": bool(supabase), "esp32": bool(ESP32_URL)}


@app.get("/api/logs")
def logs(limit: int = 50):
    return S.logs[:limit]


def mjpeg():
    while True:
        if S.jpeg:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + S.jpeg + b"\r\n"
        time.sleep(0.04)   # ~25 fps cap


@app.get("/video_feed")
def video_feed():
    return StreamingResponse(mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    S.clients.add(websocket)
    await websocket.send_json({"type": "state", "state": S.mode})
    try:
        while True:
            await websocket.receive_text()   # keep the connection open
    except WebSocketDisconnect:
        S.clients.discard(websocket)


@app.get("/captures/{name}")
def get_capture(name: str, request: Request):
    # Only the laptop running the server may view snapshots.
    if request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403)
    path = (CAPTURES / name).resolve()
    if path.suffix.lower() != ".jpg" or CAPTURES.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path)

# Serves the dashboard at http://localhost:8000/ once frontend/index.html exists
if pathlib.Path("frontend/index.html").exists():
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")