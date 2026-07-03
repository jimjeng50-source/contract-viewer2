# contract-viewer2 — 合約自動審查工具

自動勘誤 Word（.docx）與 PDF 格式的**訂購單合約**與**發包承攬契約**：漏條款、金額大小寫不符、無效日期、漏填空欄、用語混用、常見法律用字錯誤。規則以 YAML 維護，可隨時新增，不用改程式。附互動網頁介面與自動學習功能。

## 安裝

```bash
pip install -r requirements.txt
```

需要 Python 3.10+。

## 單機版 HTML（免安裝，開發主線）

`dist/合約審查_單機版.html` 是一個完全自足的離線網頁：下載這一個檔案，雙擊用瀏覽器開啟即可拖放審查 .docx／.pdf，不需要 Python、不需要伺服器、不需要網路，合約內容不會離開你的電腦。

- 功能與伺服器版相同：拖放審查、商務摘要、誤報學習、補充關鍵字、線上加規則。
- 學習資料與自訂規則存在瀏覽器 localStorage；「學習資料管理」區可**匯出／匯入 JSON**（備份或帶到別台電腦），自訂規則與學到的關鍵字可**匯出成 YAML** 併回本 repo 的 `rules/`。
- 頁面上方會顯示規則版本（打包日期與內建規則數）。規則檔更新後要重新打包：

```bash
python build_standalone.py    # 需要 node/npm（自動下載前端函式庫）→ dist/合約審查_單機版.html
```

## 互動網頁（伺服器版；凍結維護，新功能只做單機版）

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

## 商務摘要（語意判讀）

審查結果最上方會先列出**判讀後**的重要商務資訊（網頁版與 Markdown 報告皆有），不是把所有數字都倒出來：

- **交貨品項**：訂購品名／契約標的／工程名稱
- **合約金額**：依上下文關鍵字（訂購總金額／契約總價／含營業稅總金額…）評分，只挑出這份合約的總價並標注含稅／未稅；鄰近並列的國字（大寫壹貳參與小寫一二三皆可）與數字金額自動併成一筆比對，不一致會標「⚠」
- **其他金額**：定金、履約保證金各自標明類別，其餘歸「其他」；違約金額歸 LD 欄不混入
- **簽約日期**：從落款或「簽約／立約」語境判斷，不列內文其他日期
- **交貨／完工期限**：分類為交貨、完工、驗收期限，擷取具體日期或「到貨後 7 日內」等相對期限
- **付款條件**：解析出時點＋天數＋方式，並整理**期款結構**（預付款／交貨款／尾款…各 %）且檢查**各期款合計是否為 100%**，不足會標「⚠」
- **貿易條件 Incoterms**：16 種術語＋地點＋版本年份
- **違約金（LD）**：解析計罰週期（含「每逾期一個日曆天」寫法）、基準與費率並換算百分比，上限可跨句擷取（如「賠償總額最高為訂購金額的10%」）；**沒有上限約定會標「上限：未見約定⚠」**；附條款原文供核對
- **責任上限（Total Liability）**：總責任／責任上限條款，擷取不到會標「⚠」提醒查總則
- **履約保證金**（金額或占比）、**保固**（期間＋起算點＋「以先到者為準」）、**當事人**

合約金額、簽約日期、期限、付款條件、LD 屬關鍵項目，擷取不到會標示「⚠ 未擷取到，請人工確認」。

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

## 審查紀錄（log）

每份審查過的合約自動記一筆紀錄：審查時間、檔名、文件類型、結果統計、商務摘要（合約金額、簽約日期、期限、LD…），可依關鍵字（含摘要內容）與日期區間查詢「哪一天審過哪些合約」。

- **單機版**：「審查紀錄查詢」面板查詢＋匯出 CSV（Excel 可直接開）；紀錄存瀏覽器 localStorage（最多 1000 筆），也包含在學習資料的匯出／匯入中。
- **伺服器版網頁**：同樣的查詢面板；紀錄存 `learning/review_log.jsonl`。
- **CLI**：

```bash
python review.py log                          # 全部紀錄（新到舊）
python review.py log --keyword 大甲精機       # 關鍵字（檔名或摘要內容，如廠商名）
python review.py log --from 2026-07-01 --to 2026-07-31 -v   # 日期區間＋完整摘要
python review.py check 合約.docx --no-log     # 這次審查不記錄
```

## 記憶系統

- `learning/`：機器自動學習資料——誤報抑制清單（`suppressions.yaml`）與回饋流水帳（`feedback.jsonl`），由網頁回饋按鈕自動維護。
- `lessons/`：人工整理的經驗庫——修正過的誤報／漏報與確認有效的做法，一檔一教訓、首行摘要，規範見 `lessons/README.md`。能落地成規則的教訓優先寫進 `rules/`。

## 開發

```bash
python -m unittest discover tests     # 單元測試
python samples/make_samples.py       # 重建含刻意錯誤的範例合約
python review.py check samples/*.docx # 應抓到範例中埋的所有錯誤
```
