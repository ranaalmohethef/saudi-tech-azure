"""Azure Functions: clean + validate KFUPM and OpenAlex inside Azure.

Five separate functions, each with its own logs and monitoring:

    process_kfupm      POST /api/process/kfupm      called by PL_Ingest_KFUPM
    process_openalex   POST /api/process/openalex   called by PL_Ingest_OpenAlex
    quality_check      POST /api/quality_check      called by PL_Master after RunFinal
    update_stats       POST /api/update_stats       called by PL_Master after QualityCheck
    health             GET  /api/health             checks access to the storage account

The URLs are the same as before, so the Data Factory activities need no change.

Each process function reads the raw files that Data Factory saved under Raw/,
runs the project's Python cleaning and validation, and writes

    interim/cleaned/<source>/<CODE>_validated.csv      (read by Final_Union_DF)
    interim/rejected/<source>/<CODE>_rejected.csv
    interim/rejected/<source>/<CODE>_failures_by_rule.csv

App settings:
    STORAGE_ACCOUNT_URL  https://storageacc4saudi.blob.core.windows.net
    DATA_CONTAINER       saudi-tech-research
    PGHOST               saudi-tech-pg.postgres.database.azure.com   (quality_check, update_stats)
    PGDATABASE           research_hub
    PGUSER               sqladminuse
    PGPASSWORD           the database password
The app's managed identity needs "Storage Blob Data Contributor" on that account.
requirements.txt needs: psycopg2-binary, pyarrow (for counting the KSU Parquet rows).
"""

from __future__ import annotations

import io
import json
import logging
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

import azure.functions as func

APP_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_ROOT))

import processing  # noqa: E402

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

RAW_PREFIX = {"kfupm": "Raw/kfupm/", "openalex": "Raw/openalex/"}


# ---------------------------------------------------------------- helpers

def _container():
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import BlobServiceClient

    service = BlobServiceClient(
        account_url=os.environ["STORAGE_ACCOUNT_URL"],
        credential=DefaultAzureCredential(),
    )
    return service.get_container_client(os.environ.get("DATA_CONTAINER", "saudi-tech-research"))


def _download(container, source: str, names: list[str], raw_dir: Path) -> None:
    def fetch(name: str) -> None:
        target = processing.local_raw_path(source, name, raw_dir)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(container.download_blob(name).readall())

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(fetch, names))


def _upload(container, source: str, outputs: dict) -> list[str]:
    written = []
    for file_name, frame in outputs.items():
        folder = "cleaned" if file_name.endswith("_validated.csv") else "rejected"
        blob_name = f"interim/{folder}/{source}/{file_name}"
        data = frame.to_csv(index=False).encode("utf-8")
        container.upload_blob(blob_name, data, overwrite=True)
        written.append(blob_name)
    return written


def _reply(body: dict, status: int) -> func.HttpResponse:
    return func.HttpResponse(json.dumps(body), status_code=status, mimetype="application/json")


def _run_source(source: str) -> func.HttpResponse:
    """Shared steps for one source: list raw files -> download -> clean + validate -> upload."""
    started = time.time()
    try:
        config = processing.project_config(APP_ROOT)
        container = _container()

        prefix = RAW_PREFIX[source]
        all_names = [blob.name for blob in container.list_blobs(name_starts_with=prefix)]
        names = processing.raw_blob_names(source, config, all_names)
        if not names:
            return _reply({"status": "error", "message": f"No raw files under {prefix}"}, 500)
        if source == "openalex":
            expected = len(config["sources"]["openalex"]["universities"])
            if len(names) != expected:
                return _reply(
                    {"status": "error", "message": f"Expected {expected} OpenAlex files, found {names}"},
                    500,
                )

        with tempfile.TemporaryDirectory() as tmp:
            work_root = Path(tmp)
            raw_dir = work_root / "data" / "raw"
            _download(container, source, names, raw_dir)
            if source == "openalex":
                processing.prepare_openalex(raw_dir)

            outputs, summary = processing.run(source, work_root, config)

        written = _upload(container, source, outputs)

        body = {
            "status": "ok",
            "source": source,
            "raw_files": len(names),
            "universities": summary,
            "validated_total": sum(row["validated"] for row in summary),
            "files_written": written,
            "seconds": round(time.time() - started, 1),
        }
        logging.info("processed %s", body)
        return _reply(body, 200)

    except Exception as error:  # returned to Data Factory so the activity fails clearly
        logging.exception("processing %s failed", source)
        return _reply({"status": "error", "source": source, "message": str(error)}, 500)


# ---------------------------------------------------------------- functions

@app.function_name(name="process_kfupm")
@app.route(route="process/kfupm", methods=["GET", "POST"])
def process_kfupm(req: func.HttpRequest) -> func.HttpResponse:
    """KFUPM Pure: parse the harvested MODS XML pages, clean and validate."""
    return _run_source("kfupm")


@app.function_name(name="process_openalex")
@app.route(route="process/openalex", methods=["GET", "POST"])
def process_openalex(req: func.HttpRequest) -> func.HttpResponse:
    """OpenAlex (KAU, KKU, PSAU): rebuild abstracts, clean and validate."""
    return _run_source("openalex")


