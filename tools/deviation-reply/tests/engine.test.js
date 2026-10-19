const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
global.DOMParser = DOMParser; global.XMLSerializer = XMLSerializer;
global.Deid = require('../src/deid.js'); global.Core = require('../src/core.js'); global.Ref = require('../src/reference.js');
const E = require('../src/engine.js');
const ExcelJS = require('exceljs'), XLSX = require('xlsx'), JSZip = require('jszip'), fs = require('fs');
const F = p => fs.readFileSync(__dirname + '/../fixtures/' + p);
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const master = Core.parseMaster(XLSX, F('master.xlsx'));
  // Excel
  const ix = await E.ingestExcel(ExcelJS, XLSX, ab(F('vendor.xlsx')), 'vendor.xlsx');
  console.log(ix.note); ok(ix.items.length === 3 && ix.cols.text === 2 && ix.header === 3, 'excel ingest 3 items, header row 4, text col C');
  ix.items.forEach(i => { i.zh = '中文回覆' + i.no; i.en = 'Reply ' + i.no + '\nline2'; });
  const xo = await E.writeExcelSame(ExcelJS, ab(F('vendor.xlsx')), ix, ix.items, 'both');
  fs.writeFileSync('/tmp/claude-0/out_vendor.xlsx', Buffer.from(xo));
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(xo); const ws2 = wb2.getWorksheet('Deviation List');
  ok(E.str(ws2.getCell(4, 5).value) === '我方回覆 Our Response' && /中文回覆1/.test(E.str(ws2.getCell(5, 5).value)) && ws2.getCell(4,5).font?.bold, 'excel reply col added with header style');
  ok(E.str(ws2.getCell(1, 1).value).includes('Deviation List') && E.str(ws2.getCell(7, 4).value) === '請貴司同意', 'excel original content preserved');
  // docx table
  const it = await E.ingestDocx(JSZip, ab(F('vendor_table.docx')));
  console.log(it.note); ok(it.items.length === 2 && it.cols.text === 2, 'docx table ingest');
  it.items.forEach(i => { i.zh = '恕難同意' + i.no; i.en = 'We cannot accept.'; });
  const dout = await E.writeDocxSame(JSZip, ab(F('vendor_table.docx')), it, it.items, 'zh');
  fs.writeFileSync('/tmp/claude-0/out_table.docx', Buffer.from(dout));
  const re = await E.ingestDocx(JSZip, dout); ok(re.cols.reply === 3 && re.items[0].existingReply === '恕難同意1', 'docx reply column added and filled');
  // docx list
  const il = await E.ingestDocx(JSZip, ab(F('vendor_list.docx')));
  ok(il.table === -1 && /付款天期/.test(il.text), 'docx list -> text for splitting');
  const pd = Core.parseDeviations(il.text); console.log('local split:', pd.map(x => x.no + ':' + x.text));
  const items = pd.filter(x => /^\d+$/.test(x.no) && x.text.length > 3);
  items.forEach(i => { i.zh = '回覆' + i.no; });
  const lout = await E.writeDocxSame(JSZip, ab(F('vendor_list.docx')), il, items, 'zh');
  fs.writeFileSync('/tmp/claude-0/out_list.docx', Buffer.from(lout));
  const li = await E.ingestDocx(JSZip, lout); ok(li.items.length >= 1 && li.cols.reply === 2, 'docx list -> appended reply table');
  // clarification
  const co = await E.writeClarification(ExcelJS, ix.items, { project: 'P1', vendor: 'V' }, 'en');
  fs.writeFileSync('/tmp/claude-0/out_clar.xlsx', Buffer.from(co)); ok(co.byteLength > 1000, 'clarification sheet');
  // rules & prompts
  const pending = [{ clauseId: 'C-PAY-01', field: '底線_可接受', newVal: '付款天期最多同意 60 日', by: 'Jim' }];
  const ec = E.effectiveClause(master, pending, 'C-PAY-01'); ok(ec.待核.length === 1, 'pending rule attached');
  const ut = E.draftUserText([{ no: '1', text: 'payment 30 days', hint: 'C-PAY-01' }], ['C-PAY-01'], master, pending, true);
  ok(ut.includes('付款天期最多同意 60 日') && ut.includes('內部底線'), 'draft prompt includes bottom line & pending rule');
  ok(!E.draftUserText([{ no: '1', text: 'x' }], ['C-PAY-01'], master, pending, false).includes('付款天期最多同意 60 日'), 'bottom lines withheld when disabled');
  ok(E.bottomLeak({ zh: '我方可同意 60 日付款', en: '', text: 'payment 30 days' }, ec).length === 1, 'bottom-line leak detected');
  ok(E.bottomLeak({ zh: '恕難同意 30 日', en: '', text: '30 日' }, ec).length === 0, 'no false leak when vendor said it');
  ok(E.resolveLang('auto', ix.items) === 'auto' && E.replyText({text:'保固改為12個月',zh:'中',en:'E'},'auto')==='中' && E.replyText({text:'payment 30 days',zh:'中',en:'E'},'auto')==='E', 'auto lang per item');
  // master merge
  const m = await E.mergeIntoMaster(ExcelJS, ab(F('master.xlsx')), { proposals: [['P1', '2026-10-18', 'Jim', '修改內容', 'C-PAY-01', '底線_可接受', '', '最多 60 日', '案例', '', '', '']], logs: [['R1', '2026-10-18', 'Jim', 'P', 'V', 'C-PAY-01', 'x', '接受', 'a', 'b', '否', '', '']], dict: [['公司', '大展公司', 'Jim', '2026-10-18']] });
  const m2 = await E.mergeIntoMaster(ExcelJS, m.buf, { proposals: [['P1', '2026-10-18', 'Jim', '修改內容', 'C-PAY-01', '底線_可接受', '', '最多 60 日', '案例', '', '', '']], logs: [], dict: [] });
  const mm = Core.parseMaster(XLSX, Buffer.from(m2.buf));
  ok(m.res.proposals === 1 && m2.res.skipped === 1 && mm.proposals.length === 1 && mm.logs.length === 1 && mm.dict.length === 1 && mm.clauses.length === 20, 'master merge append + dedupe');
  const wbm = new ExcelJS.Workbook(); await wbm.xlsx.load(m2.buf); ok(wbm.getWorksheet('條款庫').dataValidations && wbm.getWorksheet('條款庫').getCell('A1').font.bold, 'master formatting kept');
  // from scratch
  const nb = await E.buildNewMaster(ExcelJS, { clauses: [Object.assign(Object.fromEntries(Core.SCHEMA.條款庫.map(k => [k, ''])), { 條款ID: 'N-1019-Jim-1', 條款名稱: '付款條件', 關鍵字: '付款;payment', 底線_可接受: '最多 60 日', 狀態: '待核' })], logs: [['R1', '2026-10-19', 'Jim', '', '', 'N-1019-Jim-1', 'x', '接受', 'a', 'b', '否', '', '']], dict: [] });
  const nm = Core.parseMaster(XLSX, Buffer.from(nb));
  ok(!nm.errors.length && !nm.warnings.length && nm.clauses.length === 1 && nm.clauses[0].狀態 === '待核' && nm.logs.length === 1, 'build new master from scratch');
  const nb2 = await E.mergeIntoMaster(ExcelJS, nb, { clauses: [Object.assign(Object.fromEntries(Core.SCHEMA.條款庫.map(k => [k, ''])), { 條款ID: 'N-1019-Jim-2', 條款名稱: '保固', 狀態: '待核' })], proposals: [], logs: [], dict: [] });
  ok(Core.parseMaster(XLSX, Buffer.from(nb2.buf)).clauses.length === 2, 'merge new clause into master');
  ok(E.draftUserText([{ no: '1', text: 'x' }], [], E.EMPTY_MASTER(), [], true).includes('未比對到條款'), 'draft prompt works with empty rules');
  // reference library
  const R = Ref;
  ok(R.STANDARDS.length === 16 && R.STANDARDS.every(x => R.GROUPS.includes(x.group)), 'reference library 16 topics in known groups');
  ok(R.match('Payment shall be made within 30 days after invoice', null, 1)[0].id === 'T02', 'match payment -> T02');
  ok(R.match('責任上限降為合約金額 50%', null, 1)[0].id === 'T04', 'match liability cap -> T04');
  ok(R.match('逾期罰款上限降為 5%', null, 1)[0].id === 'T05', 'match LD -> T05');
  const dt = E.draftUserText([{ no: '1', text: 'payment 30 days', topics: ['T02'] }], [], E.EMPTY_MASTER(), [], true, [R.STANDARDS[1]], 'goods');
  ok(dt.includes('制式條款參考') && dt.includes('財物範本') && !dt.includes('工程會工程範本') && !dt.includes('【待查證】'), 'draft prompt includes refs filtered by doc kind');
  ok(E.DRAFT_SYSTEM.includes('不可提及 FIDIC') && E.DRAFT_SYSTEM.includes('sugZh'), 'system prompt: internal-only refs + suggested clause');
  const ix2 = await E.ingestExcel(ExcelJS, XLSX, ab(F('vendor.xlsx')), 'vendor.xlsx');
  ix2.items.forEach((i, k) => { i.zh = '回覆' + k; i.en = 'R' + k; if (k === 0) { i.sugZh = '付款期限修正為發票後 60 日。'; i.sugEn = 'Payment within 60 days after invoice.'; } });
  const xo2 = await E.writeExcelSame(ExcelJS, ab(F('vendor.xlsx')), ix2, ix2.items, 'both');
  const w3 = new ExcelJS.Workbook(); await w3.xlsx.load(xo2); const s3 = w3.getWorksheet('Deviation List');
  ok(E.str(s3.getCell(4, 6).value).startsWith('建議修正條文') && /60 日/.test(E.str(s3.getCell(5, 6).value)) && !E.str(s3.getCell(6, 6).value), 'excel suggested clause column');
  const td = await E.ingestDocx(JSZip, ab(F('vendor_table.docx'))); td.items.forEach(i => { i.zh = '回覆'; if (i.no === '1') i.sugZh = '預付款以 10% 為限，並提供等額保證。'; });
  const re2 = await E.ingestDocx(JSZip, await E.writeDocxSame(JSZip, ab(F('vendor_table.docx')), td, td.items, 'zh'));
  ok(/建議修正條文/.test(re2.items[0].existingReply) && !/建議修正條文/.test(re2.items[1].existingReply), 'docx suggested clause appended in reply cell');
  const cl2 = await E.writeClarification(ExcelJS, ix2.items, {}, 'zh'); const w4 = new ExcelJS.Workbook(); await w4.xlsx.load(cl2);
  ok(E.str(w4.worksheets[0].getCell(4, 5).value) === '建議修正條文', 'clarification suggested column');
  const nb3 = await E.buildNewMaster(ExcelJS, { clauses: [], logs: [], dict: [] });
  const rs = E.readRefSheet(XLSX, Buffer.from(nb3));
  ok(rs && rs.length === 16 && rs[1].id === 'T02', 'new master has 制式條款參考 sheet readable');
  const mm3 = await E.mergeIntoMaster(ExcelJS, ab(F('master.xlsx')), { clauses: [], proposals: [], logs: [], dict: [] });
  ok(mm3.res.refAdded && E.readRefSheet(XLSX, Buffer.from(mm3.buf)).length === 16, 'merge adds ref sheet to old master');
  const ov = R.merge(R.STANDARDS, [{ id: 'T02', pccW: '自訂：付款 30 工作天' }, { id: 'T99', group: '期限', name: '新主題', keywords: 'abc' }]);
  ok(ov.find(x => x.id === 'T02').pccW === '自訂：付款 30 工作天' && ov.find(x => x.id === 'T02').red && ov.length === 17, 'rule-file override merges');
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
