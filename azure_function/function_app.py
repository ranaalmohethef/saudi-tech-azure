"""Azure Function: clean + validate KFUPM and OpenAlex inside Azure.

Called by Data Factory at the end of PL_Ingest_KFUPM and PL_Ingest_OpenAlex:

    POST /api/process/kfupm
    POST /api/process/openalex

It reads the raw files that Data Factory saved under Raw/, runs the project's
Python cleaning and validation, and writes

    interim/cleaned/<source>/<CODE>_validated.csv      (read by Final_Union_DF)
    interim/rejected/<source>/<CODE>_rejected.csv
    interim/rejected/<source>/<CODE>_failures_by_rule.csv

App settings:
    STORAGE_ACCOUNT_URL  https://storageacc4saudi.blob.core.windows.net
    DATA_CONTAINER       saudi-tech-research
The app's managed identity needs "Storage Blob Data Contributor" on that account.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import azure.functions as func

APP_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_ROOT))

import processing  # noqa: E402

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


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


@app.route(route="process/{source}", methods=["GET", "POST"])
def process(req: func.HttpRequest) -> func.HttpResponse:
    source = (req.route_params.get("source") or "").lower()
    if source not in processing.SOURCES:
        return _reply({"status": "error", "message": f"Unknown source: {source}"}, 400)

    started = time.time()
    try:
        config = processing.project_config(APP_ROOT)
        container = _container()

        prefix = "Raw/kfupm/" if source == "kfupm" else "Raw/openalex/"
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
