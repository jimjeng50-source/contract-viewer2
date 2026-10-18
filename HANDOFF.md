# HANDOFF — 交接文件（2026-10-18 更新）

> 給接手的新對話：先讀本檔 → `CLAUDE.md`（工作守則，必遵守）→ `lessons/` 各檔首行摘要 →
> 要做 AI 審查前讀 `review-guidelines.md`。本檔是狀態快照；守則與準則以上述檔案為準。

## 一、專案是什麼

台灣工程公司的**合約審查自動化工具**。使用者（採購/商務審約人員）審查中鼎（CTCI）式
**訂購單合約**與**發包承攬契約**（Word/PDF），合約屬機密等級、不可將原文上傳雲端。
核心交付物是**單機離線版 HTML**（`dist/合約審查_單機版.html`，約 3MB，雙擊即用）。

## 二、Repo 狀態

- **2026-10-18 起本 repo 為唯一合約審查工具**；`jimjeng50-source/contract-reviewer`（Python 原型）已併入，該 repo README 已改為導引至此，不再開發

- 開發分支：`claude/contract-review-automation-jq980b`（**全部工作都在這裡，共 10 個 commit**）
- `main`：仍是 initial commit，**從未 merge、未開 PR**——使用者沒要求過，勿自行開 PR
- 工作樹乾淨；最後 commit `4485a33`（2026-07-07，AI 語意判讀串接）
- 使用者下載的單機版 = `dist/` 現檔；改了 `templates/standalone.html` 或 `rules/` 必須
  `python build_standalone.py` 重打包並用 SendUserFile 附新檔給使用者

## 二之一、另一個工具：廠商異議回覆台（2026-10-18）

`tools/deviation-reply/`：回覆廠商商務異議的單檔 HTML（Gemini 免費層＋去識別化＋規則檔學習迴路），與合約審查單機版分開、規則檔也不同（用 SharePoint 上的「商務條款底線 MasterFile.xlsx」）。細節見該目錄 README。

## 三、開發方針（重要，已寫入 CLAUDE.md）

1. **只開發單機版**（`contract_review/templates/standalone.html` + `build_standalone.py`）。
   Flask 網頁（webapp.py）與 CLI **凍結**：修壞不加新功能，新功能不回寫 Python 側。
2. 單機版驗證方式＝Playwright 對 `dist/` 產物做瀏覽器端到端測試（參考 scratchpad 曾用的
   e2e 腳本模式：mock API、ASCII 檔名、file:// 開啟）。
3. 規則檔 `rules/*.yaml` 兩側共用；改規則後跑 `python -m unittest discover tests`（54 個，
   應全綠）確認 Python 側沒壞，再重打包。

## 四、單機版功能現況（已全部實作並通過 e2e）

1. **拖放審查** .docx/.pdf/.jpg/.png（docx=JSZip 解析；PDF=pdf.js 內嵌全部中文 CMap）。
   **掃描檔**（無文字層 PDF／圖片）：使用者勾選確認「影像不會遮蔽」後，轉 JPEG 送 Claude 逐頁轉錄，
   再走同一套規則／摘要（每批 8 頁、上限 30 頁、標註「AI 辨識」位置與成本）；mock 已測，真實 key 未測
2. **規則引擎**：required/forbidden/consistency/builtin 四型，33 條內建規則（共用＋訂購單＋承攬；2026-10 由 contract-reviewer 併入 6 條，見 lessons/20261018-merge-python-prototype.md）
3. **內建檢查**：金額國字（大寫壹貳參＋小寫一二三皆支援）↔ 阿拉伯數字比對、日期有效性、空欄偵測
4. **商務摘要（語意判讀，非關鍵字節錄）**：交貨品項、合約金額（評分挑總價、含稅/未稅）、
   簽約日期（落款/訂單日期/斜線日期）、交期、付款（期款結構＋加總應為 100% 檢查）、
   Incoterms、LD（費率換算 %／跨句跨行抓上限／無上限標 ⚠）、責任上限（Total Liability）、
   履約保證金、保固（以先到者為準句型）——全部對準中鼎 PO 範本措辭
5. **僅審主合約**（預設開）：依頁首「Page X of Y／頁次 X 之 Y」略過請購單、ITP 等附件頁
6. **自動學習**：按「誤報」→ 抑制清單（跨檔案、空白不敏感）；全文型誤報可補關鍵字直接寫回規則；
   學習資料存 localStorage，可匯出/匯入 JSON；線上新增規則
7. **審查紀錄**：每份審查留檔（時間/檔名/結果/摘要），關鍵字＋日期查詢、CSV 匯出（台帳用）
8. **去識別化匯出**：本機遮蔽公司名（中英）、金額（六種形態）、統編、電話、Email、地址、
   帳號、單號、專案名、聯絡人＋自訂遮蔽詞 → 產出可上傳的 txt ＋只留本機的對照表 CSV
