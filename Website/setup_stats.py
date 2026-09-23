"""
Creates research.source_stats in PostgreSQL and fills it with the pipeline numbers.
The website reads this table to show Cleaned / Validated counts.
Safe to run more than once: it updates rows instead of duplicating them.

Run (first time, uses the numbers written in sql/source_stats.sql):
    python setup_stats.py

Run after each Python pipeline run (reads the numbers main.py wrote):
    python setup_stats.py path/to/data/processed/run_summary.json
"""
import json
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

UPSERT = """
INSERT INTO research.source_stats (university, cleaned, validated)
VALUES (%s, %s, %s)
ON CONFLICT (university) DO UPDATE
SET cleaned = EXCLUDED.cleaned, validated = EXCLUDED.validated, updated_at = now();
"""

conn = psycopg2.connect(
    host=os.environ["PGHOST"],
    port=os.environ.get("PGPORT", "5432"),
    dbname=os.environ.get("PGDATABASE", "research_hub"),
    user=os.environ["PGUSER"],
    password=os.environ["PGPASSWORD"],
    sslmode="require",
    connect_timeout=10,
)

with conn, conn.cursor() as cur:
    # 1. create the table and put in the starting numbers
    cur.execute(Path(__file__).with_name("sql").joinpath("source_stats.sql").read_text(encoding="utf-8"))

    # 2. if a run_summary.json was given, overwrite with its numbers
    if len(sys.argv) > 1:
        summary = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        for s in summary["sources"]:
            cur.execute(UPSERT, (s["source"], s["cleaned"], s["validated"]))
        print(f"Updated from {sys.argv[1]}")

    cur.execute("SELECT university, cleaned, validated FROM research.source_stats ORDER BY university")
    rows = cur.fetchall()
conn.close()

print("research.source_stats:")
for uni, cleaned, validated in rows:
    print(f"  {uni:<8} cleaned {cleaned:>7,}   validated {validated:>7,}")
print(f"  {'Total':<8} {'':>15}   validated {sum(r[2] for r in rows):>7,}")
