-- Creates the table without overwriting existing statistics.
-- Azure UpdateStats maintains the current counts.

CREATE SCHEMA IF NOT EXISTS research;

CREATE TABLE IF NOT EXISTS research.source_stats (
    university  text PRIMARY KEY,
    source      text,
    cleaned     integer NOT NULL CHECK (cleaned >= 0),
    validated   integer NOT NULL
                CHECK (validated >= 0 AND validated <= cleaned),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
