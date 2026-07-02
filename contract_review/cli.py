"""命令列介面：check（審查）、add-rule（新增規則）、list-rules（列出規則）。"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

from .extract import extract_segments
from .report import has_errors, render_console, render_markdown
from .rules import VALID_SEVERITIES, load_rules_for, run_rules, _parse_rule

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


def cmd_check(args) -> int:
    rules_dir = Path(args.rules)
    results = []
    exit_code = 0
    for file_arg in args.files:
        path = Path(file_arg)
        try:
            segments = extract_segments(path)
        except Exception as e:  # noqa: BLE001
            print(f"◆ {path.name}：無法審查 — {e}", file=sys.stderr)
            exit_code = 2
            continue
        full_text = "\n".join(seg.text for seg in segments)
        doc_type = args.type if args.type != "auto" else detect_doc_type(full_text)
        rules = load_rules_for(doc_type, rules_dir)
        findings = run_rules(rules, segments)
        label = DOC_TYPES.get(doc_type, doc_type)
        print(render_console(path.name, label, findings))
        results.append((path.name, label, findings))
        if has_errors(findings):
            exit_code = max(exit_code, 1)
    if args.output and results:
        report = render_markdown(results)
        Path(args.output).write_text(report, encoding="utf-8")
        print(f"\n報告已寫入：{args.output}")
    return exit_code


def cmd_add_rule(args) -> int:
    rules_file = Path(args.rules) / args.file
    if rules_file.exists():
        data = yaml.safe_load(rules_file.read_text(encoding="utf-8")) or {}
    else:
        data = {"doc_type": args.doc_type, "rules": []}
    if data.get("doc_type", "common") != args.doc_type:
        print(
            f"錯誤：{rules_file} 的 doc_type 是「{data.get('doc_type')}」，"
            f"與 --doc-type「{args.doc_type}」不符。請改用對應的規則檔。",
            file=sys.stderr,
        )
        return 2
    data.setdefault("rules", [])

    raw = {
        "id": args.id,
        "type": args.rule_type,
        "severity": args.severity,
    }
    if args.name:
        raw["name"] = args.name
    if args.message:
        raw["message"] = args.message
    if args.pattern:
        raw["patterns"] = args.pattern
    if args.group:
        raw["groups"] = [g.split("|") for g in args.group]
    if args.check:
        raw["check"] = args.check

    # 先驗證新規則本身，再掃描所有規則檔確認 id 不撞名（含跨文件類型）
    _parse_rule(raw, rules_file)
    all_ids = set()
    for path in sorted(Path(args.rules).glob("*.y*ml")):
        loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        all_ids.update(r.get("id") for r in loaded.get("rules", []) or [])
    if args.id in all_ids:
        print(f"錯誤：規則 id「{args.id}」已存在，請換一個 id 或直接編輯既有規則。",
              file=sys.stderr)
        return 2

    data["rules"].append(raw)
    rules_file.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    print(f"已新增規則「{args.id}」到 {rules_file}")
    return 0


def cmd_list_rules(args) -> int:
    rules_dir = Path(args.rules)
    for doc_type, label in DOC_TYPES.items():
        if doc_type == "common":
            continue
        rules = load_rules_for(doc_type, rules_dir)
        print(f"\n== {label}（{doc_type}，含共用規則，共 {len(rules)} 條） ==")
        for r in rules:
            source = Path(r.source).name
            print(f"  {r.id:<28} [{r.severity:<7}] {r.type:<11} {r.name or r.message[:30]}"
                  f"  ({source})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="review",
        description="合約自動審查工具：勘誤 Word/PDF 訂購單合約與發包承攬契約。",
    )
    parser.add_argument(
        "--rules", default=str(DEFAULT_RULES_DIR), help="規則目錄（預設：repo 內 rules/）"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_check = sub.add_parser("check", help="審查一或多份合約檔案")
    p_check.add_argument("files", nargs="+", help="要審查的 .docx / .pdf 檔案")
    p_check.add_argument(
        "--type", default="auto", choices=["auto", *DOC_TYPES],
        help="文件類型（預設 auto 依內文關鍵字判斷）",
    )
    p_check.add_argument("-o", "--output", help="將 Markdown 報告寫入此檔案")
    p_check.set_defaults(func=cmd_check)

    p_add = sub.add_parser("add-rule", help="新增一條審查規則到規則檔")
    p_add.add_argument("--id", required=True, help="規則唯一識別碼，例如 po-warranty")
    p_add.add_argument(
        "--rule-type", required=True, choices=["required", "forbidden", "consistency"],
        help="規則型別",
    )
    p_add.add_argument(
        "--doc-type", default="common", choices=list(DOC_TYPES),
        help="適用文件類型（common＝所有文件）",
    )
    p_add.add_argument(
        "--file", default="custom.yaml",
        help="寫入哪個規則檔（預設 custom.yaml，不存在會自動建立）",
    )
    p_add.add_argument("--name", default="", help="規則名稱（報告可讀性用）")
    p_add.add_argument("--message", default="", help="命中時顯示的說明")
    p_add.add_argument(
        "--pattern", action="append", default=[],
        help="regex，required/forbidden 用；可重複指定多個",
    )
    p_add.add_argument(
        "--group", action="append", default=[],
        help="consistency 用語組，組內用 | 分隔，例如 --group '甲方|乙方' --group '買方|賣方'",
    )
    p_add.add_argument("--check", default="", help="builtin 檢查名稱（一般不需要）")
    p_add.add_argument(
        "--severity", default="warning", choices=sorted(VALID_SEVERITIES), help="嚴重度"
    )
    p_add.set_defaults(func=cmd_add_rule)

    p_list = sub.add_parser("list-rules", help="列出目前所有規則")
    p_list.set_defaults(func=cmd_list_rules)
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)
