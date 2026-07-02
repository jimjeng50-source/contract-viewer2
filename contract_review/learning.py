"""自動學習：記錄使用者回饋，抑制確認過的誤報，並將補充關鍵字寫回規則。

學習資料放在 learning/：
- suppressions.yaml  誤報抑制清單。之後審查遇到相同簽章（規則＋正規化後
  的原文節錄）的發現會自動略過，跨檔案生效。
- feedback.jsonl     所有回饋的流水帳（誤報／確認），供統計與回溯。
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import yaml

from .findings import Finding

DEFAULT_LEARNING_DIR = Path(__file__).resolve().parent.parent / "learning"

_WS = re.compile(r"[\s　]+")


def finding_signature(rule_id: str, snippet: str) -> str:
    """規則＋正規化節錄的簽章；與檔名、位置無關，同一條文跨版本仍可比對。"""
    normalized = _WS.sub("", snippet or "")
    return hashlib.sha1(f"{rule_id}|{normalized}".encode()).hexdigest()[:16]


def _suppressions_path(learning_dir: Path) -> Path:
    return Path(learning_dir) / "suppressions.yaml"


def _feedback_path(learning_dir: Path) -> Path:
    return Path(learning_dir) / "feedback.jsonl"


def load_suppressions(learning_dir: Path = DEFAULT_LEARNING_DIR) -> list[dict]:
    path = _suppressions_path(learning_dir)
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return data.get("suppressions", []) or []


def apply_suppressions(
    findings: list[Finding], learning_dir: Path = DEFAULT_LEARNING_DIR
) -> tuple[list[Finding], int]:
    """過濾已學習為誤報的發現，回傳（保留的發現, 被抑制數）。"""
    signatures = {s["signature"] for s in load_suppressions(learning_dir)}
    if not signatures:
        return findings, 0
    kept = [
        f for f in findings
        if finding_signature(f.rule_id, f.snippet) not in signatures
    ]
    return kept, len(findings) - len(kept)


def record_feedback(
    verdict: str,
    finding: dict,
    file_name: str = "",
    note: str = "",
    learning_dir: Path = DEFAULT_LEARNING_DIR,
) -> dict:
    """記錄一筆回饋。verdict: false_positive / confirmed。

    誤報且有原文節錄時加入抑制清單；回傳 {action, detail} 說明學到了什麼。
    """
    learning_dir = Path(learning_dir)
    learning_dir.mkdir(parents=True, exist_ok=True)
    entry = {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "verdict": verdict,
        "rule_id": finding.get("rule_id", ""),
        "file": file_name,
        "location": finding.get("location", ""),
        "snippet": finding.get("snippet", ""),
        "note": note,
    }
    with _feedback_path(learning_dir).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    if verdict != "false_positive":
        return {"action": "logged", "detail": "已記錄確認回饋。"}

    snippet = finding.get("snippet", "")
    if not snippet:
        return {
            "action": "logged",
            "detail": "已記錄誤報。此為全文型規則，無法以節錄抑制；"
            "若合約中其實有該條款，請補充關鍵字讓規則學會新寫法。",
        }

    signature = finding_signature(finding.get("rule_id", ""), snippet)
    suppressions = load_suppressions(learning_dir)
    if any(s["signature"] == signature for s in suppressions):
        return {"action": "suppressed", "detail": "此誤報先前已學習過。"}
    suppressions.append(
        {
            "signature": signature,
            "rule_id": finding.get("rule_id", ""),
            "snippet": snippet,
            "created": entry["time"],
            "note": note,
        }
    )
    _suppressions_path(learning_dir).write_text(
        yaml.safe_dump({"suppressions": suppressions}, allow_unicode=True,
                       sort_keys=False, width=100),
        encoding="utf-8",
    )
    return {
        "action": "suppressed",
        "detail": "已學習此誤報：之後審查遇到相同條文將不再回報。",
    }


def extend_rule_patterns(rule_id: str, new_pattern: str, rules_dir: Path) -> str:
    """把新關鍵字（regex）追加到規則的 patterns，讓 required 規則學會新寫法。

    回傳被修改的規則檔路徑；找不到規則或 regex 無效時丟 ValueError。
    """
    try:
        re.compile(new_pattern)
    except re.error as e:
        raise ValueError(f"補充的 regex「{new_pattern}」無效：{e}")
    for path in sorted(Path(rules_dir).glob("*.y*ml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for raw in data.get("rules", []) or []:
            if raw.get("id") != rule_id:
                continue
            if raw.get("type") not in ("required", "forbidden"):
                raise ValueError(f"規則 {rule_id} 型別為 {raw.get('type')}，不支援補充關鍵字。")
            patterns = raw.setdefault("patterns", [])
            if new_pattern in patterns:
                return str(path)
            patterns.append(new_pattern)
            path.write_text(
                yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100),
                encoding="utf-8",
            )
            return str(path)
    raise ValueError(f"找不到規則「{rule_id}」。")


def learning_stats(learning_dir: Path = DEFAULT_LEARNING_DIR) -> dict:
    """回傳學習統計：抑制數、各規則的誤報／確認次數。"""
    suppressions = load_suppressions(learning_dir)
    per_rule: dict[str, dict] = {}
    feedback_path = _feedback_path(Path(learning_dir))
    total = 0
    if feedback_path.exists():
        for line in feedback_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            total += 1
            stats = per_rule.setdefault(
                entry.get("rule_id", "?"), {"false_positive": 0, "confirmed": 0}
            )
            verdict = entry.get("verdict")
            if verdict in stats:
                stats[verdict] += 1
    return {
        "suppression_count": len(suppressions),
        "feedback_count": total,
        "per_rule": per_rule,
    }
