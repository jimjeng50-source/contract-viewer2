const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const D = __dirname, sent = [];
const J = o => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.addInitScript(() => { delete window.showOpenFilePicker; window.showOpenFilePicker = undefined; });
  await p.route('**/generativelanguage.googleapis.com/**', async r => {
    const body = JSON.parse(r.request().postData()); sent.push(body);
    const sys = body.systemInstruction.parts[0].text, user = body.contents[0].parts.map(x => x.text || '[IMG]').join('');
    let out;
    if (sys.includes('文件整理員')) out = { items: [{ no: '1', ref: '', text: '付款條件：要求發票後 30 天付款。' }, { no: '2', ref: '', text: '責任上限降為合約金額 50%。' }] };
    else if (sys.includes('使用者對你先前草擬')) out = { stance: '有條件接受', bottom: '可接受', zh: '我方可同意發票後 60 日付款，惟須提供等額保證。', en: 'We can accept payment within 60 days provided a guarantee is furnished.', reason: '依意見調整', rule: { clauseId: 'C-PAY-01', field: '底線_可接受', value: '付款天期最多可同意 60 日，但須提供等額保證', summary: '付款天期上限 60 日＋保證' } };
    else { const nos = [...user.matchAll(/\n\((\d+)\)/g)].map(m => m[1]); const tok = (user.split('【代號保留規則】')[0].match(/〔公司\d\d〕/) || [''])[0]; out = { items: nos.map(n => ({ no: n, clauseId: 'C-PAY-01', stance: '拒絕維持原條款', bottom: '不可接受', zh: `恕難同意，請依原條款辦理。${n === '1' ? tok : ''}`, en: 'We regret we cannot accept.', reason: '低於底線' })) }; }
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(J(out)) });
  });
  p.on('dialog', d => { console.log(' [confirm]', d.message().slice(0, 80)); d.accept(); });
  await p.goto('file://' + D + '/app.html');
  await p.click('#btnSettings'); await p.fill('#sUser', 'Jim'); await p.dispatchEvent('#sUser', 'change'); await p.fill('#sKey', 'AIzaX'); await p.dispatchEvent('#sKey', 'change'); await p.fill('#sGap', '0'); await p.dispatchEvent('#sGap', 'change'); await p.click('#dlgSet .dh button');
  await p.setInputFiles('#ruleIn', D + '/master.xlsx'); await p.waitForFunction(() => /條款/.test(document.querySelector('#ruleBadge').textContent));
  console.log('badge:', (await p.textContent('#ruleBadge')).slice(0, 60));
  async function run(file, opts = {}) {
    sent.length = 0;
    await p.setInputFiles('#fileIn', D + '/' + file);
    await p.waitForSelector('#btnDraft:not([disabled])');
    if (opts.vendor) { await p.fill('#sesVendor', opts.vendor); await p.dispatchEvent('#sesVendor', 'change'); }
    console.log(`\n== ${file}:`, (await p.textContent('#session .card')).replace(/\s+/g, ' ').slice(0, 160));
    await p.click('#btnDraft');
    for (let k = 0; k < 2; k++) {
      await p.waitForSelector('dialog#dlg[open]', { timeout: 15000 });
      const body = await p.textContent('#dlgBody');
      const leaks = ['大展', '彰濱', '東和'].filter(w => body.includes(w));
      console.log(' dialog:', await p.textContent('#dlgTitle'), '| leaks in preview:', leaks, '| send disabled:', await p.$eval('#dlgSend', x => x.disabled));
      await p.check('#dlgOk'); await p.click('#dlgSend');
      if (!opts.split) break;
      opts.split = false;
    }
    await p.waitForFunction(() => document.querySelectorAll('.item textarea[data-f=zh]').length > 0, null, { timeout: 15000 });
    const n = await p.$$eval('.item', x => x.length);
    console.log(' items', n, '| reply1:', await p.inputValue('.item >> nth=0 >> textarea[data-f=zh]'));
    const all = JSON.stringify(sent); console.log(' secrets sent:', ['大展', '彰濱', '東和', 'Deviation List'].filter(w => all.includes(w)), '| bottom line sent:', all.includes('可接受'));
    return n;
  }
  // 1 Excel + feedback/learn loop
  await run('vendor.xlsx', { vendor: '大展工程顧問股份有限公司' });
  await p.fill('.item >> nth=0 >> input[data-f=fb]', '可以同意 60 天，但要保證'); await p.dispatchEvent('.item >> nth=0 >> input[data-f=fb]', 'input');
  await p.click('.item >> nth=0 >> [data-a=revise]');
  await p.waitForSelector('.rule', { timeout: 15000 });
  console.log(' revised:', await p.inputValue('.item >> nth=0 >> textarea[data-f=zh]'));
  console.log(' leak chip:', await p.$$eval('.chip.bad', x => x.map(e => e.textContent)));
  await p.click('[data-a=learn]'); console.log(' learned:', await p.textContent('.note.ok'));
  console.log(' badge:', (await p.textContent('#ruleBadge')).match(/待核規則 \d+/)[0]);
  await p.click('#btnAgreeAll');
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]);
  await d1.saveAs(D + '/o_vendor.xlsx'); console.log(' exported', d1.suggestedFilename());
  // 2 Word table
  await run('vendor_table.docx', { vendor: '東和鋼鐵股份有限公司' });
  // next draft must include learned rule
  console.log(' learned rule in prompt:', JSON.stringify(sent).includes('付款天期最多可同意 60 日'));
  await p.click('#btnAgreeAll');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]); await d2.saveAs(D + '/o_table.docx');
  // 3 Word list
  await run('vendor_list.docx'); await p.click('#btnAgreeAll');
  const [d3] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]); await d3.saveAs(D + '/o_list.docx');
  // 4 text pdf
  await run('vendor.pdf'); await p.click('#btnAgreeAll');
  const [d4] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]); await d4.saveAs(D + '/o_pdf.xlsx');
  // 5 scan pdf (AI split with image, then draft)
  await run('scan.pdf', { split: true });
  console.log(' image part sent in split:', sent.some(s => s.contents[0].parts.some(x => x.inline_data)));
  await p.click('#btnAgreeAll');
  const [d5] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]); await d5.saveAs(D + '/o_scan.xlsx');
  // save rules (fallback: choose latest master, download merged)
  const fc = p.waitForEvent('filechooser'); await p.click('#btnSaveRules'); const ch = await fc; await ch.setFiles(D + '/master.xlsx');
  const d6 = await p.waitForEvent('download'); await d6.saveAs(D + '/o_master.xlsx');
  console.log('\nafter save badge:', (await p.textContent('#ruleBadge')).slice(0, 90));
  // monthly review
  await p.click('#btnReview'); const [d7] = await Promise.all([p.waitForEvent('download'), p.click('#rXlsx')]); await d7.saveAs(D + '/o_review.xlsx');
  console.log('review:', await p.textContent('#rOut'));
  await p.click('#dlgRev .dh button');
  await p.screenshot({ path: D + '/shot.png' });
  console.log('page errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
