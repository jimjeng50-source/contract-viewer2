/* deid.js — 台灣工程／採購文件去識別化引擎（依 deid-tw-procurement 規格重新實作）
 * 零依賴，瀏覽器與 Node 通用。代號格式〔類別NN〕。
 */
(function (root) {
  "use strict";
  const TYPES = ["人名", "公司", "專案", "金額", "郵址", "電話", "編號", "準則", "機密"];
  const TOKEN_RE = /〔([^〔〕\d\s]{1,4})(\d{2,3})〕/g;

  const SURNAMES = "陳林黃張李王吳劉蔡楊許鄭謝洪郭邱曾廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯曹薛丁卓阮馬董温唐藍石蔣古紀姚連馮歐程湯黃田康姜白汪鄒尤巫鐘黎涂龔嚴韓袁金童陸夏柳凃邵錢伍倪溫于譚駱熊任甘秦顧毛章史官萬俞雷粘饒張闕凌崔尹孔辛易";
  const TITLES = "副總經理|總經理|董事長|執行長|副總|協理|經理|副理|襄理|處長|部長|課長|科長|組長|股長|廠長|所長|主任|主管|特助|工程師|專員|顧問|博士|教授|先生|小姐|女士";
  const PUBLIC_STD = /\b(?:CNS|ASTM|ISO|IEC|API|ASME|AWS|ANSI|DIN|EN|JIS|BS|IEEE|NFPA|UL|NEMA|AISC|ACI|AASHTO|SSPC|NACE|ISA|TEMA|OSHA|FIDIC|ICC|Incoterms)\s?[-:]?\s?[A-Z]{0,2}\s?\d[\dA-Z.\-:\/]*/g;
  const ORG_STOP = /^(?:本案由|本案|該案|案由|由於|經由|委由|委託|函請|惠請|敬請|承蒙|茲有|關於|有關|針對|惟|但|與|和|及|向|由|經|請|將|對|於|跟|為|被|因|如|若|即|並|且|或|之|的|係|乃|故|致|自|從|在|本|該|貴|我|其|此|另|已|擬|後|前|給|讓|替|同|今|再|又|亦|均|皆|仍)+/;
  const ORG_INDUSTRY = /(?:工程顧問|工程|顧問|營造|建設|科技|實業|電機|機械|企業|國際|開發|工業|材料|貿易|鋼鐵|電子|資訊|管理|技術|機電|環保|能源|化工|電力|系統|設備|控股|集團)$/;

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function count(text, v) { if (!v) return 0; let n = 0, i = 0; while ((i = text.indexOf(v, i)) !== -1) { n++; i += v.length; } return n; }

  const STOPCH = "由向與及和請經於為之的是係將對跟在被給讓以自從致並且或但惟即另擬已此該本貴我其司就依按照關針等";
  const NAME_STOP = new Set(["高階","高級","高層","方面","任何","任職","任務","石化","金屬","金額","金融","萬一","程序","程度","施工","施作","連續","藍圖","紀錄","歐洲","溫度","温度","余額","毛利","章程","董事","尤其","易於","於是","何種","雷射","黃金","白天","白銀","馬上","方式","方可","方能","於本","潘","傅"]);
  // 中文無空白，貪婪比對會把前文吃進名稱；由右往左找最後一個虛詞斷點，且保留至少 minCore 字
  function cutPrefix(v, suffixRe, minCore) {
    const sm = v.match(suffixRe); const suffix = sm ? sm[0] : "";
    let core = v.slice(0, v.length - suffix.length).replace(ORG_STOP, "");
    for (let i = core.length - 1; i >= 0; i--) {
      if (STOPCH.includes(core[i]) && core.length - i - 1 >= minCore) { core = core.slice(i + 1); break; }
    }
    return core + suffix;
  }
  function orgAliases(full, text) {
    const out = [];
    const core = full.replace(/(?:股份有限公司|有限公司|工程行|企業社|事務所)$/, "");
    let base = core;
    for (let k = 0; k < 4 && ORG_INDUSTRY.test(base) && base.replace(ORG_INDUSTRY, "").length >= 2; k++) base = base.replace(ORG_INDUSTRY, "");
    const cands = [core + "公司", base + "公司", core, base];
    if (/^[A-Za-z]/.test(full)) {
      const words = full.replace(/[,.]?\s*(?:Co\.,?\s?Ltd\.?|Corporation|Corp\.?|Inc\.?|Ltd\.?|LLC|GmbH|S\.p\.A\.?|S\.A\.|Pte\.?\s?Ltd\.?|Limited|PLC|AG|B\.V\.)$/, "").trim();
      cands.length = 0; cands.push(words);
      const first = words.split(/\s+/)[0]; if (first && first.length >= 4) cands.push(first);
    }
    for (const c of cands) if (c && c !== full && c.length >= 2 && text.includes(c) && !out.includes(c)) out.push(c);
    return out;
  }

  // 規則依序執行；已被佔用的字元區段不再被後續規則取用（準則早於編號）
  function rules() {
    const S = SURNAMES, T = TITLES;
    return [
      ["郵址", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
      ["準則", /\b(?:QP|QM|QS|SOP|WI|PRO|POL|PM|PR|SP|CP)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g],
      ["準則", /[一-鿿]{2,12}(?:準則|作業要點|作業規範|管理規章|內部規定)/g],
      ["金額", /(?:NT\$|NTD|TWD|USD|US\$|EUR|RMB|CNY|JPY|SGD|新台幣|新臺幣|台幣|臺幣|美金|美元|歐元|日圓|日幣|人民幣|€|\$)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:百萬|千萬|萬|億|千|元整|元|M|K|million|billion|mil))*/g],
      ["金額", /\d[\d,]*(?:\.\d+)?\s?(?:USD|NTD|TWD|EUR|SGD|JPY|RMB)\b/g],
      ["金額", /\d[\d,]*(?:\.\d+)?\s?(?:百萬元|千萬元|萬元|億元|元整|元)/g],
      ["電話", /(?:\+\d{1,3}[-\s]?\(?\d{1,4}\)?[-\s]?\d{3,4}[-\s]?\d{3,4}|\(0\d{1,2}\)\s?\d{3,4}-?\d{4}|0\d{1,2}-\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3})(?:\s?(?:#|ext\.?|分機)\s?\d{1,5})?/gi],
      ["編號", /(?:統編|統一編號)[:：\s]*\d{8}/g],
      ["編號", /(?<![A-Za-z0-9])(?=[A-Z0-9]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]+(?:-[A-Z0-9]+)+(?![A-Za-z0-9])|(?<![A-Za-z0-9])(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,}(?![A-Za-z0-9])/g],
      ["公司", /[\u4e00-\u9fffA-Za-z0-9]{2,14}(?:股份有限公司|有限公司|工程行|企業社|事務所)/g, 0, "orgzh"],
      ["公司", /\b[A-Z][A-Za-z0-9&\-]*(?:\s+[A-Z&][A-Za-z0-9&.\-]*){0,4},?\s+(?:Co\.,?\s?Ltd\.?|Corporation|Corp\.?|Inc\.?|Ltd\.?|LLC|GmbH|S\.p\.A\.?|S\.A\.|Pte\.?\s?Ltd\.?|Limited|PLC|AG|B\.V\.)/g],
      ["人名", new RegExp(`(?:承辦人|聯絡人|窗口|經辦人?|負責人|簽核人|收件人|寄件人)[:：\\s]*([${S}][\\u4e00-\\u9fff]{1,2})`, "g"), 1],
      ["人名", new RegExp(`([${S}][\\u4e00-\\u9fff]{1,2})(?=${T})`, "g"), 1, "fullname"],
      ["人名", new RegExp(`[${S}](?:${T})`, "g"), 0, "surtitle"],
      ["人名", /\b(?:Mr|Ms|Mrs|Dr|Dear)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, 1],
      ["專案", /(?:專案代號|專案名稱|案號|工程名稱|案名)[:：\s]*([^\s，。、；;,]{2,20})/g, 1],
      ["專案", /[\u4e00-\u9fffA-Za-z0-9]{3,16}(?:新建工程|統包工程|計畫案|專案|案)(?=[，。、；;：:\s）)」』_.\-]|$)/g, 0, "proj"],
    ];
  }
  const PROJECT_STOP = /(?:方案|提案|草案|答案|檔案|個案|法案|本案|該案|此案|全案|議案|備案|結案|立案|報案|定案|原案|新案|前案|他案|各案|一案|兩案|貴案|案)$/;
  const PROJECT_GENERIC = /^(?:本|該|此|全|各|貴|原|新|前|上述|上開|前述)/;

  function detect(text) {
    const taken = new Uint8Array(text.length);
    PUBLIC_STD.lastIndex = 0; let m;
    while ((m = PUBLIC_STD.exec(text))) for (let i = m.index; i < m.index + m[0].length; i++) taken[i] = 1;
    // 已遮代號不重複偵測
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(text))) for (let i = m.index; i < m.index + m[0].length; i++) taken[i] = 1;
    const found = [];
    for (const [type, re, grp, kind] of rules()) {
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        let v = grp ? m[grp] : m[0];
        if (!v) continue;
        let start = m.index + (grp ? m[0].indexOf(v) : 0);
        if (kind === "orgzh") { const c = cutPrefix(v, /(?:股份有限公司|有限公司|工程行|企業社|事務所)$/, 4); start += v.length - c.length; v = c; }
        if (kind === "proj") {
          const c = cutPrefix(v, /(?:新建工程|統包工程|計畫案|專案|案)$/, 3); start += v.length - c.length; v = c;
          const core = v.replace(/(?:新建工程|統包工程|計畫案|專案|案)$/, "");
          if (core.length < 3 || PROJECT_GENERIC.test(v) || /(?:方|提|草|答|檔|個|法|議|備|結|立|報|定|原|全|本|該|此)案$/.test(v)) continue;
        }
        if (type === "人名" && (NAME_STOP.has(v) || NAME_STOP.has(v.slice(0, 2)))) continue;
        if (type === "人名" && kind === "fullname" && v.length < 2) continue;
        v = v.trim(); if (v.length < 2) continue;
        let overlap = false;
        for (let i = start; i < start + v.length; i++) if (taken[i]) { overlap = true; break; }
        if (overlap) continue;
        for (let i = start; i < start + v.length; i++) taken[i] = 1;
        found.push({ type, value: v });
      }
    }
    // 公司簡稱衍生
    const extra = [];
    for (const f of found) if (f.type === "公司") for (const a of orgAliases(f.value, text)) extra.push({ type: "公司", value: a });
    const all = dedupe(found.concat(extra));
    return suppress(all, text);
  }

  function dedupe(list) {
    const seen = new Map();
    for (const t of list) if (!seen.has(t.value)) seen.set(t.value, t);
    return [...seen.values()];
  }

  // ④ 僅當短詞從未獨立出現（出現次數全數落在長詞之內）時移除
  function positions(text, v) { const out = []; let i = 0; while (v && (i = text.indexOf(v, i)) !== -1) { out.push(i); i += v.length; } return out; }
  function suppress(list, text) {
    return list.filter(s => {
      const longer = list.filter(l => l !== s && l.value.length > s.value.length && l.value.includes(s.value));
      if (!longer.length) return true;
      const spans = [];
      for (const l of longer) for (const p of positions(text, l.value)) spans.push([p, p + l.value.length]);
      return positions(text, s.value).some(p => !spans.some(([a, b]) => p >= a && p + s.value.length <= b));
    });
  }

  function sortTerms(terms) { return terms.sort((a, b) => b.value.length - a.value.length || a.value.localeCompare(b.value)); }

  function assignCodes(terms, text) {
    const order = terms.slice().sort((a, b) => {
      const ia = text ? text.indexOf(a.value) : 0, ib = text ? text.indexOf(b.value) : 0;
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
    const n = {};
    for (const t of order) { n[t.type] = (n[t.type] || 0) + 1; t.code = `〔${t.type}${String(n[t.type]).padStart(2, "0")}〕`; }
    return terms;
  }

  function buildTerms(text, opts) {
    opts = opts || {};
    const dict = opts.dict || [], keep = opts.keep || [];
    const keepSet = new Set(keep);
    let list = detect(text).map(t => ({ ...t, source: "規則" }));
    for (const d of dict) {
      if (!d || !d.value || d.value.length < 2 || !text.includes(d.value)) continue;
      const ex = list.find(t => t.value === d.value);
      if (ex) { ex.type = TYPES.includes(d.type) ? d.type : ex.type; ex.source = "詞庫"; }
      else list.push({ type: TYPES.includes(d.type) ? d.type : "機密", value: d.value, source: "詞庫" });
    }
    list = suppress(list, text).filter(t => !keepSet.has(t.value));
    for (const t of list) { t.count = count(text, t.value); t.on = true; }
    sortTerms(list);
    return assignCodes(list, text);
  }

  function guessType(v) {
    v = (v || "").trim();
    if (/@/.test(v)) return "郵址";
    if (/^(?:\+|0)[\d\s\-()#]{7,}$/.test(v)) return "電話";
    if (/(?:NT\$|USD|\$|元|萬|億|€)/.test(v) && /\d/.test(v)) return "金額";
    if (/(?:公司|Co\.|Ltd|Inc|Corp|GmbH|工程行)/.test(v)) return "公司";
    if (/(?:案|專案|計畫|工程)$/.test(v)) return "專案";
    if (/(?:準則|規範|要點|規章)$/.test(v) || /^(?:QP|SOP|WI)-/.test(v)) return "準則";
    if (/[A-Za-z]/.test(v) && /\d/.test(v)) return "編號";
    if (new RegExp(`^[${SURNAMES}][\\u4e00-\\u9fff]{1,2}$`).test(v)) return "人名";
    return "機密";
  }

  function addTerm(terms, text, value, type) {
    value = (value || "").trim();
    if (!value) return { ok: false, reason: "空白" };
    if (value.length < 2) return { ok: false, reason: "單一字元不可單獨遮罩（例如單姓），請連同職稱或上下文一起圈選" };
    if (/[〔〕]/.test(value)) return { ok: false, reason: "不可包含代號符號〔〕" };
    if (!text.includes(value)) return { ok: false, reason: "原文中找不到此詞" };
    type = TYPES.includes(type) ? type : guessType(value);
    const ex = terms.find(t => t.value === value);
    if (ex) { ex.type = type; ex.on = true; sortTerms(terms); assignCodes(terms, text); return { ok: true, term: ex, updated: true }; }
    const t = { type, value, source: "手動", count: count(text, value), on: true };
    terms.push(t); sortTerms(terms); assignCodes(terms, text);
    return { ok: true, term: t };
  }

  function mask(text, terms) {
    const active = sortTerms(terms.filter(t => t.on && t.value));
    const map = {};
    if (!active.length) return { text, map, leaked: [] };
    const byVal = new Map(active.map(t => [t.value, t]));
    const re = new RegExp(active.map(t => esc(t.value)).join("|"), "g");
    const out = text.replace(re, v => { const t = byVal.get(v); map[t.code] = { value: t.value, type: t.type }; return t.code; });
    const leaked = active.filter(t => out.includes(t.value)).map(t => t.value);
    return { text: out, map, leaked };
  }

  function normalizeTokens(reply, map) {
    // AI 常把〔〕改成【】或 []，若內文對得上代號就修正回來
    return reply.replace(/[【\[［]([^\]】］\s]{1,4}\d{2,3})[】\]］]/g, (all, inner) => (map["〔" + inner + "〕"] ? "〔" + inner + "〕" : all));
  }

  function unmask(text, map, restore) {
    restore = restore || {};
    text = normalizeTokens(text, map);
    return text.replace(TOKEN_RE, (tok, type) => {
      const e = map[tok];
      if (!e) return tok;
      if (restore[e.type] === false) return tok;
      return e.value;
    });
  }

  function auditTokens(reply, map) {
    const fixed = normalizeTokens(reply, map);
    const restored = [], orphans = [];
    TOKEN_RE.lastIndex = 0; let m;
    while ((m = TOKEN_RE.exec(fixed))) (map[m[0]] ? restored : orphans).push(m[0]);
    return { restored: [...new Set(restored)], orphans: [...new Set(orphans)] };
  }

  function residual(masked) { return detect(masked); }
  function leftTokens(text) { TOKEN_RE.lastIndex = 0; return [...new Set((text.match(TOKEN_RE) || []))]; }

  function verify(text, terms) {
    const { text: masked, map, leaked } = mask(text, terms);
    return { ok: unmask(masked, map) === text && !leaked.length, masked, leaked, residual: residual(masked) };
  }

  // ---- 詞庫可攜 ----
  function dictExportJson(dict) { return JSON.stringify(dict.map(d => ({ type: d.type, value: d.value })), null, 1); }
  function dictExportCsv(dict) { return "﻿類別,詞\n" + dict.map(d => `${d.type},"${String(d.value).replace(/"/g, '""')}"`).join("\n"); }
  function dictParse(raw) {
    raw = String(raw || "").replace(/^﻿/, "").trim();
    if (!raw) return [];
    if (/^[\[{]/.test(raw)) { try { const j = JSON.parse(raw); return (Array.isArray(j) ? j : [j]).filter(x => x && x.value).map(x => ({ type: TYPES.includes(x.type) ? x.type : "機密", value: String(x.value).trim() })); } catch (e) { /* 落到逐行 */ } }
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
      const cells = line.split(line.includes("\t") ? "\t" : ",").map(s => s.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
      if (!cells[0] || cells[0] === "類別" || cells[0] === "詞") continue;
      if (cells.length >= 2 && TYPES.includes(cells[0])) out.push({ type: cells[0], value: cells[1] });
      else if (cells.length >= 2 && TYPES.includes(cells[1])) out.push({ type: cells[1], value: cells[0] });
      else out.push({ type: "機密", value: cells[0] });
    }
    return out.filter(d => d.value && d.value.length >= 2);
  }
  function dictMerge(base, add) {
    const seen = new Set(base.map(d => d.value)); let added = 0, skipped = 0;
    const out = base.slice();
    for (const d of add) { if (seen.has(d.value)) { skipped++; continue; } seen.add(d.value); out.push(d); added++; }
    return { dict: out, added, skipped };
  }

  const PROMPT_NOTE = "\n\n【代號保留規則】文中〔類別NN〕格式的代號（例如〔公司01〕〔金額02〕）代表已遮蔽的機密資訊。請在回覆中原樣保留這些代號（含全形方框），不得改寫、翻譯、合併、增刪編號，也不得替換為「某公司」「the Company」等字樣；英文回覆中同樣直接使用原代號。";

  const Deid = { TYPES, detect, buildTerms, addTerm, mask, unmask, residual, verify, auditTokens, guessType, leftTokens,
    dictExportJson, dictExportCsv, dictParse, dictMerge, PROMPT_NOTE, sortTerms, assignCodes, orgAliases };
  if (typeof module !== "undefined" && module.exports) module.exports = Deid; else root.Deid = Deid;
})(typeof window !== "undefined" ? window : globalThis);
