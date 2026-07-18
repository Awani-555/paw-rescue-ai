-- Initial schema for PawRescue AI's move off flat-file JSON to Postgres.
--
-- Reconciled against the actual data in db.json / volunteer-locations.json
-- at migration time, not just the shape the app's routes construct in
-- memory - several fields (confidence, injuries, first_aid, detected_label,
-- severity_note, nearest_facilities, nearby_alerts_skipped, notes, the
-- human-readable location string, resolved_by) exist in real records but
-- weren't in the first draft of this schema.
--
-- Deliberate deviations from a fully "textbook" relational design, chosen
-- for lower migration risk over normalization purity:
--   - IDs stay as app-generated prefixed strings (e.g. 'case_report_<uuid>'),
--     not DB-generated UUIDs - preserves every existing ID used in URLs,
--     deep links (?case=, ?help=), and frontend-side ID construction
--     exactly as-is.
--   - reports and cases are merged into one `cases` table: the app has
--     always created them 1:1 at submission time and never diverges them
--     afterward, so keeping two tables would just mean writing (and
--     duplicating storage for) the same row twice on every report.
--   - responded_by/responded_at are plain columns on `cases`, not a
--     case_responses join table - the current "I'm Responding" claim is
--     single-claim/last-write-wins, so a join table would model a
--     multi-responder capability the app doesn't actually have.
--   - images stay as base64 data URIs in a TEXT column (renamed from the
--     original photo_url to `image`, since "_url" would be misleading for
--     inline base64) - no object-storage credentials exist yet to move
--     them out. This doesn't fully fix the "every read pulls a multi-MB
--     blob" issue, but it's a real improvement: callers that don't need
--     the image can leave it out of their SELECT list, which the old
--     read-the-whole-file design could never do.

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  report_id TEXT, -- kept for continuity/debugging even though report+case are now one row

  -- AI analysis result (ai-service/main.py's response, persisted at submission time)
  species TEXT,
  severity TEXT NOT NULL,
  detected_label TEXT,
  confidence DOUBLE PRECISION,
  injuries JSONB, -- array of strings
  first_aid JSONB, -- array of strings
  severity_note TEXT,
  nearest_facilities JSONB, -- array of facility objects (name/type/address/lat/lng/phone/hours/source/distance)

  -- Reporter-submitted content
  image TEXT, -- data:image/jpeg;base64,... - see note above on why not photo_url
  location TEXT, -- human-readable string, e.g. "Location detected via GPS" or a manual entry
  notes TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  has_gps_location BOOLEAN NOT NULL DEFAULT false,
  nearby_alerts_skipped BOOLEAN NOT NULL DEFAULT true,
  reporter_device_id TEXT, -- not currently populated by any code path (anonymous reporters have no device id today); kept for future use

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'responding' | 'resolved'
  responded_by TEXT, -- responder's email, single-claim (matches current app behavior)
  responded_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS responders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  organization TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_helpers ( -- Tier 1 "I'll Help" offers
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name_encrypted TEXT NOT NULL,
  phone_encrypted TEXT NOT NULL,
  consented BOOLEAN NOT NULL DEFAULT false,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS volunteer_locations (
  id TEXT PRIMARY KEY, -- 'device:<deviceId>' | 'responder:<responderId>', matches current app-level identity scheme
  role TEXT NOT NULL, -- 'public' | 'registered'
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  tracking_enabled BOOLEAN NOT NULL DEFAULT true,
  push_subscription JSONB
);

CREATE TABLE IF NOT EXISTS call_tokens ( -- short-lived tokens from the privacy hardening pass
  token TEXT PRIMARY KEY,
  helper_id TEXT NOT NULL REFERENCES public_helpers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false
  -- Deliberately no phone/plaintext column here: the phone is decrypted
  -- from public_helpers only at the moment /api/call/:token redeems this
  -- row, same as the in-memory version - a call token never holds a
  -- decrypted phone number at rest, even transiently.
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_public_helpers_case_id ON public_helpers(case_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_locations_role ON volunteer_locations(role);
CREATE INDEX IF NOT EXISTS idx_volunteer_locations_last_seen ON volunteer_locations(last_seen);
CREATE INDEX IF NOT EXISTS idx_call_tokens_expires ON call_tokens(expires_at);
