# 本 repo 的執行環境：pdfplumber 首次執行若因 `_cffi_backend` 掛掉，`pip install cffi` 即可修復；環境內的 LibreOffice 無法轉檔。

## 情境

在遠端容器環境首次跑 PDF 審查時，pdfminer → cryptography → `_cffi_backend` 匯入鏈炸掉（系統的 debian 版 cryptography 缺 cffi）。另外 `soffice --headless --convert-to pdf` 對任何檔案（含純 txt）都回 "source file could not be loaded"，是安裝不完整，不是檔案問題。

## 做法

`pip install -U cryptography cffi`（實際起作用的是 cffi）後 pdfplumber 正常。需要產生中文測試 PDF 時用 reportlab 的 `UnicodeCIDFont('STSong-Light')`，不要浪費時間修 LibreOffice。

## 為什麼重要

這兩個症狀的錯誤訊息都指向錯誤方向（cryptography panic 看起來像套件版本衝突、soffice 錯誤看起來像檔案損壞），不記下來每次新 session 都會重新踩一輪、浪費排查時間。
