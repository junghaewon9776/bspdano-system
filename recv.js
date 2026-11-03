// ============================================================================
// 💸 받을 돈 — 고객(발주처)에게 받을 공사대금: 계약금·중도금·잔금 일정 · 입금 기록 · 미수
//   입금 기록: /evtData/{공사}/Est/{견적}/rcv/{id} = { dt, am, kind(계약금|중도금|잔금|기타), how, memo, at, by }
//   일정: 계약(ct)의 p1/p2/p3 % → 금액, 받을 때: 계약일 / 중도금 시기 / 준공일
//   ※ 업체에 줄 돈(내가 산 것)은 세출·물품/구매 쪽
// ============================================================================
var RCV_ALL = null, RCV_LOADING = false, RCV_FILT = "due";

// 계약 견적의 받을 일정 + 받은 돈을 앞 단계부터 채워서 단계별 상태
function _rcvPlan(e){
  var c = _estCalc(e), ct = e.ct || {}, tot = c.tot;
  var a1 = Math.floor(tot * _estN(ct.p1) / 100), a2 = Math.floor(tot * _estN(ct.p2) / 100), a3 = tot - a1 - a2;
  var st = [{ k: "계약금", am: a1, due: ct.dt || "", when: "계약할 때" }];
  if(_estN(ct.p2)) st.push({ k: "중도금", am: a2, due: "", when: ct.p2when || "" });
  st.push({ k: "잔금", am: a3, due: ct.en || "", when: "준공 후" });
  var got = _rcvSum(e), left = got, today = todayKST();
  st.forEach(function(s){
    s.paid = Math.min(s.am, left); left -= s.paid;
    s.state = s.paid >= s.am ? "완납" : s.paid > 0 ? "일부" : "미수";
    s.late = s.state !== "완납" && s.due && s.due < today && s.k !== "중도금";
  });
  return { tot: tot, got: got, rest: tot - got, steps: st, over: Math.max(0, got - tot), billed: _estStmtSum(e) };
}
function _rcvSum(e){ var s = 0; Object.keys(e.rcv || {}).forEach(function(k){ s += _estN(e.rcv[k].am); }); return s; }
function _rcvStC(s){ return s === "완납" ? "#16a34a" : s === "일부" ? "#b45309" : "#dc2626"; }

