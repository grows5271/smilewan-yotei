// 記録の点検（ツールのページで実行する）。recRows（今開いている1人分）を調べて、問題の一覧を返す
// 使い方：await qaBuildAll('2026-10') … 全員の10月を作り直して点検（保存しない）
//        qaCheckRows(name) … 今開いている記録を点検
window.qaCheckRows = function (name) {
  const out = [], add = (r, kind, msg) => out.push({ name, date: ymd(r.date), start: r.e.start || entryTime(r.e).s || '', type: r.e.type || '', kind, msg });
  const K = kubunOf(name) === '介護', NG = [...getNgList(), ...clientNg(name)];
  const rows = recRows.filter(r => r.on && r.text).slice().sort((a, b) => (a.date - b.date) || (entryTime(a.e).s || '').localeCompare(entryTime(b.e).s || ''));
  const seen = new Set(); let dup = 0, sents = 0;
  rows.forEach(r => {
    const t = String(r.text), kp = kpAll(r), v = vOf(r), tm = tmplFor(r), dow = r.date.getDay();
    // 1. 見本どおりか（見本がある訪問）
    if (tm) (tm.checked || []).forEach(k => {
      if (k === '食事|完食') return; if ((tm.dayOnly || {})[k] && !tm.dayOnly[k].includes(dow)) return; if ((r.kpOff || []).includes(k)) return;
      if (r.sick && /入浴介助|清拭/.test(k)) return;
      if ((tm.either || []).some(g => g.includes(k))) return;
      if (!kp.includes(k)) add(r, '見本と違う', `見本にある「${k}」が付いていない（用紙p${tm.page}）`);
    });
    // 2. チェックと文章
    MENTION.forEach(([k, re]) => { if (kp.includes(k) && !re.test(t)) add(r, 'チェックと文章', `「${k.split('|')[1]}」にチェックがあるのに文章に無い`); });
    const tNoLink = t.split(/(?<=。)/).filter(x => !LINK_RE.test(x)).join('');
    [['入浴・清拭|入浴介助', /入浴介助を行|浴槽への出入り|浴槽に/], ['入浴・清拭|洗髪', /洗髪/], ['起床・就寝|起床介助', /起床介助|起き上がり/], ['起床・就寝|就寝介助', /就寝介助|就寝の準備を手伝/]].forEach(([k, re]) => {
      if (!kp.includes(k) && re.test(tNoLink) && !r.sick) add(r, '文章とチェック', `文章に「${tNoLink.match(re)[0]}」があるのに「${k.split('|')[1]}」にチェックが無い`); });
    if (typeof MENTION_NOT !== 'undefined') { const keepS = typeof sickKeep === 'function' ? sickKeep() : () => false, rules = typeof mnRules === 'function' ? mnRules(r) : (r.sick ? [] : MENTION_NOT); t.split(/(?<=。)/).filter(x => x.trim() && !LINK_RE.test(x) && !keepS(x.trim())).forEach(x => rules.forEach(([keys, re]) => { if (re.test(x) && !keys.some(k => kp.includes(k))) add(r, '文章とチェック', `チェックが無いのに文章に「${x.match(re)[0]}」：${x.slice(0, 30)}`); })); }
    // 3. NG・完食
    NG.forEach(w => { if (w && t.includes(w)) add(r, 'NG表現', `「${w}」`); });
    if (kp.includes('食事|完食') && !(r.kpOn || []).includes('食事|完食')) add(r, '完食', '完食にチェック');
    // 4. 呼び方
    if (K && /本人/.test(t)) add(r, '呼び方', '介護なのに「本人」');
    if (!K && /利用者様/.test(t)) add(r, '呼び方', '障害なのに「利用者様」');
    // 5. 体調不良
    if (r.sick) {
      if (typeof isPureBath === 'function' && !isPureBath(r)) add(r, '体調不良', '入浴だけでない訪問が体調不良になっている');
      if (!kp.includes('入浴・清拭|シャワー浴')) add(r, '体調不良', 'シャワー浴が無い');
      if (kp.includes('入浴・清拭|入浴介助')) add(r, '体調不良', '入浴介助が残っている');
      if (kp.includes('入浴・清拭|清拭') && !(r.kpOn || []).includes('入浴・清拭|清拭')) add(r, '体調不良', '清拭が残っている');
      if (v.顔色 !== '不良') add(r, '体調不良', '顔色が不良でない');
      if (/清拭/.test(t)) add(r, '体調不良', '文章に清拭');
    }
    if (r.kind === '家事援助' && (r.sick || kp.includes('入浴・清拭|シャワー浴') || /シャワー浴/.test(t))) add(r, '体調不良', '家事の訪問にシャワー浴（シャワー浴は身体の訪問だけ）');
    // 6. 共に行う：共にの訪問以外で共に行う項目／共に行う項目と同じ家事が普通の欄にも
    const tog = kp.filter(k => TOGETHER_RE.test(k) && !(tm && (tm.checked || []).includes(k)));
    if (tog.length && !visTogether(r.e) && !(tm && /共に/.test(tm.type || ''))) add(r, '共に行う', `共にの訪問でないのに「${tog.map(k => k.split('|')[1]).join('・')}」`);
    // 7. 買物の金額
    if (kp.includes('買物等|日常品等の買物')) {
      if (!v.預り) add(r, '買物', '金額が入っていない');
      else if (+v.預り - +v.購入 !== +v.お釣) add(r, '買物', `預り${v.預り}−購入${v.購入}≠お釣${v.お釣}`);
    }
    // 8. 時刻の流れ
    const h = Math.floor((hm(entryTime(r.e).s) || 720) / 60), pos = re => { const m = t.match(re); return m ? m.index : -1; };
    if (h < 12) { const tn = t.split(/(?<=。)/).filter(x => !LINK_RE.test(x)).join(''), a = tn.search(/起床|起き上が/), b = tn.search(/朝食|配膳/); if (a >= 0 && b >= 0 && a > b) add(r, '順番', '起床が朝食より後'); }
    else { const t2 = t.replace(/[、の]?(食後|食べ終えた後|食事の後|食事が済んでから)(に|は)?[^。]*(就寝|寝る)[^。]*/g, ''), a = t2.search(/就寝|ベッドへ|ベッドに/);
      if (a >= 0 && t2.slice(a).search(/服薬|薬を|の薬|洗面|歯磨き|口腔|夕食|配膳/) > 0 && !/眠前薬|寝る前の薬/.test(t2.slice(a))) add(r, '順番', '就寝の後に服薬・洗面・食事'); }
    { const ss0 = t.split(/(?<=。)/).filter(x => x.trim()); const ci = ss0.findIndex(x => typeof CLOSE_RE !== 'undefined' && CLOSE_RE.test(x) && !LINK_RE.test(x));
      if (ci >= 0 && ss0.slice(ci + 1).some(x => /代行|購入|掃除|清掃|洗濯|調理|配膳|入浴|洗髪|更衣|着替え|服薬/.test(x) && !LINK_RE.test(x) && !/「/.test(x))) add(r, '順番', '締めの文の後に支援の文'); }
    if (typeof orderFlow === 'function' && !r.sick) { const c = { ...r, e: r.e, text: t }; try { orderFlow(c); } catch (e) {} if (c.text !== t) add(r, '順番', '支援の流れの順になっていない'); }
    // 8.5 計画書（業務手順書）の手順の言い回し：その訪問に当たる手順の文が文章にあるか（チェックの無い支援・本人がやることは数えない）
    if (typeof planCands === 'function' && !r.sick) { const c = planCands(r, t), n = c.length; if (n > 0 && c.filter(x => x.present).length < n) add(r, '計画書', `計画書の手順の文が足りない（例：${c.find(x => !x.present).says[0].slice(0, 24)}）`); }
    if (typeof planDedupe === 'function' && planDedupe(r, t) !== t) add(r, '計画書', '手順書の文と同じ意味の決まった文が残っている');
    // 8.6 献立・買い物支援で選んだ料理・保存した買い物の品物が文章にあるか
    if (typeof withKd === 'function' && !r.sick && withKd(r, t) !== t) add(r, '献立アプリ', '献立（献立アプリ・手順書のメニュー）や買った品物が文章に無い');
    // 9. 同じ文が2回（同じ訪問の中）・空の文
    const ss = t.split(/(?<=。)/).filter(x => x.trim()); const inRow = new Set();
    ss.forEach(x => { sents++; if (inRow.has(x)) add(r, '重複', `同じ訪問に同じ文：${x.slice(0, 30)}`); inRow.add(x); if (seen.has(x)) dup++; seen.add(x); });
    if (!ss.length) add(r, '文章', '文章が空');
    if (/。。|、。|、、/.test(t)) add(r, '文章', '句読点の重なり');
    // 10. 家事の訪問はゴミ出し
    if (r.kind === '家事援助' && tm && !kp.includes('清掃|ゴミ出し')) add(r, 'ゴミ出し', '家事なのにゴミ出しが無い');
    if (r.kind === '家事援助' && kp.some(k => k.startsWith('清掃|')) && !kp.includes('清掃|居室') && !(r.kpOff || []).includes('清掃|居室')) add(r, '居室', '家事の清掃なのに居室が無い');
  });
  // 12. 同じ日・同じ時刻の訪問が2つ（時刻欄が空の古い行と、時刻の入った行）
  { const g = new Map(); rows.forEach(r => { const s = entryTime(r.e).s; if (!s) return; const k = ymd(r.date) + ' ' + s; g.set(k, [...(g.get(k) || []), r]); });
    g.forEach(v => { if (v.length > 1 && v.some(r => r.e.start)) v.filter(r => !r.e.start).forEach(r => add(r, '二重の訪問', '同じ日・同じ時刻に訪問が2つ（時刻欄が空の古い行）')); }); }
  // 13. 同じ日に時間の重なる同じ種類の訪問（予定表の時刻を変えたときの古い行など）。どちらが正しいかは人が決める
  { const bd = new Map(); rows.forEach(r => { const s = hm(entryTime(r.e).s); if (s == null || !r.e.start) return; const k = ymd(r.date); bd.set(k, [...(bd.get(k) || []), r]); });
    bd.forEach(v => { v.sort((a, b) => hm(entryTime(a.e).s) - hm(entryTime(b.e).s)); for (let i = 1; i < v.length; i++) { const a = v[i - 1], b = v[i], as = hm(entryTime(a.e).s), ae = hm(entryTime(a.e).e) || as + 30, bs = hm(entryTime(b.e).s); if (a.kind === b.kind && bs - as <= 30 && bs < ae) add(b, '重なる訪問', `同じ日に時間の重なる訪問が2つ（${entryTime(a.e).s}〜${entryTime(a.e).e}と${entryTime(b.e).s}〜${entryTime(b.e).e}）。シフトと合う方を残して、もう片方は外してください`); } }); }
  // 11. 体調不良の日と共に行う日
  const togDays = new Set(rows.filter(r => r.kind !== '家事援助' && visTogether(r.e)).map(r => ymd(r.date)));
  rows.filter(r => r.sick && togDays.has(ymd(r.date))).forEach(r => add(r, '体調不良', '共に行う日に体調不良'));
  return { out, dupPct: sents ? Math.round(dup / sents * 1000) / 10 : 0, rows: rows.length };
};
// 全員分を作り直して点検（保存はしない）
window.qaBuildAll = async function (ym, opt = {}) {
  const save = window.saveRecords, mark = window.markRecDirty, put = window.putDoc, conf = window.confirm, al = window.alert;
  window.saveRecords = async () => true; window.markRecDirty = () => {}; window.putDoc = async () => true; window.confirm = () => true; window.alert = () => {};
  const res = { people: [], issues: [], dup: {} };
  try {
    const names = (opt.names || Object.keys(getStore())).sort((a, b) => a.localeCompare(b, 'ja'));
    const [y, m] = ym.split('-').map(Number), last = new Date(y, m, 0).getDate();
    for (const n of names) {
      loadSaved(n); document.getElementById('recFrom').value = `${ym}-01`; document.getElementById('recTo').value = `${ym}-${String(last).padStart(2, '0')}`;
      try { await buildRecords(); } catch (e) { res.issues.push({ name: n, kind: 'エラー', msg: String(e && e.message || e) }); continue; }
      const q = qaCheckRows(n); res.people.push({ name: n, rows: q.rows, issues: q.out.length, dupPct: q.dupPct }); res.issues.push(...q.out);
      if (opt.keep) (window._qaRows = window._qaRows || {})[n] = recRows.map(r => ({ date: ymd(r.date), start: r.e.start || entryTime(r.e).s, on: r.on, kp: kpAll(r), text: r.text, sick: !!r.sick }));
    }
  } finally { window.saveRecords = save; window.markRecDirty = mark; window.putDoc = put; window.confirm = conf; window.alert = al; }
  return res;
};
