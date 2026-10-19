const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const D = __dirname, sent = [];
const J = o => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
  await p.route('**/generativelanguage.googleapis.com/**', async r => {
    const body = JSON.parse(r.request().postData()); sent.push(body);
    const sys = body.systemInstruction.parts[0].text, user = body.contents[0].parts.map(x => x.text || '').join('');
    let out;
    if (sys.includes('使用者對你先前草擬')) out = { stance: '有條件接受', bottom: '可接受', topicId: 'T02', zh: '我方可同意發票後 60 日付款。', en: 'We accept 60 days.', sugZh: '乙方開立合格發票後 60 日內付款。', sugEn: 'Payment shall be made within 60 days after receipt of a valid invoice.', reason: '參考工程會範本 15 工作天與 FIDIC 56 天', rule: { clauseId: '', topicId: 'T02', clauseName: '', field: '底線_可接受', value: '付款天期最多 60 日', summary: '付款上限 60 日' } };
    else { const nos = [...user.matchAll(/\n\((\d+)\)/g)].map(m => m[1]); out = { items: nos.map(n => ({ no: n, clauseId: '', clauseName: '', topicId: n === '1' ? 'T02' : 'T05', stance: n === '1' ? '有條件接受' : '拒絕維持原條款', bottom: '無對應', zh: '回覆' + n, en: 'Reply ' + n, sugZh: n === '1' ? '發票後 45 日內付款。' : '', sugEn: n === '1' ? 'Payment within 45 days after invoice.' : '', reason: '依制式條款判斷' })) }; }
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(J(out)) });
  });
  await p.goto('file://' + D + '/app.html');
  await p.click('#btnSettings'); await p.fill('#sUser', 'Jim'); await p.dispatchEvent('#sUser', 'change'); await p.fill('#sKey', 'AIzaX'); await p.dispatchEvent('#sKey', 'change'); await p.fill('#sGap', '0'); await p.dispatchEvent('#sGap', 'change'); await p.click('#dlgSet .dh button');
  await p.click('#btnRefs'); console.log('refs dialog:', await p.textContent('#refInfo'), '| rows', await p.$$eval('#refTable tr', x => x.length - 1), '| 待查證 chips', await p.$$eval('#refTable .chip.warn', x => x.length));
  await p.selectOption('#refGroup', '金額上限'); console.log('filter 金額上限 rows', await p.$$eval('#refTable tr', x => x.length - 1)); await p.click('#dlgRefs .dh button');
  await p.setInputFiles('#fileIn', D + '/vendor.xlsx'); await p.waitForSelector('#btnDraft:not([disabled])');
  await p.selectOption('#sesKind', 'goods');
  await p.click('#btnDraft'); await p.waitForSelector('dialog#dlg[open]');
  console.log('preview has refs:', (await p.textContent('#dlgBody')).includes('制式條款參考'), '| goods only:', !(await p.textContent('#dlgBody')).includes('工程會工程範本'));
  await p.check('#dlgOk'); await p.click('#dlgSend'); await p.waitForFunction(() => document.querySelectorAll('.item textarea[data-f=zh]').length > 0);
  console.log('chips:', await p.$$eval('.item .chip.o', x => x.map(e => e.textContent)));
  console.log('suggest textarea item1:', await p.inputValue('.item >> nth=0 >> textarea[data-f=sugZh]'), '| item2 has sug box:', !!(await p.$('.item >> nth=1 >> textarea[data-f=sugZh]')));
  await p.fill('.item >> nth=0 >> input[data-f=fb]', '最多可同意 60 天'); await p.dispatchEvent('.item >> nth=0 >> input[data-f=fb]', 'input');
  await p.click('.item >> nth=0 >> [data-a=revise]'); await p.waitForSelector('.rule');
  console.log('revise prompt has refs:', JSON.stringify(sent[sent.length - 1]).includes('制式條款參考'), '| rule:', (await p.textContent('.rule')).replace(/\s+/g, ' ').slice(0, 80));
  await p.click('[data-a=learn]'); console.log('local clause:', await p.evaluate(() => S.localClauses.map(c => `${c.類別}/${c.條款名稱}/${c.備註.slice(-14)}`)));
  await p.click('#btnAgreeAll'); const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]); await d.saveAs(D + '/r_out.xlsx');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#btnSaveRules')]); await d2.saveAs(D + '/r_rules.xlsx');
  console.log('page errors:', errs); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