9. **AI 語意判讀（API 串接）**：設定 Anthropic API key（localStorage）→ 一鍵「本機去識別化
   → 只送遮蔽文字 → Claude 依打包內嵌的 review-guidelines.md 審查 → 串流顯示 → 本機還原代號」。
   模型 Opus 4.8（預設）/Sonnet 5/Haiku 4.5；CORS 直連（`anthropic-dangerous-direct-browser-access:
   true` header，preflight 對真實 API 實測過，file:// 亦可）；顯示 tokens 與成本估算。
   **注意：真實 key 的實彈呼叫從未測過**（開發環境無 key，只做過 Playwright mock 驗證）。

## 五、記憶／學習體系（四層，勿混用）

| 層 | 檔案 | 性質 | 維護規則 |
| --- | --- | --- | --- |
| 工作守則 | `CLAUDE.md` | 給 AI 的開發守則 | 方針變更時更新 |
| 開發教訓 | `lessons/*.md` | 一檔一教訓、首行摘要、要寫為什麼重要 | 不重複、更新優於新增、錯了就刪（規範見 lessons/README.md） |
| 審查準則 | `review-guidelines.md` | AI 審約的專業判斷（活文件） | 使用者 comment 後回寫；**改後要重打包 dist**（準則打包時嵌入單機版 AI 審查的 system prompt） |
| 機器學習資料 | `learning/` | 工具自動維護（抑制/回饋/紀錄） | 勿手動編輯 |

另有 `reviews/`：AI 直接審查的報告存檔（`YYYYMMDD-檔名.md`），**目前是空的**——
AI 審查＋使用者 comment 的迴路設計好了但**還沒跑過第一輪**。合約原文永不 commit。

## 六、關鍵環境坑（lessons/ 有完整記錄，新 session 必看）

- 容器 debian 版 Python 套件常壞：pdfplumber 缺 `_cffi_backend` → `pip install cffi`；
  flask 裝不上 → `pip install --ignore-installed blinker flask`
- 容器 LibreOffice 無法轉檔（連 txt 都不行），別浪費時間修；中文測試 PDF 用 reportlab
  `UnicodeCIDFont('STSong-Light')` 產生
- **Playwright `setInputFiles` 給中文檔名路徑會靜默失敗**（不觸發 change、不報錯）→
  先複製成 ASCII 檔名再上傳；`<a download="中文名">` 也會退化成 "download" → 下載檔名用 ASCII
- 打包需 node/npm（下載 jszip、pdfjs-dist@3.11.174）；scratchpad 的 vendor 目錄不跨 session，
  新 session 直接跑 `python build_standalone.py` 會自動 npm 下載
- pdf.js 對無 ToUnicode 的 CID 中文 PDF 抽出 0 字、錯誤訊息誤導成「掃描檔」→ 已整包內嵌
  169 個 CMap 解決，勿再往 OCR 方向排查

## 七、審查領域知識（對準中鼎範本，詳見 lessons/20260703-ctci-po-structure.md）

中鼎 PO(C) 20221003 版：12 頁 A~N 條款＋31 條採購注意事項。要點：LD 用語是「約定損失賠償」
（每逾期一個日曆天 0.1%、上限 10%、低於 10% 要主管核准，費率與上限常分屬不同句）；
含營業稅總金額用國字小寫填寫、須與 TOB 數字相符；各期款加總應為 100%；保固為驗收日起
12 個月或送達工地後 24 個月以先到者為準；保險與 COVID-19 條款不可刪；英文保證書非台灣
銀行開立要經 MEGA/HSBC advising。簽名授權、附件序號等屬人工確認項，不自動化。

## 八、相關 skills（使用者環境已有，可整合）

新對話的環境裡可能有兩個從本專案衍生／相關的 skills，觸發時機注意：
- `deid-tw-procurement`：台灣工程採購文件去識別化（遮罩→送 AI→回填管線），與本 repo 的
  去識別化功能同源概念——涉及遮蔽規則調整時兩邊對齊
- `engineering-insurance-toolkit`：工程保險審查/選用/試算/製作——合約保險條款審查可觸發，
  與 review-guidelines.md 的保險節互補

## 九、待辦與下一步（按優先序）

1. **跑第一輪真實迴路**：使用者拿真合約（或去識別化檔）做 AI 審查 → comment → 回寫
   review-guidelines.md → 可規則化者落地單機版 → 重打包。迴路已建好但零實戰。
2. **AI 語意判讀實彈測試**：使用者用自己的 API key 實際呼叫一次（mock 已全過，真實未測）。
3. **真實合約校準**：摘要判讀與去識別化規則都是照範本＋樣本調的，真實填寫版合約可能有
   漏抓寫法——收集例句後擴充（去識別化漏抓尤其要緊，上傳前使用者需抽查）。
4. 資安確認：去識別化文件的分級、送 Anthropic API 的政策核可（使用者端進行中）。
5. 使用者未要求前**不開 PR、不 merge main**。

## 十、新對話開場建議

```
1. 讀 HANDOFF.md（本檔）→ CLAUDE.md → lessons/ 首行摘要
2. git log --oneline 確認是否有本檔未記錄的新 commit
3. 若要改單機版：改 templates/standalone.html → python -m unittest discover tests
   → python build_standalone.py → Playwright e2e（ASCII 檔名！）→ commit/push
   → SendUserFile 附新 dist 給使用者
4. 若使用者丟合約來審：走 CLAUDE.md「AI 直接審查工作流」，先讀 review-guidelines.md
```
