# contract-viewer2 — 合約自動審查工具

自動勘誤 Word（.docx）與 PDF 格式的**訂購單合約**與**發包承攬契約**：漏條款、金額大小寫不符、無效日期、漏填空欄、用語混用、常見法律用字錯誤。規則以 YAML 維護，可隨時新增，不用改程式。

## 安裝

```bash
pip install -r requirements.txt
```

需要 Python 3.10+。

## 審查合約

```bash
# 審查一或多份合約，自動判斷文件類型
python review.py check 訂購單.docx 承攬契約.pdf

# 指定文件類型、輸出 Markdown 報告
python review.py check 合約.docx --type subcontract -o 審查報告.md
```

文件類型：`purchase_order`（訂購單合約）、`subcontract`（發包承攬契約）、`common`（只套共用規則）。預設 `auto` 依內文關鍵字判斷。

結束碼：`0` 無錯誤、`1` 有 error 等級發現、`2` 檔案無法讀取——可直接接進批次腳本。

限制：
- 舊版 `.doc` 請先另存為 `.docx`。
- 掃描影像 PDF 需先 OCR 成文字型 PDF。
- PDF 抽字可能遺失全形空白，空欄偵測敏感度較 .docx 低（詳見 `lessons/`），有原始 .docx 時優先審 .docx。

## 內建檢查

| 檢查 | 說明 | 等級 |
| --- | --- | --- |
| 金額大小寫比對 | 「壹佰貳拾萬元整（NT$1,000,000）」大寫與數字不符 | error |
| 日期有效性 | 民國／西元日期如「2月30日」「13月」 | error |
| 空欄偵測 | 底線、未勾選框、緊鄰「元／年／月／日」的全形空白 | warning |
| 必要條款 | 依文件類型檢查付款、交期、驗收、保固、工期、履約保證、工安、保險等 | 依規則 |
| 用語一致性 | 甲乙方／買賣方稱謂混用、契約合約混用 | warning/info |
| 法律用字 | 「訂金」應為「定金」（民法第248條）等 | warning |

## 新增審查規則

規則放在 `rules/*.yaml`，四種型別：`required`（必要條款，找不到就報）、`forbidden`（出現就報，用於錯字／禁用語）、`consistency`（多組用語混用就報）、`builtin`（掛程式化檢查）。

用指令新增（寫入 `rules/custom.yaml`，會自動驗證 regex 與 id 不重複）：

```bash
# 必要條款：全文找不到「智慧財產」就提示
python review.py add-rule --id custom-ip --rule-type required \
  --name 智慧財產權 --pattern '智慧財產|智財' \
  --message '全文未發現智慧財產權條款，請確認是否需要。' --severity info

# 錯字勘誤：出現「合約書乙份」就警告
python review.py add-rule --id custom-yi-fen --rule-type forbidden \
  --pattern '乙份' --message '「乙份」建議改為「一份」。' --severity info

# 用語一致性：計畫／專案混用
python review.py add-rule --id custom-project-term --rule-type consistency \
  --group '計畫' --group '專案' --severity info
```

也可以直接編輯 YAML，格式見 `rules/common.yaml` 內註解。`python review.py list-rules` 檢視現行全部規則。

## 審查經驗記憶庫

`lessons/` 累積修正過的誤報／漏報與確認有效的做法，一檔一教訓、首行摘要，規範見 `lessons/README.md`。

## 開發

```bash
python -m unittest discover tests     # 單元測試
python samples/make_samples.py       # 重建含刻意錯誤的範例合約
python review.py check samples/*.docx # 應抓到範例中埋的所有錯誤
```
