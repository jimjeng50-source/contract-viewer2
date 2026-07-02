"""命令列介面：check（審查）、add-rule（新增規則）、list-rules（列出規則）、serve（網頁）。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .engine import DEFAULT_RULES_DIR, DOC_TYPES, review_file
from .learning import DEFAULT_LEARNING_DIR
from .report import has_errors, render_console, render_markdown
from .rules import VALID_SEVERITIES, append_rule, load_rules_for


def cmd_check(args) -> int:
    results = []
    exit_code = 0
    for file_arg in args.files:
        path = Path(file_arg)
        try:
            result = review_file(
                path, doc_type=args.type, rules_dir=args.rules,
                learning_dir=args.learning,
            )
        except Exception as e:  # noqa: BLE001
            print(f"◆ {path.name}：無法審查 — {e}", file=sys.stderr)
            exit_code = 2
            continue
        print(render_console(result.file_name, result.doc_type_label, result.findings))
        if result.suppressed_count:
            print(f"  （另有 {result.suppressed_count} 項已學習的誤報被自動略過）")
        results.append((result.file_name, result.doc_type_label, result.findings))
        if has_errors(result.findings):
            exit_code = max(exit_code, 1)
    if args.output and results:
        report = render_markdown(results)
        Path(args.output).write_text(report, encoding="utf-8")
        print(f"\n報告已寫入：{args.output}")
    return exit_code


def cmd_add_rule(args) -> int:
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
    try:
        rules_file = append_rule(args.rules, args.file, args.doc_type, raw)
    except ValueError as e:
        print(f"錯誤：{e}", file=sys.stderr)
        return 2
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


def cmd_serve(args) -> int:
    from .webapp import create_app

    app = create_app(rules_dir=args.rules, learning_dir=args.learning)
    print(f"合約審查網頁啟動：http://{args.host}:{args.port}/（Ctrl+C 停止）")
    app.run(host=args.host, port=args.port, debug=False)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="review",
        description="合約自動審查工具：勘誤 Word/PDF 訂購單合約與發包承攬契約。",
    )
    parser.add_argument(
        "--rules", default=str(DEFAULT_RULES_DIR), help="規則目錄（預設：repo 內 rules/）"
    )
    parser.add_argument(
        "--learning", default=str(DEFAULT_LEARNING_DIR),
        help="學習資料目錄（預設：repo 內 learning/）",
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

    p_serve = sub.add_parser("serve", help="啟動互動審查網頁")
    p_serve.add_argument("--host", default="127.0.0.1", help="繫結位址（預設 127.0.0.1）")
    p_serve.add_argument("--port", type=int, default=8000, help="埠號（預設 8000）")
    p_serve.set_defaults(func=cmd_serve)
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)
