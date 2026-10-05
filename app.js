(function () {
  const D = () => window.KEIGAN_DATA || { plants: [], articles: [], cases: [], samples: [], slips: [], observations: [] };
  const DOM = {
    pathology: ['植物病理学', 'sap'],
    chemistry: ['化学', 'ver'],
    physics: ['物理学', 'steel'],
    math: ['数学', 'indigo'],
    history: ['史学', 'blood'],
    present: ['現代', 'char']
  };
  let draft = '';
  let session = [];
  let compQ = '';
  let compD = 'all';
  let viewing = null;

  function entries() { return D().plants.concat(D().articles); }
  function cases() { return D().cases; }
  function domOf(id) { return DOM[id] || ['消去法', 'brass']; }

  function esc(s) {
    const dq = String.fromCharCode(34);
    return String(s == null ? '' : s)
      .split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
      .split(dq).join('&quot;');
  }

  function fold(s) {
    let o = '';
    for (const ch of String(s)) {
      const c = ch.charCodeAt(0);
      if (c >= 0xFF10 && c <= 0xFF19) o += String.fromCharCode(48 + c - 0xFF10);
      else if (ch === '％') o += '%';
      else o += ch;
    }
    return o;
  }

  function norm(s) {
    let o = '';
    for (const ch of fold(s).toLowerCase()) {
      if (ch !== ' ' && ch !== '\n' && ch !== '\t' && ch !== '　') o += ch;
    }
    return o;
  }

  function firstNum(s) {
    let cur = '';
    for (const ch of s) {
      if (ch >= '0' && ch <= '9') cur += ch;
      else if (ch === '.' && cur && cur.indexOf('.') < 0) cur += ch;
      else if (cur) return parseFloat(cur);
    }
    return cur ? parseFloat(cur) : null;
  }

  function lastNum(s) {
    let cur = '';
    let last = null;
    for (const ch of s) {
      if (ch >= '0' && ch <= '9') cur += ch;
      else if (ch === '.' && cur && cur.indexOf('.') < 0) cur += ch;
      else if (cur) { last = parseFloat(cur); cur = ''; }
    }
    if (cur) last = parseFloat(cur);
    return last;
  }

  function numAfter(text, keys) {
    for (const k of keys) {
      const i = text.indexOf(k);
      if (i < 0) continue;
      const n = firstNum(text.slice(i + k.length, i + k.length + 14));
      if (n != null) return n;
    }
    return null;
  }

  function numBefore(text, keys) {
    for (const k of keys) {
      const i = text.indexOf(k);
      if (i < 0) continue;
      const n = lastNum(text.slice(Math.max(0, i - 14), i));
      if (n != null) return n;
    }
    return null;
  }

  function asUnit(n) { if (n == null) return null; return n > 1 ? n / 100 : n; }

  function bayes(p, se, fpr) {
    const num = se * p;
    const den = num + fpr * (1 - p);
    if (!(den > 0)) return null;
    return num / den;
  }

  function pct(x) {
    if (x == null || !isFinite(x)) return '—';
    return (Math.round(x * 1000) / 10).toFixed(1) + '%';
  }

  function parseBayes(text) {
    const t = fold(text);
    let prior = null;
    const compact = norm(t);
    if (compact.indexOf('1/3') >= 0 || compact.indexOf('三分の一') >= 0) prior = 1 / 3;
    const pRaw = numAfter(t, ['事前確率', '事前']);
    if (pRaw != null && compact.indexOf('1/3') < 0) prior = asUnit(pRaw);
    const se = asUnit(numBefore(t, ['で捉え', '的中', '感度']) );
    const se2 = se != null ? se : asUnit(numAfter(t, ['的中', '感度', '捉え']));
    const fpr = asUnit(numBefore(t, ['で誤って', '誤検知', '偽陽性']));
    const fpr2 = fpr != null ? fpr : asUnit(numAfter(t, ['誤検知', '偽陽性', '誤って']));
    if (prior == null || se2 == null || fpr2 == null) return null;
    if (prior <= 0 || prior >= 1 || se2 <= 0 || se2 > 1 || fpr2 < 0 || fpr2 > 1) return null;
    return { prior, se: se2, fpr: fpr2, post: bayes(prior, se2, fpr2) };
  }

  function parseStain(text) {
    const t = fold(text);
    const major = numAfter(t, ['長径', '長軸']);
    const minor = numAfter(t, ['短径', '短軸']);
    if (major == null || minor == null) return null;
    return { major, minor };
  }

  function isHarm(text) {
    const keys = ['作り方を教', '合成手順', '致死量', '殺す方法', '殺し方', '爆弾', '完全犯罪', '毒の製造', '暗殺の手順', '何グラムで', '農薬の配合', '毒を作', '調合比'];
    return keys.some(k => text.indexOf(k) >= 0);
  }

  function rank(list, text) {
    const t = norm(text);
    return list.map(item => {
      let score = 0;
      if (item.title && t.indexOf(norm(item.title)) >= 0) score += 5;
      (item.aliases || []).forEach(a => { if (a && t.indexOf(norm(a)) >= 0) score += 3; });
      (item.keys || []).forEach(k => { if (k && t.indexOf(norm(k)) >= 0) score += 1; });
      return { item, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  }

  function chip(id) {
    const d = domOf(id);
    return '<span class="chip ' + d[1] + '">' + esc(d[0]) + '</span>';
  }

  function chips(ids) {
    const seen = {};
    let html = '';
    ids.forEach(id => {
      if (!id || seen[id]) return;
      seen[id] = 1;
      const d = domOf(id);
      html += '<span class="chip ' + d[1] + '">' + esc(d[0]) + '</span>';
    });
    return html || '<span class="chip brass">消去法</span>';
  }

  function bar(c) {
    const w = Math.max(0, Math.min(100, Math.round(c * 100)));
    return '<div class="bar" aria-hidden="true"><i style="width:' + w + '%"></i></div>';
  }

  function hypHTML(h) {
    return '<div class="hyp"><h3>' + esc(h.name) + '</h3><p class="meta">確度 ' + pct(h.confidence) + '。これは信念ではなく、材料の厚さだ。</p>' + bar(h.confidence) + '<p>支えるもの。' + esc(h.because) + '</p><p>棄てる条件。' + esc(h.kill) + '</p></div>';
  }

  function opinionHTML(op) {
    const hyps = (op.hypotheses || []).map(hypHTML).join('');
    const obs = (op.observations || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const disc = (op.discarded || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const next = (op.next || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const principles = (op.principles || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const calc = op.calc ? '<div class="lbl">計算</div><p>' + esc(op.calc) + '</p>' : '';
    const related = (op.related || []).map(id => {
      const e = entries().find(x => x.id === id) || cases().find(x => x.id === id);
      if (!e) return '';
      const href = cases().some(c => c.id === id) ? '#/cases/' + id : '#/compendium/' + id;
      return '<a class="chip brass" href="' + href + '">' + esc(e.title) + '</a> ';
    }).join('');
    return '<article class="paper"><div class="seal">慧</div><p class="kicker">鑑定意見書</p><h2>' + esc(op.title || '意見') + '</h2><p class="meta">顧問探偵 黒樫 慧。事実と推論は分けて書く。</p><div>' + chips(op.domains || []) + '</div><div class="lbl">依頼の要旨</div><p>' + esc(op.gist) + '</p>' + calc + '<div class="lbl">観察</div><ul>' + (obs || '<li>書かれた観察が薄い。</li>') + '</ul>' + (principles ? '<div class="lbl">一般原理（現場の事実ではない）</div><ul>' + principles + '</ul>' : '') + '<div class="lbl">仮説</div>' + hyps + (disc ? '<div class="lbl">捨てた説明</div><ul>' + disc + '</ul>' : '') + '<div class="lbl">結論</div><p>' + esc(op.conclusion) + '</p><div class="lbl">次に確かめること</div><ul>' + next + '</ul>' + (related ? '<div class="lbl">関連</div><p>' + related + '</p>' : '') + '<p class="meta">確度は、書かれた材料と、ここに編んだ知識の範囲である。当てずっぽうはしない。</p></article>';
  }

  function base(partial) {
    return Object.assign({
      title: '鑑定',
      gist: '',
      observations: [],
      domains: [],
      hypotheses: [],
      discarded: [],
      conclusion: '',
      next: [],
      principles: [],
      related: [],
      calc: ''
    }, partial);
  }

  function refuse() {
    return base({
      title: '受け取らない依頼',
      domains: ['chemistry'],
      gist: 'この依頼は鑑定ではなく、加害か製造の設計に見える。',
      observations: ['手順、配合、致死量、犯行の再現は書かない。', '依頼文そのももは、ここに転記しない。'],
      hypotheses: [{
        name: '合法な問いに書き直せる',
        confidence: 0.2,
        because: '見分け、歴史、予防、診断ならこの机の仕事だ。',
        kill: '加害の手順を求める限り、意見書は開かない。'
      }],
      conclusion: '見分ける論理、事件の歴史、病気の診断、防ぐ方へ書き直してほしい。',
      next: ['何を見分けたいのかを書く。', '現場で安全に観察できることだけを書く。']
    });
  }

  function sentences(text) {
    const raw = String(text).split('。').map(s => s.trim()).filter(Boolean);
    return raw.slice(0, 5).map(s => s + '。');
  }

  function consult(text, sess, opts) {
    opts = opts || {};
    const q = fold(String(text || '')).trim();
    if (!q) {
      return base({
        title: '空の依頼',
        gist: 'まだ何も書かれていない。',
        conclusion: '結論を出すには早い。観察を一つでも書いてほしい。',
        next: ['見たことと、見ていないことを分ける。']
      });
    }
    if (isHarm(q)) return refuse();
    const priorText = opts.board ? '' : (sess || []).map(s => s.q).join('\n');
    const blob = (priorText ? priorText + '\n' : '') + q;
    const b = parseBayes(q) || parseBayes(blob);
    const stain = parseStain(q) || parseStain(blob);
    const plants = rank(D().plants, blob);
    const arts = rank(D().articles, blob);
    const topA = arts[0] ? arts[0].item : null;

    if (b) return bayesOpinion(q, b, topA);
    if (stain) return stainOpinion(q, stain);
    if (norm(blob).indexOf('霜') >= 0 && (norm(blob).indexOf('窓') >= 0 || norm(blob).indexOf('外側') >= 0)) return frostOpinion(q);
    if (plants.length && plants[0].score >= 2) return plantOpinion(q, plants);
    if ((q.indexOf('とは') >= 0 || q.indexOf('原理') >= 0 || q.indexOf('何') >= 0) && (topA || plants[0])) {
      return defineOpinion(q, (plants[0] && plants[0].score >= (topA ? arts[0].score : 0)) ? plants[0].item : topA);
    }
    return genericOpinion(q, blob, plants, arts, opts);
  }

  function bayesOpinion(q, b, topA) {
    const post = b.post;
    const calc = '事前 ' + pct(b.prior) + '、的中 ' + pct(b.se) + '、誤って示す割合 ' + pct(b.fpr) + '。事後は ' + pct(post) + '。式は、的中×事前 を、それと「誤って示す割合×（1−事前）」の和で割ったもの。';
    return base({
      title: '陽性の読み方',
      domains: ['math'],
      gist: '数が揃っているので、仮定の上でただ計算する。有罪の宣言ではない。',
      calc: calc,
      observations: sentences(q).concat(['他の人を檢査したかどうかは、書かれていなければ使わない。', '関与者は一人、という事前の形を、文面どおりに受け取った。']),
      hypotheses: [
        {
          name: '事後確率は ' + pct(post),
          confidence: post,
          because: '与えられた事前、的中、誤りの三つだけから出た数だ。計算そのものは確かだ。世の中の有罪とは別だ。',
          kill: '事前が互いに排他でない、検査が独立でない、的中と誤りが別の値なら、この数は崩れる。'
        },
        {
          name: '陽性だから本人、は説明にならない',
          confidence: 1 - post,
          because: '残りは、無関係なのに陽性になった側に残る。',
          kill: '独立な第二の証拠が同じ人を指し、その誤りがよほど小さければ、こちらは細る。'
        }
      ],
      discarded: ['事前を書かずに、陽性を有罪の同義語にすること。'],
      conclusion: '仮定の上では事後確率 ' + pct(post) + '。これを「決まった」とは呼ばない。事前が甘ければ、同じ陽性でも答えは変わる。',
      next: ['事前は何から来たかを書く。勘と気分なら、そう書く。', '他の候補を檢査したなら、その陰陽も足す。', '検査の的中と誤りが、その現場で測られた値かを疑う。'],
      related: topA ? [topA.id, 'bayes'] : ['bayes', 'monty']
    });
  }

  function stainOpinion(q, s) {
    if (s.minor > s.major) {
      return base({
        title: '棃円として読めない',
        domains: ['physics'],
        gist: '短径が長径を超えている。棃円の定義に反する。',
        observations: ['長径 ' + s.major + '、短径 ' + s.minor + '。'],
        hypotheses: [{
          name: '測り違いか、長短の入れ違え',
          confidence: 0.7,
          because: '幅が長さを超える棃円はない。',
          kill: '測り直して短が長以下になれば、角度の話に進める。'
        }],
        conclusion: '入射角は計算しない。先に測り直す。',
        next: ['棃円の長軸と短軸を、面に沿って測り直す。', '尾の有無は別に記す。方向は角度からは出ない。']
      });
    }
    const ratio = s.minor / s.major;
    const deg = Math.asin(ratio) * 180 / Math.PI;
    const degS = (Math.round(deg * 10) / 10).toFixed(1);
    return base({
      title: '棃円の入射角',
      domains: ['physics'],
      gist: '面に対する入射角の見積もりだけを出す。誰がやったかは出ない。',
      calc: '角度 = arcsin(短径/長径) = arcsin(' + s.minor + '/' + s.major + ') = ' + degS + '度。面に対しての角で、90度が面に垂直に近い。',
      observations: [
        '長径 ' + s.major + '、短径 ' + s.minor + '。比は ' + (Math.round(ratio * 100) / 100) + '。',
        'これは飛び散りの形が棃円で、着弾時に大きく崩れていない、という仮定の上の式だ。',
        '尾の向き、距離、武器の種類は書かれていなければ足さない。'
      ],
      hypotheses: [
        {
          name: '入射角は約 ' + degS + '度',
          confidence: 0.72,
          because: '幅と長さの比だけから出る幾何だ。数そのものは固い。現場への適用は、斑が崩れた棃円であることを要する。',
          kill: '斑が吸収で広がった、曲面に付いた、重なった、なら式は使えない。'
        },
        {
          name: '角度は犯人の身長も距離も決めない',
          confidence: 0.8,
          because: '落下も風も着弾点も、この二数には入っていない。下から入ったように見えても、遠くからの落下でありうる。',
          kill: '距離、弾種、着弾の高さが独立に分かれば、身長の話は別に開ける。この角度だけでは開けない。'
        }
      ],
      discarded: ['棃円だけを見て、撃った人の立ち位置を一つに決めること。'],
      conclusion: '面に対する角はおよそ ' + degS + '度。それ以上の物語は、この斑が支えない。',
      next: ['斑の端が崩れていないかを見る。', '尾があれば、方向は尾の側で議論する。角度とは別の証拠だ。', '吸収しやすい布なら、見かけの幅を信じすぎない。'],
      related: ['stain', 'ballistic']
    });
  }

  function frostOpinion(q) {
    return base({
      title: '霜は阿里バイを証しない',
      domains: ['physics'],
      gist: '窓の外側だけに霜があり、室内は暖かい、という観察だ。出入りの有無とは別の話だ。',
      observations: [
        '結露や霜は、周りより冷たい面につく。',
        '暖かい部屋の窓で、外が冰点下なら、外側だけが白くなるのは普通の夜である。',
        '内側にも霜があるなら、室内側のガラスが冰点下だった、という別の観察になる。今はそうは書かれていない。',
        '「朝まで誰も入っていない」は言葉であって、霜が証した事実ではない。'
      ],
      hypotheses: [
        {
          name: '外側の霜は、暖房と冷夜の普通の結果',
          confidence: 0.74,
          because: '暖かい空気は内側のガラスを温め、外気は外側の面を冷やす。水蒸気は冷たい側で凝る。',
          kill: '外気温が冰点より明らかに高く、なお外側だけが霜だったなら、この説明は弱い。温度を測る。'
        },
        {
          name: '密室の主張は、霜からは出ない',
          confidence: 0.66,
          because: '出入りしても、部屋が暖かければ外側は霜だける。鍵も挿し金も足跡も、霜は代わらない。',
          kill: '内側ガラスの霜が指で擦かれている、という別の観察があれば、話は変わる。今の文には無い。'
        }
      ],
      discarded: ['外側の霜をもって、夜の間誰も入れなかったと証すること。'],
      conclusion: '霜は温度の物語を支持する。出入りについては沈黙している。結論を、盗難の成否にまで延ばすのは早計だ。',
      next: ['外気温と室温を数で書く。', '鍵、挿し金、床の乱れを、霜とは別の段に書く。', '内側のガラスを擦った痕があるかだけは見る。'],
      related: ['frost', 'cooling', 'frostcase']
    });
  }

  function plantOpinion(q, ranked) {
    const top = ranked.slice(0, 3);
    const hyps = top.map((x, i) => {
      const p = x.item;
      const c = Math.max(0.22, [0.62, 0.4, 0.28][i] - (x.score < 3 ? 0.08 : 0));
      return {
        name: p.title,
        confidence: i === 0 ? Math.min(0.68, 0.34 + x.score * 0.06) : c,
        because: p.summary,
        kill: p.confound || '宿主が違う、胞子が無い、条件が記事と反するなら下がる。'
      };
    });
    if (hyps.length === 1) {
      hyps.push({
        name: 'まだ名前を決めない',
        confidence: 0.48,
        because: '符合する語はある。ただし一つの病気に定めるには、宿主と胞子と分布が足りない。',
        kill: '裏面の胞子、維管束の褐変、同じ畡の広がりが確認できれば、上位の仮説が残る。'
      });
    }
    const names = top.map(x => x.item.title).join('、');
    return base({
      title: '病斑の照合',
      domains: ['pathology'],
      gist: '書かれた症状を、編んだ病害の語に照らした。顕微鏡はまだ見ていない。',
      observations: sentences(q).concat(['照合は語の重なりであって、分離ではない。', '上位は ' + names + '。']),
      hypotheses: hyps,
      discarded: ['病斑の色だけで、薬害か病気かを即断すること。胞子の有無が先だ。'],
      conclusion: top[0].score >= 4
        ? '現時点で最も整合するのは' + top[0].item.title + '。確定ではない。宿主と胞子を見るまで、名前は仮に置く。'
        : '結論を一つの病名にするには早い。上位は' + top[0].item.title + 'だが、混同が残っている。',
      next: [
        '宿主の植物名を書く。',
        '斑の裏にかびや粉があるか、ルーペで見る。',
        '湿り、窒素、散布の形（筋、随意、下葉からか）を分ける。',
        top[0].item.use || '近隣の株と比べる。'
      ],
      related: top.map(x => x.item.id).concat(['triangle'])
    });
  }

  function defineOpinion(q, item) {
    if (!item) return genericOpinion(q, q, [], [], {});
    return base({
      title: item.title,
      domains: [item.domain],
      gist: '項目の説明を求められたように読む。現場の断定ではない。',
      observations: item.observe || [item.summary],
      hypotheses: [{
        name: item.title + 'の標準的な理解',
        confidence: 0.58,
        because: item.summary,
        kill: item.confound || '条件が記事と違えば、別の項目に移る。'
      }],
      conclusion: item.summary,
      next: [item.use || '関連する項目と見比べる。', '自分の事例に当てはめるなら、観察を足して再び依頼する。'],
      related: item.related || []
    });
  }

  function genericOpinion(q, blob, plants, arts, opts) {
    const thin = q.length < 50;
    const obs = sentences(q);
    const domains = [];
    const principles = [];
    const related = [];
    if (plants[0]) { domains.push('pathology'); related.push(plants[0].item.id); }
    if (arts[0]) {
      domains.push(arts[0].item.domain);
      related.push(arts[0].item.id);
      principles.push(arts[0].item.title + '。' + arts[0].item.summary);
    }
    const hyps = [
      {
        name: '書かれた範囲の単純な読み',
        confidence: thin ? 0.28 : 0.36,
        because: '足されていない事実は使わない。文にある奇異を、まずそのまま奇異として置く。',
        kill: '時刻、位置、誰が見たか、何が無かったかが足され、単純な読みと矛盾すれば捨てる。'
      },
      {
        name: 'まだ測っていない量がある',
        confidence: thin ? 0.55 : 0.4,
        because: '短い依頼ほど、結論の穴は大きい。確度を盛るのは、材料が足りないことの告白である。',
        kill: '反証できる観察が三つ以上、互いに独立に揃えば、この仮説は下がる。'
      }
    ];
    if (principles.length) {
      hyps.push({
        name: '博物誌の原理を参照する',
        confidence: 0.33,
        because: principles[0] + '。これは現場で起きたことではない。',
        kill: '依頼の条件がこの原理の適用外なら、参照を外す。'
      });
    }
    const op = base({
      title: thin ? 'まだ薄い' : '一応の整理',
      domains: domains,
      gist: '書かれたことだけを下に置く。書かれていない傷も、人も、時刻も足さない。',
      observations: obs,
      principles: opts.board ? principles : [],
      hypotheses: hyps,
      discarded: ['文に無い物証を、あったことにして説明すること。'],
      conclusion: '結論を出すには早い。厚くしてから再び来てほしい。',
      next: ['確認した事実と、誰かの言葉とを行を分けて書く。', '時刻、場所、誰が触いていたかを足す。', '変だと思った点を一つ、具体的に書く。'],
      related: related.slice(0, 4)
    });
    if (!opts.board && principles.length) {
      op.observations = op.observations.concat(['参照できる原理がある。' + principles[0]]);
    }
    return op;
  }

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (e) { return []; }
  }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function route() {
    const h = location.hash || '#/';
    const raw = h.charAt(0) === '#' ? h.slice(1) : h;
    const bits = raw.split('?');
    const path = bits[0] || '/';
    const parts = path.split('/').filter(Boolean);
    const params = {};
    if (bits[1]) {
      bits[1].split('&').forEach(pair => {
        const i = pair.indexOf('=');
        const k = i < 0 ? pair : pair.slice(0, i);
        const v = i < 0 ? '' : pair.slice(i + 1);
        try { params[decodeURIComponent(k)] = decodeURIComponent(v); }
        catch (e) { params[k] = v; }
      });
    }
    return { parts, params };
  }

  function setNav(name) {
    document.querySelectorAll('nav a').forEach(a => {
      if (a.getAttribute('data-nav') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function homeHTML() {
    const obs = (D().observations || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const legend = Object.keys(DOM).map(id => {
      const d = DOM[id];
      return '<a class="' + d[1] + '" href="#/compendium?d=' + id + '">' + esc(d[0]) + '</a>';
    }).join('');
    return '<section class="hero"><div class="vlabel">顧問探偵室 · 十七号</div><div><h1>慧眼</h1><p class="en">KEIGAN</p><p class="ruby"><ruby>黒樫<rt>くろがし</rt></ruby> <ruby>慧<rt>けい</rt></ruby></p><p class="lead">観察し、仮説を並べ、一つずつ捨てる。植物の病斑も、血の棃円も、証言の確率も、同じ机で扱う。世界は細部に嘘をつかない。ただし、細部を見落とすのは人間の方だ。</p><div class="actions"><a class="btn solid" href="#/consult">相談する</a><a class="btn" href="#/cases">事件簿を開く</a></div></div></section><section class="obs"><h2>今日の観察</h2><ul>' + obs + '</ul><h2>扱う学</h2><div class="legend">' + legend + '</div></section>';
  }

  function consultHTML(params) {
    const slips = (D().slips || []).map((s, i) => '<button type="button" data-slip="' + i + '">' + esc(s) + '</button>').join('');
    const samples = (D().samples || []).map((s, i) => '<button type="button" class="textbtn" data-sample="' + i + '">' + esc(s.opinion.title) + '</button>').join('');
    const saved = load('keigan.opinions').map((s, i) => '<button type="button" class="textbtn" data-saved="' + i + '">' + esc(s.opinion.title) + '</button>').join('');
    let banner = '';
    if (params.case) {
      const c = cases().find(x => x.id === params.case);
      if (c) banner = '<p class="meta">事件「' + esc(c.title) + '」を桌に載せた。質問を足してから求めるとよい。</p>';
      if (c && !draft) {
        draft = '事件「' + c.title + '」を踏まえて相談する。\n分かっていること:\n' + (c.facts || []).join('\n') + '\n質問: ';
      }
    }
    const doc = viewing ? opinionHTML(viewing) : '<article class="paper"><p class="kicker">手控え</p><h2>まだ依頼は無い</h2><p>見本を開くか、左の短冊を押して文を置くとよい。空の机では、名前のついた結論は出さない。</p></article>';
    const thread = session.map(s => '<p class="meta">先の依頼。' + esc(s.q.slice(0, 80)) + '</p>').join('');
    return '<div class="consult"><section class="noprint"><h2 style="font-family:Shippori Mincho,serif;font-weight:600">依頼書</h2>' + banner + '<form id="ask"><label for="q">観察と、分からないこと</label><textarea id="q" name="q">' + esc(draft) + '</textarea><div class="actions"><button class="btn solid" type="submit">意見書を求める</button><button class="btn" type="button" id="reset">机を更ける</button></div></form><div class="lbl" style="color:#e0c48a">短冊</div><div class="slips">' + slips + '</div><div class="lbl" style="color:#e0c48a">見本</div><div class="cardlist">' + samples + '</div>' + (saved ? '<div class="lbl" style="color:#e0c48a">綴じた意見書</div><div class="cardlist">' + saved + '</div>' : '') + thread + '</section><section><div class="actions noprint"><button type="button" class="btn" id="bind">この意見書を綴じる</button></div><div id="doc">' + doc + '</div></section></div>';
  }

  function casesHTML() {
    const rows = cases().map(c => {
      const d = domOf(c.domain);
      return '<a class="rowitem" href="#/cases/' + c.id + '"><span class="' + d[1] + '">' + esc(d[0]) + ' · ' + esc(c.kind) + '</span><strong>' + esc(c.title) + '</strong><span>' + esc(c.when || '') + '</span></a><p class="meta" style="margin:-6px 0 10px">' + esc(c.summary) + '</p>';
    }).join('');
    return '<h2 style="font-family:Shippori Mincho,serif">事件簿</h2><p class="lead">史実は史実、創作は創作と書いた。推測を事実の段には入れない。</p>' + rows;
  }

  function caseHTML(id) {
    const c = cases().find(x => x.id === id);
    if (!c) return '<p>その事件は無い。</p>';
    const facts = (c.facts || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const time = (c.timeline || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const ded = (c.deduction || []).map(x => '<li><strong>' + esc(x.kind) + '。</strong>' + esc(x.text) + '</li>').join('');
    const open = (c.open || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const related = (c.related || []).map(rid => {
      const e = entries().find(x => x.id === rid);
      return e ? '<a class="chip brass" href="#/compendium/' + rid + '">' + esc(e.title) + '</a> ' : '';
    }).join('');
    return '<article class="paper"><p class="kicker">' + esc(c.kind) + ' · ' + esc(domOf(c.domain)[0]) + '</p><div class="seal">慧</div><h2>' + esc(c.title) + '</h2><p class="meta">' + esc(c.when || '') + '</p><p>' + esc(c.summary) + '</p><div class="lbl">分かっていること</div><ul>' + facts + '</ul><div class="lbl">時系列</div><ul>' + time + '</ul><div class="lbl">黒樫の推論</div><ul>' + ded + '</ul><div class="lbl">未解決</div><ul>' + open + '</ul><p>' + related + '</p><p><a class="btn ink" href="#/consult?case=' + c.id + '">この事件を相談に持ち込む</a></p></article>';
  }

  function compendiumHTML() {
    const filters = '<button type="button" data-d="all" aria-pressed="' + (compD === 'all' ? 'true' : 'false') + '">すべて</button>' + Object.keys(DOM).map(id => '<button type="button" data-d="' + id + '" aria-pressed="' + (compD === id ? 'true' : 'false') + '">' + esc(DOM[id][0]) + '</button>').join('');
    const q = norm(compQ);
    const list = entries().filter(e => (compD === 'all' || e.domain === compD) && (!q || norm(e.title + (e.latin || '') + (e.aliases || []).join('') + e.summary).indexOf(q) >= 0));
    const rows = list.map(e => {
      const d = domOf(e.domain);
      return '<a class="rowitem" href="#/compendium/' + e.id + '"><span class="' + d[1] + '">' + esc(d[0]) + '</span><strong>' + esc(e.title) + '</strong><span>' + esc(e.latin || '') + '</span></a>';
    }).join('');
    return '<h2 style="font-family:Shippori Mincho,serif">博物誌</h2><form class="search" id="find" role="search"><label for="cq">検索</label><input id="cq" type="search" value="' + esc(compQ) + '" placeholder="病名、ラテン名、霜、ベイズ"></form><div class="filters">' + filters + '</div><p class="meta">' + list.length + ' 件</p>' + rows;
  }

  function articleHTML(id) {
    const e = entries().find(x => x.id === id);
    if (!e) return '<p>その項目は無い。</p>';
    const obs = (e.observe || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const related = (e.related || []).map(rid => {
      const o = entries().find(x => x.id === rid) || cases().find(x => x.id === rid);
      if (!o) return '';
      const href = cases().some(c => c.id === rid) ? '#/cases/' + rid : '#/compendium/' + rid;
      return '<a class="chip brass" href="' + href + '">' + esc(o.title) + '</a> ';
    }).join('');
    return '<article class="paper"><p class="kicker">' + esc(domOf(e.domain)[0]) + '</p><h2>' + esc(e.title) + '</h2><p class="latin">' + esc(e.latin || '') + '</p><p>' + esc(e.summary) + '</p><div class="lbl">観察要点</div><ul>' + obs + '</ul><div class="lbl">混同しやすいもの</div><p>' + esc(e.confound || '') + '</p><div class="lbl">探偵が使うとき</div><p>' + esc(e.use || '') + '</p><p>' + related + '</p><p><a class="btn ink" href="#/consult?q=' + encodeURIComponent(e.title + 'について、見分けの要点を。') + '">この項目で相談する</a></p></article>';
  }

  function boardHTML() {
    const cards = load('keigan.board');
    const opts = Object.keys(DOM).map(id => '<option value="' + id + '">' + esc(DOM[id][0]) + '</option>').join('');
    const list = cards.map((c, i) => '<div class="clue"><header><span class="' + domOf(c.domain)[1] + '">' + esc(domOf(c.domain)[0]) + '</span><button type="button" data-del="' + i + '">外す</button></header><p>' + esc(c.text) + '</p></div>').join('');
    const doc = viewing ? opinionHTML(viewing) : '<article class="paper"><p class="kicker">推論盤</p><h2>札だけを信じる</h2><p>札は事実だけを書く。解釈は札にしない。総合するとき、私は札に無い物証を足さない。博物誌から借りるのは原理だけで、それと明記する。</p></article>';
    return '<div class="split"><section class="noprint"><h2 style="font-family:Shippori Mincho,serif">札</h2><form id="addc"><label for="ct">札の文</label><textarea id="ct"></textarea><label for="cd">学</label><select id="cd">' + opts + '</select><div class="actions"><button class="btn solid" type="submit">札を置く</button><button class="btn" id="syn" type="button">総合する</button><button class="btn" id="clearc" type="button">すべて外す</button></div></form><div class="cardlist">' + (list || '<p class="meta">まだ札が無い。</p>') + '</div></section><section><div id="doc">' + doc + '</div></section></div>';
  }

  function render() {
    const app = document.getElementById('app');
    if (!app) return;
    if (!window.KEIGAN_DATA) {
      app.innerHTML = '<p>知識が読めなかった。data.js を確認してほしい。</p>';
      return;
    }
    const r = route();
    const head = r.parts[0] || 'home';
    setNav(head === 'home' ? '' : head);
    const qEl = document.getElementById('q');
    if (qEl) draft = qEl.value;
    const cEl = document.getElementById('cq');
    if (cEl) compQ = cEl.value;
    let html = '';
    try {
      if (!r.parts.length) html = homeHTML();
      else if (r.parts[0] === 'consult') html = consultHTML(r.params);
      else if (r.parts[0] === 'cases' && r.parts[1]) html = caseHTML(r.parts[1]);
      else if (r.parts[0] === 'cases') html = casesHTML();
      else if (r.parts[0] === 'compendium' && r.parts[1]) html = articleHTML(r.parts[1]);
      else if (r.parts[0] === 'compendium') {
        if (r.params.d) compD = r.params.d;
        html = compendiumHTML();
      } else if (r.parts[0] === 'board') html = boardHTML();
      else html = '<p>その頁は無い。<a href="#/">戻る</a></p>';
      app.innerHTML = html;
    } catch (err) {
      app.textContent = '表示に失敗した。' + (err && err.message ? err.message : '');
      return;
    }
    bind();
    if (r.params.q && document.getElementById('q') && !draft) {
      draft = r.params.q;
      document.getElementById('q').value = r.params.q;
    }
    const titles = { consult: '相談室', cases: '事件簿', compendium: '博物誌', board: '推論盤' };
    document.title = (titles[head] ? titles[head] + ' — ' : '') + '慧眼';
  }

  function bind() {
    const form = document.getElementById('ask');
    if (form) {
      form.addEventListener('submit', ev => {
        ev.preventDefault();
        const text = document.getElementById('q').value;
        const op = consult(text, session, {});
        session.push({ q: text, opinion: op });
        viewing = op;
        draft = '';
        render();
      });
    }
    const reset = document.getElementById('reset');
    if (reset) reset.addEventListener('click', () => { session = []; viewing = null; draft = ''; render(); });
    document.querySelectorAll('[data-slip]').forEach(btn => {
      btn.addEventListener('click', () => {
        draft = D().slips[Number(btn.getAttribute('data-slip'))];
        const q = document.getElementById('q');
        if (q) q.value = draft;
      });
    });
    document.querySelectorAll('[data-sample]').forEach(btn => {
      btn.addEventListener('click', () => {
        viewing = D().samples[Number(btn.getAttribute('data-sample'))].opinion;
        render();
      });
    });
    document.querySelectorAll('[data-saved]').forEach(btn => {
      btn.addEventListener('click', () => {
        const all = load('keigan.opinions');
        viewing = all[Number(btn.getAttribute('data-saved'))].opinion;
        render();
      });
    });
    const bindBtn = document.getElementById('bind');
    if (bindBtn) bindBtn.addEventListener('click', () => {
      if (!viewing) return;
      const all = load('keigan.opinions');
      all.unshift({ at: new Date().toISOString(), opinion: viewing });
      save('keigan.opinions', all.slice(0, 24));
      render();
    });
    const find = document.getElementById('find');
    if (find) find.addEventListener('submit', ev => { ev.preventDefault(); compQ = document.getElementById('cq').value; render(); });
    const cq = document.getElementById('cq');
    if (cq) cq.addEventListener('input', () => { compQ = cq.value; render(); });
    document.querySelectorAll('[data-d]').forEach(btn => {
      btn.addEventListener('click', () => {
        compD = btn.getAttribute('data-d');
        location.hash = '#/compendium' + (compD === 'all' ? '' : '?d=' + compD);
      });
    });
    const addc = document.getElementById('addc');
    if (addc) addc.addEventListener('submit', ev => {
      ev.preventDefault();
      const text = document.getElementById('ct').value.trim();
      if (!text) return;
      const cards = load('keigan.board');
      cards.push({ text, domain: document.getElementById('cd').value });
      save('keigan.board', cards.slice(0, 16));
      render();
    });
    document.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cards = load('keigan.board');
        cards.splice(Number(btn.getAttribute('data-del')), 1);
        save('keigan.board', cards);
        render();
      });
    });
    const syn = document.getElementById('syn');
    if (syn) syn.addEventListener('click', () => {
      const cards = load('keigan.board');
      if (!cards.length) { viewing = null; render(); return; }
      const blob = cards.map(c => c.text).join('\n');
      const op = consult(blob, [], { board: true });
      op.title = '札の総合';
      op.gist = '札が ' + cards.length + ' 枚。以下の観察は札の文だけである。';
      op.observations = cards.map(c => c.text);
      op.domains = cards.map(c => c.domain).concat(op.domains || []);
      viewing = op;
      render();
    });
    const clearc = document.getElementById('clearc');
    if (clearc) clearc.addEventListener('click', () => { save('keigan.board', []); viewing = null; render(); });
  }

  const check = bayes(1 / 3, 0.85, 0.08);
  if (check == null || Math.abs(check - 0.8416) > 0.01) {
    console.warn('bayes self-check failed', check);
  }

  window.addEventListener('hashchange', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
