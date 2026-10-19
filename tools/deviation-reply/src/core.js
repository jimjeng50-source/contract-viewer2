/* core.js — 條款回覆工作台核心邏輯（瀏覽器與 Node 通用；XLSX / PptxGenJS 由呼叫端注入） */
(function (root) {
  "use strict";
  const Deid = root.Deid || (typeof require !== "undefined" ? require("./deid.js") : null);

  const SCHEMA = {
    條款庫: ["條款ID", "類別", "條款名稱", "關鍵字", "我方標準條款_中", "我方標準條款_EN", "底線_可接受", "底線_需升級", "底線_不可接受", "升級對象", "慣用回覆_中", "慣用回覆_EN", "狀態", "版本", "核准人", "核准日", "下次Review日", "備註"],
    提案區: ["提案ID", "提案日", "提案人", "類型", "條款ID", "欄位", "原內容", "建議內容", "理由與案例", "決議", "決議說明", "決議日"],
    回覆紀錄: ["紀錄ID", "日期", "承辦", "專案代號", "廠商", "條款ID", "廠商Deviation摘要", "立場", "最終回覆_中", "最終回覆_EN", "是否超出底線", "升級核准人", "備註"],
    詞庫: ["類別", "詞", "新增人", "新增日"],
    變更紀錄: ["月份", "條款ID", "欄位", "舊內容", "新內容", "依據提案ID", "核准人"],
  };
  const REQUIRED = { 條款庫: ["條款ID", "條款名稱", "關鍵字", "底線_可接受", "底線_需升級", "底線_不可接受", "慣用回覆_中", "狀態"] };
  const STANCES = ["接受", "有條件接受", "拒絕維持原條款", "升級待決"];
  const APPROVED = ["核准", "修正後核准"];
  // 不參與比對、也不會送出的欄位（底線一律不出門）
  const NEVER_SEND = ["底線_可接受", "底線_需升級", "底線_不可接受", "升級對象", "核准人"];

  // ---------- 共用 ----------
  const pad = n => String(n).padStart(2, "0");
  function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function normDate(v) {
    if (v === null || v === undefined || v === "") return "";
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    const s = String(v).trim();
    const m = s.match(/^(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    const r = s.match(/^(\d{2,3})[\/.](\d{1,2})[\/.](\d{1,2})$/); // 民國
    if (r) return `${+r[1] + 1911}-${pad(r[2])}-${pad(r[3])}`;
    return s;
  }
  const str = v => (v === null || v === undefined ? "" : v instanceof Date ? normDate(v) : String(v).trim());
  function monthEnd(month) { const [y, m] = month.split("-").map(Number); const d = new Date(y, m, 0); return `${y}-${pad(m)}-${pad(d.getDate())}`; }
  function inMonth(date, month) { return normDate(date).startsWith(month); }
  function tsv(rows) { return rows.map(r => r.map(c => str(c).replace(/\t/g, " ").replace(/\r?\n/g, " ⏎ ")).join("\t")).join("\n"); }
  // 貼進 Excel 時保留儲存格內換行：用引號包住含換行的儲存格
  function tsvExcel(rows) { return rows.map(r => r.map(c => { const s = str(c).replace(/\t/g, " "); return /[\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join("\t")).join("\r\n"); }
  function clip(s, n) { s = str(s).replace(/\s+/g, " "); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // ---------- 讀 Master ----------
  function sheetRows(XLSX, wb, name) {
    const ws = wb.Sheets[name];
    if (!ws) return null;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
    return rows.map(r => { const o = {}; for (const k of Object.keys(r)) o[k.trim()] = r[k] instanceof Date ? normDate(r[k]) : r[k]; return o; })
      .filter(r => Object.values(r).some(v => str(v) !== ""));
  }
  function parseMaster(XLSX, data) {
    const isBuf = typeof Buffer !== "undefined" && Buffer.isBuffer(data);
    const wb = XLSX.read(isBuf ? data : new Uint8Array(data), { type: isBuf ? "buffer" : "array", cellDates: true });
    const out = { clauses: [], proposals: [], logs: [], dict: [], changes: [], warnings: [], errors: [] };
    const need = ["條款庫", "提案區", "回覆紀錄", "詞庫"];
    for (const n of need) if (!wb.Sheets[n]) out.errors.push(`找不到工作表「${n}」`);
    if (out.errors.length) return out;
    const c = sheetRows(XLSX, wb, "條款庫");
    const hdr = Object.keys((XLSX.utils.sheet_to_json(wb.Sheets["條款庫"], { header: 1 })[0] || []).reduce((a, k) => (a[str(k)] = 1, a), {}));
    for (const k of REQUIRED.條款庫) if (!hdr.includes(k)) out.errors.push(`條款庫缺少欄位「${k}」`);
    if (out.errors.length) return out;
    const ids = new Set();
    out.clauses = c.map(r => { const o = {}; for (const k of SCHEMA.條款庫) o[k] = str(r[k]); return o; }).filter(r => r.條款ID);
    for (const r of out.clauses) { if (ids.has(r.條款ID)) out.warnings.push(`條款ID 重複：${r.條款ID}`); ids.add(r.條款ID); }
    out.proposals = (sheetRows(XLSX, wb, "提案區") || []).map(r => { const o = {}; for (const k of SCHEMA.提案區) o[k] = ["提案日", "決議日"].includes(k) ? normDate(r[k]) : str(r[k]); return o; });
    out.logs = (sheetRows(XLSX, wb, "回覆紀錄") || []).map(r => { const o = {}; for (const k of SCHEMA.回覆紀錄) o[k] = k === "日期" ? normDate(r[k]) : str(r[k]); return o; });
    out.dict = (sheetRows(XLSX, wb, "詞庫") || []).map(r => ({ type: Deid.TYPES.includes(str(r["類別"])) ? str(r["類別"]) : "機密", value: str(r["詞"]) })).filter(d => d.value.length >= 2);
    out.changes = (sheetRows(XLSX, wb, "變更紀錄") || []).map(r => { const o = {}; for (const k of SCHEMA.變更紀錄) o[k] = str(r[k]); return o; });
    for (const r of out.clauses) {
      r.下次Review日 = normDate(r.下次Review日); r.核准日 = normDate(r.核准日);
      if (!["有效", "範例待核", "待核", "停用"].includes(r.狀態)) out.warnings.push(`${r.條款ID} 狀態「${r.狀態 || "空白"}」不在清單內，視為範例待核`);
    }
    return out;
  }

  // ---------- 條款比對（純本機） ----------
  function keywords(clause) { return str(clause.關鍵字).split(/[;；,，、\n]/).map(s => s.trim()).filter(s => s.length >= 2); }
  function matchClauses(text, clauses, top) {
    const t = str(text).toLowerCase();
    const res = [];
    for (const c of clauses) {
      if (c.狀態 === "停用") continue;
      const hits = [];
      let score = 0;
      for (const k of keywords(c)) {
        const kl = k.toLowerCase();
        const isAscii = /^[\x00-\x7f]+$/.test(kl);
        const hit = isAscii ? new RegExp(`(^|[^a-z])${kl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t) : t.includes(kl);
        if (hit) { hits.push(k); score += Math.min(kl.length, 8); }
      }
      if (str(c.條款名稱) && t.includes(c.條款名稱.toLowerCase())) score += 10;
      if (score) res.push({ id: c.條款ID, name: c.條款名稱, score, hits });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, top || 3);
  }

  // ---------- 偏離清單解析 ----------
  function parseDeviations(raw) {
    raw = str(raw).replace(/\r/g, "");
    if (!raw) return [];
    const items = [];
    if (raw.includes("\t")) {
      for (const line of raw.split("\n")) {
        const cells = line.split("\t").map(s => s.trim());
        if (!cells.some(Boolean)) continue;
        if (/^(項次|no\.?|item|#)$/i.test(cells[0])) continue;
        const nonEmpty = cells.filter(Boolean);
        if (nonEmpty.length >= 3) items.push({ no: cells[0], ref: cells[1], text: cells.slice(2).filter(Boolean).join(" ") });
        else if (nonEmpty.length === 2) items.push({ no: nonEmpty[0], ref: "", text: nonEmpty[1] });
        else items.push({ no: "", ref: "", text: nonEmpty[0] });
      }
    } else if (/\n\s*\n/.test(raw)) {
      raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).forEach(s => items.push({ no: "", ref: "", text: s }));
    } else if ((raw.match(/^\s*(?:\d+[.)、．]|[（(]\d+[)）])/gm) || []).length >= 2) {
      let cur = null;
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*(?:(\d+)[.)、．]|[（(](\d+)[)）])\s*(.*)$/);
        if (m) { cur = { no: m[1] || m[2], ref: "", text: m[3] }; items.push(cur); }
        else if (cur && line.trim()) cur.text += "\n" + line.trim();
      }
    } else items.push({ no: "", ref: "", text: raw.trim() });
    return items.map((it, i) => ({ ...it, no: it.no || String(i + 1) }));
  }

  // ---------- 送 Gemini 的內容（預覽與送出共用同一函式） ----------
  const SYSTEM_PROMPT = [
    "你是台灣 EPC 工程統包商（買方）的資深採購合約專員，負責回覆供應商／分包商報價時提出的商務條款偏離（deviation）。",
    "原則：",
    "1. 嚴格依照使用者給定的「我方立場」撰寫；不得自行讓步、不得新增任何數字、期限、金額或承諾，也不得暗示可再讓步。",
    "2. 參考「慣用回覆範例」的語氣與論點，但需針對該筆偏離內容具體回應，不要照抄。",
    "3. 中文使用台灣商務書信用語（繁體中文），英文使用正式合約書信英文；中英文意思需一致。",
    "4. 每個版本 2–4 句，直接可貼入澄清表（clarification sheet），不要稱謂、不要署名、不要加引號。",
    "5. 文中〔類別NN〕代號為已遮蔽的機密資訊，必須原樣保留。",
    "輸出：僅輸出 JSON，格式為 {\"options\":[{\"style\":\"堅定\",\"zh\":\"…\",\"en\":\"…\",\"note\":\"給承辦的一句提醒（中文）\"},{\"style\":\"平衡\",…},{\"style\":\"柔性\",…}]}，三個版本語氣由堅定到柔性，但立場一致。",
  ].join("\n");

  function payloadText(item, clause) {
    const L = [];
    L.push("【任務】請為下列供應商偏離撰寫我方回覆。");
    L.push(`【我方立場】${item.stance || "（未指定）"}${item.stanceNote ? "；補充：" + item.stanceNote : ""}`);
    if (clause) {
      L.push(`【條款】${clause.條款名稱}（${clause.類別 || "商務"}）`);
      if (clause.我方標準條款_中 || clause.我方標準條款_EN) L.push(`【我方標準條款】\n中：${clause.我方標準條款_中}\nEN：${clause.我方標準條款_EN}`);
      if (clause.慣用回覆_中 || clause.慣用回覆_EN) L.push(`【慣用回覆範例】\n中：${clause.慣用回覆_中}\nEN：${clause.慣用回覆_EN}`);
    } else L.push("【條款】未對應到條款庫，請依偏離內容判斷。");
    L.push(`【供應商偏離內容】${item.ref ? "（引用條次：" + item.ref + "）" : ""}\n${item.text}`);
    return L.join("\n\n");
  }

  // 批次遮罩：同一批次共用一組 terms，代號一致
  function prepareBatch(items, clauseById, dict, extraTerms) {
    const raw = items.map(it => payloadText(it, clauseById[it.clauseId]));
    const all = raw.join("\n\n=====\n\n");
    let terms = Deid.buildTerms(all, { dict });
    for (const t of extraTerms || []) Deid.addTerm(terms, all, t.value, t.type);
    return { raw, all, terms };
  }
  function maskBatch(batch) {
    const { text, map, leaked } = Deid.mask(batch.raw.join("\n\n=====\n\n"), batch.terms);
    const parts = text.split("\n\n=====\n\n");
    return { parts: parts.map(p => p + Deid.PROMPT_NOTE), map, leaked, residual: Deid.residual(text) };
  }
  function requestBody(maskedUser, temperature) {
    return {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: maskedUser }] }],
      generationConfig: { temperature: temperature === undefined ? 0.4 : temperature, responseMimeType: "application/json" },
    };
  }

  // ---------- Gemini API ----------
  const API = "https://generativelanguage.googleapis.com/v1beta";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function callGemini({ key, model, body, fetchFn, onRetry }) {
    const f = fetchFn || fetch;
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await f(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const cand = (j.candidates || [])[0];
        const text = cand && cand.content && (cand.content.parts || []).map(p => p.text || "").join("");
        if (!text) throw new Error(`Gemini 未回傳內容（${(cand && cand.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || "未知原因"}）`);
        return text;
      }
      const msg = (j.error && j.error.message) || res.statusText;
      last = new Error(`Gemini ${res.status}：${msg}`);
      if (res.status === 404) throw new Error(`找不到模型「${model}」。請到「設定」按「載入可用模型」重新選擇。`);
      if (res.status === 400 && /API key/i.test(msg)) throw new Error("API Key 無效，請到「設定」重新貼上。");
      if (res.status === 429 || res.status >= 500) {
        let wait = 15000 * (attempt + 1);
        const ri = ((j.error && j.error.details) || []).find(d => d.retryDelay);
        if (ri) wait = Math.max(wait, parseFloat(ri.retryDelay) * 1000 + 1000);
        if (onRetry) onRetry(attempt + 1, wait, res.status);
        await sleep(wait); continue;
      }
      throw last;
    }
    throw last;
  }
  async function listModels({ key, fetchFn }) {
    const f = fetchFn || fetch;
    const res = await f(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    const j = await res.json();
    if (!res.ok) throw new Error((j.error && j.error.message) || res.statusText);
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, "")).filter(n => /gemini/i.test(n)).sort();
  }
  function parseOptions(text) {
    let s = str(text).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    const j = JSON.parse(s);
    const arr = Array.isArray(j) ? j : j.options;
    if (!Array.isArray(arr) || !arr.length) throw new Error("回覆格式不符（缺 options）");
    return arr.slice(0, 3).map(o => ({ style: str(o.style), zh: str(o.zh), en: str(o.en), note: str(o.note) }));
  }

  // ---------- 匯出：回覆表、回覆紀錄、提案 ----------
  function replySheetRows(items, clauseById) {
    const rows = [["項次", "廠商引用條次", "條款", "廠商偏離內容 Vendor Deviation", "我方回覆 Our Response (EN)", "我方回覆（中文）"]];
    for (const it of items) rows.push([it.no, it.ref, (clauseById[it.clauseId] || {}).條款名稱 || "", it.text, it.finalEn, it.finalZh]);
    return rows;
  }
  function logRows(items, ctx) {
    const d = today().replace(/-/g, "");
    return items.map((it, i) => [`R${d}-${(ctx.user || "X").slice(0, 3)}-${pad(i + 1)}`, today(), ctx.user || "", ctx.project || "", ctx.vendor || "",
      it.clauseId || "", clip(it.text, 120), it.stance || "", it.finalZh || "", it.finalEn || "", it.overBottom ? "是" : "否", it.approver || "", ""]);
  }
  function proposalRow(p, ctx) {
    return [p.id || `P${today().replace(/-/g, "")}-${(ctx.user || "X").slice(0, 3)}-${pad(ctx.seq || 1)}`, today(), ctx.user || "", p.type, p.clauseId, p.field, p.oldVal || "", p.newVal || "", p.reason || "", "", "", ""];
  }

  // ---------- 月度 Review ----------
  function diffClauses(prev, curr) {
    const P = new Map((prev || []).map(r => [r.條款ID, r])), C = new Map(curr.map(r => [r.條款ID, r]));
    const out = [];
    for (const [id, c] of C) {
      const p = P.get(id);
      if (!p) { out.push({ id, name: c.條款名稱, kind: "新增", field: "（整列）", before: "", after: c.條款名稱 }); continue; }
      for (const f of SCHEMA.條款庫) if (f !== "條款ID" && str(p[f]) !== str(c[f])) out.push({ id, name: c.條款名稱, kind: f === "狀態" && c.狀態 === "停用" ? "停用" : "修改", field: f, before: str(p[f]), after: str(c[f]) });
    }
    for (const [id, p] of P) if (!C.has(id)) out.push({ id, name: p.條款名稱, kind: "刪除", field: "（整列）", before: p.條款名稱, after: "" });
    return out;
  }
  function monthlyReview({ prev, curr, month, dept }) {
    const diffs = prev ? diffClauses(prev.clauses, curr.clauses) : [];
    const approved = curr.proposals.filter(p => APPROVED.includes(p.決議));
    const BOOKKEEPING = ["版本", "核准人", "核准日", "下次Review日"];
    for (const d of diffs) {
      const hit = approved.find(p => p.條款ID === d.id && (!p.欄位 || p.欄位 === d.field || d.field === "（整列）" || p.類型 === "停用條款" && d.field === "狀態"));
      d.basis = hit ? hit.提案ID : "";
      d.authorized = !!hit || (BOOKKEEPING.includes(d.field) && diffs.some(x => x.id === d.id && !BOOKKEEPING.includes(x.field)));
    }
    // 只有簿記欄位變動、其他欄位未動 → 也視為需確認
    for (const d of diffs) if (BOOKKEEPING.includes(d.field) && !d.basis) d.authorized = diffs.some(x => x.id === d.id && !BOOKKEEPING.includes(x.field) && x.authorized);
    const pending = curr.proposals.filter(p => !str(p.決議) || p.決議 === "延至下月");
    const decided = curr.proposals.filter(p => str(p.決議) && p.決議 !== "延至下月" && inMonth(p.決議日, month));
    const logs = curr.logs.filter(l => inMonth(l.日期, month));
    const byClause = {};
    for (const l of logs) { const k = l.條款ID || "（未對應）"; (byClause[k] = byClause[k] || { id: k, n: 0, over: 0 }).n++; if (l.是否超出底線 === "是") byClause[k].over++; }
    const cname = id => (curr.clauses.find(c => c.條款ID === id) || {}).條款名稱 || id;
    const clauseStats = Object.values(byClause).map(x => ({ ...x, name: cname(x.id), pct: logs.length ? Math.round(x.n / logs.length * 100) : 0 })).sort((a, b) => b.n - a.n);
    const byStance = {}, byUser = {};
    for (const l of logs) { byStance[l.立場 || "（空白）"] = (byStance[l.立場 || "（空白）"] || 0) + 1; byUser[l.承辦 || "（空白）"] = (byUser[l.承辦 || "（空白）"] || 0) + 1; }
    const end = monthEnd(month);
    const due = curr.clauses.filter(c => c.狀態 !== "停用" && c.下次Review日 && c.下次Review日 <= end);
    const draft = curr.clauses.filter(c => c.狀態 === "範例待核" || !["有效", "範例待核", "停用"].includes(c.狀態));
    return {
      month, dept: dept || "", hasPrev: !!prev, diffs, unauthorized: diffs.filter(d => !d.authorized), pending, decided, logs,
      over: logs.filter(l => l.是否超出底線 === "是").length, clauseStats, byStance, byUser, due, draft,
      clauseCount: curr.clauses.length, activeCount: curr.clauses.filter(c => c.狀態 === "有效").length, cname,
    };
  }

  function reviewWorkbook(XLSX, R) {
    const wb = XLSX.utils.book_new();
    const add = (name, rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = (widths || []).map(w => ({ wch: w })); if (rows.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: rows[0].length - 1 } }) }; XLSX.utils.book_append_sheet(wb, ws, name); };
    add("摘要", [["項目", "數值", "說明"],
      ["檢討月份", R.month, ""], ["條款總數", R.clauseCount, `其中有效 ${R.activeCount} 條`],
      ["本月回覆件數", R.logs.length, "回覆紀錄中日期落在本月者"], ["超出底線件數", R.over, "是否超出底線＝是"],
      ["條款變更項數", R.diffs.length, R.hasPrev ? "與上月快照比對" : "未載入上月快照，未比對"],
      ["未經核准變更", R.unauthorized.length, "條款庫有變動但找不到核准提案"],
      ["待決提案", R.pending.length, "決議空白或延至下月"], ["本月已決議提案", R.decided.length, ""],
      ["到期需 Review 條款", R.due.length, `下次Review日 ≤ ${monthEnd(R.month)}`], ["範例待核條款", R.draft.length, "底線尚未經主管核定"],
      ["產出時間", new Date().toLocaleString("zh-TW"), ""]], [20, 14, 40]);
    add("條款差異", [["條款ID", "條款名稱", "變更類型", "欄位", "上月內容", "本月內容", "依據提案ID", "是否經核准"],
      ...R.diffs.map(d => [d.id, d.name, d.kind, d.field, d.before, d.after, d.basis, d.authorized ? "是" : "否（請追認或還原）"])], [12, 16, 8, 16, 45, 45, 14, 16]);
    add("待決提案", [SCHEMA.提案區, ...R.pending.map(p => SCHEMA.提案區.map(k => p[k]))], [14, 12, 10, 10, 12, 16, 36, 40, 34, 10, 30, 12]);
    add("本月決議", [SCHEMA.提案區, ...R.decided.map(p => SCHEMA.提案區.map(k => p[k]))], [14, 12, 10, 10, 12, 16, 36, 40, 34, 10, 30, 12]);
    const st = [["條款ID", "條款名稱", "件數", "占比", "超出底線件數"], ...R.clauseStats.map(x => [x.id, x.name, x.n, x.pct + "%", x.over]), [], ["立場", "件數"], ...Object.entries(R.byStance), [], ["承辦", "件數"], ...Object.entries(R.byUser)];
    add("回覆統計", st, [14, 18, 8, 8, 12]);
    add("到期與待核", [["條款ID", "條款名稱", "狀態", "下次Review日", "原因"],
      ...R.due.map(c => [c.條款ID, c.條款名稱, c.狀態, c.下次Review日, "到期"]),
      ...R.draft.filter(c => !R.due.includes(c)).map(c => [c.條款ID, c.條款名稱, c.狀態, c.下次Review日, "範例待核"])], [12, 18, 10, 13, 10]);
    return wb;
  }

  // ---------- 簡報（clean-orange-deck 標準） ----------
  const O = "E8710A", K = "000000", G = "7F7F7F", LN = "D9D9D9", FONT = "Microsoft JhengHei";
  function fitTitle(cands) { for (const c of cands) if (c && c.length <= 18) return c; return clip(cands[cands.length - 1], 18); }
  function buildDeck(PptxGenJS, R) {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE"; pptx.title = `商務條款底線月度檢討 ${R.month}`; pptx.company = R.dept || "";
    const titles = []; let page = 1;
    const T = (s, opt) => s.addText(opt.text, Object.assign({ fontFace: FONT, color: K, margin: 0, fit: "none", valign: "top", align: "left" }, opt, { text: undefined }));
    const slide = (title, note, source) => {
      const s = pptx.addSlide(); s.background = { color: "FFFFFF" };
      const t = fitTitle(Array.isArray(title) ? title : [title]); titles.push(t);
      T(s, { text: t, x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 36, bold: true, color: O, valign: "middle" });
      page++; T(s, { text: String(page), x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 12, color: G, align: "right" });
      if (source) T(s, { text: source, x: 0.6, y: 7.0, w: 10, h: 0.3, fontSize: 12, color: G });
      if (note) s.addNotes(note);
      return s;
    };
    const table = (s, header, rows, colW, opts) => {
      opts = opts || {};
      const hb = [{ type: "none" }, { type: "none" }, { type: "solid", pt: 1.5, color: K }, { type: "none" }];
      const bb = [{ type: "none" }, { type: "none" }, { type: "solid", pt: 0.75, color: LN }, { type: "none" }];
      const data = [header.map(h => ({ text: h, options: { bold: true, color: O, border: hb } }))];
      rows.forEach((r, ri) => data.push(r.map((v, ci) => {
        const num = typeof v === "number" || /^-?[\d,.]+%?$/.test(String(v));
        const hot = (opts.hot || []).some(([a, b]) => a === ri && b === ci);
        return { text: String(v), options: { align: num ? "right" : "left", color: hot ? O : K, bold: hot, border: bb } };
      })));
      s.addTable(data, { x: 0.6, y: 1.7, w: 12.1, colW, rowH: 0.62, fontFace: FONT, fontSize: 18, valign: "middle", margin: [0.03, 0.1, 0.03, 0.1] });
    };
    const bigNums = (s, items) => {
      const w = 12.1 / items.length;
      items.forEach(([num, label, hot], i) => {
        T(s, { text: String(num), x: 0.6 + i * w, y: 2.2, w, h: 1.6, fontSize: 72, bold: true, color: O, align: "center", valign: "middle" });
        T(s, { text: label, x: 0.6 + i * w, y: 3.9, w, h: 0.8, fontSize: 20, align: "center" });
      });
    };
    const mm = R.month.split("-");
    const ym = `${mm[0]}年${+mm[1]}月`;

    // 1 封面
    const c = pptx.addSlide(); c.background = { color: "FFFFFF" };
    T(c, { text: "商務條款底線月度檢討", x: 0.6, y: 2.5, w: 12.1, h: 1.3, fontSize: 44, bold: true, color: O, valign: "middle" });
    T(c, { text: `${ym}${R.dept ? "｜" + R.dept : ""}`, x: 0.6, y: 3.9, w: 12.1, h: 0.7, fontSize: 24 });
    titles.push("（封面）");

    // 2 總覽
    const n = R.logs.length;
    let s = slide(n ? [`本月回覆${n}件，${R.over}件超出底線`, `本月回覆${n}件`] : ["本月尚無回覆紀錄"],
      `回覆件數依「回覆紀錄」日期統計。\n立場分布：${Object.entries(R.byStance).map(([k, v]) => `${k} ${v}`).join("、") || "無"}\n承辦分布：${Object.entries(R.byUser).map(([k, v]) => `${k} ${v}`).join("、") || "無"}`,
      "資料來源：Master File 回覆紀錄／提案區");
    bigNums(s, [[n, "本月回覆件數"], [R.over, "超出底線件數"], [R.pending.length, "待決提案"]]);

    // 3 最常被挑戰條款
    if (R.clauseStats.length) {
      const top = R.clauseStats[0];
      s = slide([`${top.name}最常被挑戰，占${top.pct}%`, `${top.name}最常被挑戰`, "最常被挑戰的條款前五名"],
        R.clauseStats.map((x, i) => `${i + 1}. ${x.id} ${x.name}：${x.n} 件（${x.pct}%），超出底線 ${x.over} 件`).join("\n"), "資料來源：回覆紀錄");
      const rows = R.clauseStats.slice(0, 5).map((x, i) => [i + 1, clip(x.name, 14), x.n, x.pct + "%", x.over]);
      table(s, ["排名", "條款", "件數", "占比", "超出底線"], rows, [1.4, 5.1, 1.8, 1.8, 2.0], { hot: rows.map((r, i) => (r[4] > 0 ? [i, 4] : null)).filter(Boolean) });
    }

    // 4 條款變更
    if (R.diffs.length) {
      const u = R.unauthorized.length;
      const list = R.unauthorized.concat(R.diffs.filter(d => d.authorized));
      s = slide(u ? [`${u}項變更未經核准，請追認`, `${u}項變更未經核准`] : [`本月條款變更${R.diffs.length}項，皆有依據`, `本月條款變更${R.diffs.length}項`],
        list.map(d => `${d.id} ${d.name}｜${d.kind}｜${d.field}\n  上月：${clip(d.before, 80)}\n  本月：${clip(d.after, 80)}\n  依據：${d.basis || "無（未經核准）"}`).join("\n"),
        list.length > 6 ? `另 ${list.length - 6} 項見差異表` : "資料來源：上月快照 vs 本月 Master");
      const rows = list.slice(0, 6).map(d => [d.id, clip(d.name, 8), d.kind, clip(d.field, 8), d.basis || (d.authorized ? "隨同核准" : "未經核准")]);
      table(s, ["條款ID", "條款", "變更", "欄位", "依據"], rows, [2.0, 2.8, 1.3, 2.6, 3.4], { hot: rows.map((r, i) => (r[4] === "未經核准" ? [i, 4] : null)).filter(Boolean) });
    }

    // 5 待決提案
    if (R.pending.length) {
      s = slide([`請核示${R.pending.length}項待決提案`],
        R.pending.map(p => `${p.提案ID}｜${p.條款ID} ${R.cname(p.條款ID)}｜${p.類型}｜欄位：${p.欄位}\n  原：${clip(p.原內容, 100)}\n  建議：${p.建議內容}\n  理由：${p.理由與案例}\n  提案人：${p.提案人}`).join("\n\n"),
        R.pending.length > 6 ? `另 ${R.pending.length - 6} 項見差異表「待決提案」` : "細節見講者備註");
      table(s, ["提案ID", "條款", "類型", "建議摘要", "提案人"],
        R.pending.slice(0, 6).map(p => [clip(p.提案ID, 16), clip(R.cname(p.條款ID), 7), clip(p.類型, 4), clip(p.建議內容, 12), clip(p.提案人, 4)]), [3.1, 2.2, 1.5, 3.7, 1.6]);
    }

    // 6 到期／待核
    const dd = R.due.concat(R.draft.filter(x => !R.due.includes(x)));
    if (dd.length) {
      s = slide(R.due.length ? [`${R.due.length}條底線到期需重新確認`, `${R.due.length}條底線到期`] : [`${R.draft.length}條底線仍待主管核定`, "底線待核定條款"],
        dd.map(c => `${c.條款ID} ${c.條款名稱}｜${c.狀態}｜下次Review日 ${c.下次Review日 || "未填"}`).join("\n"),
        dd.length > 6 ? `另 ${dd.length - 6} 條見差異表「到期與待核」` : "資料來源：條款庫");
      table(s, ["條款ID", "條款", "狀態", "下次Review日"], dd.slice(0, 6).map(c => [c.條款ID, clip(c.條款名稱, 12), c.狀態, c.下次Review日 || "未填"]), [2.6, 4.9, 2.2, 2.4],
        { hot: dd.slice(0, 6).map((c, i) => (c.狀態 !== "有效" ? [i, 2] : null)).filter(Boolean) });
    }

    // 7 請核示事項
    const asks = [];
    if (R.pending.length) asks.push(`核定${R.pending.length}項待決提案`);
    if (R.unauthorized.length) asks.push(`追認或還原${R.unauthorized.length}項未核准變更`);
    if (R.due.length || R.draft.length) asks.push(`確認${R.due.length || R.draft.length}條到期或待核底線`);
    if (!asks.length) asks.push("本月無待決事項");
    s = slide("請核示事項", "會後請維護人：①依決議更新條款庫 ②填寫變更紀錄 ③另存本月快照。");
    asks.slice(0, 3).forEach((a, i) => {
      const y = 1.9 + i * 1.65;
      s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y, w: 12.1, h: 1.3, fill: { color: "FFFFFF" }, line: { color: i === 0 ? O : K, width: i === 0 ? 2.5 : 1.5 }, rectRadius: 0.08 });
      T(s, { text: String(i + 1), x: 0.9, y, w: 0.9, h: 1.3, fontSize: 40, bold: true, color: O, align: "center", valign: "middle" });
      T(s, { text: a, x: 2.0, y, w: 10.4, h: 1.3, fontSize: 28, bold: i === 0, color: i === 0 ? O : K, valign: "middle" });
    });
    return { pptx, titles };
  }

  // ---------- 會後：依核准提案產生條款庫更新列與變更紀錄 ----------
  function bumpVersion(v) { const n = parseFloat(v); return isNaN(n) ? "1.0" : (Math.round((n + 0.1) * 10) / 10).toFixed(1); }
  function applyApproved(curr, month, approver) {
    const rows = new Map(), changes = [], skipped = [];
    const props = curr.proposals.filter(p => APPROVED.includes(p.決議) && inMonth(p.決議日, month));
    for (const p of props) {
      const first = !rows.has(p.條款ID);
      const base = rows.get(p.條款ID) || Object.assign({}, curr.clauses.find(c => c.條款ID === p.條款ID) || {});
      const val = p.決議 === "修正後核准" && str(p.決議說明) ? p.決議說明 : p.建議內容;
      if (p.類型 === "新增條款") {
        if (base.條款ID) { skipped.push(`${p.提案ID}：條款ID ${p.條款ID} 已存在`); continue; }
        Object.assign(base, { 條款ID: p.條款ID, 條款名稱: p.原內容 || "", 狀態: "範例待核", 版本: "0.1", 備註: `新增自 ${p.提案ID}：${val}` });
        changes.push([month, p.條款ID, "（整列）", "", val, p.提案ID, approver]);
      } else if (!base.條款ID) { skipped.push(`${p.提案ID}：找不到條款ID ${p.條款ID}`); continue; }
      else if (p.類型 === "停用條款") { changes.push([month, p.條款ID, "狀態", base.狀態, "停用", p.提案ID, approver]); base.狀態 = "停用"; }
      else if (p.類型 === "新增範例") {
        const f = SCHEMA.條款庫.includes(p.欄位) ? p.欄位 : "慣用回覆_中";
        const nv = str(base[f]) ? `${base[f]}\n\n【範例】${val}` : val;
        changes.push([month, p.條款ID, f, base[f] || "", nv, p.提案ID, approver]); base[f] = nv;
      } else {
        if (!SCHEMA.條款庫.includes(p.欄位) || p.欄位 === "條款ID") { skipped.push(`${p.提案ID}：欄位「${p.欄位}」不是條款庫欄位`); continue; }
        changes.push([month, p.條款ID, p.欄位, base[p.欄位] || "", val, p.提案ID, approver]); base[p.欄位] = val;
      }
      if (p.類型 !== "新增條款" && first) base.版本 = bumpVersion(base.版本);
      base.核准人 = approver || base.核准人; base.核准日 = p.決議日 || today();
      rows.set(p.條款ID, base);
    }
    return { rows: [...rows.values()].map(r => SCHEMA.條款庫.map(k => r[k] || "")), changes, skipped, count: props.length };
  }

  const Core = { SCHEMA, STANCES, NEVER_SEND, SYSTEM_PROMPT, today, normDate, monthEnd, tsv, tsvExcel, clip, parseMaster, matchClauses, parseDeviations,
    payloadText, prepareBatch, maskBatch, requestBody, callGemini, listModels, parseOptions, replySheetRows, logRows, proposalRow,
    diffClauses, monthlyReview, reviewWorkbook, buildDeck, fitTitle, applyApproved, sleep };
  if (typeof module !== "undefined" && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== "undefined" ? window : globalThis);
