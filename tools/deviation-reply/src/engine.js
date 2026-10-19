/* engine.js — 廠商異議回覆台核心（瀏覽器與 Node 通用；ExcelJS / XLSX / JSZip / DOMParser 由環境提供） */
(function (root) {
  "use strict";
  const Core = root.Core || (typeof require !== "undefined" ? require("./core.js") : null);
  const Deid = root.Deid || (typeof require !== "undefined" ? require("./deid.js") : null);
  const Ref = root.Ref || (typeof require !== "undefined" ? require("./reference.js") : null);
  const str = v => (v === null || v === undefined ? "" : typeof v === "object" && v.richText ? v.richText.map(r => r.text).join("") : typeof v === "object" && "result" in v ? String(v.result ?? "") : typeof v === "object" && v.text ? String(v.text) : v instanceof Date ? Core.normDate(v) : String(v)).trim();

  // ───────── 欄位辨識（Excel 與 Word 表格共用） ─────────
  const RE_NO = /^(項次|序號|項目|編號|no\.?|item|#|s\/?n|nr\.?)$/i;
  const RE_REF = /(條次|條款|條文|章節|頁次|clause|section|article|ref|paragraph|spec|page)/i;
  const RE_REPLY = /(回覆|答覆|回應|核覆|response|reply|answer|disposition)/i;
  const RE_TEXT_STRONG = /(偏離|異議|例外|差異|澄清|deviation|exception|clarification|comment|remark|objection)/i;
  const RE_TEXT = /(說明|內容|意見|description|requirement|proposal|vendor|bidder|supplier|contractor|廠商)/i;

  function detectColumns(rows) {
    let best = null;
    for (let h = 0; h < Math.min(rows.length, 15); h++) {
      const r = rows[h].map(c => str(c));
      if (r.filter(Boolean).length < 2) continue;
      let score = 0;
      const cols = { no: -1, ref: -1, text: -1, reply: -1 };
      r.forEach((c, i) => {
        if (!c || c.length > 60) return;
        if (cols.reply < 0 && RE_REPLY.test(c)) { cols.reply = i; score += 2; return; }
        if (cols.text < 0 && RE_TEXT_STRONG.test(c)) { cols.text = i; score += 3; return; }
        if (cols.no < 0 && RE_NO.test(c)) { cols.no = i; score += 1; return; }
        if (cols.ref < 0 && RE_REF.test(c)) { cols.ref = i; score += 1; return; }
      });
      if (cols.text < 0) r.forEach((c, i) => { if (cols.text < 0 && c && c.length <= 60 && i !== cols.reply && RE_TEXT.test(c)) { cols.text = i; score += 2; } });
      if (score >= 3 && (!best || score > best.score)) best = { header: h, cols, score };
    }
    const width = Math.max(0, ...rows.map(r => r.length));
    if (!best) best = { header: -1, cols: { no: -1, ref: -1, text: -1, reply: -1 }, score: 0 };
    if (best.cols.text < 0) {
      // 沒有表頭可辨識：取平均字數最長的欄位當異議內容
      let maxAvg = 0;
      for (let c = 0; c < width; c++) {
        if (c === best.cols.reply) continue;
        const vals = rows.slice(best.header + 1).map(r => str(r[c])).filter(Boolean);
        const avg = vals.length ? vals.reduce((a, v) => a + v.length, 0) / vals.length : 0;
        if (avg > maxAvg && vals.length) { maxAvg = avg; best.cols.text = c; }
      }
    }
    return best;
  }

  function rowsToItems(rows, det, extra) {
    const items = [];
    const { cols } = det;
    if (cols.text < 0) return items;
    for (let r = det.header + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const text = str(row[cols.text]);
      if (!text || text.length < 2) continue;
      if (RE_TEXT_STRONG.test(text) && text.length < 40 && r <= det.header + 1 && det.header < 0) continue;
      items.push(Object.assign({ no: cols.no >= 0 ? str(row[cols.no]) || String(items.length + 1) : String(items.length + 1), ref: cols.ref >= 0 ? str(row[cols.ref]) : "", text, existingReply: cols.reply >= 0 ? str(row[cols.reply]) : "", rowIndex: r }, extra || {}));
    }
    return items;
  }

  // ───────── Excel ─────────
  async function ingestExcel(ExcelJS, XLSX, buf, name) {
    let wb = null, sheets = [];
    const isXlsx = /\.xlsx$|\.xlsm$/i.test(name);
    if (isXlsx) {
      wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
      wb.eachSheet(ws => {
        const rows = [];
        ws.eachRow({ includeEmpty: true }, (row, n) => { const vals = []; row.eachCell({ includeEmpty: true }, (cell, c) => { vals[c - 1] = str(cell.value); }); rows[n - 1] = vals; });
        for (let i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
        sheets.push({ name: ws.name, rows, hidden: ws.state && ws.state !== "visible" });
      });
    } else {
      const x = XLSX.read(new Uint8Array(buf), { type: "array" });
      for (const n of x.SheetNames) sheets.push({ name: n, rows: XLSX.utils.sheet_to_json(x.Sheets[n], { header: 1, defval: "", raw: false }) });
    }
    let best = null;
    for (const s of sheets) {
      if (s.hidden) continue;
      const det = detectColumns(s.rows);
      const items = rowsToItems(s.rows, det, { sheet: s.name });
      if (items.length && (!best || det.score > best.det.score || (det.score === best.det.score && items.length > best.items.length))) best = { sheet: s.name, det, items, rows: s.rows };
    }
    if (!best) return { kind: "excel", items: [], note: "找不到異議內容欄位" };
    return { kind: "excel", sheet: best.sheet, header: best.det.header, cols: best.det.cols, items: best.items, sourceXlsx: isXlsx,
      note: `工作表「${best.sheet}」第 ${best.det.header + 1} 列為表頭；異議欄＝第 ${best.det.cols.text + 1} 欄${best.det.cols.reply >= 0 ? `，回覆欄＝第 ${best.det.cols.reply + 1} 欄` : "，將新增回覆欄"}` };
  }

  async function writeExcelSame(ExcelJS, buf, ing, items, lang) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(ing.sheet);
    let col = ing.cols.reply >= 0 ? ing.cols.reply + 1 : 0;
    const headerRow = ing.header >= 0 ? ing.header + 1 : 0;
    if (!col) {
      col = ws.columnCount + 1;
      const src = ws.getColumn(ing.cols.text + 1);
      ws.getColumn(col).width = Math.max(40, src.width || 40);
      if (headerRow) {
        const hc = ws.getCell(headerRow, col), sc = ws.getCell(headerRow, ing.cols.text + 1);
        hc.value = lang === "zh" ? "我方回覆" : lang === "en" ? "Our Response" : "我方回覆 Our Response";
        hc.style = JSON.parse(JSON.stringify(sc.style || {}));
      }
    }
    const hasSug = items.some(it => suggestText(it, lang));
    const scol = hasSug ? Math.max(col, ws.columnCount) + 1 : 0;
    if (scol) {
      ws.getColumn(scol).width = 50;
      if (headerRow) { const hc = ws.getCell(headerRow, scol); hc.value = SUG_HDR(lang); hc.style = JSON.parse(JSON.stringify(ws.getCell(headerRow, col).style || {})); }
    }
    for (const it of items) {
      const r = it.rowIndex + 1;
      const c = ws.getCell(r, col), sc = ws.getCell(r, ing.cols.text + 1);
      if (ing.cols.reply < 0) c.style = JSON.parse(JSON.stringify(sc.style || {}));
      c.value = replyText(it, lang);
      c.alignment = Object.assign({}, c.alignment || {}, { wrapText: true, vertical: "top" });
      if (scol && suggestText(it, lang)) { const g = ws.getCell(r, scol); g.style = JSON.parse(JSON.stringify(sc.style || {})); g.value = suggestText(it, lang); g.alignment = { wrapText: true, vertical: "top" }; }
    }
    return wb.xlsx.writeBuffer();
  }

  // ───────── Word ─────────
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const tags = (node, local) => { const l = node.getElementsByTagNameNS(W, local), out = []; for (let i = 0; i < l.length; i++) out.push(l[i]); return out; };
  function wText(node) {
    const out = [];
    for (const p of tags(node, "p")) { let s = ""; for (const t of tags(p, "t")) s += t.textContent; out.push(s); }
    return out.join("\n").trim();
  }
  function directChildren(node, local) { const out = []; for (let c = node.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && c.localName === local) out.push(c); return out; }
  function tableRows(tbl) { return directChildren(tbl, "tr").map(tr => directChildren(tr, "tc").map(tc => wText(tc))); }

  async function ingestDocx(JSZip, buf) {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml").async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const tbls = tags(doc, "tbl");
    let best = null;
    tbls.forEach((tbl, ti) => {
      const rows = tableRows(tbl);
      const det = detectColumns(rows);
      const items = rowsToItems(rows, det, { table: ti });
      if (items.length && (!best || det.score > best.det.score || (det.score === best.det.score && items.length > best.items.length))) best = { ti, det, items };
    });
    if (best && best.items.length) return { kind: "docx", table: best.ti, header: best.det.header, cols: best.det.cols, items: best.items,
      note: `第 ${best.ti + 1} 個表格；異議欄＝第 ${best.det.cols.text + 1} 欄${best.det.cols.reply >= 0 ? `，回覆欄＝第 ${best.det.cols.reply + 1} 欄` : "，將新增回覆欄"}` };
    const body = tags(doc, "body")[0];
    const paras = directChildren(body, "p").map(p => tags(p, "t").map(t => t.textContent).join("").trim()).filter(Boolean);
    return { kind: "docx", table: -1, text: paras.join("\n"), items: [], note: "文件沒有異議表格，改用條列內容" };
  }

  function el(doc, name, attrs) { const e = doc.createElementNS(W, "w:" + name); for (const k in attrs || {}) e.setAttributeNS(W, "w:" + k, attrs[k]); return e; }
  function makePara(doc, text, bold, rPrSrc) {
    const p = el(doc, "p");
    String(text).split("\n").forEach((line, i) => {
      const r = el(doc, "r");
      if (rPrSrc) r.appendChild(rPrSrc.cloneNode(true));
      else if (bold) { const rp = el(doc, "rPr"); rp.appendChild(el(doc, "b")); r.appendChild(rp); }
      if (i) r.appendChild(el(doc, "br"));
      const t = el(doc, "t"); t.setAttribute("xml:space", "preserve"); t.textContent = line; r.appendChild(t);
      p.appendChild(r);
    });
    return p;
  }
  function setCellText(doc, tc, text) {
    const ps = directChildren(tc, "p");
    const firstR = tags(tc, "rPr")[0] || null;
    const pPr = ps[0] ? directChildren(ps[0], "pPr")[0] : null;
    ps.forEach(p => tc.removeChild(p));
    const np = makePara(doc, text, false, firstR);
    if (pPr) np.insertBefore(pPr.cloneNode(true), np.firstChild);
    tc.appendChild(np);
  }

  async function writeDocxSame(JSZip, buf, ing, items, lang) {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml").async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const body = tags(doc, "body")[0];
    if (ing.table >= 0) {
      const tbl = tags(doc, "tbl")[ing.table];
      const trs = directChildren(tbl, "tr");
      let col = ing.cols.reply;
      if (col < 0) {
        const grid = directChildren(tbl, "tblGrid")[0];
        if (grid) grid.appendChild(el(doc, "gridCol", { w: "3600" }));
        trs.forEach((tr, ri) => {
          const tcs = directChildren(tr, "tc");
          const ref = tcs[Math.min(ing.cols.text, tcs.length - 1)];
          const tc = el(doc, "tc");
          const tcPr = ref ? directChildren(ref, "tcPr")[0] : null;
          if (tcPr) { const c = tcPr.cloneNode(true); for (const g of directChildren(c, "gridSpan").concat(directChildren(c, "vMerge"))) c.removeChild(g); tc.appendChild(c); }
          tc.appendChild(makePara(doc, ri === ing.header ? (lang === "zh" ? "我方回覆" : lang === "en" ? "Our Response" : "我方回覆 Our Response") : "", ri === ing.header));
          tr.appendChild(tc);
        });
        col = directChildren(trs[0], "tc").length - 1;
      }
      for (const it of items) {
        const tcs = directChildren(trs[it.rowIndex], "tc");
        const tc = col < tcs.length ? tcs[col] : tcs[tcs.length - 1];
        setCellText(doc, tc, replyText(it, lang) + (suggestText(it, lang) ? `\n\n【${SUG_HDR(lang)}】\n${suggestText(it, lang)}` : ""));
      }
    } else {
      // 無表格：在文末（sectPr 前）加「我方回覆」標題與回覆表
      const sect = directChildren(body, "sectPr")[0] || null;
      const add = n => body.insertBefore(n, sect);
      add(makePara(doc, lang === "en" ? "Our Response" : "我方回覆 Our Response", true));
      const tbl = el(doc, "tbl");
      const pr = el(doc, "tblPr"); const bd = el(doc, "tblBorders");
      for (const s of ["top", "left", "bottom", "right", "insideH", "insideV"]) bd.appendChild(el(doc, s, { val: "single", sz: "4", space: "0", color: "999999" }));
      pr.appendChild(el(doc, "tblW", { w: "5000", type: "pct" })); pr.appendChild(bd); tbl.appendChild(pr);
      const grid = el(doc, "tblGrid"); for (const w of ["800", "4200", "4600"]) grid.appendChild(el(doc, "gridCol", { w })); tbl.appendChild(grid);
      const row = (cells, bold) => { const tr = el(doc, "tr"); cells.forEach(c => { const tc = el(doc, "tc"); tc.appendChild(makePara(doc, c, bold)); tr.appendChild(tc); }); tbl.appendChild(tr); };
      row(["項次 No.", "廠商異議 Vendor Deviation", "我方回覆 Our Response"], true);
      for (const it of items) row([it.no, it.text, replyText(it, lang) + (suggestText(it, lang) ? `\n\n【${SUG_HDR(lang)}】\n${suggestText(it, lang)}` : "")]);
      add(tbl);
    }
    zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
    return zip.generateAsync({ type: "uint8array" });
  }

  // ───────── PDF／掃描 → 澄清表 ─────────
  async function writeClarification(ExcelJS, items, ctx, lang) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clarification");
    const hasSug = items.some(it => suggestText(it, lang));
    ws.columns = [{ width: 8 }, { width: 14 }, { width: 55 }, { width: 60 }].concat(hasSug ? [{ width: 55 }] : []);
    const t = ws.addRow([`${ctx.project || ""} ${ctx.vendor || ""} 商務澄清回覆 Commercial Clarification`.trim()]);
    t.font = { bold: true, size: 14 }; ws.mergeCells(1, 1, 1, 4);
    ws.addRow([`日期 Date：${Core.today()}`]);
    ws.addRow([]);
    const h = ws.addRow(["項次\nNo.", "條次\nRef.", "廠商異議\nVendor Deviation", lang === "zh" ? "我方回覆" : lang === "en" ? "Our Response" : "我方回覆\nOur Response"].concat(hasSug ? [SUG_HDR(lang)] : []));
    h.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8710A" } }; c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; });
    for (const it of items) {
      const r = ws.addRow([it.no, it.ref, it.text, replyText(it, lang)].concat(hasSug ? [suggestText(it, lang)] : []));
      r.eachCell(c => { c.alignment = { wrapText: true, vertical: "top" }; c.border = { top: { style: "thin", color: { argb: "FFD9D9D9" } }, bottom: { style: "thin", color: { argb: "FFD9D9D9" } } }; });
    }
    ws.views = [{ state: "frozen", ySplit: 4 }];
    return wb.xlsx.writeBuffer();
  }

  // 建議修正條文（只在有條件接受時由 AI 提供）
  function suggestText(it, lang) {
    if (!it.sugZh && !it.sugEn) return "";
    if (lang === "auto") lang = isMostlyCJK(it.text) ? "zh" : "en";
    if (lang === "zh") return it.sugZh || it.sugEn;
    if (lang === "en") return it.sugEn || it.sugZh;
    return [it.sugZh, it.sugEn].filter(Boolean).join("\n\n");
  }
  const SUG_HDR = lang => lang === "zh" ? "建議修正條文" : lang === "en" ? "Proposed Clause Wording" : "建議修正條文 Proposed Clause";

  // ───────── 回覆語言 ─────────
  function isMostlyCJK(s) { const t = str(s).replace(/\s/g, ""); if (!t) return true; const c = (t.match(/[一-鿿]/g) || []).length; return c / t.length > 0.25; }
  // auto：逐項依廠商原文語言回覆；整份都同一語言時表頭也只用該語言
  function resolveLang(lang, items) { if (lang !== "auto") return lang; const zh = items.filter(i => isMostlyCJK(i.text)).length; return zh === items.length ? "zh" : zh === 0 ? "en" : "auto"; }
  function replyText(it, lang) {
    if (lang === "auto") lang = isMostlyCJK(it.text) ? "zh" : "en";
    if (lang === "zh") return it.zh || it.en || "";
    if (lang === "en") return it.en || it.zh || "";
    return [it.zh, it.en].filter(Boolean).join("\n\n");
  }

  // ───────── 規則（Master＋待核） ─────────
  const BOTTOM = ["底線_可接受", "底線_需升級", "底線_不可接受"];
  function effectiveClause(master, pending, id) {
    const base = master.clauses.find(c => c.條款ID === id);
    if (!base) return null;
    const c = Object.assign({}, base, { 待核: [] });
    const props = master.proposals.filter(p => !p.決議 && p.條款ID === id).map(p => ({ field: p.欄位, value: p.建議內容, by: p.提案人, from: "提案區" }))
      .concat((pending || []).filter(p => p.clauseId === id).map(p => ({ field: p.field, value: p.newVal, by: p.by, from: "本機" })));
    for (const p of props) c.待核.push(p);
    return c;
  }
  function pastReplies(master, id, n) {
    return master.logs.filter(l => l.條款ID === id && (l.最終回覆_中 || l.最終回覆_EN)).slice(-n || -3)
      .map(l => ({ stance: l.立場, dev: Core.clip(l.廠商Deviation摘要, 120), zh: l.最終回覆_中, en: l.最終回覆_EN }));
  }
  function clauseBlock(c, master, sendBottom) {
    const L = [`【條款 ${c.條款ID}｜${c.條款名稱}】`];
    if (c.我方標準條款_中 || c.我方標準條款_EN) L.push(`我方標準條款：${c.我方標準條款_中}${c.我方標準條款_EN ? " / " + c.我方標準條款_EN : ""}`);
    if (sendBottom) {
      L.push(`內部底線（機密，只供你判斷，絕不可寫進回覆）${c.狀態 !== "有效" ? "〔尚未經主管核定〕" : ""}：`);
      L.push(`  可接受：${c.底線_可接受 || "—"}`); L.push(`  需升級（${c.升級對象 || "主管"}核准）：${c.底線_需升級 || "—"}`); L.push(`  不可接受：${c.底線_不可接受 || "—"}`);
    }
    if (c.慣用回覆_中 || c.慣用回覆_EN) L.push(`慣用回覆範例：${c.慣用回覆_中}${c.慣用回覆_EN ? " / " + c.慣用回覆_EN : ""}`);
    const pend = c.待核.filter(p => sendBottom || !BOTTOM.includes(p.field));
    if (pend.length) { L.push("同仁回饋的新規則（待主管核定，但請優先遵循）："); pend.forEach(p => L.push(`  - ${p.field}：${p.value}`)); }
    const past = pastReplies(master, c.條款ID, 3);
    if (past.length) { L.push("過往實際回覆（經驗）："); past.forEach(p => L.push(`  - 廠商：${p.dev}｜立場：${p.stance}｜回覆：${p.zh || p.en}`)); }
    return L.join("\n");
  }

  const STANCES = ["接受", "有條件接受", "拒絕維持原條款", "需升級"];
  const DRAFT_SYSTEM = [
    "你是台灣 EPC 工程統包商（買方，中鼎）的資深採購合約專員，負責回覆供應商／分包商提出的商務條款異議（deviation）。",
    "做法：",
    "1. 先判斷每筆異議對應哪個條款，對照「內部底線」決定我方立場：落在『可接受』→ 接受或有條件接受；落在『需升級』→ 需升級（回覆先維持原條款或請廠商說明，不得承諾）；落在『不可接受』或無法判斷→ 拒絕維持原條款。",
    "2. 「同仁回饋的新規則」代表使用者最新的判斷，與底線衝突時以新規則為準。",
    "3. 回覆參考慣用範例與過往實際回覆的語氣與論點，但要具體回應該筆異議。絕不可在回覆中透露內部底線、可讓步空間或內部核准流程。",
    "4. 不得自行新增底線以外的數字、期限或承諾。",
    "5. 中文用台灣商務書信用語（繁體），英文用正式合約書信英文，中英意思一致；每版 1–4 句，可直接貼入澄清表，不要稱謂署名。",
    "6. 文中〔類別NN〕代號為已遮蔽的機密資訊，必須原樣保留。",
    "7. 若沒有任何相關條款規則（規則庫尚在累積中），依台灣工程統包商買方的一般立場：原則維持我方原條款、請廠商說明理由，不自行讓步；並在 clauseName 給一個簡短條款名稱（如：付款條件、逾期罰款、保固）。",
    "8. 判斷依據的優先順序：使用者新規則 > 內部底線 > 中鼎 PO 慣例 > 工程會範本（國內公共工程慣例）＞ FIDIC（國際慣例，較平衡）。「制式條款參考」用來判斷廠商要求是否超出國內外慣例、決定讓步是否合理，並作為擬稿寫法的範本。",
    "9. 「制式條款參考」只供內部判斷，回覆中絕不可提及 FIDIC、紅皮書、銀皮書、工程會、範本、條號或「國際慣例」等出處。",
    "10. 只有立場為『有條件接受』時，另外給 sugZh／sugEn：可直接放入合約的修正條文（中英各一段，比照制式條款的結構與用語：主體、期限或比例、條件、例外；不得超出底線），其他立場留空字串。",
    "11. topicId 填最相關的制式條款主題ID（如 T02），沒有就空字串。",
    `輸出：僅輸出 JSON：{"items":[{"no":"項次","clauseId":"條款ID或空字串","clauseName":"條款名稱","topicId":"T01–T16 或空字串","stance":"${STANCES.join("|")}","bottom":"可接受|需升級|不可接受|無對應","zh":"中文回覆","en":"English reply","sugZh":"建議修正條文（僅有條件接受）","sugEn":"Proposed clause (conditional acceptance only)","reason":"給承辦看的一句判斷理由（中文，可提及底線與所參考的制式條款）"}]}`,
  ].join("\n");

  const REVISE_SYSTEM = [
    "你是台灣 EPC 工程統包商（買方）的資深採購合約專員。使用者對你先前草擬的異議回覆提出意見，請依意見改寫，並判斷這個意見能否一般化成以後可沿用的規則。",
    "改寫規則同前：不可在回覆透露內部底線；回覆中不得提及 FIDIC、工程會、範本、條號等出處（制式條款只供內部判斷）；中文台灣商務用語、英文正式；中英一致；〔類別NN〕代號原樣保留。",
    "立場為『有條件接受』時，給 sugZh／sugEn：比照制式條款寫法、可直接放入合約的修正條文；其他立場留空字串。",
    "規則的 topicId 填最相關的制式條款主題ID（如 T02），讓規則依主題歸類；clauseName 優先使用該主題名稱。",
    "規則萃取：若使用者的意見表達了可一般化的原則（例如『付款天期最多同意 60 天』『保固可同意交貨後 18 個月孰先』『這類要求一律拒絕』），請轉成一條規則；",
    "field 只能是：底線_可接受、底線_需升級、底線_不可接受、慣用回覆_中、慣用回覆_EN；若只是針對這一案的措辭修改（如『語氣軟一點』），rule 為 null。",
    "若規則庫沒有對應條款，clauseId 留空，並給 clauseName（簡短條款名稱）、category（付款／保證／保固／罰則／責任／價格／交貨／保險／終止／變更／爭議／其他）與 keywords（中英文關鍵字 4–8 個，分號分隔，供日後自動比對）。",
    "value 要寫成可直接放進規則庫的完整一句話，不要包含〔代號〕或個案名稱。",
    `輸出：僅輸出 JSON：{"stance":"${STANCES.join("|")}","bottom":"可接受|需升級|不可接受|無對應","zh":"…","en":"…","sugZh":"…或空字串","sugEn":"…或空字串","topicId":"…","reason":"一句說明","rule":{"clauseId":"條款ID或空字串","topicId":"T01–T16 或空字串","clauseName":"…","category":"…","keywords":"…","field":"…","value":"…","summary":"一句話描述這條規則"}或null}`,
  ].join("\n");

  const SPLIT_SYSTEM = [
    "你是文件整理員。使用者給你一份廠商對合約／詢價條件提出的異議或偏離清單（可能是文字或掃描影像），請拆成逐項清單。",
    "規則：每項保留廠商原文（不得改寫、翻譯、摘要）；有項次或條次就照抄；看不清楚的字以〔?〕代替；表頭、頁首頁尾、簽名、公司抬頭不要列入。",
    "文中〔類別NN〕代號原樣保留。",
    '輸出：僅輸出 JSON：{"items":[{"no":"項次","ref":"廠商引用的條次（沒有就空字串）","text":"異議原文"}]}',
  ].join("\n");

  const REF_HEAD = "【制式條款參考（只供內部判斷與擬稿，回覆中不得提及出處）】";
  function refsText(refs, docKind) { return refs && refs.length ? [REF_HEAD, refs.map(s => Ref.block(s, docKind)).join("\n")].join("\n") : ""; }
  function draftUserText(items, clauseIds, master, pending, sendBottom, refs, docKind) {
    const blocks = [...new Set(clauseIds.filter(Boolean))].map(id => effectiveClause(master, pending, id)).filter(Boolean).map(c => clauseBlock(c, master, sendBottom));
    const L = ["【相關條款規則】", blocks.length ? blocks.join("\n\n") : "（未比對到條款，請依一般採購買方立場判斷並將 clauseId 留空）", "", "【條款清單（供 clauseId 參考）】",
      master.clauses.filter(c => c.狀態 !== "停用").map(c => `${c.條款ID} ${c.條款名稱}`).join("；"), "", "【廠商異議】"];
    for (const it of items) L.push(`(${it.no})${it.ref ? "［條次 " + it.ref + "］" : ""}${it.hint ? "［本機比對：" + it.hint + "］" : ""}${it.topics && it.topics.length ? "［制式主題：" + it.topics.join("/") + "］" : ""} ${it.text}`);
    const rt = refsText(refs, docKind);
    if (rt) L.unshift(rt, "");
    return L.join("\n");
  }
  function reviseUserText(it, feedback, master, pending, sendBottom, refs, docKind) {
    const c = it.clauseId ? effectiveClause(master, pending, it.clauseId) : null;
    return [refsText(refs, docKind), c ? clauseBlock(c, master, sendBottom) : "【條款】未對應", "", `【廠商異議】(${it.no}) ${it.text}`, "",
      `【你先前的回覆】立場：${it.stance}\n中：${it.zh}\nEN：${it.en}${it.sugZh || it.sugEn ? `\n建議修正條文：${it.sugZh} / ${it.sugEn}` : ""}`, "", `【使用者意見】${feedback}`].filter(x => x !== null).join("\n");
  }

  function parseJSON(text) {
    let s = str(text).replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    return JSON.parse(s);
  }
  function geminiBody(system, parts, temperature) {
    return { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }],
      generationConfig: { temperature: temperature ?? 0.3, responseMimeType: "application/json" } };
  }

  // 底線洩漏檢查：回覆中出現底線裡的數字，但廠商原文沒有 → 示警
  function bottomLeak(it, clause) {
    if (!clause) return [];
    const nums = new Set();
    for (const f of BOTTOM) (str(clause[f]).match(/\d+(?:\.\d+)?\s*(?:%|％|日|天|個月|月|年|萬|倍)/g) || []).forEach(n => nums.add(n.replace(/\s/g, "")));
    for (const p of clause.待核 || []) if (BOTTOM.includes(p.field)) (str(p.value).match(/\d+(?:\.\d+)?\s*(?:%|％|日|天|個月|月|年|萬|倍)/g) || []).forEach(n => nums.add(n.replace(/\s/g, "")));
    const reply = (str(it.zh) + str(it.en)).replace(/\s/g, ""), dev = str(it.text).replace(/\s/g, "");
    return [...nums].filter(n => reply.includes(n) && !dev.includes(n));
  }

  const EMPTY_MASTER = () => ({ clauses: [], proposals: [], logs: [], dict: [], changes: [] });

  // 規則檔內的「制式條款參考」工作表：可在 Excel 中修正或貼上正式版本原文，工具讀取後覆寫內建參考庫
  const REF_SHEET = "制式條款參考";
  function addRefSheet(wb, HDR, list) {
    if (wb.getWorksheet(REF_SHEET)) return false;
    const ws = wb.addWorksheet(REF_SHEET, { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
    ws.addRow(Ref.COLS).eachCell(c => Object.assign(c, { style: JSON.parse(JSON.stringify(HDR || { font: { bold: true } })) }));
    [8, 12, 18, 30, 50, 50, 50, 50, 40, 40].forEach((w, i) => ws.getColumn(i + 1).width = w);
    for (const r of Ref.toRows(list || Ref.STANDARDS)) ws.addRow(r).eachCell(c => c.alignment = { wrapText: true, vertical: "top" });
    ws.getCell(`A${ws.rowCount + 2}`).value = `內建版本 ${Ref.VERSION}；FIDIC 欄為摘要（原文受著作權保護），「【待查證】」表示未能核對該版本原文。可直接修改或貼上正式原文，工具會以本表為準。`;
    return true;
  }
  function readRefSheet(XLSX, data) {
    try {
      const isBuf = typeof Buffer !== "undefined" && Buffer.isBuffer(data);
      const wb = XLSX.read(isBuf ? data : new Uint8Array(data), { type: isBuf ? "buffer" : "array" });
      const ws = wb.Sheets[REF_SHEET]; if (!ws) return null;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).slice(1).filter(r => /^T?\w+\d/.test(String(r[0])) && r[2]);
      return Ref.fromRows(rows);
    } catch (e) { return null; }
  }

  // 從零建立規則檔（欄位與「商務條款底線 MasterFile」一致）
  async function buildNewMaster(ExcelJS, { clauses, logs, dict }) {
    const wb = new ExcelJS.Workbook();
    const HDR = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8710A" } }, alignment: { horizontal: "center", vertical: "middle", wrapText: true } };
    const guide = wb.addWorksheet("說明");
    [["商務條款底線規則檔"], ["由「廠商異議回覆台」依使用者回饋累積產生；請放 SharePoint 共用資料夾。"], ["條款庫", "AI 依使用者意見歸納的條款與底線。新條款狀態為「待核」，主管每月 review 核定後改為「有效」。"],
      ["提案區", "對既有條款的修改建議（待核）；主管在「決議／決議日」填寫核准、修正後核准、退回或延至下月。"], ["回覆紀錄", "每次產出完稿的實際回覆，作為 AI 的經驗範例與月度統計。"], ["詞庫", "去識別化用的機密詞（廠商名、人名、專案名）。本表本身即為機密清單。"],
      ["欄名", "各表第一列欄名為工具讀取依據，請勿更名或刪除。"]].forEach((r, i) => { const row = guide.addRow(r); if (i === 0) row.font = { bold: true, size: 16, color: { argb: "FFE8710A" } }; else row.getCell(1).font = { bold: true }; });
    guide.getColumn(1).width = 14; guide.getColumn(2).width = 100;
    const widths = { 條款庫: [12, 10, 16, 30, 40, 40, 32, 32, 32, 14, 45, 45, 10, 7, 10, 12, 13, 24], 提案區: [22, 12, 10, 12, 14, 16, 36, 40, 34, 12, 30, 12], 回覆紀錄: [24, 12, 10, 12, 16, 12, 40, 14, 45, 45, 12, 12, 24], 詞庫: [10, 30, 10, 12], 變更紀錄: [10, 12, 16, 40, 40, 14, 10] };
    const lists = { 條款庫: { M: ["有效", "待核", "範例待核", "停用"] }, 提案區: { D: ["新增條款", "修改內容", "新增範例", "停用條款"], J: ["核准", "修正後核准", "退回", "延至下月"] }, 回覆紀錄: { K: ["是", "否"] }, 詞庫: { A: Deid.TYPES } };
    const data = { 條款庫: (clauses || []).map(c => Core.SCHEMA.條款庫.map(k => c[k] || "")), 提案區: [], 回覆紀錄: logs || [], 詞庫: dict || [], 變更紀錄: [] };
    addRefSheet(wb, HDR);
    for (const name of ["條款庫", "提案區", "回覆紀錄", "詞庫", "變更紀錄"]) {
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
      ws.addRow(Core.SCHEMA[name]).eachCell(c => Object.assign(c, { style: JSON.parse(JSON.stringify(HDR)) }));
      ws.getRow(1).height = 30;
      widths[name].forEach((w, i) => ws.getColumn(i + 1).width = w);
      for (const r of data[name]) ws.addRow(r).eachCell(c => c.alignment = { wrapText: true, vertical: "top" });
      for (const [col, items] of Object.entries(lists[name] || {})) ws.dataValidations.add(`${col}2:${col}2000`, { type: "list", allowBlank: true, formulae: ['"' + items.join(",") + '"'] });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Core.SCHEMA[name].length } };
    }
    wb.views = [{ activeTab: 1 }];
    return wb.xlsx.writeBuffer();
  }

  // ───────── 規則檔存回（ExcelJS，保留格式與下拉選單） ─────────
  async function mergeIntoMaster(ExcelJS, buf, { clauses, proposals, logs, dict }) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const res = { clauses: 0, proposals: 0, logs: 0, dict: 0, skipped: 0 };
    const append = (sheetName, rows, key, counter) => {
      const ws = wb.getWorksheet(sheetName); if (!ws) throw new Error(`規則檔缺少工作表「${sheetName}」`);
      const have = new Set(); ws.eachRow((row, n) => { if (n > 1) have.add(str(row.getCell(key).value)); });
      let last = 1; ws.eachRow((row, n) => { if (row.values.some(v => str(v))) last = n; });
      for (const r of rows) {
        const k = str(r[key - 1]);
        if (k && have.has(k)) { res.skipped++; continue; }
        last++; const row = ws.getRow(last);
        r.forEach((v, i) => { row.getCell(i + 1).value = v; row.getCell(i + 1).alignment = { wrapText: true, vertical: "top" }; });
        row.commit(); have.add(k); res[counter]++;
      }
    };
    res.refAdded = addRefSheet(wb, { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8710A" } }, alignment: { horizontal: "center", vertical: "middle", wrapText: true } });
    append("條款庫", (clauses || []).map(c => Core.SCHEMA.條款庫.map(k => c[k] || "")), 1, "clauses");
    append("提案區", proposals || [], 1, "proposals");
    append("回覆紀錄", logs || [], 1, "logs");
    append("詞庫", dict || [], 2, "dict");
    return { buf: await wb.xlsx.writeBuffer(), res };
  }

  const Engine = { str, detectColumns, rowsToItems, ingestExcel, writeExcelSame, ingestDocx, writeDocxSame, writeClarification, resolveLang, replyText, isMostlyCJK,
    effectiveClause, clauseBlock, EMPTY_MASTER, buildNewMaster, suggestText, readRefSheet, REF_SHEET, pastReplies, draftUserText, reviseUserText, parseJSON, geminiBody, bottomLeak, mergeIntoMaster,
    DRAFT_SYSTEM, REVISE_SYSTEM, SPLIT_SYSTEM, STANCES, BOTTOM };
  if (typeof module !== "undefined" && module.exports) module.exports = Engine; else root.Engine = Engine;
})(typeof window !== "undefined" ? window : globalThis);
