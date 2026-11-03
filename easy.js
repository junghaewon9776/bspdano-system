// ============================================================================
// 📱 쉬운 화면 — 어르신·현장 직원도 휴대폰으로: 큰 글씨·큰 버튼·한 단계씩
//   📷 사진 찍어 올리기 (무슨 사진? → 어디? → 찍기/앨범)
//   💰 견적 쓰기 (받는 곳 → 세트(면적만)/단가표/직접 → 합계 → 다 썼어요)
//   → 사장님은 PC 견적·계약 / 현장사진·보고서 에서 확인하고 뽑기만
//   데이터는 est.js(EST, /evtData/{공사}/Est) · photo.js(/phData) · pb.js(단가표·세트) 그대로 씀
// ============================================================================
var EZ = { pg: "home", st: "", loc: "", last: [], cat: "", sub: "", set: "", a: "", u: "py", pick: "", add: "" };
var EZ_ED = null;

(function(){
  if(document.getElementById("ezCss")) return;
  var st = document.createElement("style"); st.id = "ezCss";
  st.textContent = ".ez{font-size:18px;max-width:640px;margin:0 auto;color:#1c1917}" +
    ".ez .eb{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:66px;font-size:21px;font-weight:800;border:none;border-radius:16px;color:#fff;cursor:pointer;margin:0 0 12px;padding:12px 16px;box-shadow:0 3px 0 rgba(0,0,0,.18);font-family:inherit;text-align:center;line-height:1.25}" +
    ".ez .eb:active{transform:translateY(2px);box-shadow:none}" +
    ".ez .eb.sm{min-height:54px;font-size:18px}" +
    ".ez .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ez .g2 .eb{margin:0}" +
    ".ez .ttl{font-size:24px;font-weight:900;margin:6px 0 4px}.ez .sub{font-size:16px;color:#57534e;margin-bottom:14px}" +
    ".ez .box{background:#fff;border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.08)}" +
    ".ez input.big,.ez select.big{width:100%;font-size:21px;padding:14px;border:2px solid #a8a29e;border-radius:12px;box-sizing:border-box;font-family:inherit}" +
    ".ez .back{background:#57534e}.ez .chip{display:inline-block;font-size:18px;font-weight:700;padding:10px 16px;border-radius:24px;border:2px solid #7c4a21;color:#7c4a21;background:#fff;margin:0 8px 8px 0;cursor:pointer}" +
    ".ez .chip.on{background:#7c4a21;color:#fff}.ez .row{display:flex;gap:10px;align-items:center}" +
    ".ez .it{border:2px solid #e7e5e4;border-radius:14px;padding:12px;margin-bottom:10px;background:#fff}" +
    ".ez .tot{font-size:28px;font-weight:900;color:#7c4a21}";
  document.head.appendChild(st);
})();