// ── 견적 상세(계약)에 붙는 "💵 받은 돈" ──
function _rcvBox(id){
  var e = EST[id]; if(!e || e.st !== "계약") return "";
  var P = _rcvPlan(e), B = _estBtn;
  var h = '<div class="card" style="margin-bottom:10px;border:2px solid #16a34a"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><strong>💵 받은 돈 (고객 → 우리)</strong>' + B("#16a34a", "+ 입금 기록", "rcvAdd('" + id + "')") + '</div>';
  h += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:10px 0;font-size:14px"><div>계약 금액 <b>' + _estW(P.tot) + '</b></div><div>청구(거래명세표) <b>' + _estW(P.billed) + '</b></div><div>받은 돈 <b style="color:#16a34a">' + _estW(P.got) + '</b></div><div>남은 돈 <b style="color:#dc2626;font-size:17px">' + _estW(P.rest) + '원</b></div>' + (P.over ? '<div style="color:#7c3aed">⚠ ' + _estW(P.over) + '원 더 받음</div>' : '') + '</div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f0fdf4"><th style="padding:6px;text-align:left">구분</th><th style="text-align:right">받을 돈</th><th style="text-align:left;padding-left:10px">받을 때</th><th style="text-align:right">받은 돈</th><th>상태</th></tr></thead><tbody>';
  P.steps.forEach(function(s){
    h += '<tr style="border-bottom:1px solid #f1f5f9;' + (s.late ? "background:#fef2f2" : "") + '"><td style="padding:6px;font-weight:700">' + s.k + '</td><td style="text-align:right">' + _estW(s.am) + '</td><td style="padding-left:10px">' + esc(s.when) + (s.due ? ' <span class="mut">(' + esc(s.due) + ')</span>' : '') + (s.late ? ' <b style="color:#dc2626">⏰ 지남</b>' : '') + '</td><td style="text-align:right">' + _estW(s.paid) + '</td><td style="text-align:center"><span style="background:' + _rcvStC(s.state) + ';color:#fff;font-size:12px;font-weight:700;padding:2px 9px;border-radius:10px">' + s.state + '</span></td></tr>';
  });
  h += '</tbody></table>';
  var rk = Object.keys(e.rcv || {}).sort(function(a, b){ return String(e.rcv[a].dt).localeCompare(String(e.rcv[b].dt)); });
  if(rk.length){
    h += '<div style="font-weight:700;font-size:13px;margin:12px 0 4px">입금 기록</div><table style="width:100%;border-collapse:collapse;font-size:13px">';
    rk.forEach(function(k){ var r = e.rcv[k]; h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:5px">' + esc(r.dt) + '</td><td>' + esc(r.kind || "") + '</td><td style="text-align:right;font-weight:700">' + _estW(r.am) + '원</td><td style="padding-left:10px;color:#64748b">' + esc(r.how || "") + (r.memo ? " · " + esc(r.memo) : "") + '</td><td style="text-align:right">' + B("#dc2626", "삭제", "rcvDel('" + id + "','" + k + "')", "padding:3px 9px") + '</td></tr>'; });
    h += '</table>';
  } else h += '<div class="mut" style="font-size:12.5px;margin-top:8px">아직 입금 기록이 없어요 — 돈이 들어오면 <b>+ 입금 기록</b></div>';
  return h + '</div>';
}
function rcvAdd(id){
  var e = EST[id], P = _rcvPlan(e), nx = P.steps.filter(function(s){ return s.state !== "완납"; })[0] || P.steps[P.steps.length - 1];
  var I = function(lb, eid, v, ex){ return '<label style="font-size:13px">' + lb + '<input id="' + eid + '" value="' + esc(v) + '" ' + (ex || "") + ' style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:15px"></label>'; };
  var h = '<h3 style="margin:0 0 8px">💵 입금 기록 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3><div style="font-size:13px;margin-bottom:10px">' + esc((e.cl && e.cl.nm) || "") + ' · ' + esc(e.nm || "") + ' · 남은 돈 <b style="color:#dc2626">' + _estW(P.rest) + '원</b></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + I("받은 날", "rc_dt", todayKST()) + I("금액 (원)", "rc_am", nx ? _estW(nx.am - nx.paid) : "", 'inputmode="numeric"');
  h += '<label style="font-size:13px">구분<select id="rc_kind" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px">' + ["계약금", "중도금", "잔금", "기타"].map(function(k){ return '<option' + (nx && nx.k === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select></label>';
  h += '<label style="font-size:13px">받은 방법<select id="rc_how" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px"><option>계좌이체</option><option>현금</option><option>카드</option><option>어음·기타</option></select></label></div>';
  h += '<div style="margin-top:8px">' + I("메모", "rc_memo", "", 'placeholder="예: 농협 입금, 세금계산서 발행함"') + '</div>';
  h += '<div style="text-align:right;margin-top:12px">' + _estBtn("#16a34a", "💾 저장", "rcvSave('" + id + "')", "padding:9px 22px") + '</div>';
  openPopup(h, 520);
}
function rcvSave(id){
  var g = function(k){ return (document.getElementById("rc_" + k) || {}).value || ""; }, am = Math.round(_estN(g("am")));
  if(!(am > 0)) return toast("금액을 적어 주세요", true);
  var r = { dt: g("dt").trim() || todayKST(), am: am, kind: g("kind"), how: g("how"), memo: g("memo").trim(), at: new Date().toISOString(), by: CID || "" };
  var ref = _estRef(id).child("rcv").push();
  ref.set(r).then(function(){ var e = EST[id]; e.rcv = e.rcv || {}; e.rcv[ref.key] = r; RCV_ALL = null; closePopup(); toast("💵 " + _estW(am) + "원 받은 걸로 기록했어요"); draw(); })
    .catch(function(err){ toast("저장 실패: " + err.message, true); });
}
function rcvDel(id, k){
  var r = EST[id].rcv[k]; if(!confirm(r.dt + " " + _estW(r.am) + "원 입금 기록을 지울까요?")) return;
  _estRef(id).child("rcv/" + k).remove().then(function(){ delete EST[id].rcv[k]; RCV_ALL = null; draw(); });
}

// ── 💸 받을 돈 한눈에 (모든 공사) ──
function _rcvLoadAll(){
  if(RCV_LOADING) return; RCV_LOADING = true;
  var evs = (typeof EVENTS !== "undefined" && EVENTS) || [];
  Promise.all([fbDb.ref("/main/Companies").once("value")].concat(evs.map(function(ev){ return fbDb.ref("/evtData/" + ev.evtId + "/Est").once("value").then(function(s){ return { ev: ev, est: s.val() || {} }; }).catch(function(){ return { ev: ev, est: {} }; }); }))).then(function(r){
    RCV_LOADING = false; COMPS = r[0].val() || COMPS || {};
    RCV_ALL = []; r.slice(1).forEach(function(x){ Object.keys(x.est).forEach(function(k){ var e = x.est[k]; if(e.st === "계약") RCV_ALL.push({ ev: x.ev, id: k, e: e, P: _rcvPlan(e) }); }); });
    if(CTAB === "recv") draw();
  }).catch(function(e){ RCV_LOADING = false; toast("불러오기 실패: " + e.message, true); });
}
function dRecv(){
  if(!RCV_ALL){ _rcvLoadAll(); return '<div class="card"><div class="mut">📡 모든 공사의 계약을 모으는 중...</div></div>'; }
  var rows = RCV_ALL.filter(function(x){ return RCV_FILT === "all" || x.P.rest > 0; }).sort(function(a, b){
    var la = a.P.steps.some(function(s){ return s.late; }) ? 0 : 1, lb = b.P.steps.some(function(s){ return s.late; }) ? 0 : 1;
    return la - lb || b.P.rest - a.P.rest; });
  var T = { tot: 0, got: 0, rest: 0, late: 0, billed: 0 };
  RCV_ALL.forEach(function(x){ T.tot += x.P.tot; T.got += x.P.got; T.rest += Math.max(0, x.P.rest); T.billed += x.P.billed; x.P.steps.forEach(function(s){ if(s.late) T.late += s.am - s.paid; }); });
  var B = _estBtn, h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><strong style="font-size:18px">💸 받을 돈 — 고객 공사대금</strong><div>' + B("#475569", "🔄 새로 불러오기", "RCV_ALL=null;draw()") + '</div></div>';
  h += '<div class="mut" style="font-size:12.5px;margin-top:4px">모든 공사의 <b>계약</b>된 견적이에요. 입금은 견적·계약 → 그 견적 → <b>💵 받은 돈</b>에서 기록해요. (업체에 줄 돈은 세출·물품/구매)</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px">';
  [["계약 합계", T.tot, "#334155"], ["청구(거래명세표)", T.billed, "#0f766e"], ["받은 돈", T.got, "#16a34a"], ["남은 돈 (미수)", T.rest, "#dc2626"], ["⏰ 기한 지난 돈", T.late, "#b91c1c"]].forEach(function(c){
    h += '<div style="border:2px solid ' + c[2] + ';border-radius:10px;padding:10px"><div style="font-size:12px;color:' + c[2] + ';font-weight:700">' + c[0] + '</div><div style="font-size:19px;font-weight:900;color:' + c[2] + '">' + _estW(c[1]) + '원</div></div>'; });
  h += '</div></div>';
  h += '<div class="card" style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">';
  [["evt", "🏗️ 공사별"], ["cl", "📒 거래처별 (원장)"]].forEach(function(v){ var on = RCV_VIEW === v[0]; h += '<button class="btn" style="background:' + (on ? "#7c4a21" : "#e7e5e4") + ';color:' + (on ? "#fff" : "#292524") + ';padding:8px 16px;font-size:13px" onclick="RCV_VIEW=\'' + v[0] + '\';draw()">' + v[1] + '</button>'; });
  if(RCV_VIEW === "cl") return h + '</div>' + _rcvClientView();
  h += '<span style="width:14px"></span>';
  [["due", "남은 돈 있는 것만"], ["all", "전부"]].forEach(function(v){ var on = RCV_FILT === v[0]; h += '<button class="btn" style="background:' + (on ? "#292524" : "#e7e5e4") + ';color:' + (on ? "#fff" : "#292524") + '" onclick="RCV_FILT=\'' + v[0] + '\';draw()">' + v[1] + '</button>'; });
  h += '</div><div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:860px"><thead><tr style="background:#f1f5f9">';
  ["고객 (발주처)", "공사", "업체", "계약 금액", "받은 돈", "남은 돈", "다음에 받을 것", ""].forEach(function(t, i){ h += '<th style="padding:8px;text-align:' + (i >= 3 && i <= 5 ? "right" : "left") + '">' + t + '</th>'; });
  h += '</tr></thead><tbody>';
  if(!rows.length) h += '<tr><td colspan="8" style="padding:30px;text-align:center;color:#94a3b8">' + (RCV_ALL.length ? "남은 돈이 없어요 👍" : "계약된 견적이 없어요 — 견적 승인 → 📑 계약서 만들기를 하면 여기 나와요") + '</td></tr>';
  rows.forEach(function(x){
    var nx = x.P.steps.filter(function(s){ return s.state !== "완납"; })[0], late = x.P.steps.some(function(s){ return s.late; });
    h += '<tr style="border-bottom:1px solid #f1f5f9;' + (late ? "background:#fef2f2" : "") + '"><td style="padding:8px;font-weight:700">' + esc((x.e.cl && x.e.cl.nm) || "") + '</td><td style="padding:8px">' + esc(x.ev.nm || "") + '</td><td style="padding:8px;font-size:12px">' + esc(_estComp(x.e).nm || "") + '</td>';
    h += '<td style="padding:8px;text-align:right">' + _estW(x.P.tot) + '</td><td style="padding:8px;text-align:right;color:#16a34a">' + _estW(x.P.got) + '</td><td style="padding:8px;text-align:right;font-weight:900;color:#dc2626">' + _estW(Math.max(0, x.P.rest)) + '</td>';
    h += '<td style="padding:8px">' + (nx ? '<b>' + nx.k + '</b> ' + _estW(nx.am - nx.paid) + '원' + (nx.due ? ' <span class="mut">' + esc(nx.due) + '</span>' : nx.when ? ' <span class="mut">' + esc(nx.when) + '</span>' : '') + (nx.late ? ' <b style="color:#dc2626">⏰ 지남</b>' : '') : '<span style="color:#16a34a;font-weight:700">✔ 다 받음</span>') + '</td>';
    h += '<td style="padding:8px;white-space:nowrap">' + B("#2563eb", "열기", "rcvOpen('" + x.ev.evtId + "','" + x.id + "')", "padding:4px 10px") + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}
// 그 공사로 바꾸고 견적 상세(받은 돈)로
async function rcvOpen(evtId, id){
  if(!CUR_EVT || CUR_EVT.evtId !== evtId) await switchEvent(evtId);
  CTAB = "est"; EST_ED = null; if(typeof PB_VIEW !== "undefined") PB_VIEW = false;
  if(EST_EVT !== evtId || !EST){ EST = null; window.__estOpen = id; } else EST_CUR = id;   // 견적 다 받은 뒤 그 견적을 열게
  mkTabs(); draw();
}

// ============================================================================
// 📒 거래처원장 — 고객(발주처)별 계약 합계·받은 돈·잔금 + 날짜순 원장(계약 → 입금, 잔액)
// ============================================================================
var RCV_VIEW = "evt", RCV_YR = "", RCV_CL = "";
function _rcvQ(s){ return esc(s).replace(/'/g, "\\'"); }
function _rcvYrs(){ var y = {}; (RCV_ALL || []).forEach(function(x){ var d = String((x.e.ct && x.e.ct.dt) || x.e.dt || "").slice(0, 4); if(d) y[d] = 1; }); return Object.keys(y).sort().reverse(); }
function _rcvInYr(x){ return !RCV_YR || String((x.e.ct && x.e.ct.dt) || x.e.dt || "").slice(0, 4) === RCV_YR; }
function _rcvClients(){
  var m = {};
  (RCV_ALL || []).filter(_rcvInYr).forEach(function(x){
    var nm = String((x.e.cl && x.e.cl.nm) || "(이름 없음)").trim(), c = m[nm] || (m[nm] = { nm: nm, n: 0, tot: 0, billed: 0, got: 0, rest: 0, last: "", late: 0, list: [] });
    c.n++; c.tot += x.P.tot; c.billed += x.P.billed; c.got += x.P.got; c.rest += Math.max(0, x.P.rest); c.list.push(x);
    Object.keys(x.e.rcv || {}).forEach(function(k){ var d = x.e.rcv[k].dt || ""; if(d > c.last) c.last = d; });
    x.P.steps.forEach(function(s){ if(s.late) c.late += s.am - s.paid; });
  });
  return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a, b){ return b.rest - a.rest || b.tot - a.tot; });
}
// 원장 줄: 계약(받을 돈 생김) + 입금(받음) → 날짜순, 줄마다 잔액
function _rcvLedger(c){
  var L = [];
  c.list.forEach(function(x){
    var ct = x.e.ct || {};
    L.push({ dt: ct.dt || x.e.dt || "", what: "공사 계약" + (ct.st || ct.en ? " (" + (ct.st || "") + " ~ " + (ct.en || "") + ")" : ""), evt: x.ev.nm || x.e.nm || "", up: x.P.tot, down: 0 });
    Object.keys(x.e.rcv || {}).forEach(function(k){ var r = x.e.rcv[k]; L.push({ dt: r.dt || "", what: (r.kind || "입금") + " 받음" + (r.how ? " · " + r.how : "") + (r.memo ? " · " + r.memo : ""), evt: x.ev.nm || x.e.nm || "", up: 0, down: _estN(r.am) }); });
  });
  L.sort(function(a, b){ return String(a.dt).localeCompare(String(b.dt)) || (b.up - a.up); });
  var bal = 0; L.forEach(function(r){ bal += r.up - r.down; r.bal = bal; });
  return L;
}
function _rcvLedgerTable(c, print){
  var L = _rcvLedger(c), S = print ? "" : "padding:7px;border-bottom:1px solid #f1f5f9;";
  var h = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr' + (print ? "" : ' style="background:#f1f5f9"') + '><th style="' + S + 'text-align:left">날짜</th><th style="' + S + 'text-align:left">내용</th><th style="' + S + 'text-align:left">공사</th><th style="' + S + 'text-align:right">계약 (받을 돈)</th><th style="' + S + 'text-align:right">입금 (받은 돈)</th><th style="' + S + 'text-align:right">잔액</th></tr></thead><tbody>';
  L.forEach(function(r){ h += '<tr><td style="' + S + '">' + esc(r.dt) + '</td><td style="' + S + '">' + esc(r.what) + '</td><td style="' + S + '">' + esc(r.evt) + '</td><td style="' + S + 'text-align:right">' + (r.up ? _estW(r.up) : "") + '</td><td style="' + S + 'text-align:right;color:#16a34a">' + (r.down ? _estW(r.down) : "") + '</td><td style="' + S + 'text-align:right;font-weight:800">' + _estW(r.bal) + '</td></tr>'; });
  h += '<tr style="font-weight:900"><td colspan="3" style="' + S + 'text-align:center">합 계</td><td style="' + S + 'text-align:right">' + _estW(c.tot) + '</td><td style="' + S + 'text-align:right;color:#16a34a">' + _estW(c.got) + '</td><td style="' + S + 'text-align:right;color:#dc2626">' + _estW(c.tot - c.got) + '</td></tr></tbody></table>';
  return h;
}
function _rcvClientView(){
  var cs = _rcvClients(), B = _estBtn, yrs = _rcvYrs();
  var h = '<div class="card" style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>📅 연도</b><select onchange="RCV_YR=this.value;RCV_CL=\'\';draw()" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px"><option value="">전체</option>' + yrs.map(function(y){ return '<option' + (y === RCV_YR ? " selected" : "") + '>' + y + '</option>'; }).join("") + '</select><span class="mut" style="font-size:12px">(계약일 기준)</span><span style="margin-left:auto">' + B("#7c4a21", "🖨️ 거래처별 합계 인쇄", "rcvPrint('')") + '</span></div>';
  if(RCV_CL){
    var c = cs.filter(function(x){ return x.nm === RCV_CL; })[0];
    if(c){
      h += '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div>' + B("#475569", "← 거래처 목록", "RCV_CL='';draw()") + ' <strong style="font-size:18px;margin-left:6px">📒 ' + esc(c.nm) + ' 거래처원장</strong></div>' + B("#7c4a21", "🖨️ 인쇄 / PDF", "rcvPrint('" + _rcvQ(c.nm) + "')") + '</div>';
      h += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:10px 0;font-size:14px"><div>공사 <b>' + c.n + '건</b></div><div>계약 합계 <b>' + _estW(c.tot) + '</b></div><div>받은 돈 <b style="color:#16a34a">' + _estW(c.got) + '</b></div><div>잔금 <b style="color:#dc2626;font-size:17px">' + _estW(c.rest) + '원</b></div>' + (c.late ? '<div style="color:#b91c1c;font-weight:800">⏰ 기한 지남 ' + _estW(c.late) + '원</div>' : '') + '</div>';
      return h + '<div style="overflow-x:auto">' + _rcvLedgerTable(c, false) + '</div></div>';
    }
    RCV_CL = "";
  }
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:820px"><thead><tr style="background:#f1f5f9">';
  ["거래처 (고객)", "공사", "계약 합계", "청구", "받은 돈", "잔금", "마지막 입금", ""].forEach(function(t, i){ h += '<th style="padding:8px;text-align:' + (i >= 2 && i <= 5 ? "right" : "left") + '">' + t + '</th>'; });
  h += '</tr></thead><tbody>';
  if(!cs.length) h += '<tr><td colspan="8" style="padding:30px;text-align:center;color:#94a3b8">계약된 공사가 없어요</td></tr>';
  var T = { n: 0, tot: 0, billed: 0, got: 0, rest: 0 };
  cs.forEach(function(c){ ["n", "tot", "billed", "got", "rest"].forEach(function(k){ T[k] += c[k]; });
    var go = "RCV_CL='" + _rcvQ(c.nm) + "';draw()";
    h += '<tr style="border-bottom:1px solid #f1f5f9;cursor:pointer;' + (c.late ? "background:#fef2f2" : "") + '" onclick="' + go + '"><td style="padding:8px;font-weight:800">' + esc(c.nm) + (c.late ? ' <span style="color:#dc2626;font-size:11px">⏰ 기한 지남</span>' : '') + '</td><td style="padding:8px">' + c.n + '건</td><td style="padding:8px;text-align:right">' + _estW(c.tot) + '</td><td style="padding:8px;text-align:right">' + _estW(c.billed) + '</td><td style="padding:8px;text-align:right;color:#16a34a">' + _estW(c.got) + '</td><td style="padding:8px;text-align:right;font-weight:900;color:#dc2626">' + _estW(c.rest) + '</td><td style="padding:8px">' + esc(c.last || "-") + '</td><td style="padding:8px">' + B("#2563eb", "원장", "event.stopPropagation();" + go, "padding:4px 10px") + '</td></tr>'; });
  if(cs.length) h += '<tr style="background:#fafaf9;font-weight:900"><td style="padding:8px">합계 (' + cs.length + '곳)</td><td style="padding:8px">' + T.n + '건</td><td style="padding:8px;text-align:right">' + _estW(T.tot) + '</td><td style="padding:8px;text-align:right">' + _estW(T.billed) + '</td><td style="padding:8px;text-align:right;color:#16a34a">' + _estW(T.got) + '</td><td style="padding:8px;text-align:right;color:#dc2626">' + _estW(T.rest) + '</td><td colspan="2"></td></tr>';
  return h + '</tbody></table></div>';
}
function rcvPrint(nm){
  var cs = _rcvClients(), cp = _estComp({}), yr = RCV_YR ? RCV_YR + "년 · " : "", b = '<div class="pg">';
  if(nm){
    var c = cs.filter(function(x){ return x.nm === nm; })[0]; if(!c) return;
    b += '<h1 style="letter-spacing:10px">거 래 처 원 장</h1><table class="nb" style="margin-bottom:3mm;font-size:13px"><tr><td><b style="font-size:16px">' + esc(c.nm) + '</b> 귀하</td><td style="text-align:right">' + yr + '뽑은 날 ' + esc(todayKST()) + '<br>' + esc(cp.nm || "") + '</td></tr></table>';
    b += _rcvLedgerTable(c, true);
    b += '<div style="margin-top:4mm;font-size:14px;text-align:right">남은 금액 <b style="font-size:17px">₩' + _estW(c.tot - c.got) + '</b>' + (cp.bank ? '<br><span style="font-size:12px">입금 계좌: ' + esc(cp.bank) + '</span>' : '') + '</div>';
  } else {
    b += '<h1 style="letter-spacing:6px">거래처별 공사대금 현황</h1><div style="text-align:right;font-size:12px;margin-bottom:2mm">' + yr + '뽑은 날 ' + esc(todayKST()) + ' · ' + esc(cp.nm || "") + '</div><table><tr><th>거래처</th><th>공사</th><th>계약 합계</th><th>청구</th><th>받은 돈</th><th>잔금</th><th>마지막 입금</th></tr>';
    var T = { tot: 0, billed: 0, got: 0, rest: 0, n: 0 };
    cs.forEach(function(c){ T.tot += c.tot; T.billed += c.billed; T.got += c.got; T.rest += c.rest; T.n += c.n; b += '<tr><td>' + esc(c.nm) + '</td><td class="c">' + c.n + '</td><td class="r">' + _estW(c.tot) + '</td><td class="r">' + _estW(c.billed) + '</td><td class="r">' + _estW(c.got) + '</td><td class="r"><b>' + _estW(c.rest) + '</b></td><td class="c">' + esc(c.last || "-") + '</td></tr>'; });
    b += '<tr style="font-weight:900"><td class="c">합계</td><td class="c">' + T.n + '</td><td class="r">' + _estW(T.tot) + '</td><td class="r">' + _estW(T.billed) + '</td><td class="r">' + _estW(T.got) + '</td><td class="r">' + _estW(T.rest) + '</td><td></td></tr></table>';
  }
  _estWin((nm ? "거래처원장_" + nm : "거래처별_공사대금") + "_" + todayKST(), b + '</div>', false);
}