# ---------------------------------------------------------------- PostgreSQL helpers

@contextmanager
def _pg():
    """Opens a connection, commits on success, and always closes it."""
    import psycopg2

    conn = psycopg2.connect(
        host=os.environ["PGHOST"],
        port=os.environ.get("PGPORT", "5432"),
        dbname=os.environ.get("PGDATABASE", "research_hub"),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        sslmode="require",
        connect_timeout=15,
    )
    try:
        with conn:          # commit, or roll back on error
            yield conn
    finally:
        conn.close()


def _scalar(cur, sql, params=None):
    cur.execute(sql, params) if params else cur.execute(sql)
    return cur.fetchone()[0]


# ---------------------------------------------------------------- quality_check

UNIVERSITIES = [u.strip() for u in os.environ.get("QC_UNIVERSITIES", "KAUST,KFUPM,KSU,KAU,KKU,PSAU").split(",") if u.strip()]
YEAR_MIN, YEAR_MAX = 2023, 2026
MAX_DROP = float(os.environ.get("QC_MAX_DROP", "0.2"))   # fail if the table shrinks by more than 20%

QC_HISTORY_DDL = """
CREATE TABLE IF NOT EXISTS research.quality_checks (
    id          serial      PRIMARY KEY,
    checked_at  timestamptz NOT NULL DEFAULT now(),
    total_rows  integer     NOT NULL,
    passed      boolean     NOT NULL,
    details     jsonb       NOT NULL
)"""

QC_COUNTS = {
    # name: (SQL that returns a number which must be 0, meaning)
    "duplicate_research_id": (
        "SELECT COUNT(*) - COUNT(DISTINCT research_id) FROM research.final_dataset",
        "research_id must be unique"),
    "missing_required": (
        "SELECT COUNT(*) FROM research.final_dataset "
        "WHERE coalesce(trim(research_id), '') = '' OR coalesce(trim(title), '') = '' "
        "OR coalesce(trim(authors), '') = '' OR coalesce(trim(doi), '') = '' "
        "OR coalesce(trim(url), '') = '' OR coalesce(trim(source), '') = '' OR publication_year IS NULL",
        "required fields must be filled"),
    "uppercase_doi": (
        "SELECT COUNT(*) FROM research.final_dataset WHERE doi <> lower(doi)",
        "DOIs must be lowercase"),
    "bad_doi_format": (
        r"SELECT COUNT(*) FROM research.final_dataset WHERE doi !~ '^10\.\d{4,9}/\S+$'",
        "DOIs must look like 10.xxxx/..."),
    "year_out_of_range": (
        f"SELECT COUNT(*) FROM research.final_dataset WHERE publication_year NOT BETWEEN {YEAR_MIN} AND {YEAR_MAX}",
        f"years must be {YEAR_MIN}-{YEAR_MAX}"),
    "bad_url": (
        "SELECT COUNT(*) FROM research.final_dataset WHERE url !~* '^https?://[^/]+'",
        "URLs must start with http(s)://"),
}


@app.function_name(name="quality_check")
@app.route(route="quality_check", methods=["GET", "POST"])
def quality_check(req: func.HttpRequest) -> func.HttpResponse:
    """Checks research.final_dataset after RunFinal. Returns 500 (so the pipeline fails) if any check fails."""
    try:
        with _pg() as conn, conn.cursor() as cur:
            cur.execute(QC_HISTORY_DDL)

            cur.execute("SELECT university, COUNT(*) FROM research.final_dataset GROUP BY university ORDER BY university")
            per_university = {u: n for u, n in cur.fetchall()}
            total = sum(per_university.values())

            checks = []
            missing = [u for u in UNIVERSITIES if per_university.get(u, 0) == 0]
            checks.append({"check": "every_university_has_rows", "passed": not missing,
                           "detail": f"no rows for: {', '.join(missing)}" if missing else "all universities present"})

            for name, (sql, meaning) in QC_COUNTS.items():
                bad = _scalar(cur, sql)
                checks.append({"check": name, "passed": bad == 0, "detail": f"{bad} rows break the rule: {meaning}"})

            previous = None
            cur.execute("SELECT total_rows FROM research.quality_checks WHERE passed ORDER BY checked_at DESC LIMIT 1")
            row = cur.fetchone()
            if row:
                previous = row[0]
            dropped = previous is not None and total < previous * (1 - MAX_DROP)
            checks.append({"check": "no_sudden_drop", "passed": not dropped,
                           "detail": f"{total} rows now, {previous} at the last passed check" if previous else f"{total} rows (first check)"})

            passed = all(c["passed"] for c in checks)
            body = {"status": "ok" if passed else "failed", "total_rows": total,
                    "per_university": per_university, "checks": checks,
                    "failed_checks": [c["check"] for c in checks if not c["passed"]]}

            cur.execute("INSERT INTO research.quality_checks (total_rows, passed, details) VALUES (%s, %s, %s)",
                        (total, passed, json.dumps(body)))

        logging.info("quality_check %s", body)
        return _reply(body, 200 if passed else 500)

    except Exception as error:
        logging.exception("quality_check failed to run")
        return _reply({"status": "error", "message": str(error)}, 500)


