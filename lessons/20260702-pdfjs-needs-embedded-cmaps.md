# pdf.js 遇到無 ToUnicode 表的 CID 中文字型時抽不出任何字，錯誤訊息會誤導成「掃描影像 PDF」；單機版已整包內嵌 CMap 解決，勿再往 OCR 方向排查。

## 情境

單機版 HTML 用 pdf.js 抽 PDF 文字，測試 PDF（reportlab CID 字型產生）抽出 0 個字，前端顯示我們自己的錯誤訊息「可能是掃描影像 PDF，請先 OCR」。真正原因在 console：`The CMap "baseUrl" parameter must be specified`——該 PDF 的字型用預定義 CMap 且無內嵌 ToUnicode 表，pdf.js 需要外部 CMap 檔才能把字碼轉成文字。Python 版沒事是因為 pdfminer 自帶 CMap。

## 做法

`build_standalone.py` 把 pdfjs-dist 的 169 個 .bcmap 全部 base64 內嵌（原始 1.7MB），前端用自訂 `CMapReaderFactory` ＋ `useWorkerFetch: false` 從內嵌表讀取。Word／Adobe 輸出的合約 PDF 多半有 ToUnicode 不需要 CMap，但印表機驅動或舊系統產的 PDF 會踩到，整包內嵌換取穩定。

## 為什麼重要

症狀（抽出 0 字）與掃描影像 PDF 完全相同，但成因與解法完全不同。不記下來，之後遇到使用者回報「某份 PDF 審不出來」，會先叫人去 OCR 白忙一場；正確的第一步是開瀏覽器 console 看有沒有 CMap 錯誤。
