"""審查紀錄：每份審查過的合約記一筆 log（時間、檔名、結果統計、商務摘要）。

紀錄存於 learning/review_log.jsonl（與學習資料同目錄，CLI 與網頁共用）。
單機版另存瀏覽器 localStorage，邏輯對應 templates/standalone.html。
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from .learning import DEFAULT_LEARNING_DIR

_LOG_NAME = "review_log.jsonl"
_SUMMARY_VALUES_PER_FIELD = 3


def _log_path(learning_dir: Path) -> Path:
    return Path(learning_dir) / _LOG_NAME


def record_review(result, learning_dir: Path = DEFAULT_LEARNING_DIR) -> dict:
    """把一次審查結果寫入紀錄檔，回傳寫入的紀錄。result: engine.ReviewResult。"""
    counts = {"error": 0, "warning": 0, "info": 0}
    for f in result.findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1
    summary = {}
    for fld in result.summary:
        if fld.values:
            summary[fld.label] = [v.text for v in fld.values[:_SUMMARY_VALUES_PER_FIELD]]
    entry = {
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "file": result.file_name,
        "doc_type": result.doc_type,
        "doc_type_label": result.doc_type_label,
        "counts": counts,
        "suppressed": result.suppressed_count,
        "summary": summary,
    }
    learning_dir = Path(learning_dir)
    learning_dir.mkdir(parents=True, exist_ok=True)
    with _log_path(learning_dir).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def query_log(
    learning_dir: Path = DEFAULT_LEARNING_DIR,
    keyword: str = "",
    date_from: str = "",
    date_to: str = "",
    limit: int = 100,
) -> list[dict]:
    """查詢審查紀錄，新到舊。keyword 比對檔名與摘要內容；日期格式 YYYY-MM-DD。"""
    path = _log_path(Path(learning_dir))
    if not path.exists():
        return []
    entries: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    entries.reverse()  # 新到舊

    def match(entry: dict) -> bool:
        day = entry.get("time", "")[:10]
        if date_from and day < date_from:
            return False
        if date_to and day > date_to:
            return False
        if keyword:
            haystack = entry.get("file", "") + entry.get("doc_type_label", "") + json.dumps(
                entry.get("summary", {}), ensure_ascii=False
            )
            if keyword not in haystack:
                return False
        return True

    return [e for e in entries if match(e)][:limit]
