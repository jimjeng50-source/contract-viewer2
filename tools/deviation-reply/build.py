"""打包「廠商異議回覆台」單檔 HTML：python build.py [-o 輸出路徑]（需先 npm install）"""
import base64, json, re, sys, subprocess
from pathlib import Path
ROOT = Path(__file__).parent
NM = ROOT / "node_modules"
LIBS = {"/*__EXCELJS__*/": "exceljs/dist/exceljs.min.js", "/*__XLSX__*/": "xlsx/dist/xlsx.full.min.js", "/*__JSZIP__*/": "jszip/dist/jszip.min.js",
        "/*__PPTX__*/": "pptxgenjs/dist/pptxgen.bundle.js", "/*__PDFJS__*/": "pdfjs-dist/build/pdf.min.js", "/*__PDFJS_WORKER__*/": "pdfjs-dist/build/pdf.worker.min.js"}
SRC = {"/*__DEID__*/": "src/deid.js", "/*__REF__*/": "src/reference.js", "/*__CORE__*/": "src/core.js", "/*__ENGINE__*/": "src/engine.js"}
def safe(t): return re.sub(r"</script", r"<\\/script", t, flags=re.I).replace("<!--", "<\\!--")
if not (NM / "exceljs").exists():
    subprocess.run(["npm", "install"], cwd=ROOT, check=True)
html = (ROOT / "src/app.html").read_text(encoding="utf-8")
for k, p in {**LIBS, **SRC}.items():
    base = NM if k in LIBS else ROOT
    assert k in html, k
    html = html.replace(k, safe((base / p).read_text(encoding="utf-8")))
cm = {f.stem: base64.b64encode(f.read_bytes()).decode() for f in sorted((NM / "pdfjs-dist/cmaps").glob("*.bcmap"))}
html = html.replace("/*__CMAPS__*/", json.dumps(cm))
out = Path(sys.argv[sys.argv.index("-o") + 1]) if "-o" in sys.argv else ROOT / "dist" / "廠商異議回覆台.html"
out.parent.mkdir(parents=True, exist_ok=True); out.write_text(html, encoding="utf-8")
print(f"已產出 {out}（{out.stat().st_size/1024/1024:.1f} MB）")
