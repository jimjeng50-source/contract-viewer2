"""互動審查網頁：拖放上傳 .docx/.pdf、即時審查、誤報回饋自動學習、線上加規則。

啟動：python review.py serve（預設 http://127.0.0.1:8000/）
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from .engine import DEFAULT_RULES_DIR, DOC_TYPES, review_file
from .findings import SEVERITY_LABEL
from .learning import (
    DEFAULT_LEARNING_DIR,
    extend_rule_patterns,
    finding_signature,
    learning_stats,
    record_feedback,
)
from .rules import VALID_SEVERITIES, append_rule, load_rules_for

ALLOWED_SUFFIXES = {".docx", ".pdf"}
MAX_UPLOAD_MB = 30


def create_app(
    rules_dir: str | Path = DEFAULT_RULES_DIR,
    learning_dir: str | Path = DEFAULT_LEARNING_DIR,
) -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
    rules_dir = Path(rules_dir)
    learning_dir = Path(learning_dir)

    @app.get("/")
    def index():
        return render_template("index.html", doc_types=DOC_TYPES)

    @app.post("/api/review")
    def api_review():
        files = request.files.getlist("files")
        doc_type = request.form.get("doc_type", "auto")
        if not files:
            return jsonify({"error": "沒有收到檔案。"}), 400
        results = []
        for storage in files:
            name = storage.filename or "未命名"
            suffix = Path(name).suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                results.append({"file": name, "error": f"不支援的格式 {suffix}（僅 .docx/.pdf）"})
                continue
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
                storage.save(tmp.name)
                try:
                    result = review_file(
                        tmp.name, doc_type=doc_type,
                        rules_dir=rules_dir, learning_dir=learning_dir,
                    )
                except Exception as e:  # noqa: BLE001
                    results.append({"file": name, "error": str(e)})
                    continue
            counts = {"error": 0, "warning": 0, "info": 0}
            findings = []
            for f in result.findings:
                counts[f.severity] += 1
                findings.append(
                    {
                        "rule_id": f.rule_id,
                        "severity": f.severity,
                        "severity_label": SEVERITY_LABEL[f.severity],
                        "message": f.message,
                        "location": f.location,
                        "snippet": f.snippet,
                        "signature": finding_signature(f.rule_id, f.snippet),
                    }
                )
            results.append(
                {
                    "file": name,
                    "doc_type": result.doc_type,
                    "doc_type_label": result.doc_type_label,
                    "counts": counts,
                    "suppressed": result.suppressed_count,
                    "findings": findings,
                }
            )
        return jsonify({"results": results})

    @app.post("/api/feedback")
    def api_feedback():
        data = request.get_json(silent=True) or {}
        verdict = data.get("verdict")
        finding = data.get("finding") or {}
        if verdict not in ("false_positive", "confirmed"):
            return jsonify({"error": "verdict 必須是 false_positive 或 confirmed。"}), 400
        outcome = record_feedback(
            verdict=verdict,
            finding=finding,
            file_name=data.get("file", ""),
            note=data.get("note", ""),
            learning_dir=learning_dir,
        )
        extend = (data.get("extend_pattern") or "").strip()
        if verdict == "false_positive" and extend:
            try:
                path = extend_rule_patterns(finding.get("rule_id", ""), extend, rules_dir)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400
            outcome = {
                "action": "pattern_extended",
                "detail": f"已把關鍵字「{extend}」學進規則"
                f"「{finding.get('rule_id')}」（{Path(path).name}），"
                "之後含此寫法的合約不會再誤報。",
            }
        return jsonify(outcome)

    @app.get("/api/rules")
    def api_rules():
        seen = {}
        for doc_type in DOC_TYPES:
            for r in load_rules_for(doc_type, rules_dir):
                seen[r.id] = {
                    "id": r.id,
                    "name": r.name,
                    "type": r.type,
                    "severity": r.severity,
                    "message": r.message,
                    "patterns": r.patterns,
                    "source": Path(r.source).name,
                }
        return jsonify({"rules": sorted(seen.values(), key=lambda r: r["id"])})

    @app.post("/api/rules")
    def api_add_rule():
        data = request.get_json(silent=True) or {}
        doc_type = data.get("doc_type", "common")
        if doc_type not in DOC_TYPES:
            return jsonify({"error": f"doc_type 必須是 {sorted(DOC_TYPES)} 之一。"}), 400
        if data.get("severity", "warning") not in VALID_SEVERITIES:
            return jsonify({"error": f"severity 必須是 {sorted(VALID_SEVERITIES)} 之一。"}), 400
        raw = {
            "id": (data.get("id") or "").strip(),
            "type": data.get("rule_type"),
            "severity": data.get("severity", "warning"),
        }
        for key in ("name", "message"):
            if data.get(key):
                raw[key] = data[key]
        if data.get("patterns"):
            raw["patterns"] = [p for p in data["patterns"] if p.strip()]
        if data.get("groups"):
            raw["groups"] = [g for g in data["groups"] if g]
        try:
            path = append_rule(rules_dir, data.get("file", "custom.yaml"), doc_type, raw)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify({"detail": f"已新增規則「{raw['id']}」到 {Path(path).name}。"})

    @app.get("/api/stats")
    def api_stats():
        return jsonify(learning_stats(learning_dir))

    return app
