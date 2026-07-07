#!/usr/bin/env python3
"""打包單機版審查網頁：一個離線 HTML 檔，雙擊即可用，不需 Python 與伺服器。

用法：python build_standalone.py [--vendor DIR] [-o 輸出檔]
產出：dist/合約審查_單機版.html

vendor 目錄需含三個檔（預設會自動用 npm 下載到暫存目錄）：
  jszip.min.js（docx 解壓）、pdf.min.js 與 pdf.worker.min.js（pdf.js v3 UMD 版）。
pdf.worker 以一般 <script> 內嵌：pdf.js 偵測到全域 pdfjsWorker 時會走
主執行緒 fake worker，完全不需要對外載入，合約規模的 PDF 效能足夠。
"""

from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent
TEMPLATE = REPO / "contract_review" / "templates" / "standalone.html"
DEFAULT_OUT = REPO / "dist" / "合約審查_單機版.html"
VENDOR_FILES = {
    "jszip.min.js": "jszip/dist/jszip.min.js",
    "pdf.min.js": "pdfjs-dist/build/pdf.min.js",
    "pdf.worker.min.js": "pdfjs-dist/build/pdf.worker.min.js",
}
# CID 字型中文 PDF 需要的 CMap 表目錄（整包內嵌，離線也能解字）
VENDOR_CMAPS_DIR = "pdfjs-dist/cmaps"
NPM_PACKAGES = ["jszip@3", "pdfjs-dist@3.11.174"]


def load_rules_json() -> tuple[str, int]:
    """把 rules/*.yaml 攤平成前端用的 JSON（每條規則帶 doc_type）。"""
    rules = []
    for path in sorted((REPO / "rules").glob("*.y*ml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        doc_type = data.get("doc_type", "common")
        for raw in data.get("rules", []) or []:
            rule = {"doc_type": doc_type, **raw}
            rules.append(rule)
    return json.dumps(rules, ensure_ascii=False), len(rules)


def ensure_vendor(vendor: Path | None) -> Path:
    if (
        vendor
        and all((vendor / name).exists() for name in VENDOR_FILES)
        and (vendor / "cmaps").is_dir()
    ):
        return vendor
    if vendor:
        print("vendor 目錄不完整（需三個 js 檔與 cmaps/ 目錄），改用 npm 下載…")
    tmp = Path(tempfile.mkdtemp(prefix="cv2-vendor-"))
    subprocess.run(
        ["npm", "install", "--prefix", str(tmp), "--no-fund", "--no-audit", *NPM_PACKAGES],
        check=True, capture_output=True,
    )
    out = tmp / "vendor"
    out.mkdir()
    for name, rel in VENDOR_FILES.items():
        shutil.copy(tmp / "node_modules" / rel, out / name)
    shutil.copytree(tmp / "node_modules" / VENDOR_CMAPS_DIR, out / "cmaps")
    return out


def load_cmaps_json(vendor: Path) -> str:
    cmaps = {}
    for path in sorted((vendor / "cmaps").glob("*.bcmap")):
        cmaps[path.stem] = base64.b64encode(path.read_bytes()).decode()
    if not cmaps:
        raise SystemExit(f"{vendor}/cmaps 內沒有 .bcmap 檔")
    return json.dumps(cmaps)


def js_safe(text: str) -> str:
    """避免內嵌腳本內容提前關閉 <script> 標籤。"""
    return text.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def build(vendor: Path | None, out_path: Path) -> None:
    vendor = ensure_vendor(vendor)
    rules_json, rule_count = load_rules_json()
    html = TEMPLATE.read_text(encoding="utf-8")
    replacements = {
        "/*__JSZIP__*/": js_safe((vendor / "jszip.min.js").read_text(encoding="utf-8")),
        "/*__PDFJS__*/": js_safe((vendor / "pdf.min.js").read_text(encoding="utf-8")),
        "/*__PDFJS_WORKER__*/": js_safe(
            (vendor / "pdf.worker.min.js").read_text(encoding="utf-8")
        ),
        "/*__RULES_JSON__*/": js_safe(rules_json),
        "/*__CMAPS_JSON__*/": load_cmaps_json(vendor),
        "/*__GUIDELINES__*/": js_safe(json.dumps(
            (REPO / "review-guidelines.md").read_text(encoding="utf-8"),
            ensure_ascii=False,
        )),
        "/*__BUILD_INFO__*/": f"{date.today().isoformat()}（內建 {rule_count} 條規則）",
    }
    for placeholder, content in replacements.items():
        if placeholder not in html:
            raise SystemExit(f"模板缺少佔位符 {placeholder}")
        html = html.replace(placeholder, content)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"已產出 {out_path}（{size_mb:.1f} MB，內建 {rule_count} 條規則）")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vendor", type=Path, help="已下載的前端函式庫目錄")
    parser.add_argument("-o", "--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    try:
        build(args.vendor, args.output)
    except subprocess.CalledProcessError as e:
        print(f"npm 下載失敗：{e.stderr.decode()[:500]}", file=sys.stderr)
        sys.exit(1)
