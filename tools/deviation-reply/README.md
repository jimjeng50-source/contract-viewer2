# 廠商異議回覆台（deviation-reply）

單檔 HTML 工具：把廠商的商務異議檔（Excel／Word／PDF／掃描檔）拖進來 → Gemini 依「商務條款底線 MasterFile.xlsx」的底線與範例草擬回覆 → 使用者逐項同意或給意見 → 意見萃取成規則（寫入規則檔「提案區」，待主管每月 review 核定）→ 產出完稿（與來源同格式；PDF／掃描轉 Excel 澄清表）。

與本 repo 的合約審查單機版是**不同工具**（審自家合約 vs. 回覆廠商異議），只是放在同一 repo 管理。

## 學習迴路
- 使用者意見 → AI 改寫回覆，並判斷能否一般化成規則（底線三級或慣用回覆）→ 使用者按「記住」才寫入。
- 規則先存本機，按「存回規則檔」合併進 SharePoint 上的 MasterFile（提案區／回覆紀錄／詞庫，以 ID 去重、保留格式）。
- 之後的草擬會帶入：已核定底線＋所有待核規則（標示待核但優先遵循）＋該條款最近 3 筆實際回覆。
- 每月 Review 匯出差異表與 clean-orange-deck 簡報；主管在提案區填「決議／決議日」即轉正。

## 機密處理
- 文字一律以 deid.js 遮蔽（人名、公司、專案、金額、郵址、電話、編號、準則＋詞庫），首次送出必經逐字確認；意見調整若出現新機密詞也會再確認。
- 「讓 AI 參考內部底線」預設開啟（底線會送到 Gemini 免費層）；可在設定關閉，關閉後 AI 只依立場與範例回覆。
- 回覆中出現底線數字而廠商原文沒有 → 標示「可能洩漏底線」。
- 掃描影像無法遮蔽，介面明確警告。

## 開發
```bash
npm install
node tests/engine.test.js      # 引擎單元測試（Node＋xmldom）
python3 build.py               # → dist/廠商異議回覆台.html（約 5 MB，完全離線）
node e2e/run.js                # Playwright e2e（先把 dist 複製成 e2e/app.html、fixtures 複製到 e2e/；mock Gemini）
```
src/deid.js、src/core.js 沿用自 2026-10 的「條款回覆工作台」。
