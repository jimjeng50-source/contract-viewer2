# 本 repo 的遠端容器環境有三個坑：debian 版 Python 套件壞損（用 `pip install --ignore-installed` 修）、LibreOffice 無法轉檔、Playwright 上傳非 ASCII 檔名路徑會靜默失敗。

## 情境

1. pdfplumber 首跑因 `_cffi_backend` 缺失炸掉（debian 版 cryptography 不完整）；安裝 flask 時 debian 版 blinker 因 RECORD 檔缺失無法解除安裝。
2. `soffice --headless --convert-to pdf` 對任何檔案（含純 txt）都回 "source file could not be loaded"，是安裝不完整，不是檔案問題。
3. Playwright 的 `setInputFiles` 給中文檔名路徑時不觸發 change 事件也不報錯，看起來像網頁 bug，其實是容器內 Chromium/CDP 的怪癖——curl 用中文檔名打 API 完全正常。

## 做法

1. `pip install cffi` 修 pdfplumber；`pip install --ignore-installed blinker flask` 繞過壞損的 debian 套件。
2. 需要產生中文測試 PDF 用 reportlab 的 `UnicodeCIDFont('STSong-Light')`，不要浪費時間修 LibreOffice。
3. 瀏覽器 e2e 測試上傳檔案時，先把檔案複製成 ASCII 檔名再 `setInputFiles`。

## 為什麼重要

三個症狀的錯誤訊息都指向錯誤方向（套件版本衝突／檔案損壞／前端 JS bug），實際原因都是環境問題。不記下來每次新 session 都會重新排查一輪，尤其第 3 點會讓人誤以為自己寫的網頁上傳壞了而白改前端。
