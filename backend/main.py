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

import cv2
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO

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
            "created_at": entry["time"],
            "result": entry["result"],
            "snapshot": entry["snapshot"],
            "capture_to_result_s": entry["seconds"],
        }).execute()
    except Exception as e:
        print("Supabase insert failed:", e)


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
    }
    S.last_result = entry
    S.logs.insert(0, entry)
    del S.logs[200:]
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    print(result, S.votes)
    broadcast({"type": "result", **entry})
    S.cooldown_until = time.time() + COOLDOWN_S
    set_mode("cooldown")
    # slow I/O off the camera thread so the stream does not freeze
    threading.Thread(target=lambda: (save_to_supabase(entry), notify_esp32(result)),
                     daemon=True).start()


def camera_loop():
    cap = cv2.VideoCapture(CAM_INDEX)
    while not S.stop:
        ok, frame = cap.read()
        if not ok:
            S.camera_ok = False
            time.sleep(0.5)
            cap.release()
            cap = cv2.VideoCapture(CAM_INDEX)   # try to reconnect
            continue
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
    S.loop = asyncio.get_running_loop()
    if LOG_FILE.exists():   # reload recent history after a restart
        lines = LOG_FILE.read_text(encoding="utf-8").splitlines()[-200:]
        S.logs = [json.loads(l) for l in reversed(lines) if l.strip()]
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()
    yield
    S.stop = True


app = FastAPI(title="Uniform Compliance API", lifespan=lifespan)

# Allow your separately-hosted dashboard to call the API. Tighten for real deployment.
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/trigger")
def trigger():
    """Start one check. Later, the RFID tap handler calls this same function."""
    with S.lock:
        if S.mode != "idle":
            return JSONResponse({"ok": False, "state": S.mode}, status_code=409)
        if not S.camera_ok:
            return JSONResponse({"ok": False, "error": "camera not available"}, status_code=503)
        S.votes = []
        S.t_start = time.time()
        set_mode("collecting")
    return {"ok": True, "state": "collecting"}


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


app.mount("/captures", StaticFiles(directory="captures"), name="captures")
# Serves the dashboard at http://localhost:8000/ once frontend/index.html exists
if pathlib.Path("frontend/index.html").exists():
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
