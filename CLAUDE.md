# contract-viewer2 — 合約自動審查工具

Word（.docx）／PDF 訂購單合約與發包承攬契約的自動勘誤工具。純 Python，規則以 YAML 維護。

## 常用指令

```bash
pip install -r requirements.txt          # 安裝相依
python review.py check <檔案...>         # 審查（--type auto 自動判斷文件類型）
python review.py check f.docx -o 報告.md # 輸出 Markdown 報告
python review.py add-rule ...            # 新增規則（見 README.md）
python review.py list-rules              # 列出所有規則
python -m unittest discover tests        # 跑測試
python samples/make_samples.py           # 重新產生範例合約
```

## 架構

- `contract_review/extract.py`：docx/pdf → 帶位置資訊的文字段落
- `contract_review/rules.py`：YAML 規則引擎（required／forbidden／consistency／builtin 四種型別）
- `contract_review/checks.py`：程式化檢查（金額大小寫比對、日期有效性、空欄偵測）
- `rules/*.yaml`：規則檔；`doc_type: common` 套用到所有文件
- `samples/`：含刻意錯誤的範例合約與產生器

## 工作守則（對 AI 助手）

1. **session 開始先讀 `lessons/`**：先掃各檔第一行摘要，相關的再展開。
2. **有教訓就記**：修正過的錯誤、被驗證確認的做法，依 `lessons/README.md` 的規範記錄（一檔一教訓、首行摘要、要寫為什麼重要）。
3. **不重複**：已在程式碼、規則檔或既有 lesson 中的內容不再存一份；同主題更新既有 lesson 而非開新檔；結論錯誤的 lesson 直接刪除或改寫。
4. **規則優先於筆記**：能寫成 `rules/*.yaml` 規則的教訓就落地成規則。
5. **改規則或檢查邏輯後**：跑 `python -m unittest discover tests`，並用 `samples/` 兩份範例合約驗證預期的錯誤仍抓得到、沒有新誤報。
6. **自主完成**：只有不可逆動作、範圍實質變更、或只有使用者能提供的資訊才暫停詢問，其餘做完再回報。
