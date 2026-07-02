# contract-viewer2 — 合約自動審查工具

Word（.docx）／PDF 訂購單合約與發包承攬契約的自動勘誤工具。規則以 YAML 維護。

**開發主線（2026-07 起）：只開發單機版**（`templates/standalone.html` ＋ `build_standalone.py` → `dist/`）。
伺服器網頁（webapp.py）與 CLI 凍結維持現狀：保持能動、修壞掉的東西，但**新功能一律只做在單機版 JS，不再回寫 Python 側**。
單機版新功能的驗證方式：Playwright 對 `dist/` 產物做瀏覽器端到端測試（非 ASCII 檔名的環境坑見 lessons）。

## 常用指令

```bash
pip install -r requirements.txt          # 安裝相依
python review.py check <檔案...>         # 審查（--type auto 自動判斷文件類型）
python review.py check f.docx -o 報告.md # 輸出 Markdown 報告
python review.py serve                   # 互動網頁 http://127.0.0.1:8000/
python build_standalone.py               # 打包單機版 HTML（rules/ 變更後要重打包）
python review.py add-rule ...            # 新增規則（見 README.md）
python review.py list-rules              # 列出所有規則
python review.py log --keyword X         # 查審查紀錄（哪天審過哪些合約）
python -m unittest discover tests        # 跑測試
python samples/make_samples.py           # 重新產生範例合約
```

## 架構

- `contract_review/extract.py`：docx/pdf → 帶位置資訊的文字段落
- `contract_review/rules.py`：YAML 規則引擎（required／forbidden／consistency／builtin 四種型別）
- `contract_review/checks.py`：程式化檢查（金額大小寫比對、日期有效性、空欄偵測）
- `contract_review/summary.py`：商務摘要擷取（幣別金額、日期、LD、Incoterms…）
- `contract_review/engine.py`：CLI 與網頁共用的審查流程（抽取→摘要→規則→學習過濾）
- `contract_review/learning.py`：自動學習（誤報抑制、關鍵字寫回規則、回饋統計）
- `templates/standalone.html` ＋ `build_standalone.py`：**單機離線版（開發主線）**；引擎為 JS 實作，改完要重打包 dist/
- `contract_review/webapp.py` ＋ `templates/index.html`：Flask 互動網頁（凍結，不加新功能）
- `rules/*.yaml`：規則檔；`doc_type: common` 套用到所有文件
- `contract_review/reviewlog.py`：審查紀錄（每份合約審查留檔可查）
- `learning/`：機器學習資料（suppressions.yaml／feedback.jsonl）與審查紀錄（review_log.jsonl），勿手動與 lessons 混用
- `samples/`：含刻意錯誤的範例合約與產生器

## 工作守則（對 AI 助手）

1. **session 開始先讀 `lessons/`**：先掃各檔第一行摘要，相關的再展開。
2. **有教訓就記**：修正過的錯誤、被驗證確認的做法，依 `lessons/README.md` 的規範記錄（一檔一教訓、首行摘要、要寫為什麼重要）。
3. **不重複**：已在程式碼、規則檔或既有 lesson 中的內容不再存一份；同主題更新既有 lesson 而非開新檔；結論錯誤的 lesson 直接刪除或改寫。
4. **規則優先於筆記**：能寫成 `rules/*.yaml` 規則的教訓就落地成規則。
5. **改規則或檢查邏輯後**：規則檔（rules/*.yaml）兩邊共用，改完跑 `python -m unittest discover tests` 確認沒弄壞既有 Python 側，重打包 dist/ 並用 Playwright 拿 `samples/` 兩份範例合約驗證單機版預期的錯誤仍抓得到、沒有新誤報。單機版專屬的 JS 邏輯只用瀏覽器測試驗證。
6. **自主完成**：只有不可逆動作、範圍實質變更、或只有使用者能提供的資訊才暫停詢問，其餘做完再回報。