# ---------------------------------------------------------------- update_stats

STATS_DDL = """
CREATE TABLE IF NOT EXISTS research.source_stats (
    university  text        PRIMARY KEY,
    source      text,
    cleaned     integer     NOT NULL CHECK (cleaned >= 0),
    validated   integer     NOT NULL CHECK (validated >= 0 AND validated <= cleaned),
    updated_at  timestamptz NOT NULL DEFAULT now()
)"""

# cleaned = NULL means "not known in this run": the stored value is kept.
STATS_UPSERT = """
INSERT INTO research.source_stats AS s (university, source, cleaned, validated)
VALUES (%(u)s, %(src)s, COALESCE(%(c)s, %(v)s), %(v)s)
ON CONFLICT (university) DO UPDATE
SET validated  = EXCLUDED.validated,
    cleaned    = GREATEST(COALESCE(%(c)s, s.cleaned), EXCLUDED.validated),
    source     = COALESCE(EXCLUDED.source, s.source),
    updated_at = now()"""


def _csv_rows(container, blob_name: str) -> int:
    import pandas as pd

    data = container.download_blob(blob_name).readall()
    return len(pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False))


def _function_source_counts(container) -> dict:
    """KFUPM and OpenAlex: validated + rejected CSVs written by process_kfupm / process_openalex."""
    counts = {}
    for source in RAW_PREFIX:
        label = "KFUPM Pure (OAI-PMH)" if source == "kfupm" else "OpenAlex"
        for blob in container.list_blobs(name_starts_with=f"interim/cleaned/{source}/"):
            if not blob.name.endswith("_validated.csv"):
                continue
            code = blob.name.rsplit("/", 1)[-1].replace("_validated.csv", "")
            validated = _csv_rows(container, blob.name)
            rejected_blob = f"interim/rejected/{source}/{code}_rejected.csv"
            try:
                rejected = _csv_rows(container, rejected_blob)
            except Exception:
                rejected = 0
            counts[code] = {"source": label, "cleaned": validated + rejected, "validated": validated}
    return counts


def _ksu_count(container) -> dict:
    """KSU: rows in the Parquet files written by KSU_Clean_DF (validated rows only)."""
    import pyarrow.parquet as pq

    total = 0
    for blob in container.list_blobs(name_starts_with="interim/cleaned/ksu/"):
        if blob.name.endswith(".parquet"):
            data = container.download_blob(blob.name).readall()
            total += pq.ParquetFile(io.BytesIO(data)).metadata.num_rows
    return {"KSU": {"source": "KSU open data", "cleaned": None, "validated": total}} if total else {}


@app.function_name(name="update_stats")
@app.route(route="update_stats", methods=["GET", "POST"])
def update_stats(req: func.HttpRequest) -> func.HttpResponse:
    """Writes validated (and, when known, cleaned) counts per university into research.source_stats."""
    started = time.time()
    notes = []
    try:
        container = _container()
        counts = _function_source_counts(container)

        try:
            counts.update(_ksu_count(container))
        except Exception as error:
            notes.append(f"KSU skipped: {error}")

        with _pg() as conn, conn.cursor() as cur:
            cur.execute(STATS_DDL)

            # KAUST (repository 2023 + Crossref): validated rows already merged into research.publications
            cur.execute("SELECT university, COUNT(*) FROM research.publications GROUP BY university")
            for university, n in cur.fetchall():
                counts.setdefault(university, {"source": "KAUST Repository 2023 + Crossref", "cleaned": None, "validated": n})

            for university, row in sorted(counts.items()):
                cur.execute(STATS_UPSERT, {"u": university, "src": row["source"], "c": row["cleaned"], "v": row["validated"]})

            cur.execute("SELECT university, cleaned, validated FROM research.source_stats ORDER BY university")
            table = [{"university": u, "cleaned": c, "validated": v} for u, c, v in cur.fetchall()]

        body = {"status": "ok", "updated": sorted(counts), "source_stats": table,
                "validated_total": sum(r["validated"] for r in table), "notes": notes,
                "seconds": round(time.time() - started, 1)}
        logging.info("update_stats %s", body)
        return _reply(body, 200)

    except Exception as error:
        logging.exception("update_stats failed")
        return _reply({"status": "error", "message": str(error), "notes": notes}, 500)


@app.function_name(name="health")
@app.route(route="health", methods=["GET"])
def health(req: func.HttpRequest) -> func.HttpResponse:
    """Checks that the app can reach the storage account and counts the raw files."""
    try:
        container = _container()
        counts = {
            source: sum(1 for _ in container.list_blobs(name_starts_with=prefix))
            for source, prefix in RAW_PREFIX.items()
        }
        return _reply({"status": "ok", "storage": "connected", "raw_files": counts}, 200)
    except Exception as error:
        logging.exception("health check failed")
        return _reply({"status": "error", "storage": "not connected", "message": str(error)}, 500)
