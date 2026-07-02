# contract-viewer2 — 合約自動審查工具

自動勘誤 Word（.docx）與 PDF 格式的**訂購單合約**與**發包承攬契約**：漏條款、金額大小寫不符、無效日期、漏填空欄、用語混用、常見法律用字錯誤。規則以 YAML 維護，可隨時新增，不用改程式。附互動網頁介面與自動學習功能。

## 安裝

```bash
pip install -r requirements.txt
```

需要 Python 3.10+。

## 單機版 HTML（免安裝）

`dist/合約審查_單機版.html` 是一個完全自足的離線網頁：下載這一個檔案，雙擊用瀏覽器開啟即可拖放審查 .docx／.pdf，不需要 Python、不需要伺服器、不需要網路，合約內容不會離開你的電腦。

- 功能與伺服器版相同：拖放審查、商務摘要、誤報學習、補充關鍵字、線上加規則。
- 學習資料與自訂規則存在瀏覽器 localStorage；「學習資料管理」區可**匯出／匯入 JSON**（備份或帶到別台電腦），自訂規則與學到的關鍵字可**匯出成 YAML** 併回本 repo 的 `rules/`。
- 頁面上方會顯示規則版本（打包日期與內建規則數）。規則檔更新後要重新打包：

```bash
python build_standalone.py    # 需要 node/npm（自動下載前端函式庫）→ dist/合約審查_單機版.html
```

## 互動網頁（伺服器版）

```bash
python review.py serve            # 啟動後開 http://127.0.0.1:8000/
python review.py serve --port 9000 --host 0.0.0.0   # 自訂埠號／對外
```

- **拖放上傳**：把 .docx／.pdf 拖進頁面（可一次多份），立即顯示審查結果。
- **自動學習**：對每項結果按「✘ 誤報」——
  - 有原文節錄的發現：系統記住這條文（存入 `learning/suppressions.yaml`），之後任何檔案遇到相同條文都不再回報，比對與空白無關、跨檔案生效。
  - 全文型發現（找不到某條款）：可補充該合約實際使用的關鍵字，系統會**直接把關鍵字寫回規則檔**，規則從此認得這種寫法。
  - 按「✔ 正確」則記錄確認，累積各規則的準確度統計（`/api/stats`）。
- **線上加規則**：頁面下方表單可直接新增 required／forbidden／consistency 規則，寫入 `rules/custom.yaml`。
- 所有回饋都留存於 `learning/feedback.jsonl` 供回溯。

命令列審查同樣會套用已學習的抑制清單，兩邊共用同一份學習資料。

## 命令列審查

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

## 商務摘要

審查結果最上方會先列出擷取到的重要商務基本資訊（網頁版與 Markdown 報告皆有）：

- **當事人**（甲方／乙方／定作人／承攬人與公司名）
- **幣別金額**：新臺幣、美元、歐元、日圓、人民幣、英鎊，及中文大寫金額（自動換算數字）
- **日期**（民國／西元）與**重要期限**（交貨、完工、驗收等含具體時間的條款）
- **付款條件**（T/T、L/C、電匯、月結、票期…）
- **貿易條件 Incoterms**（FOB、CIF、DDP 等 16 種術語＋版本年份）
- **違約金（LD）**數額與上限、**履約保證金**、**保固**

「幣別金額」「日期」「重要期限」「付款條件」「違約金」屬關鍵項目，擷取不到會標示「⚠ 未擷取到，請人工確認」。

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

## 記憶系統

- `learning/`：機器自動學習資料——誤報抑制清單（`suppressions.yaml`）與回饋流水帳（`feedback.jsonl`），由網頁回饋按鈕自動維護。
- `lessons/`：人工整理的經驗庫——修正過的誤報／漏報與確認有效的做法，一檔一教訓、首行摘要，規範見 `lessons/README.md`。能落地成規則的教訓優先寫進 `rules/`。

## 開發

```bash
python -m unittest discover tests     # 單元測試
python samples/make_samples.py       # 重建含刻意錯誤的範例合約
python review.py check samples/*.docx # 應抓到範例中埋的所有錯誤
```
