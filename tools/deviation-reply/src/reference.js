/* reference.js — 制式條款參考庫（內部判斷與擬稿用，不在回覆中引用出處）
 * 依主題分組；每格內容為摘要（FIDIC 原文受著作權保護，僅摘要條號與機制）。
 * 「【待查證】」= 未能取得該版本原文核對，使用前請以手邊正式版本確認；規則檔「制式條款參考」工作表可覆寫本表。
 * 版本：FIDIC 2017 第二版（紅皮書＝施工、銀皮書＝EPC/統包）；工程會工程／財物採購契約範本；採購契約要項；中鼎 PO(C) 20221003 版慣例。
 * 2026-10-19 建立。
 */
(function (root) {
  "use strict";
  const U = "【待查證】";
  const SRC = {
    malawi: "https://svtp.gov.mw/wp-content/uploads/2020/07/MC_1__MC_2_Conditions_of_Contract_and_Contract_Forms_Volume_3_20-07-2020-1.pdf",
    silverPrev: "https://pdfcoffee.com/fidic-silver-book-conditions-of-contract-for-epc-turnkey-projects-2nd-edition-2017-pdf-free.html",
    silver522: "https://www.instituteccp.com/notices-under-fidic-silver-book-2017-edition-part-5/",
    clyde: "https://www.clydeco.com/uploads/Blogs/brexit/FIDIC_Quick_Reference_Guide_-_Yellow_Book_2017.pdf",
    fenTerm: "https://www.fenwickelliott.com/knowledge-hub/international-quarterlies/issue-37/the-developing-right-to-terminate-for-convenience-under-fidic/",
    fenLD: "https://www.fenwickelliott.com/knowledge-hub/annual-review/ar-2022/delay-liquidated-damages-some-new-ideas-from-fidic/",
    susp: "https://codozasady.pl/en/p/suspension-and-resumption-of-work-under-fidic-contract-terms",
    pay1999: "https://internationalconstructionknowledgehub.com/wp-content/uploads/Clause-14.pdf",
    pccItems: "https://lawweb.pcc.gov.tw/LawContent.aspx?id=GL000077",
    tpeTpl: "https://www-ws.gov.taipei/001/Upload/825/relfile/61163/9080724/c76fd705-2702-4cbe-898e-3182e7ea4550.pdf",
    tpeLecture: "https://www-ws.gov.taipei/001/Upload/342/relfile/36967/8163604/b56befde-db18-48e6-8ce5-ec6fa3bf61e8.pdf",
    pcc100: "https://www.huludun.taichung.gov.tw/df_ufiles/h/%E5%B7%A5%E7%A8%8B%E6%8E%A1%E8%B3%BC%E5%A5%91%E7%B4%84%E7%AF%84%E6%9C%AC1001011%E6%A0%B8%E5%AE%9A.pdf",
    lawtwLD: "https://www.lawtw.com/archives/403709",
    judicial111: "https://www.judicial.gov.tw/tw/dl-182242-68abfb07b4434f06b6b8afee33bd8b84.html",
    ctci: "contract-viewer2 lessons/20260703-ctci-po-structure.md（中鼎 PO(C) 20221003 版）",
  };

  const GROUPS = ["期限", "金額上限", "保證與款項", "責任與保固", "契約變動與爭議"];

  const STANDARDS = [
    { id: "T01", group: "期限", name: "文件審閱期限", keywords: "審閱;審查;核可;送審;review;approval;comment;no-objection;document submission;drawing",
      red: `${U}紅皮書 4.4.1 承包商文件（承包商設計部分）由工程師審閱，審閱期依 Contract Data。`,
      silver: "銀皮書 5.2.2：業主審閱承包商文件，審閱期一般為 21 天；期限內未發通知視為無異議；退件重送重新起算。6.12 關鍵人員異議期 14 天。",
      pccW: "工程範本：設計審查時程由機關於招標時載明（統包範本「機關審查時程為＿日」）；估驗計價機關 15 工作天內完成審核（含技術服務廠商審查時間）。",
      pccG: `${U}財物範本：送審文件審查期限由機關於招標時載明。`,
      ctci: "",
      src: [SRC.silver522, SRC.tpeTpl] },
    { id: "T02", group: "期限", name: "請款與付款期限", keywords: "付款;付款期限;付款天期;請款;發票;估驗;計價;payment;payment terms;invoice;days;net;due",
      red: "紅皮書 14.6 工程師收到請款單後 28 天內簽發期中付款證明；14.7 期中款於工程師收到請款單後 56 天內付款，最終款 56 天；14.8 遲延付款按央行貼現率加 3% 計付融資費用（逐月複利）。",
      silver: `${U}銀皮書 14.7：無工程師簽證，業主收到請款單後 56 天內付款；14.8 遲延融資費用同紅皮書。`,
      pccW: "工程範本第 5 條：估驗款機關 15 工作天內審核、接到請款單據後 15 工作天內付款（涉補助款 30 工作天）；尾款於驗收合格後 15 日內簽發結算驗收證明，接到請款單據後 15 工作天內一次無息結付。",
      pccG: `${U}財物範本：驗收合格後，機關於接到請款單據後 15 工作天內付款。採購契約要項第 34 點：契約應載明付款條件及期限。`,
      ctci: "中鼎 PO B 條：45 個日曆天電匯；各期款（預付 10%／文件 5%／材料 10%／交貨／尾款 10%）加總應為 100%。",
      src: [SRC.malawi, SRC.pay1999, SRC.tpeTpl, SRC.tpeLecture, SRC.pccItems, SRC.ctci] },
    { id: "T03", group: "期限", name: "通知、索賠與工期展延申請期限", keywords: "通知;索賠;展延;工期展延;延期;claim;notice;extension of time;EOT;time bar",
      red: "20.2：索賠事件知悉後 28 天內通知（逾期失權），84 天內提出完整索賠；3.7 協商 42 天＋決定 42 天；不服決定 28 天內發 NOD。",
      silver: "同紅皮書（20.2 的 28／84 天；3.5 協商 42 天＋決定 42 天；NOD 28 天）。",
      pccW: "工程範本第 7 條：事故發生或消滅後 7 日內通知機關（未載明時），45 日內檢具事證書面申請展延（未載明時）。",
      pccG: `${U}財物範本：比照工程範本，通知與申請期限由機關載明。`,
      ctci: "",
      src: [SRC.clyde, SRC.silverPrev, SRC.pcc100, SRC.judicial111] },
    { id: "T04", group: "金額上限", name: "總責任上限", keywords: "責任上限;賠償上限;總賠償;limitation of liability;liability cap;aggregate liability;cap;total liability",
      red: "1.15：承包商總責任以 Contract Data 所載金額為上限，未載明者為得標契約金額（Accepted Contract Amount）；詐欺、重大過失、故意違約、輕率不當行為不受上限限制。",
      silver: "Limitation of Liability 條：上限為 Contract Data 所載金額，未載明者為契約價格；業主供料（2.6）、臨時水電（4.19）、智慧財產（17.3）、17.4 第一段人身傷亡賠償，以及詐欺、重大過失、故意違約、輕率不當行為不受上限限制。",
      pccW: "工程範本：損害賠償上限由機關載明，未載明者為契約價金總額；廠商故意隱瞞瑕疵、故意或重大過失、對第三人侵權不受上限限制；逾期違約金不計入此上限。",
      pccG: `${U}財物範本：損害賠償上限機制比照工程範本。採購契約要項第 58–60 點：機關得於契約訂明損害賠償範圍、上限及除外情形。`,
      ctci: "",
      src: [SRC.malawi, SRC.silverPrev, SRC.tpeLecture, SRC.lawtwLD, SRC.pccItems] },
    { id: "T05", group: "金額上限", name: "逾期罰款（延遲損害賠償）", keywords: "逾期;逾期罰款;違約金;延遲;遲延;約定損失賠償;LD;liquidated damages;delay damages;penalty;late delivery",
      red: "8.8：費率與上限載於 Contract Data；完工前為業主對延遲的唯一金錢救濟（詐欺、重大過失、故意違約、輕率不當行為除外）。MDB 範例：每日 0.05%、上限 10%（得標金額扣除暫定金額）。",
      silver: "8.8：同紅皮書，費率與上限載於 Contract Data。",
      pccW: "工程範本：每日依契約價金總額 1‰（未載明時），未完成部分不影響使用者按該部分價金 3‰；總額以契約價金總額 20% 為上限（機關可訂較低，不得高於 20%）。",
      pccG: "財物範本：每日比率由機關載明；採購契約要項第 45 點：逾期違約金以契約價金總額 20% 為上限。",
      ctci: "中鼎 PO E 條「約定損失賠償」：每逾期一個日曆天 0.1%（文件 0.05%），上限 10%；低於 10% 須主管核准。",
      src: [SRC.fenLD, SRC.malawi, SRC.lawtwLD, SRC.pccItems, SRC.ctci] },
    { id: "T06", group: "金額上限", name: "間接損失排除", keywords: "間接損失;衍生損害;所失利益;利潤損失;consequential;indirect;loss of profit;loss of use;loss of production",
      red: "1.15：雙方互不負擔使用損失、利潤損失、合約損失及間接或衍生損失，但 8.8 延遲損害等特定條款與詐欺、重大過失等情形除外（除外條次以原文為準）。",
      silver: "同紅皮書的雙向排除架構（除外條次以原文為準）。",
      pccW: "工程會 96.5.24 函：廠商的損害賠償責任得不包含機關所失利益，但機關應於招標文件預先載明。",
      pccG: `${U}財物範本：同工程會函釋原則。`,
      ctci: "",
      src: [SRC.malawi, SRC.tpeLecture] },
    { id: "T07", group: "保證與款項", name: "履約保證", keywords: "履約保證;履保;保證金;銀行保證;performance security;performance bond;bank guarantee;PB",
      red: "4.2：收到得標通知書後 28 天內提交，金額依 Contract Data。",
      silver: "4.2：雙方簽約後 28 天內提交；契約價格因變更增減逾 20% 時調整金額；保固證書簽發後 21 天內返還；到期前 28 天未取得保固證書須展延。",
      pccW: "工程範本第 14 條：比例由機關載明；驗收合格且無待解決事項後 30 日內發還，可依進度分次發還（查核金額以上不少於 4 次）；不可歸責於廠商而暫停履約逾 6 個月（未載明時），提前發還。",
      pccG: `${U}財物範本：比例由機關載明；驗收合格後發還。`,
      ctci: "中鼎 PO B 條：保證書於 28 日曆天內提交，有效期至保固期滿後 90 天；英文保證書非台灣銀行開立須經兆豐或 HSBC 通知。",
      src: [SRC.malawi, SRC.silverPrev, SRC.tpeTpl, SRC.pcc100, SRC.ctci] },
    { id: "T08", group: "保證與款項", name: "預付款及還款保證", keywords: "預付款;預付;訂金;頭款;advance payment;down payment;APG;advance payment guarantee",
      red: "14.2：預付款金額與扣回方式依 Contract Data，須先提交等額預付款保證，隨扣回遞減。",
      silver: "14.2：同紅皮書。",
      pccW: "工程範本第 5 條：比例由機關載明，查核金額以上不逾訂約總價 30%；估驗達訂約總價 20% 起至 80% 止逐期扣回；須提交預付款還款保證。",
      pccG: `${U}財物範本：預付款比例由機關載明，並須預付款還款保證。`,
      ctci: "中鼎 PO B 條：預付款 10%（須預付款保證）。",
      src: [SRC.pay1999, SRC.tpeTpl, SRC.tpeLecture, SRC.pccItems, SRC.ctci] },
    { id: "T09", group: "保證與款項", name: "保留款", keywords: "保留款;保留;尾款;retention;retention money;holdback",
      red: "14.9：比例與上限依 Contract Data；移交證書後退還一半，其餘於瑕疵通知期屆滿後退還；可以保證替代。MDB 範例：5%、上限 5%。",
      silver: "14.9：同紅皮書。",
      pccW: "工程範本第 5 條：每期估驗扣 5% 保留款；查核金額以上工程初驗合格且無逾期，可請求退還已扣保留款的 50%；有重大缺失機關得提高為 2 倍。",
      pccG: `${U}財物範本：通常不扣保留款，以保固保證金替代。`,
      ctci: "中鼎 PO B 條：尾款 10%。",
      src: [SRC.malawi, SRC.pay1999, SRC.tpeTpl, SRC.ctci] },
    { id: "T10", group: "責任與保固", name: "保固與瑕疵責任期", keywords: "保固;保固期;瑕疵;瑕疵擔保;warranty;defects notification period;DNP;defects liability;guarantee period",
      red: "瑕疵通知期依 Contract Data，未載明者為 1 年；因瑕疵無法使用的期間可展延（11.3，展延上限以原文為準）；設備的潛在瑕疵責任於瑕疵通知期屆滿後 2 年終止（11.10）。",
      silver: "1.1.24／11.3：同紅皮書，未載明者為 1 年。",
      pccW: "工程範本：保固期由機關載明，未載明時非結構物 1 年、結構物 5 年（100.10.11 版）。",
      pccG: `${U}財物範本：保固期由機關載明，未載明者為 1 年。`,
      ctci: "中鼎 PO D 條：驗收日起 12 個月或送達工地後 24 個月，以先到者為準。",
      src: [SRC.silverPrev, SRC.clyde, SRC.pcc100, SRC.ctci] },
    { id: "T11", group: "責任與保固", name: "保險", keywords: "保險;投保;營造綜合險;安裝工程;運輸險;第三人責任;insurance;CAR;EAR;cargo;third party liability",
      red: `${U}第 19 條：承包商投保工程、設備、第三人責任及員工保險，以雙方為共同被保險人；險種與金額依 Contract Data。`,
      silver: `${U}第 19 條：同紅皮書。`,
      pccW: "工程範本第 13 條：廠商依招標文件投保營造或安裝工程綜合保險、雇主意外責任險等。",
      pccG: `${U}財物範本：依招標文件投保運輸及安裝相關保險。`,
      ctci: "中鼎 PO K 條：保險條款不可刪除，航運保險應延伸至工地。",
      src: [SRC.judicial111, SRC.ctci] },
    { id: "T12", group: "契約變動與爭議", name: "契約變更與數量增減", keywords: "變更;追加;追減;設計變更;數量增減;variation;change order;change;VO",
      red: "第 13 條：工程師可指示變更；變更計價的利潤預設 5%（Contract Data 可另訂）。",
      silver: "第 13 條：業主可指示變更；2.4 單一變更逾契約價格 10% 或累計逾 30% 時，承包商可要求業主提出資金證明。",
      pccW: "工程範本第 3 條：總價結算時個別項目數量增減逾 5% 部分依原單價計價，增減達 30% 以上得合理調整單價。採購契約要項：變更須雙方合意並作成書面，否則無效。",
      pccG: "採購契約要項第 20–24 點：機關得於契約範圍內要求變更，須雙方書面合意。",
      ctci: "",
      src: [SRC.clyde, SRC.silverPrev, SRC.tpeTpl, SRC.pccItems] },
    { id: "T13", group: "契約變動與爭議", name: "物價調整", keywords: "物價調整;價格調整;調價;漲價;固定價;指數;price escalation;price adjustment;fixed price;firm price;indexation",
      red: `${U}13.7：依 Contract Data 的成本指數公式調整，未列公式則不調整。`,
      silver: `${U}13.7：同紅皮書；EPC 統包常約定不調整。`,
      pccW: "工程範本第 5 條：營造工程物價總指數漲跌逾 2.5% 部分調整；或個別項目 10%、中分類 5%、總指數 2.5% 依序調整。採購契約要項：管理費、利潤不調整。",
      pccG: "採購契約要項第 38–39 點：指數調整須載明項目、基準、公式及佐證。",
      ctci: "",
      src: [SRC.pcc100, SRC.tpeLecture, SRC.pccItems] },
    { id: "T14", group: "契約變動與爭議", name: "暫停執行", keywords: "暫停;停工;暫停履約;suspension;suspend;stand-by",
      red: "第 8 條（暫停條款）：業主暫停逾 84 天，承包商可要求復工；28 天內未獲准許，可視為刪除該部分工作，全部暫停者可終止契約；暫停的工期與費用可請求。",
      silver: `${U}同紅皮書（84 天＋28 天機制）。`,
      pccW: "工程範本：機關要求暫停時，廠商增加的必要費用由機關負擔；不可歸責於廠商暫停逾 6 個月（未載明時），履約保證金提前發還。廠商得終止的暫停期間門檻【待查證】。",
      pccG: "採購契約要項第 68–69 點：非可歸責於廠商的暫停，機關得補償必要費用並酌予展延。",
      ctci: "",
      src: [SRC.susp, SRC.pcc100, SRC.judicial111, SRC.pccItems] },
    { id: "T15", group: "契約變動與爭議", name: "終止與解除", keywords: "終止;解約;終止契約;任意終止;便利終止;政策變更;termination;terminate;for convenience;for default",
      red: "15.5 便利終止：通知後於承包商收到通知或業主返還履約保證（較晚者）後 28 天生效；2017 版承包商可請求利潤損失等；終止後業主不得自行或交他人施作該部分。",
      silver: "15.5：同紅皮書。",
      pccW: "政府採購法第 64 條、採購契約要項：因政策變更終止或解除契約須報上級機關核准，並補償廠商因此所生損失；可歸責廠商時機關得自行或洽他廠商完成，費用由廠商負擔。",
      pccG: "同工程（政府採購法第 64 條）。",
      ctci: "",
      src: [SRC.fenTerm, SRC.pccItems] },
    { id: "T16", group: "契約變動與爭議", name: "爭議處理與準據法", keywords: "爭議;仲裁;調解;訴訟;準據法;管轄;dispute;arbitration;mediation;governing law;jurisdiction",
      red: "第 21 條：爭議先送 DAAB（42 天內提交），不服決定 28 天內發 NOD，再經友好解決後仲裁。",
      silver: "第 21 條：同紅皮書。",
      pccW: "採購契約要項第 70–74 點：先協議，未果得申請調解、申訴、仲裁或訴訟；準據法為中華民國法律；管轄法院為機關所在地法院。",
      pccG: "同工程。",
      ctci: "中鼎 PO G 條：台灣法、台北仲裁。",
      src: [SRC.clyde, SRC.pccItems, SRC.ctci] },
  ];

  const COLS = ["主題ID", "群組", "主題", "關鍵字", "FIDIC紅皮書", "FIDIC銀皮書", "工程會工程範本", "工程會財物範本", "中鼎PO慣例", "來源"];
  function toRows(list) { return list.map(s => [s.id, s.group, s.name, s.keywords, s.red, s.silver, s.pccW, s.pccG, s.ctci, (s.src || []).join("\n")]); }
  function fromRows(rows) {
    return rows.filter(r => r && r[0]).map(r => ({ id: String(r[0]).trim(), group: r[1] || "其他", name: r[2] || "", keywords: r[3] || "", red: r[4] || "", silver: r[5] || "", pccW: r[6] || "", pccG: r[7] || "", ctci: r[8] || "", src: String(r[9] || "").split(/\n/).filter(Boolean) }));
  }
  // 規則檔的工作表優先：同 ID 覆寫，新 ID 附加
  function merge(base, override) {
    const out = base.map(s => Object.assign({}, s));
    for (const o of override || []) { const i = out.findIndex(s => s.id === o.id); if (i >= 0) out[i] = Object.assign({}, out[i], Object.fromEntries(Object.entries(o).filter(([, v]) => v && (!Array.isArray(v) || v.length)))); else out.push(o); }
    return out;
  }
  function match(text, list, n) {
    const t = String(text || "").toLowerCase();
    return (list || STANDARDS).map(s => {
      let score = 0;
      for (const k of String(s.keywords).split(/[;；]/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 2)) {
        const ascii = /^[\x00-\x7f]+$/.test(k);
        if (ascii ? new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t) : t.includes(k)) score += Math.min(k.length, 6);
      }
      return { s, score };
    }).filter(x => x.score).sort((a, b) => b.score - a.score).slice(0, n || 2).map(x => x.s);
  }
  function block(s, docKind) {
    const L = [`〈${s.id} ${s.group}／${s.name}〉`];
    if (docKind !== "goods" && s.pccW) L.push(`  工程會工程範本：${s.pccW}`);
    if (docKind !== "works" && s.pccG) L.push(`  工程會財物範本：${s.pccG}`);
    if (s.red) L.push(`  FIDIC 紅皮書：${s.red}`);
    if (s.silver) L.push(`  FIDIC 銀皮書：${s.silver}`);
    if (s.ctci) L.push(`  中鼎 PO 慣例：${s.ctci}`);
    return L.join("\n").replace(/【待查證】/g, "（未核對原文）");
  }

  const Ref = { STANDARDS, GROUPS, COLS, toRows, fromRows, merge, match, block, VERSION: "2026-10-19" };
  if (typeof module !== "undefined" && module.exports) module.exports = Ref; else root.Ref = Ref;
})(typeof window !== "undefined" ? window : globalThis);
