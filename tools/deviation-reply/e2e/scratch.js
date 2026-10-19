const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const D = __dirname, sent = [];
const J = o => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
let reviseCount = 0;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
  await p.route('**/generativelanguage.googleapis.com/**', async r => {
    const body = JSON.parse(r.request().postData()); sent.push(body);
    const sys = body.systemInstruction.parts[0].text, user = body.contents[0].parts.map(x => x.text || '').join('');
    let out;
    if (sys.includes('使用者對你先前草擬')) {
      reviseCount++;
      const existing = (user.match(/【條款 (\S+)｜/) || [])[1] || '';
      out = { stance: '有條件接受', bottom: '可接受', zh: '我方可同意發票後 60 日付款。', en: 'We can accept 60 days.', reason: '依意見',
        rule: { clauseId: existing, clauseName: '付款條件', category: '付款', keywords: '付款;付款天期;payment;invoice;days', field: reviseCount === 1 ? '底線_可接受' : '底線_不可接受', value: reviseCount === 1 ? '付款天期最多同意 60 日' : '發票後 30 日以內付款', summary: '付款天期' } };
    } else { const nos = [...user.matchAll(/\n\((\d+)\)/g)].map(m => m[1]); out = { items: nos.map(n => ({ no: n, clauseId: '', clauseName: '付款條件', stance: '拒絕維持原條款', bottom: '無對應', zh: '請依原條款辦理。', en: 'Please follow the original terms.', reason: '一般立場' })) }; }
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(J(out)) });
  });
  await p.goto('file://' + D + '/app.html');
  console.log('intro:', (await p.textContent('#intro')).slice(0, 70));
  await p.click('#btnSettings'); await p.fill('#sUser', 'Jim'); await p.dispatchEvent('#sUser', 'change'); await p.fill('#sKey', 'AIzaX'); await p.dispatchEvent('#sKey', 'change'); await p.fill('#sGap', '0'); await p.dispatchEvent('#sGap', 'change'); await p.click('#dlgSet .dh button');
  console.log('badge0:', await p.textContent('#ruleBadge'), '| save btn:', await p.textContent('#btnSaveRules'));
  const draft = async f => { sent.length = 0; await p.setInputFiles('#fileIn', D + '/' + f); await p.waitForSelector('#btnDraft:not([disabled])'); await p.click('#btnDraft'); await p.waitForSelector('dialog#dlg[open]'); await p.check('#dlgOk'); await p.click('#dlgSend'); await p.waitForFunction(() => document.querySelectorAll('.item textarea[data-f=zh]').length > 0); };
  // 1) no rules file at all
  await draft('vendor.xlsx');
  console.log('drafted without rules:', await p.$$eval('.item', x => x.length), 'items; clause select:', await p.$eval('.item select', s => s.options[s.selectedIndex].text));
  await p.fill('.item >> nth=0 >> input[data-f=fb]', '付款天期最多可以同意 60 天'); await p.dispatchEvent('.item >> nth=0 >> input[data-f=fb]', 'input');
  await p.click('.item >> nth=0 >> [data-a=revise]'); await p.waitForSelector('.rule');
  console.log('rule box:', (await p.textContent('.rule')).replace(/\s+/g, ' ').slice(0, 90));
  await p.click('[data-a=learn]'); console.log('learned:', await p.textContent('.note.ok'));
  console.log('badge1:', await p.textContent('#ruleBadge'), '| save btn:', await p.textContent('#btnSaveRules'));
  // second rule on same new clause should merge into it, not create another
  await p.fill('.item >> nth=0 >> input[data-f=fb]', '30 天以內一律不接受'); await p.dispatchEvent('.item >> nth=0 >> input[data-f=fb]', 'input');
  await p.click('.item >> nth=0 >> [data-a=revise]'); await p.waitForSelector('.rule'); await p.click('[data-a=learn]');
  console.log('local clauses:', await p.evaluate(() => S.localClauses.map(c => `${c.條款ID} ${c.條款名稱} 可接受=${c.底線_可接受} 不可接受=${c.底線_不可接受} 狀態=${c.狀態}`)));
  await p.click('#btnAgreeAll'); const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]); await d1.saveAs(D + '/s_out1.xlsx');
  // 2) next file uses learned rule
  await draft('vendor.pdf');
  console.log('learned rule used in next draft:', JSON.stringify(sent).includes('付款天期最多同意 60 日'));
  // 3) create rules file
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#btnSaveRules')]); await d2.saveAs(D + '/s_rules.xlsx');
  console.log('created:', d2.suggestedFilename(), '| badge2:', await p.textContent('#ruleBadge'));
  console.log('page errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
