const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
global.DOMParser = DOMParser; global.XMLSerializer = XMLSerializer;
global.Deid = require('../src/deid.js'); global.Core = require('../src/core.js');
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
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