function _ezB(bg, label, on, cls){ return '<button class="eb' + (cls ? " " + cls : "") + '" style="background:' + bg + '" onclick="' + on + '">' + label + '</button>'; }
function _ezGo(pg){ EZ.pg = pg; draw(); try { window.scrollTo(0, 0); } catch(e){} }
function _ezQ(s){ return esc(s).replace(/'/g, "\\'"); }

function dEasy(){
  try { localStorage.setItem("hs_easy", "1"); } catch(e){}
  if(!CUR_EVT && EZ.pg !== "newEvt") return '<div class="ez">' + _ezEvtPick() + '</div>';
  var ev = _estEvt();
  if(EST_EVT !== ev || !EST){ _estLoad(); return '<div class="ez"><div class="box">📡 불러오는 중...</div></div>'; }
  if(PH_EVT !== ev || !PH){ _phLoad(); return '<div class="ez"><div class="box">📡 사진 불러오는 중...</div></div>'; }
  var h = '<div class="ez">';
  if(EZ.pg === "photo") h += _ezPhoto();
  else if(EZ.pg === "est") h += _ezEst();
  else if(EZ.pg === "list") h += _ezList();
  else if(EZ.pg === "evt" || EZ.pg === "newEvt") h += _ezEvtPick();
  else h += _ezHome();
  return h + '</div>';
}

// ── 처음 화면 ──
function _ezHome(){
  var mine = Object.keys(EST || {}).length, ph = _phIds().length;
  var h = '<div class="box" style="background:#fbf3e8;border:2px solid #c08a52"><div style="font-size:15px;color:#7c4a21;font-weight:700">지금 공사</div><div class="ttl" style="margin:2px 0 10px">🏗️ ' + esc(CUR_EVT.nm || "") + '</div>';
  h += _ezB("#78716c", "🔄 다른 공사 고르기 / 새 공사", "_ezGo('evt')", "sm") + '</div>';
  h += _ezB("#0f766e", "📷 사진 찍어 올리기", "EZ.st='';EZ.loc='';EZ.last=[];_ezGo('photo')");
  h += _ezB("#7c4a21", "💰 견적 쓰기", "ezNewEst()");
  h += _ezB("#2563eb", "📋 이 공사 견적 보기 (" + mine + ")", "_ezGo('list')");
  h += '<div class="sub" style="text-align:center;margin-top:6px">사진 ' + ph + '장 올라가 있어요 · 다 쓰면 사장님이 확인하고 뽑아요</div>';
  h += '<div style="text-align:center;margin-top:18px"><button class="btn" style="background:#57534e;color:#fff;padding:10px 18px;font-size:14px" onclick="try{localStorage.removeItem(\'hs_easy\')}catch(e){};CTAB=\'est\';mkTabs();draw()">💻 원래 화면으로</button></div>';
  return h;
}

// ── 공사 고르기 / 새 공사 ──
function _ezEvtPick(){
  var h = '<div class="ttl">🏗️ 어느 공사예요?</div><div class="sub">누르면 그 공사로 바뀌어요</div>';
  (EVENTS || []).filter(function(e){ return e.active !== false; }).forEach(function(e){
    var on = CUR_EVT && CUR_EVT.evtId === e.evtId;
    h += _ezB(on ? "#7c4a21" : "#a8a29e", (on ? "✔ " : "") + esc(e.nm || e.evtId), "ezEvt('" + _ezQ(e.evtId) + "')", "sm");
  });
  h += '<div class="box" style="margin-top:10px"><div style="font-weight:800;margin-bottom:8px">➕ 새 공사 만들기</div><input class="big" id="ezNewEvt" placeholder="예: 수협 2공장 외곽 보수공사" value="' + esc(EZ.add) + '" oninput="EZ.add=this.value"><div style="height:10px"></div>' + _ezB("#16a34a", "새 공사 만들기", "ezNewEvt()") + '</div>';
  if(CUR_EVT) h += _ezB("#57534e", "← 돌아가기", "_ezGo('home')", "back sm");
  return h;
}
function ezEvt(id){ EZ.pg = "home"; if(CUR_EVT && CUR_EVT.evtId === id){ draw(); return; } switchEvent(id); }
async function ezNewEvt(){
  var nm = String(EZ.add || "").trim(); if(!nm) return toast("공사 이름을 적어 주세요", true);
  if(!confirm("'" + nm + "' 공사를 새로 만들까요?")) return;
  var id = "H" + todayKST().replace(/-/g, "").slice(2) + Math.random().toString(36).slice(2, 5).toUpperCase();
  showLoading("공사 만드는 중...");
  var r = await api("addEvent", { evtId: id, nm: nm, yr: todayKST().slice(0, 4), active: true, modules: (CUR_EVT && CUR_EVT.modules) || "budget,purchase,act,mem,est,photo,recv,easy", note: "📱 쉬운 화면에서 만듦", shareMems: false });
  if(!r || !r.ok){ hideLoading(); return toast((r && r.err) || "공사를 못 만들었어요", true); }
  try { await refreshData(false); } catch(e){}
  hideLoading(); EZ.add = ""; EZ.pg = "home"; toast("🏗️ '" + nm + "' 만들었어요");
  await switchEvent(id);
}

// ── 📷 사진: 무슨 사진? → 어디? → 찍기/앨범 ──
function _ezLocs(){ var c = {}; _phIds().forEach(function(k){ var l = String(PH.meta[k].loc || "").trim(); if(l) c[l] = (c[l] || 0) + 1; }); return Object.keys(c).sort(function(a, b){ return c[b] - c[a]; }).slice(0, 12); }
function _ezPhoto(){
  var h = '';
  if(!EZ.st){
    h += '<div class="ttl">📷 무슨 사진이에요?</div><div class="sub">하나 눌러 주세요</div>';
    [["pre", "🔨 공사 전", "#b45309"], ["mid", "🚧 공사 중", "#2563eb"], ["post", "✨ 공사 후 (다 하고)", "#16a34a"], ["site", "🏢 현장 모습 (견적용)", "#0f766e"], ["plan", "📐 시공 계획 · 도면", "#7c3aed"]].forEach(function(s){ h += _ezB(s[2], s[1], "EZ.st='" + s[0] + "';draw()"); });
    return h + _ezB("#57534e", "← 처음으로", "_ezGo('home')", "back sm");
  }
  var col = PH_STC[EZ.st] || "#475569";
  h += '<div class="box" style="border:3px solid ' + col + '"><div style="font-size:15px;color:' + col + ';font-weight:800">' + _phStN(EZ.st) + ' 사진</div>';
  h += '<div style="font-weight:800;margin:10px 0 8px">📍 어디예요? <span style="font-weight:400;font-size:15px;color:#78716c">(안 적어도 돼요)</span></div>';
  h += '<input class="big" id="ezLoc" placeholder="예: 2층 화장실" value="' + esc(EZ.loc) + '" oninput="EZ.loc=this.value"><div style="margin-top:10px">';
  _ezLocs().forEach(function(l){ h += '<span class="chip' + (EZ.loc === l ? " on" : "") + '" onclick="EZ.loc=\'' + _ezQ(l) + '\';draw()">' + esc(l) + '</span>'; });
  h += '</div></div>';
  h += _ezB(col, "📷 카메라로 찍기", "ezShot('cam')") + _ezB("#57534e", "🖼 앨범에서 고르기 (여러 장)", "ezShot('album')");
  if(EZ.last.length){
    h += '<div class="box"><div style="font-weight:800;margin-bottom:8px">✅ 방금 올린 사진 ' + EZ.last.length + '장</div><div class="g2">';
    EZ.last.slice(-6).forEach(function(k){ if(PH.meta[k]) h += '<img src="' + PH.meta[k].t + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px">'; });
    h += '</div></div>';
  }
  h += '<div class="g2">' + _ezB("#78716c", "다른 종류 사진", "EZ.st='';draw()", "sm") + _ezB("#57534e", "다 했어요 ✔", "_ezGo('home')", "sm") + '</div>';
  return h;
}
function ezShot(how){
  var loc = String(EZ.loc || "").trim(), st = EZ.st;
  phPick(how, st, function(ids){
    if(loc && ids.length){ var u = {}; ids.forEach(function(k){ u["meta/" + k + "/loc"] = loc; PH.meta[k].loc = loc; }); _phRef().update(u).catch(function(){}); }
    EZ.last = EZ.last.concat(ids); draw();
  });
}

// ── 💰 견적 쓰기 ──
function ezNewEst(){
  EZ_ED = { _id: "", no: _estNextNo(), dt: todayKST(), st: "작성중", ez: 1, sup: _estDefComp(), cl: { nm: "", ceo: "", biz: "", addr: "", tel: "" },
    nm: CUR_EVT.nm || "", site: "", valid: "견적일로부터 30일", term: "", split: false, items: [], ext: [], cut: 1000, cutTot: true, vat: true, memo: EST_MEMO };
  EZ.pick = ""; _ezGo("est");
}
function ezEditEst(id){ EZ_ED = JSON.parse(JSON.stringify(EST[id])); EZ_ED._id = id; EZ.pick = ""; _ezGo("est"); }
function _ezEst(){
  var e = EZ_ED; if(!e) return _ezHome();
  if(EZ.pick === "set") return _ezPickSet();
  if(EZ.pick === "pb") return _ezPickPb();
  if(EZ.pick === "own") return _ezPickOwn();
  var c = _estCalc(e), h = '<div class="ttl">💰 견적 쓰기</div>';
  // ① 받는 곳
  var cks = Object.keys(CLIENTS || {}).sort(function(a, b){ return String(CLIENTS[a].nm).localeCompare(String(CLIENTS[b].nm)); }).slice(0, 8);
  h += '<div class="box"><div style="font-weight:800;margin-bottom:8px">① 누구한테 내는 견적이에요?</div><input class="big" placeholder="예: 영광군 수산업협동조합" value="' + esc(e.cl.nm) + '" onchange="EZ_ED.cl.nm=this.value"><div style="margin-top:10px">';
  cks.forEach(function(k){ h += '<span class="chip' + (e.cl.nm === CLIENTS[k].nm ? " on" : "") + '" onclick="ezClient(\'' + _ezQ(k) + '\')">' + esc(CLIENTS[k].nm) + '</span>'; });
  h += '</div><div style="font-weight:800;margin:12px 0 8px">공사 이름</div><input class="big" value="' + esc(e.nm) + '" onchange="EZ_ED.nm=this.value"></div>';
  // ② 넣기
  h += '<div class="box"><div style="font-weight:800;margin-bottom:10px">② 무슨 공사를 하나요?</div>';
  h += _ezB("#b45309", "📐 평수만 넣기 (세트)", "EZ.pick='set';EZ.a='';draw()") + _ezB("#7c4a21", "📒 단가표에서 고르기", "EZ.pick='pb';EZ.cat='';EZ.sub='';draw()") + _ezB("#57534e", "✏️ 직접 쓰기", "EZ.pick='own';draw()", "sm") + '</div>';
  // ③ 목록
  var its = e.items.filter(function(it){ return !it.hd; });
  h += '<div class="box"><div style="font-weight:800;margin-bottom:10px">③ 넣은 항목 ' + its.length + '개</div>';
  if(!its.length) h += '<div style="color:#a8a29e;padding:10px 0">아직 없어요 — 위에서 넣어 주세요</div>';
  e.items.forEach(function(it, i){
    if(it.hd){ h += '<div style="font-weight:900;color:#7c4a21;margin:12px 0 6px">' + esc(it.nm) + '</div>'; return; }
    var u = _estUnit(it), am = Math.round(_estN(it.qty) * u);
    h += '<div class="it"><div style="font-weight:800">' + esc(it.nm) + (it.spec ? ' <span style="font-weight:400;color:#78716c">' + esc(it.spec) + '</span>' : '') + '</div>';
    h += '<div class="row" style="margin-top:8px"><button class="btn" style="background:#57534e;color:#fff;width:48px;height:48px;font-size:24px;border-radius:12px" onclick="ezQty(' + i + ',-1)">−</button>';
    h += '<input inputmode="decimal" value="' + esc(it.qty) + '" onchange="EZ_ED.items[' + i + '].qty=_estN(this.value);draw()" style="width:80px;font-size:21px;padding:8px;text-align:center;border:2px solid #a8a29e;border-radius:10px"> <span>' + esc(it.u || "") + '</span>';
    h += '<button class="btn" style="background:#57534e;color:#fff;width:48px;height:48px;font-size:24px;border-radius:12px" onclick="ezQty(' + i + ',1)">+</button>';
    h += '<button class="btn" style="background:#dc2626;color:#fff;height:48px;font-size:16px;border-radius:12px;margin-left:auto" onclick="EZ_ED.items.splice(' + i + ',1);draw()">빼기</button></div>';
    h += '<div style="margin-top:8px;color:#57534e;font-size:16px">' + _estW(u) + '원 × ' + _estN(it.qty) + ' = <b style="color:#1c1917;font-size:19px">' + _estW(am) + '원</b></div></div>';
  });
  h += '</div>';
  // ④ 합계 + 저장
  h += '<div class="box" style="background:#fbf3e8;border:2px solid #c08a52;text-align:center"><div style="font-size:16px;color:#57534e">합계 (부가세 포함, 천 원 아래 버림)</div><div class="tot">' + _estW(c.tot) + '원</div><div style="font-size:15px;color:#78716c">금 ' + _estKor(c.tot) + '원정</div></div>';
  h += _ezB("#16a34a", "💾 다 썼어요 — 사장님께 보내기", "ezSaveEst()") + _ezB("#57534e", "← 저장 안 하고 나가기", "if(confirm('적은 게 지워져요. 나갈까요?')){EZ_ED=null;_ezGo('home')}", "back sm");
  return h;
}
function ezClient(k){ var c = CLIENTS[k]; if(!c) return; EZ_ED.cl = { nm: c.nm || "", ceo: c.ceo || "", biz: c.biz || "", addr: c.addr || "", tel: c.tel || "" }; draw(); }
function ezQty(i, d){ var it = EZ_ED.items[i], step = _estN(it.qty) >= 10 ? 1 : (String(it.qty).indexOf(".") >= 0 ? 0.5 : 1); it.qty = Math.max(0, Math.round((_estN(it.qty) + d * step) * 100) / 100); draw(); }
// 단가표·세트 넣기는 pb.js 의 _pbInsert 를 EZ_ED 로 돌려서 씀
function _ezInsert(rows, note){ var keep = EST_ED; EST_ED = EZ_ED; try { _pbInsert(rows, true, note); } finally { EST_ED = keep; } }

function _ezPickSet(){
  if(!PB){ _pbLoad(); return '<div class="box">📡 불러오는 중...</div>'; }
  var ids = _pbSetIds(), h = '<div class="ttl">📐 평수만 넣기</div>';
  if(!ids.length) return h + '<div class="box">아직 세트가 없어요. 사장님께 <b>단가표 · 세트</b>를 만들어 달라고 해 주세요.</div>' + _ezB("#57534e", "← 돌아가기", "EZ.pick='';draw()", "back sm");
  if(!EZ.set || !PSET[EZ.set]){
    h += '<div class="sub">어떤 공사예요?</div>';
    ids.forEach(function(k){ h += _ezB("#b45309", "📐 " + esc(PSET[k].nm), "EZ.set='" + k + "';EZ.a='';draw()"); });
    return h + _ezB("#57534e", "← 돌아가기", "EZ.pick='';draw()", "back sm");
  }
  var S = PSET[EZ.set], am = EZ.u === "py" ? _estN(EZ.a) * PB_PY : _estN(EZ.a), t = 0;
  h += '<div class="box"><div style="font-weight:800;font-size:20px;margin-bottom:10px">📐 ' + esc(S.nm) + '</div><div style="font-weight:800;margin-bottom:8px">넓이가 얼마예요?</div>';
  h += '<div class="row"><input class="big" inputmode="decimal" id="ezA" value="' + esc(EZ.a) + '" placeholder="예: 4" oninput="EZ.a=this.value;_ezSetCalc()" style="flex:1"></div><div class="g2" style="margin-top:10px">';
  h += _ezB(EZ.u === "py" ? "#7c4a21" : "#78716c", (EZ.u === "py" ? "✔ " : "") + "평", "EZ.u='py';draw()", "sm") + _ezB(EZ.u === "m2" ? "#7c4a21" : "#78716c", (EZ.u === "m2" ? "✔ " : "") + "㎡ (헤베)", "EZ.u='m2';draw()", "sm") + '</div>';
  h += '<div id="ezSetTbl" style="margin-top:12px"></div></div>';
  h += _ezB("#16a34a", "✔ 이대로 넣기", "ezSetGo()") + '<div class="g2">' + _ezB("#78716c", "다른 세트", "EZ.set='';draw()", "sm") + _ezB("#57534e", "← 돌아가기", "EZ.pick='';draw()", "sm") + '</div>';
  setTimeout(_ezSetCalc, 0);
  return h;
}
function _ezSetCalc(){
  var S = PSET[EZ.set], el = document.getElementById("ezSetTbl"); if(!S || !el) return;
  var am = EZ.u === "py" ? _estN(EZ.a) * PB_PY : _estN(EZ.a), t = 0, h = '';
  (S.lines || []).forEach(function(L){ var p = PB[L.pb]; if(!p) return; var q = _pbLineQty(L, am), a = Math.round(q * _pbUnit(p)); t += a;
    h += '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #e7e5e4;padding:8px 0;font-size:16px"><span>' + esc(p.nm) + ' <span style="color:#78716c">' + (q || "-") + esc(p.u || "") + '</span></span><b>' + (a ? _estW(a) : "-") + '</b></div>'; });
  h += '<div style="text-align:right;margin-top:8px;font-size:18px">합계 <b style="font-size:22px;color:#7c4a21">' + _estW(t) + '원</b></div>';
  if(!am) h += '<div style="color:#b45309;margin-top:4px">↑ 넓이를 넣어 주세요</div>';
  el.innerHTML = h;
}
function ezSetGo(){
  var S = PSET[EZ.set], am = EZ.u === "py" ? _estN(EZ.a) * PB_PY : _estN(EZ.a);
  if(!am && (S.lines || []).some(function(L){ return L.mode !== "fix"; })) return toast("넓이를 넣어 주세요", true);
  _ezInsert((S.lines || []).filter(function(L){ return PB[L.pb]; }).map(function(L){ return { k: L.pb, q: _pbLineQty(L, am) }; }), EZ.u === "py" ? _estN(EZ.a) + "평" : _estN(EZ.a) + "㎡");
  EZ.pick = ""; EZ.set = ""; draw(); toast("📐 " + S.nm + " 넣었어요");
}
function _ezPickPb(){
  if(!PB){ _pbLoad(); return '<div class="box">📡 불러오는 중...</div>'; }
  var h = '<div class="ttl">📒 단가표에서 고르기</div>';
  if(!Object.keys(PB).length) return h + '<div class="box">단가표가 비어 있어요. 사장님께 채워 달라고 해 주세요.</div>' + _ezB("#57534e", "← 돌아가기", "EZ.pick='';draw()", "back sm");
  if(!EZ.cat){
    h += '<div class="sub">무슨 공사예요?</div>';
    Object.keys(_pbCats()).sort().forEach(function(c){ h += _ezB("#7c4a21", esc(c), "EZ.cat='" + _ezQ(c) + "';EZ.sub='';draw()", "sm"); });
    return h + _ezB("#57534e", "← 돌아가기", "EZ.pick='';draw()", "back sm");
  }
  var subs = _pbSubs(EZ.cat);
  if(Object.keys(subs).length && !EZ.sub){
    h += '<div class="sub">' + esc(EZ.cat) + ' — 어디예요?</div>';
    Object.keys(subs).sort().forEach(function(c){ h += _ezB("#b45309", esc(c), "EZ.sub='" + _ezQ(c) + "';draw()", "sm"); });
    h += _ezB("#a8a29e", "전부 보기", "EZ.sub='*';draw()", "sm");
    return h + _ezB("#57534e", "← 다른 공사", "EZ.cat='';draw()", "back sm");
  }
  h += '<div class="sub">' + esc(EZ.cat) + (EZ.sub && EZ.sub !== "*" ? " › " + esc(EZ.sub) : "") + ' — 수량을 적고 <b>넣기</b></div>';
  _pbIds(EZ.cat, "", EZ.sub === "*" ? "" : EZ.sub).forEach(function(k){ var p = PB[k];
    h += '<div class="it"><div style="font-weight:800">' + esc(p.nm) + (p.spec ? ' <span style="font-weight:400;color:#78716c">' + esc(p.spec) + '</span>' : '') + '</div><div style="color:#57534e;font-size:16px;margin:4px 0 8px">' + _estW(_pbUnit(p)) + '원 / ' + esc(p.u || "") + '</div>';
    h += '<div class="row"><input id="ezq_' + k + '" inputmode="decimal" placeholder="수량' + (/평/.test(p.u || "") ? " (30 또는 99㎡)" : "") + '" style="flex:1;font-size:20px;padding:10px;border:2px solid #a8a29e;border-radius:10px;min-width:0"><button class="btn" style="background:#16a34a;color:#fff;height:50px;font-size:18px;padding:0 18px;border-radius:12px" onclick="ezPbAdd(\'' + k + '\')">넣기</button></div></div>'; });
  return h + '<div class="g2">' + _ezB("#78716c", "← 다른 공사", "EZ.cat='';EZ.sub='';draw()", "sm") + _ezB("#57534e", "다 넣었어요 ✔", "EZ.pick='';draw()", "sm") + '</div>';
}
function ezPbAdd(k){
  var el = document.getElementById("ezq_" + k), q = _pbQty(el ? el.value : "", PB[k].u);
  if(!q) return toast("수량을 적어 주세요", true);
  _ezInsert([{ k: k, q: q }]); if(el) el.value = ""; toast("✔ " + PB[k].nm + " " + q + (PB[k].u || "") + " 넣었어요");
}
function _ezPickOwn(){
  var h = '<div class="ttl">✏️ 직접 쓰기</div><div class="box">';
  h += '<div style="font-weight:800;margin-bottom:6px">무엇을</div><input class="big" id="ezOn" placeholder="예: 인건비, 스카이, 페인트"><div style="height:12px"></div>';
  h += '<div class="g2"><div><div style="font-weight:800;margin-bottom:6px">몇 개 (수량)</div><input class="big" id="ezOq" inputmode="decimal" value="1"></div><div><div style="font-weight:800;margin-bottom:6px">단위</div><input class="big" id="ezOu" placeholder="식, 평, 명, 일"></div></div><div style="height:12px"></div>';
  h += '<div style="font-weight:800;margin-bottom:6px">한 개에 얼마 (원)</div><input class="big" id="ezOp" inputmode="numeric" placeholder="예: 3200000"></div>';
  return h + _ezB("#16a34a", "✔ 넣기", "ezOwnAdd()") + _ezB("#57534e", "← 돌아가기", "EZ.pick='';draw()", "back sm");
}
function ezOwnAdd(){
  var g = function(id){ return (document.getElementById(id) || {}).value || ""; }, nm = g("ezOn").trim(), p = _estN(g("ezOp"));
  if(!nm) return toast("무엇인지 적어 주세요", true); if(!p) return toast("금액을 적어 주세요", true);
  EZ_ED.items.push({ nm: nm, spec: "", u: g("ezOu").trim() || "식", qty: _estN(g("ezOq")) || 1, mat: p, lab: 0, exp: 0, note: "" });
  EZ.pick = ""; draw(); toast("✔ " + nm + " 넣었어요");
}
function ezSaveEst(){
  var e = EZ_ED;
  if(!String(e.cl.nm || "").trim()) return toast("① 누구한테 내는 견적인지 적어 주세요", true);
  if(!e.items.some(function(it){ return !it.hd; })) return toast("② 항목을 하나 이상 넣어 주세요", true);
  var id = e._id, o = _estClean(e); delete o._id;
  o.ez = 1; o.ezBy = (ME && (ME.nm || ME.id)) || CID || ""; o.upAt = new Date().toISOString(); o.upBy = CID || "";
  var ck = _estKey(o.cl.nm); if(ck && !CLIENTS[ck]){ var cc = { nm: o.cl.nm, ceo: "", biz: "", addr: "", tel: "" }; CLIENTS[ck] = cc; fbDb.ref("/main/Clients/" + ck).set(cc).catch(function(){}); }
  showLoading("보내는 중...");
  var p = id ? _estRef(id).update(o).then(function(){ return id; }) : _estRef().push(Object.assign(o, { mkAt: o.upAt, mkBy: o.upBy })).then(function(r){ return r.key; });
  p.then(function(k){ hideLoading(); EST[k] = Object.assign({}, EST[k] || {}, o); EZ_ED = null; EZ.pg = "home"; draw(); toast("✅ 보냈어요! 사장님이 확인하고 뽑아요"); })
   .catch(function(err){ hideLoading(); toast("못 보냈어요: " + err.message, true); });
}

// ── 📋 이 공사 견적 ──
function _ezList(){
  var ids = Object.keys(EST || {}).sort(function(a, b){ return String(EST[b].dt || "").localeCompare(String(EST[a].dt || "")); });
  var h = '<div class="ttl">📋 이 공사 견적</div><div class="sub">' + esc(CUR_EVT.nm || "") + '</div>';
  if(!ids.length) h += '<div class="box">아직 견적이 없어요</div>';
  ids.forEach(function(k){ var e = EST[k], c = _estCalc(e), canEdit = (e.st || "작성중") === "작성중";
    h += '<div class="it" style="' + (canEdit ? "cursor:pointer" : "") + '"' + (canEdit ? ' onclick="ezEditEst(\'' + k + '\')"' : '') + '><div class="row" style="justify-content:space-between"><b>' + esc((e.cl && e.cl.nm) || "(받는 곳 없음)") + '</b>' + _estBadge(e.st) + '</div>';
    h += '<div style="color:#57534e;font-size:15px;margin-top:4px">' + esc(e.dt || "") + ' · ' + esc(_estComp(e).nm || "") + '</div><div style="font-size:22px;font-weight:900;color:#7c4a21;margin-top:4px">' + _estW(c.tot) + '원</div>';
    h += '<div style="font-size:14px;color:#78716c;margin-top:2px">' + (canEdit ? "누르면 이어서 고칠 수 있어요" : "사장님이 확인한 견적이에요") + '</div></div>'; });
  return h + _ezB("#57534e", "← 처음으로", "_ezGo('home')", "back sm");
}
