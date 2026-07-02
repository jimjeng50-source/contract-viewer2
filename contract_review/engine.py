"""審查引擎：CLI 與網頁介面共用的審查流程（抽取 → 規則 → 學習過濾）。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .extract import extract_segments
from .findings import Finding
from .learning import DEFAULT_LEARNING_DIR, apply_suppressions
from .rules import load_rules_for, run_rules
from .summary import SummaryField, extract_summary

DEFAULT_RULES_DIR = Path(__file__).resolve().parent.parent / "rules"

DOC_TYPES = {
    "purchase_order": "訂購單合約",
    "subcontract": "發包承攬契約",
    "common": "一般契約（僅套用共用規則）",
}

# 依關鍵字自動判斷文件類型；承攬優先於訂購（承攬契約中也常出現「訂購」字樣）
_DETECT_PATTERNS = [
    ("subcontract", r"承攬|發包|工程契約"),
    ("purchase_order", r"訂購單|訂購契約|採購"),
]


def detect_doc_type(full_text: str) -> str:
    for doc_type, pattern in _DETECT_PATTERNS:
        if re.search(pattern, full_text):
            return doc_type
    return "common"


@dataclass
class ReviewResult:
    file_name: str
    doc_type: str
    doc_type_label: str
    findings: list[Finding]
    suppressed_count: int  # 因學習到的誤報而被略過的發現數
    summary: list[SummaryField]  # 商務摘要（幣別金額、日期、LD、Incoterms…）


def review_file(
    path: str | Path,
    doc_type: str = "auto",
    rules_dir: str | Path = DEFAULT_RULES_DIR,
    learning_dir: str | Path = DEFAULT_LEARNING_DIR,
) -> ReviewResult:
    path = Path(path)
    segments = extract_segments(path)
    if doc_type == "auto":
        full_text = "\n".join(seg.text for seg in segments)
        doc_type = detect_doc_type(full_text)
    rules = load_rules_for(doc_type, rules_dir)
    findings = run_rules(rules, segments)
    findings, suppressed = apply_suppressions(findings, Path(learning_dir))
    return ReviewResult(
        file_name=path.name,
        doc_type=doc_type,
        doc_type_label=DOC_TYPES.get(doc_type, doc_type),
        findings=findings,
        suppressed_count=suppressed,
        summary=extract_summary(segments),
    )
