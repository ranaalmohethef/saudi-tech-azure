"""Clean and validate the KFUPM and OpenAlex raw files with the project code.

This module has no Azure dependency, so it can be tested locally. It reuses
``main.py`` and ``src/`` unchanged: the same cleaning functions, the same
validation rules and the same output files as ``python main.py``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

import main
from src.config import Paths, load_config, year_range
from src.schema import SCHEMA_COLUMNS, failures_by_rule, validate_dataset

SOURCES = ("kfupm", "openalex")

# ADF writes one file per harvested page: year2023_page0000.xml
KFUPM_PAGE = re.compile(r"year\d{4}_page\d{4}\.xml$")


def project_config(app_root: Path) -> dict:
    """Load the bundled config.yaml (the same file as the repository)."""
    return load_config(app_root)


def raw_blob_names(source: str, config: dict, all_names: list[str]) -> list[str]:
    """Pick the raw files one source needs from a list of blob names."""
    if source == "kfupm":
        return sorted(
            name for name in all_names
            if name.startswith("Raw/kfupm/") and KFUPM_PAGE.search(name)
        )

    wanted = {
        f"Raw/openalex/openalex_{entry['ror']}.json"
        for entry in config["sources"]["openalex"]["universities"]
    }
    return sorted(name for name in all_names if name in wanted)


def local_raw_path(source: str, blob_name: str, raw_dir: Path) -> Path:
    """Where a downloaded blob is placed so main.py finds it."""
    file_name = blob_name.rsplit("/", 1)[-1]
    if source == "kfupm":
        return raw_dir / "kfupm_pure" / file_name
    return raw_dir / file_name


def flatten_openalex(data: bytes) -> list[dict]:
    """Turn an ADF OpenAlex file into a flat list of works.

    The ADF copy can save either the works themselves or the whole API page
    ({"meta": ..., "results": [...]}) for every page, as an array or one object
    per line. All of these shapes become one list of works.
    """
    text = data.decode("utf-8-sig").strip()
    if not text:
        return []

    try:
        parsed = json.loads(text)
        items = parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        items = [json.loads(line) for line in text.splitlines() if line.strip()]

    works: list[dict] = []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("results"), list):
            works.extend(item["results"])
        elif isinstance(item, list):
            works.extend(item)
        elif isinstance(item, dict):
            works.append(item)
    return works


def prepare_openalex(raw_dir: Path) -> int:
    """Rewrite each downloaded OpenAlex file in the shape main.py reads."""
    total = 0
    for path in sorted(raw_dir.glob("openalex_*.json")):
        works = flatten_openalex(path.read_bytes())
        path.write_text(json.dumps(works, ensure_ascii=False), encoding="utf-8")
        total += len(works)
    return total


def run(source: str, work_root: Path, config: dict) -> tuple[dict[str, pd.DataFrame], list[dict]]:
    """Clean and validate one source.

    ``work_root/data/raw`` must already hold the raw files. Returns the output
    tables by file name and one summary row per university.
    """
    if source not in SOURCES:
        raise ValueError(f"Unknown source {source!r}. Use one of {SOURCES}.")

    paths = Paths(
        root=work_root,
        raw=work_root / "data" / "raw",
        interim=work_root / "data" / "interim",
        processed=work_root / "data" / "processed",
    ).ensure()
    min_year, max_year = year_range(config)

    cleaned = main.BUILDERS[source](config, paths, min_year, max_year)
    if cleaned.empty:
        raise ValueError(f"{source}: cleaning produced 0 rows; outputs were not replaced")

    outputs: dict[str, pd.DataFrame] = {}
    summary: list[dict] = []

    for university, group in main.split_by_university(
        cleaned, main.source_universities(config, source)
    ):
        validated, rejected = validate_dataset(group, university, min_year, max_year)
        outputs[f"{university}_validated.csv"] = validated[SCHEMA_COLUMNS]
        outputs[f"{university}_rejected.csv"] = rejected
        outputs[f"{university}_failures_by_rule.csv"] = failures_by_rule(rejected)
        summary.append(
            {
                "university": university,
                "cleaned": int(len(group)),
                "validated": int(len(validated)),
                "rejected": int(len(rejected)),
            }
        )

    if sum(row["validated"] for row in summary) == 0:
        raise ValueError(f"{source}: 0 validated rows; outputs were not replaced")

    return outputs, summary
