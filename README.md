# Uniform Compliance Monitoring System

AI-powered school uniform compliance monitoring using a webcam and YOLOv8.

## Setup
```bash
python -m venv venv
venv\Scripts\activate        # Windows (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
```

## Scripts
- `scripts/test_webcam.py`: check that the webcam and pretrained YOLOv8 work
- `scripts/collect_images.py`: save dataset photos with SPACE (set PERSON per student)

## Notes
- Never commit `.env`, the `dataset/` photos (students are minors) or `.pt` model files.

## Run the system (backend + dashboard)
```bash
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
Open http://localhost:8000 and click **Check uniform**.

| Endpoint | Purpose |
|---|---|
| `GET /video_feed` | annotated MJPEG stream, use as `<img src>` |
| `POST /trigger` | start one check (later: RFID tap calls this) |
| `GET /api/status`, `GET /api/logs` | current state, recent results |
| `WS /ws` | live `state` and `result` messages |

Optional: set `SUPABASE_URL`/`SUPABASE_KEY` in `.env` and create the table:
```sql
create table compliance_logs (
  id bigint generated always as identity primary key,
  created_at timestamp, result text, snapshot text, capture_to_result_s real);
```
Set `ESP32_URL` to have the server call `GET /result?status=compliant|noncompliant|retry` on the ESP32.
