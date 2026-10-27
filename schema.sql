-- =====================================================================
-- Uniform Compliance Monitoring System: Supabase schema
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Reflects the REAL state of the database as of 2026-10-27.
-- =====================================================================

-- ---------------------------------------------------------------------
-- students: one row per RFID card
-- rfid_uid must be UPPERCASE hex with NO spaces (card "F9 07 03 9E" -> 'F907039E')
-- ---------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  rfid_uid text unique not null,
  name text not null,
  section text
);

-- ---------------------------------------------------------------------
-- compliance_logs: one row per finished check (written by backend/main.py)
-- Columns the backend actually writes: created_at*, result, snapshot,
-- capture_to_result_s, student_id.  (*see timestamp note below)
-- student_id is NULL for dashboard-button test checks (no card tapped).
-- ---------------------------------------------------------------------
create table if not exists compliance_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  result text,                 -- 'COMPLIANT' | 'NON-COMPLIANT' | 'NO RESULT - RETRY'
  snapshot text,               -- filename in local captures/ folder
  capture_to_result_s real,    -- seconds from trigger to result (objective: avg < 5 s)
  student_id uuid references students(id)
);

-- Columns for databases created earlier (the table originally came from a first
-- draft schema, then was aligned with the backend). These make an old table match.
alter table compliance_logs add column if not exists result text;
alter table compliance_logs add column if not exists snapshot text;
alter table compliance_logs add column if not exists capture_to_result_s real;
alter table compliance_logs add column if not exists student_id uuid references students(id);

-- Leftover columns from the first draft. The backend does NOT use them.
-- Kept so existing data/tables stay valid; safe to ignore or drop later.
alter table compliance_logs add column if not exists label text;
alter table compliance_logs add column if not exists compliant boolean;
alter table compliance_logs add column if not exists confidence real;
alter table compliance_logs add column if not exists snapshot_path text;
alter table compliance_logs alter column label drop not null;

-- ---------------------------------------------------------------------
-- Security: RLS on, deliberately NO policies.
-- Only the FastAPI server can read/write, using the SECRET key
-- (sb_secret_... / service_role) in .env as SUPABASE_KEY.
-- The publishable/anon key will silently return zero rows, which shows up
-- as "unregistered" on every card. Never put the secret key in the
-- frontend or the ESP32 code.
-- ---------------------------------------------------------------------
alter table students enable row level security;
alter table compliance_logs enable row level security;

-- ---------------------------------------------------------------------
-- Seed: test card used during development
-- ---------------------------------------------------------------------
insert into students (rfid_uid, name, section)
values ('F907039E', 'Test Student', 'BSIT-3B')
on conflict (rfid_uid) do nothing;

-- ---------------------------------------------------------------------
-- KNOWN ISSUE (not fixed in SQL): timestamp offset
-- backend/main.py sends created_at as local time text with no timezone, so
-- Supabase stores it as UTC (about 8 hours off for the Philippines).
-- Fix: delete the  "created_at": entry["time"],  line in save_to_supabase()
-- so the database default now() stamps the row. Old test rows keep the
-- wrong time.
-- ---------------------------------------------------------------------

-- Handy check:
-- select created_at, result, student_id, capture_to_result_s
-- from compliance_logs order by created_at desc limit 5;
