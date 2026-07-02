"""將審查結果輸出為主控台摘要與 Markdown 報告。"""

from __future__ import annotations

from datetime import date

from .findings import SEVERITY_LABEL, SEVERITY_ORDER, Finding


def summary_line(findings: list[Finding]) -> str:
    counts = {"error": 0, "warning": 0, "info": 0}
    for f in findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1
    return (
        f"錯誤 {counts['error']}、警告 {counts['warning']}、提示 {counts['info']}"
    )


def render_console(file_name: str, doc_type_label: str, findings: list[Finding]) -> str:
    lines = [f"◆ {file_name}（{doc_type_label}）：{summary_line(findings)}"]
    for f in findings:
        location = f"［{f.location}］" if f.location else ""
        lines.append(f"  [{SEVERITY_LABEL[f.severity]}] {f.rule_id} {location} {f.message}")
    if not findings:
        lines.append("  未發現問題。")
    return "\n".join(lines)


def render_markdown(results: list[tuple[str, str, list[Finding]]]) -> str:
    """results: (檔名, 文件類型標籤, findings) 的列表。"""
    lines = [
        "# 合約審查報告",
        "",
        f"- 審查日期：{date.today().isoformat()}",
        f"- 審查檔案：{len(results)} 份",
        "",
    ]
    for file_name, doc_type_label, findings in results:
        lines += [f"## {file_name}", "", f"- 文件類型：{doc_type_label}",
                  f"- 結果統計：{summary_line(findings)}", ""]
        if not findings:
            lines += ["未發現問題。", ""]
            continue
        lines += ["| 等級 | 規則 | 位置 | 說明 | 原文節錄 |", "| --- | --- | --- | --- | --- |"]
        for f in sorted(findings, key=lambda f: f.sort_key()):
            snippet = f.snippet.replace("|", "｜").replace("\n", " ")
            message = f.message.replace("|", "｜")
            lines.append(
                f"| {SEVERITY_LABEL[f.severity]} | {f.rule_id} | {f.location} "
                f"| {message} | {snippet} |"
            )
        lines.append("")
    return "\n".join(lines)


def has_errors(findings: list[Finding]) -> bool:
    return any(SEVERITY_ORDER.get(f.severity, 9) == 0 for f in findings)
