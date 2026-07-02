"""規則引擎：載入 rules/*.yaml 並對文件段落執行檢查。

規則型別：
- required     patterns 中任一 regex 全文都找不到 → 回報（漏條款）
- forbidden    patterns 中任一 regex 出現 → 回報（禁用字詞、常見錯字）
- consistency  groups 中超過一組用語同時出現 → 回報（稱謂／用語混用）
- builtin      呼叫 checks.py 中的程式化檢查（check: 名稱）
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .checks import BUILTIN_CHECKS
from .extract import Segment
from .findings import Finding

VALID_TYPES = {"required", "forbidden", "consistency", "builtin"}
VALID_SEVERITIES = {"error", "warning", "info"}


@dataclass
class Rule:
    id: str
    type: str
    message: str = ""
    severity: str = "warning"
    name: str = ""
    patterns: list[str] = field(default_factory=list)
    groups: list[list[str]] = field(default_factory=list)
    check: str = ""
    source: str = ""  # 來源 yaml 檔，供 list-rules 顯示


def load_rules_for(doc_type: str, rules_dir: str | Path) -> list[Rule]:
    """載入 common 與指定文件類型的所有規則檔。"""
    rules_dir = Path(rules_dir)
    rules: list[Rule] = []
    for path in sorted(rules_dir.glob("*.yaml")) + sorted(rules_dir.glob("*.yml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        file_doc_type = data.get("doc_type", "common")
        if file_doc_type not in ("common", doc_type):
            continue
        for raw in data.get("rules", []) or []:
            rules.append(_parse_rule(raw, path))
    seen = {}
    for rule in rules:
        if rule.id in seen:
            raise ValueError(
                f"規則 id 重複：「{rule.id}」同時出現在 {seen[rule.id]} 與 {rule.source}"
            )
        seen[rule.id] = rule.source
    return rules


def _parse_rule(raw: dict, path: Path) -> Rule:
    rule_id = raw.get("id")
    rule_type = raw.get("type")
    if not rule_id:
        raise ValueError(f"{path}: 規則缺少 id 欄位：{raw}")
    if rule_type not in VALID_TYPES:
        raise ValueError(
            f"{path}: 規則 {rule_id} 的 type「{rule_type}」無效，"
            f"必須是 {sorted(VALID_TYPES)} 之一"
        )
    severity = raw.get("severity", "warning")
    if severity not in VALID_SEVERITIES:
        raise ValueError(
            f"{path}: 規則 {rule_id} 的 severity「{severity}」無效，"
            f"必須是 {sorted(VALID_SEVERITIES)} 之一"
        )
    rule = Rule(
        id=rule_id,
        type=rule_type,
        message=raw.get("message", ""),
        severity=severity,
        name=raw.get("name", ""),
        patterns=list(raw.get("patterns", []) or []),
        groups=[list(g) for g in (raw.get("groups", []) or [])],
        check=raw.get("check", ""),
        source=str(path),
    )
    if rule.type in ("required", "forbidden") and not rule.patterns:
        raise ValueError(f"{path}: {rule.type} 規則 {rule_id} 缺少 patterns")
    if rule.type == "consistency" and len(rule.groups) < 2:
        raise ValueError(f"{path}: consistency 規則 {rule_id} 的 groups 至少需要兩組")
    if rule.type == "builtin" and rule.check not in BUILTIN_CHECKS:
        raise ValueError(
            f"{path}: builtin 規則 {rule_id} 的 check「{rule.check}」不存在，"
            f"可用：{sorted(BUILTIN_CHECKS)}"
        )
    for pattern in rule.patterns + [t for g in rule.groups for t in g]:
        try:
            re.compile(pattern)
        except re.error as e:
            raise ValueError(f"{path}: 規則 {rule_id} 的 regex「{pattern}」無效：{e}")
    return rule


def append_rule(rules_dir: str | Path, file_name: str, doc_type: str, raw: dict) -> Path:
    """驗證並把一條新規則寫入規則檔（CLI add-rule 與網頁 API 共用）。

    回傳寫入的檔案路徑；驗證失敗、doc_type 不符或 id 重複時丟 ValueError。
    """
    rules_dir = Path(rules_dir)
    rules_file = rules_dir / file_name
    if rules_file.exists():
        data = yaml.safe_load(rules_file.read_text(encoding="utf-8")) or {}
    else:
        data = {"doc_type": doc_type, "rules": []}
    if data.get("doc_type", "common") != doc_type:
        raise ValueError(
            f"{rules_file} 的 doc_type 是「{data.get('doc_type')}」，"
            f"與指定的「{doc_type}」不符。請改用對應的規則檔。"
        )
    data.setdefault("rules", [])

    _parse_rule(raw, rules_file)
    all_ids = set()
    for path in sorted(rules_dir.glob("*.y*ml")):
        loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        all_ids.update(r.get("id") for r in loaded.get("rules", []) or [])
    if raw["id"] in all_ids:
        raise ValueError(
            f"規則 id「{raw['id']}」已存在，請換一個 id 或直接編輯既有規則。"
        )

    data["rules"].append(raw)
    rules_dir.mkdir(parents=True, exist_ok=True)
    rules_file.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    return rules_file


def run_rules(rules: list[Rule], segments: list[Segment]) -> list[Finding]:
    findings: list[Finding] = []
    full_text = "\n".join(seg.text for seg in segments)
    for rule in rules:
        if rule.type == "required":
            findings += _run_required(rule, full_text)
        elif rule.type == "forbidden":
            findings += _run_forbidden(rule, segments)
        elif rule.type == "consistency":
            findings += _run_consistency(rule, segments)
        elif rule.type == "builtin":
            findings += BUILTIN_CHECKS[rule.check](segments, rule)
    findings.sort(key=lambda f: f.sort_key())
    return findings


def _run_required(rule: Rule, full_text: str) -> list[Finding]:
    if any(re.search(p, full_text) for p in rule.patterns):
        return []
    message = rule.message or (
        f"全文未發現「{rule.name or '／'.join(rule.patterns)}」相關條款，請確認是否遺漏。"
    )
    return [Finding(rule_id=rule.id, severity=rule.severity, message=message, location="全文")]


def _run_forbidden(rule: Rule, segments: list[Segment]) -> list[Finding]:
    findings = []
    for seg in segments:
        for pattern in rule.patterns:
            m = re.search(pattern, seg.text)
            if m:
                message = rule.message or f"出現不建議用語「{m.group(0)}」。"
                findings.append(
                    Finding(
                        rule_id=rule.id,
                        severity=rule.severity,
                        message=message,
                        location=seg.location,
                        snippet=seg.text[:60],
                    )
                )
                break  # 同段落同規則只報一次
    return findings


def _run_consistency(rule: Rule, segments: list[Segment]) -> list[Finding]:
    # 排除含「簡稱」的定義段落：如「定作人：Ｘ公司（以下簡稱甲方）」為
    # 標準寫法，定義處同時出現兩組稱謂不算混用。
    body_text = "\n".join(seg.text for seg in segments if "簡稱" not in seg.text)
    present = []
    for group in rule.groups:
        if any(re.search(t, body_text) for t in group):
            present.append("／".join(group))
    if len(present) <= 1:
        return []
    message = rule.message or f"用語混用：{'、'.join(present)} 同時出現，請統一。"
    return [Finding(rule_id=rule.id, severity=rule.severity, message=message, location="全文")]
