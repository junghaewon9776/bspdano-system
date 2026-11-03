// ============================================================================
// 🏗️ 견적·계약 — 공사별 견적서 작성 → 승인 → 계약서 → 거래명세표 (인쇄/PDF·엑셀)
//   데이터: /evtData/{공사}/Est/{id}   견적 내는 업체(공급자·직인, 여러 개): /main/Companies   발주처 불러오기: /main/Clients
//   est = { no, dt, st(작성중|제출|승인|반려|계약), sup(업체 id), cl:{발주처}, nm, site, valid, term,
//           split, items:[{hd,nm,spec,u,qty,mat,lab,exp,note}], ext:[{nm,mode,v}],
//           cut, vat, memo, apAt, apBy, apNote, ct:{계약}, stmts:{id:{거래명세}} }
// ============================================================================
var EST = null, EST_EVT = "", EST_CUR = "", EST_ED = null, COMPS = {}, CLIENTS = {}, EST_LOADING = false;
var EST_ST = ["작성중","제출","승인","반려","계약"];
var EST_EXT_MODES = [["pct", "직접공사비의 %"], ["lab", "노무비의 %"], ["ml", "재료비+노무비의 %"], ["prev", "위 금액 합계의 %"], ["amt", "금액(원)"]];
// 📐 원가계산 기본 줄 — 요율은 해마다 바뀌어서 0 으로 (직접 넣기)
var EST_COST_ROWS = [{ nm: "간접노무비", mode: "lab", v: 0 }, { nm: "산재보험료", mode: "lab", v: 0 }, { nm: "고용보험료", mode: "lab", v: 0 }, { nm: "안전관리비", mode: "ml", v: 0 }, { nm: "일반관리비", mode: "prev", v: 0 }, { nm: "이윤", mode: "prev", v: 0 }];
var EST_MEMO = ["1. 상기 금액은 부가가치세가 포함된 금액입니다.", "2. 견적 유효기간은 견적일로부터 30일입니다.", "3. 공사 착수 및 준공일은 계약 시 협의하여 정합니다.", "4. 현장 여건 변경 및 물량 증감 시 정산하여 청구합니다."].join("\n");
var EST_ST_BG = {"작성중":"#475569","제출":"#2563eb","승인":"#16a34a","반려":"#dc2626","계약":"#7c3aed"};

function _estEvt(){ return (CUR_EVT && CUR_EVT.evtId) || ""; }
function _estRef(id){ return fbDb.ref("/evtData/" + _estEvt() + "/Est" + (id ? "/" + id : "")); }
function _estClean(o){ return JSON.parse(JSON.stringify(o, function(k, v){ return v === undefined ? null : v; })); }
function _estN(v){ var n = Number(String(v == null ? "" : v).replace(/,/g, "")); return isFinite(n) ? n : 0; }
function _estW(n){ return Math.round(n).toLocaleString("ko-KR"); }
// 견적 내는 업체(공급자) — 여러 사업자 중 고름. 기본 = main 표시된 업체 → 없으면 첫 업체
function _estCompIds(){ return Object.keys(COMPS || {}).sort(function(a, b){ return (COMPS[b].main ? 1 : 0) - (COMPS[a].main ? 1 : 0) || String(COMPS[a].nm || "").localeCompare(String(COMPS[b].nm || "")); }); }
function _estDefComp(){ return _estCompIds()[0] || ""; }
function _estComp(e){ var id = (e && e.sup && COMPS[e.sup]) ? e.sup : _estDefComp(); return id ? COMPS[id] : { nm: SYS_NAME }; }
function _estKey(s){ return String(s || "").trim().replace(/[.#$\[\]\/]/g, "_").slice(0, 80); }

function _estLoad(){
  var ev = _estEvt(); if(!ev || EST_LOADING) return;
  EST_LOADING = true;
  Promise.all([_estRef().once("value"), fbDb.ref("/main/Companies").once("value"), fbDb.ref("/main/Clients").once("value")]).then(function(r){
    EST_LOADING = false; EST = r[0].val() || {}; COMPS = r[1].val() || {}; CLIENTS = r[2].val() || {}; EST_EVT = ev;
    if(EST_CUR && !EST[EST_CUR]) EST_CUR = "";
    if(CTAB === "est" || CTAB === "photo" || CTAB === "easy") draw();
  }).catch(function(e){ EST_LOADING = false; toast("견적 불러오기 실패: " + e.message, true); });
}

// ── 금액 계산 ──
function _estUnit(it){ return _estN(it.mat) + _estN(it.lab) + _estN(it.exp); }
function _estCalc(e){
  var d = 0, m = 0, l = 0, x = 0;
  (e.items || []).forEach(function(it){
    if(it.hd) return;
    var q = _estN(it.qty);
    if(e.split){ m += q * _estN(it.mat); l += q * _estN(it.lab); x += q * _estN(it.exp); }
    else m += q * _estN(it.mat);
  });
  m = Math.round(m); l = Math.round(l); x = Math.round(x); d = m + l + x;
  var run = d;   // "위 금액 합계" = 직접공사비 + 앞 줄 제경비
  var ext = (e.ext || []).map(function(r){
    var base = r.mode === "lab" ? l : r.mode === "ml" ? m + l : r.mode === "prev" ? run : d;
    var a = r.mode === "amt" ? Math.round(_estN(r.v)) : Math.round(base * _estN(r.v) / 100);
    run += a;
    return { nm: r.nm || "", mode: r.mode, v: r.v, am: a };
  });
  var pre = d; ext.forEach(function(r){ pre += r.am; });
  var cutU = _estN(e.cut), sup, vat, tot;
  if(e.cutTot && cutU > 0 && e.vat !== false){
    // 총액(부가세 포함)에서 끝자리 버림 → 공급가액·부가세는 총액에서 거꾸로 (공급가액+부가세 = 총액 딱 맞게)
    tot = Math.floor((pre + Math.floor(pre / 10)) / cutU) * cutU; sup = Math.round(tot / 1.1); vat = tot - sup;
    return { mat: m, lab: l, exp: x, direct: d, ext: ext, pre: pre, cutAm: sup - pre, sup: sup, vat: vat, tot: tot };
  }
  sup = cutU > 0 ? Math.floor(pre / cutU) * cutU : pre;
  vat = e.vat === false ? 0 : Math.floor(sup / 10);
  return { mat: m, lab: l, exp: x, direct: d, ext: ext, pre: pre, cutAm: sup - pre, sup: sup, vat: vat, tot: sup + vat };
}

// 금 일천이백만원정
function _estKor(n){
  n = Math.round(Math.abs(n)); if(!n) return "영";
  var D = ["","일","이","삼","사","오","육","칠","팔","구"], S = ["","십","백","천"], B = ["","만","억","조"], out = "", g = 0;
  while(n > 0){
    var c = n % 10000, s = "";
    for(var i = 0; i < 4; i++){ var dg = Math.floor(c / Math.pow(10, i)) % 10; if(dg) s = D[dg] + S[i] + s; }
    if(s) out = s + B[g] + out;
    n = Math.floor(n / 10000); g++;
  }
  return out;
}

// ── 화면 ──
function dEst(){
  if(!CUR_EVT) return '<div class="card">먼저 위에서 공사를 골라 주세요.</div>';
  if(EST_EVT !== _estEvt() || !EST){ EST_CUR = window.__estOpen || ""; window.__estOpen = ""; EST_ED = null; _estLoad(); return '<div class="card"><div class="mut">📡 견적 불러오는 중...</div></div>'; }
  if(typeof PB_VIEW !== "undefined" && PB_VIEW && !EST_ED) return dPriceBook();
  if(EST_ED) return _estEditor();
  if(EST_CUR && EST[EST_CUR]) return _estDetail(EST_CUR);
  return _estList();
}

function _estBtn(bg, label, onclick, extra){
  return '<button class="btn" style="background:' + bg + ';color:#fff;' + (extra || "") + '" onclick="' + onclick + '">' + label + '</button>';
}
function _estBadge(st){ return '<span style="font-size:12px;padding:2px 9px;border-radius:10px;background:' + (EST_ST_BG[st] || "#475569") + ';color:#fff;font-weight:700">' + esc(st || "작성중") + '</span>'; }
function _estStmtSum(e){ var s = 0; Object.keys(e.stmts || {}).forEach(function(k){ s += _estN(e.stmts[k].sup) + _estN(e.stmts[k].vat); }); return s; }

function _estList(){
  var ids = Object.keys(EST).sort(function(a, b){ return String(EST[b].dt || "").localeCompare(String(EST[a].dt || "")) || String(EST[b].no || "").localeCompare(String(EST[a].no || "")); });
  var h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<div><strong style="font-size:18px">🏗️ 견적·계약</strong> <span class="mut" style="font-size:12px;margin-left:6px">' + esc(CUR_EVT.nm || "") + ' — 견적 내기 → 승인 → 계약서 → 거래명세표</span></div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">' + _estBtn("#2563eb", "+ 새 견적", "estNew()") + _estBtn("#7c4a21", "📒 단가표 · 세트", "PB_VIEW=true;draw()") + _estBtn("#0f766e", "🏢 견적 내는 업체 (" + _estCompIds().length + ")", "estCompanyList()") + '</div></div>';
  if(!_estCompIds().length) h += '<div style="margin-top:8px;padding:8px 10px;background:#fef3c7;border-radius:6px;font-size:13px;color:#92400e">⚠️ <b>견적 내는 업체</b>(상호·사업자번호·대표자·주소·직인)를 먼저 등록해 두면 견적서·계약서·거래명세표에 자동으로 찍혀요. 사업자가 여러 개거나 다른 업체 이름으로 써 줄 때도 여기 등록해 두고 골라 쓰면 돼요.</div>';
  h += '</div>';
  // 요약
  var cnt = {}, ctAm = 0, billed = 0;
  ids.forEach(function(id){ var e = EST[id]; cnt[e.st || "작성중"] = (cnt[e.st || "작성중"] || 0) + 1; if(e.st === "계약"){ ctAm += _estCalc(e).tot; billed += _estStmtSum(e); } });
  h += '<div class="card" style="margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap;font-size:13px">';
  EST_ST.forEach(function(s){ h += '<div>' + _estBadge(s) + ' <b>' + (cnt[s] || 0) + '</b>건</div>'; });
  h += '<div style="margin-left:auto">계약 총액 <b style="color:#7c3aed">' + _estW(ctAm) + '원</b> · 거래명세 발행 <b style="color:#0f766e">' + _estW(billed) + '원</b> · 남은 청구 <b style="color:#dc2626">' + _estW(ctAm - billed) + '원</b></div></div>';
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:720px"><thead><tr style="background:#f1f5f9">';
  ["견적번호", "날짜", "견적 낸 업체", "받는 곳(발주처)", "공사명", "견적 금액(부가세 포함)", "상태", "거래명세"].forEach(function(t){ h += '<th style="padding:8px;text-align:left;border-bottom:1px solid #e2e8f0">' + t + '</th>'; });
  h += '</tr></thead><tbody>';
  if(!ids.length) h += '<tr><td colspan="8" style="padding:30px;text-align:center;color:#94a3b8">아직 견적이 없어요 — <b>+ 새 견적</b>을 눌러 시작하세요</td></tr>';
  ids.forEach(function(id){
    var e = EST[id], c = _estCalc(e), bs = _estStmtSum(e);
    h += '<tr style="cursor:pointer" onclick="EST_CUR=\'' + id + '\';draw()" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'">';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>' + esc(e.no || "") + '</b>' + (e.ez ? '<div style="font-size:11px;color:#b45309;font-weight:700">📱 ' + esc(e.ezBy || '현장') + ' 작성</div>' : '') + '</td>';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9">' + esc(e.dt || "") + '</td>';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9">' + esc(_estComp(e).nm || "") + '</td>';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9">' + esc((e.cl && e.cl.nm) || "") + '</td>';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9">' + esc(e.nm || "") + '</td>';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right"><b>' + _estW(c.tot) + '</b></td>';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9">' + _estBadge(e.st) + '</td>';
    h += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;font-size:12px">' + (bs ? _estW(bs) + '원 (' + Object.keys(e.stmts || {}).length + '장)' : '-') + '</td></tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

// ── 새 견적 / 복사 ──
function _estNextNo(){
  var d = todayKST().replace(/-/g, ""), n = 0;
  Object.keys(EST || {}).forEach(function(k){ var no = String(EST[k].no || ""); if(no.indexOf(d) === 0) n = Math.max(n, parseInt(no.split("-")[1]) || 0); });
  return d + "-" + (n + 1);
}
function estNew(){
  EST_ED = { _id: "", no: _estNextNo(), dt: todayKST(), st: "작성중", sup: _estDefComp(), cl: { nm: "", ceo: "", biz: "", addr: "", tel: "" },
    nm: CUR_EVT.nm || "", site: "", valid: "견적일로부터 30일", term: "", split: true,
    items: [{ hd: 1, nm: "1. 공사" }, { nm: "", spec: "", u: "식", qty: 1, mat: 0, lab: 0, exp: 0, note: "" }],
    ext: [], cut: 1000, cutTot: true, vat: true, memo: EST_MEMO };
  draw();
}
function estCopy(id){
  var s = JSON.parse(JSON.stringify(EST[id]));
  delete s.ct; delete s.stmts; delete s.apAt; delete s.apBy; delete s.apNote;
  s._id = ""; s.no = _estNextNo(); s.dt = todayKST(); s.st = "작성중"; s.memo = (s.memo || "");
  EST_ED = s; EST_CUR = ""; draw(); toast("복사했어요 — 업체·금액을 바꿔 저장하면 새 견적 (수정 견적·비교 견적)");
}
function estEdit(id){ EST_ED = JSON.parse(JSON.stringify(EST[id])); EST_ED._id = id; draw(); }

// ── 편집 화면 ──
function _estIn(val, on, w, extra){ return '<input value="' + esc(val == null ? "" : val) + '" onchange="' + on + '" style="width:' + (w || "100%") + ';padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box;' + (extra || "") + '">'; }
function _estNumIn(i, k){ return '<input inputmode="numeric" value="' + esc(_estN(EST_ED.items[i][k]) ? _estW(_estN(EST_ED.items[i][k])) : "") + '" oninput="estIt(' + i + ',\'' + k + '\',this.value,1)" onblur="this.value=_estN(this.value)?_estW(_estN(this.value)):\'\'" style="width:100%;padding:5px;border:1px solid #cbd5e1;border-radius:5px;text-align:right;box-sizing:border-box">'; }

function _estEditor(){
  var e = EST_ED, T = 'style="padding:4px;border-bottom:1px solid #e2e8f0"';
  var h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<strong style="font-size:17px">' + (e._id ? '✏️ 견적 고치기' : '📝 새 견적') + ' <span class="mut" style="font-size:13px">No. ' + esc(e.no) + '</span></strong>';
  h += '<div style="display:flex;gap:6px">' + _estBtn("#16a34a", "💾 저장", "estSave()") + _estBtn("#475569", "취소", "if(confirm('저장 안 하고 나갈까요?')){EST_ED=null;draw();}") + '</div></div></div>';
  // 기본 정보
  h += '<div class="card" style="margin-bottom:10px">';
  var F = function(lb, val, path){ return '<label>' + lb + _estIn(val, "estSet('" + path + "',this.value)") + '</label>'; };
  h += '<div style="padding:8px 10px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;margin-bottom:10px;font-size:13px"><b>🏢 견적 내는 업체 (공급자)</b> <select onchange="EST_ED.sup=this.value" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;min-width:200px;margin-left:6px">';
  if(!_estCompIds().length) h += '<option value="">(등록된 업체 없음)</option>';
  _estCompIds().forEach(function(k){ h += '<option value="' + k + '"' + (k === (e.sup || _estDefComp()) ? " selected" : "") + '>' + esc(COMPS[k].nm || "") + (COMPS[k].biz ? " (" + esc(COMPS[k].biz) + ")" : "") + '</option>'; });
  h += '</select> ' + _estBtn("#0f766e", "+ 새 업체", "estCompanyEdit('',1)", "padding:5px 10px") + ' <span class="mut" style="font-size:12px">— 다른 사업자·다른 업체 이름으로 써 줄 때 바꾸세요</span></div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;font-size:13px">';
  h += F("견적 날짜", e.dt, "dt") + F("공사명", e.nm, "nm") + F("공사 현장 주소", e.site, "site") + F("공사 기간 (예: 착공 후 30일)", e.term, "term") + F("견적 유효기간", e.valid, "valid");
  var cks = Object.keys(CLIENTS || {}).sort(function(a, b){ return String(CLIENTS[a].nm).localeCompare(String(CLIENTS[b].nm)); });
  h += '</div><div style="margin-top:12px;font-weight:700;font-size:13px;color:#1e40af">📮 견적 받는 곳 (발주처 · 공사 맡긴 분)';
  if(cks.length){ h += ' <select onchange="estClientPick(this.value)" style="padding:5px;border:1px solid #cbd5e1;border-radius:5px;font-weight:400;margin-left:6px"><option value="">📂 전에 쓴 발주처 불러오기</option>'; cks.forEach(function(k){ h += '<option value="' + esc(k) + '">' + esc(CLIENTS[k].nm) + '</option>'; }); h += '</select>'; }
  h += '</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;font-size:13px;margin-top:4px">';
  h += F("상호 / 이름", e.cl.nm, "cl.nm") + F("대표자", e.cl.ceo, "cl.ceo") + F("사업자번호", e.cl.biz, "cl.biz") + F("주소", e.cl.addr, "cl.addr") + F("연락처", e.cl.tel, "cl.tel");
  h += '</div></div>';
  // 내역
  h += '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">';
  h += '<strong>📋 공사 내역</strong><label style="font-size:13px"><input type="checkbox" ' + (e.split ? "checked" : "") + ' onchange="EST_ED.split=this.checked;draw()"> 단가를 <b>재료비·노무비·경비</b>로 나눠서 적기</label></div>';
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:' + (e.split ? 1100 : 820) + 'px"><thead><tr style="background:#f1f5f9">';
  var cols = ["", "품명", "규격", "단위", "수량"].concat(e.split ? ["재료비 단가", "노무비 단가", "경비 단가"] : ["단가"]).concat(["금액", "비고", ""]);
  cols.forEach(function(t){ h += '<th style="padding:6px 4px;text-align:left;font-size:12px">' + t + '</th>'; });
  h += '</tr></thead><tbody>';
  e.items.forEach(function(it, i){
    var mv = '<td ' + T + ' style="white-space:nowrap"><button class="btn btn-s" style="background:#475569" onclick="estMv(' + i + ',-1)">▲</button><button class="btn btn-s" style="background:#475569;margin-left:2px" onclick="estMv(' + i + ',1)">▼</button></td>';
    var del = '<td ' + T + '><button class="btn btn-r btn-s" onclick="estRm(' + i + ')">✕</button></td>';
    if(it.hd){
      h += '<tr style="background:#eff6ff">' + mv + '<td ' + T + ' colspan="' + (cols.length - 3) + '">' + _estIn(it.nm, "estIt(" + i + ",'nm',this.value)", "60%", "font-weight:700;background:#fff") + ' <span class="mut" style="font-size:11px">← 공종 제목 (예: 1. 철거공사)</span></td>' + del + '</tr>';
      return;
    }
    h += '<tr>' + mv;
    h += '<td ' + T + '><input list="pbDL" value="' + esc(it.nm || "") + '" onchange="estIt(' + i + ',\'nm\',this.value);pbAutoFill(' + i + ',this.value)" placeholder="품명 (단가표 자동완성)" style="width:100%;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box"></td>';
    h += '<td ' + T + '>' + _estIn(it.spec, "estIt(" + i + ",'spec',this.value)", "100%") + '</td>';
    h += '<td ' + T + ' style="width:56px">' + _estIn(it.u, "estIt(" + i + ",'u',this.value)", "52px") + '</td>';
    h += '<td ' + T + ' style="width:70px"><input inputmode="decimal" value="' + esc(it.qty == null ? "" : it.qty) + '" oninput="estIt(' + i + ',\'qty\',this.value,1)" style="width:66px;padding:5px;border:1px solid #cbd5e1;border-radius:5px;text-align:right"></td>';
    h += '<td ' + T + '>' + _estNumIn(i, "mat") + '</td>';
    if(e.split) h += '<td ' + T + '>' + _estNumIn(i, "lab") + '</td><td ' + T + '>' + _estNumIn(i, "exp") + '</td>';
    h += '<td ' + T + ' style="text-align:right;font-weight:700;white-space:nowrap" id="estAm' + i + '">' + _estW(_estN(it.qty) * (e.split ? _estUnit(it) : _estN(it.mat))) + '</td>';
    h += '<td ' + T + '>' + _estIn(it.note, "estIt(" + i + ",'note',this.value)", "100%") + '</td>' + del + '</tr>';
  });
  h += '</tbody></table></div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' + _estBtn("#7c4a21", "📒 단가표에서 넣기", "pbPick()") + _estBtn("#b45309", "📐 세트로 넣기 (면적만 넣으면 계산)", "pbSetPick()") + _estBtn("#2563eb", "+ 항목 줄", "estAdd(0)") + _estBtn("#1e40af", "+ 공종 제목 줄", "estAdd(1)") + _estBtn("#475569", "💾 이 견적 단가를 단가표에 저장", "pbSaveFromEst()") + '</div>' + (typeof pbDatalist === "function" ? pbDatalist() : "") + '</div>';
  // 제경비·합계
  h += '<div class="card" style="margin-bottom:10px"><strong>➕ 제경비 · 부가세 · 끝자리</strong>';
  h += '<table style="border-collapse:collapse;font-size:13px;margin-top:8px">';
  (e.ext || []).forEach(function(r, i){
    h += '<tr><td style="padding:3px">' + _estIn(r.nm, "EST_ED.ext[" + i + "].nm=this.value;_estRecalc()", "150px") + '</td>';
    h += '<td style="padding:3px"><select onchange="EST_ED.ext[' + i + '].mode=this.value;_estRecalc()" style="padding:5px;border:1px solid #cbd5e1;border-radius:5px">' + EST_EXT_MODES.map(function(o){ return '<option value="' + o[0] + '"' + ((r.mode || "pct") === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select></td>';
    h += '<td style="padding:3px"><input inputmode="decimal" value="' + esc(r.v) + '" oninput="EST_ED.ext[' + i + '].v=this.value;_estRecalc()" style="width:110px;padding:5px;border:1px solid #cbd5e1;border-radius:5px;text-align:right"></td>';
    h += '<td style="padding:3px"><button class="btn btn-r btn-s" onclick="EST_ED.ext.splice(' + i + ',1);draw()">✕</button></td></tr>';
  });
  h += '</table><div style="margin-top:6px">' + _estBtn("#0f766e", "+ 제경비 줄 (안전관리비·폐기물처리비 등)", "EST_ED.ext=EST_ED.ext||[];EST_ED.ext.push({nm:'',mode:'pct',v:0});draw()") + ' ' + _estBtn("#7c4a21", "📐 원가계산 기본 줄 넣기", "estCostRows()") + '<div class="mut" style="font-size:12px;margin-top:4px">간접노무비·산재·고용보험료·안전관리비·일반관리비·이윤 줄이 들어가요. 요율(%)은 해마다 바뀌어서 비워 뒀어요 — 직접 적어 주세요.</div></div>';
  h += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:13px;align-items:center">';
  h += '<label>끝자리 정리 <select onchange="EST_ED.cut=Number(this.value);_estRecalc()" style="padding:5px;border:1px solid #cbd5e1;border-radius:5px">';
  [[0, "그대로"], [100, "100원 미만 버림"], [1000, "1,000원 미만 버림"], [10000, "1만원 미만 버림"], [100000, "10만원 미만 버림"]].forEach(function(o){ h += '<option value="' + o[0] + '"' + (_estN(e.cut) === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; });
  h += '</select></label><label><input type="checkbox" ' + (e.cutTot ? "checked" : "") + ' onchange="EST_ED.cutTot=this.checked;_estRecalc()"> 부가세 더한 <b>총액</b>에서 버리기</label>';
  h += '<label><input type="checkbox" ' + (e.vat !== false ? "checked" : "") + ' onchange="EST_ED.vat=this.checked;_estRecalc()"> 부가세 10% 더하기</label></div>';
  h += '<div id="estTot" style="margin-top:12px">' + _estTotHtml(e) + '</div></div>';
  h += '<div class="card" style="margin-bottom:10px"><strong>📝 특기사항</strong> <span class="mut" style="font-size:12px">(견적서 아래에 찍혀요)</span><textarea onchange="EST_ED.memo=this.value" style="width:100%;min-height:70px;margin-top:6px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-family:inherit">' + esc(e.memo || "") + '</textarea></div>';
  h += '<div style="text-align:right;margin-bottom:20px">' + _estBtn("#16a34a", "💾 저장", "estSave()", "padding:10px 26px;font-size:14px") + '</div>';
  return h;
}
function _estTotHtml(e){
  var c = _estCalc(e), R = function(lb, v, st){ return '<tr><td style="padding:3px 14px 3px 0;color:#475569">' + lb + '</td><td style="padding:3px 0;text-align:right;' + (st || "") + '">' + _estW(v) + '원</td></tr>'; };
  var h = '<table style="border-collapse:collapse;font-size:13.5px;margin-left:auto">';
  if(e.split) h += R("재료비", c.mat) + R("노무비", c.lab) + R("경비", c.exp);
  h += R("직접공사비", c.direct, "font-weight:700");
  c.ext.forEach(function(r){ h += R(esc(r.nm || "제경비") + (r.mode !== "amt" ? " (" + _estN(r.v) + "%)" : ""), r.am); });
  if(c.cutAm) h += R("끝자리 정리", c.cutAm, "color:#dc2626");
  h += R("공급가액", c.sup, "font-weight:700;border-top:1px solid #cbd5e1") + R("부가세", c.vat);
  h += '<tr><td style="padding:6px 14px 3px 0;font-weight:800">총 견적 금액</td><td style="padding:6px 0 3px;text-align:right;font-weight:800;font-size:17px;color:#1d4ed8">' + _estW(c.tot) + '원</td></tr>';
  h += '<tr><td colspan="2" style="text-align:right;font-size:12px;color:#64748b">금 ' + _estKor(c.tot) + '원정</td></tr></table>';
  return h;
}
function _estRecalc(){
  var e = EST_ED; if(!e) return;
  e.items.forEach(function(it, i){ var el = document.getElementById("estAm" + i); if(el) el.textContent = _estW(_estN(it.qty) * (e.split ? _estUnit(it) : _estN(it.mat))); });
  var t = document.getElementById("estTot"); if(t) t.innerHTML = _estTotHtml(e);
}
function estClientPick(k){ var c = CLIENTS[k]; if(!c) return; EST_ED.cl = { nm: c.nm || "", ceo: c.ceo || "", biz: c.biz || "", addr: c.addr || "", tel: c.tel || "" }; draw(); toast(c.nm + " 불러왔어요"); }
function estCostRows(){
  var have = {}; (EST_ED.ext || []).forEach(function(r){ have[r.nm] = 1; });
  var add = EST_COST_ROWS.filter(function(r){ return !have[r.nm]; }).map(function(r){ return Object.assign({}, r); });
  EST_ED.ext = (EST_ED.ext || []).concat(add); draw();
  toast(add.length ? "📐 " + add.length + "줄 넣었어요 — 요율(%)을 적어 주세요" : "이미 다 있어요");
}
function estSet(path, v){ var p = path.split("."); if(p.length === 2) EST_ED[p[0]][p[1]] = v; else EST_ED[p[0]] = v; }
function estIt(i, k, v, num){ EST_ED.items[i][k] = num ? String(v).replace(/,/g, "") : v; if(num) _estRecalc(); }
function estAdd(hd){ EST_ED.items.push(hd ? { hd: 1, nm: "" } : { nm: "", spec: "", u: "식", qty: 1, mat: 0, lab: 0, exp: 0, note: "" }); draw(); }
function estRm(i){ EST_ED.items.splice(i, 1); draw(); }
function estMv(i, d){ var a = EST_ED.items, j = i + d; if(j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; draw(); }

function estSave(){
  var e = EST_ED; if(!e) return;
  if(!String(e.nm || "").trim()) return toast("공사명을 적어 주세요", true);
  if(!String(e.cl.nm || "").trim()) return toast("견적 받는 곳(발주처)을 적어 주세요", true);
  var id = e._id, o = _estClean(e); delete o._id;
  o.items = (o.items || []).filter(function(it){ return it.hd ? String(it.nm || "").trim() : (String(it.nm || "").trim() || _estN(it.qty) * _estUnit(it)); });
  o.upAt = new Date().toISOString(); o.upBy = CID || "";
  showLoading("저장 중...");
  var p = id ? _estRef(id).update(o).then(function(){ return id; }) : _estRef().push(Object.assign(o, { mkAt: o.upAt, mkBy: o.upBy })).then(function(r){ return r.key; });
  var ck = _estKey(o.cl.nm); if(ck){ var cc = { nm: o.cl.nm, ceo: o.cl.ceo || "", biz: o.cl.biz || "", addr: o.cl.addr || "", tel: o.cl.tel || "" }; CLIENTS[ck] = cc; fbDb.ref("/main/Clients/" + ck).set(cc).catch(function(){}); }
  p.then(function(k){ hideLoading(); EST[k] = Object.assign({}, EST[k] || {}, o); EST_ED = null; EST_CUR = k; toast("저장했어요"); draw(); })
   .catch(function(err){ hideLoading(); toast("저장 실패: " + err.message, true); });
}
function _estPatch(id, o, msg){
  showLoading("저장 중...");
  return _estRef(id).update(_estClean(o)).then(function(){ hideLoading(); Object.assign(EST[id], o); Object.keys(o).forEach(function(k){ if(o[k] === null) delete EST[id][k]; }); if(msg) toast(msg); draw(); })
    .catch(function(err){ hideLoading(); toast("저장 실패: " + err.message, true); });
}

// ── 상세 (상태 흐름 + 출력) ──
function _estDetail(id){
  var e = EST[id], c = _estCalc(e), st = e.st || "작성중";
  var h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<div>' + _estBtn("#475569", "← 목록", "EST_CUR='';draw()") + ' <strong style="font-size:17px;margin-left:6px">' + esc(e.nm || "") + '</strong> ' + _estBadge(st) + '</div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">' + (st === "계약" ? "" : _estBtn("#2563eb", "✏️ 고치기", "estEdit('" + id + "')")) + _estBtn("#0f766e", "📄 복사해서 새 견적", "estCopy('" + id + "')") + _estBtn("#dc2626", "🗑 삭제", "estDel('" + id + "')") + '</div></div>';
  h += '<div style="margin-top:8px;font-size:13px;color:#334155">No. <b>' + esc(e.no || "") + '</b> · ' + esc(e.dt || "") + ' · 업체 <b>' + esc(_estComp(e).nm || "") + '</b> · 받는 곳 <b>' + esc((e.cl && e.cl.nm) || "") + '</b> · 총 견적 <b style="color:#1d4ed8">' + _estW(c.tot) + '원</b> <span class="mut">(공급가액 ' + _estW(c.sup) + ' + 부가세 ' + _estW(c.vat) + ')</span></div></div>';

  // 진행 단계
  var steps = [["작성중", "① 견적 작성"], ["제출", "② 발주처에 보냄"], ["승인", "③ 승인"], ["계약", "④ 계약"]];
  var cur = { "작성중": 0, "제출": 1, "반려": 1, "승인": 2, "계약": 3 }[st];
  h += '<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">';
  steps.forEach(function(s, i){ var on = i <= cur; h += '<div style="flex:1;min-width:110px;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:700;background:' + (on ? (i === cur ? "#1d4ed8" : "#93c5fd") : "#e2e8f0") + ';color:' + (on ? "#fff" : "#64748b") + '">' + s[1] + '</div>'; });
  h += '</div>';
  if(st === "반려") h += '<div style="padding:8px 10px;background:#fee2e2;border-radius:6px;font-size:13px;color:#991b1b;margin-bottom:8px">❌ 반려됨 ' + esc(e.apAt || "") + (e.apNote ? ' — ' + esc(e.apNote) : '') + '<br>고친 뒤 다시 보내거나, <b>복사해서 새 견적</b>으로 수정 견적을 만드세요.</div>';
  if(e.apAt && (st === "승인" || st === "계약")) h += '<div style="font-size:13px;color:#166534;margin-bottom:8px">✅ 승인 ' + esc(e.apAt) + (e.apBy ? ' · ' + esc(e.apBy) : '') + (e.apNote ? ' — ' + esc(e.apNote) : '') + '</div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  if(st === "작성중" || st === "반려") h += _estBtn("#2563eb", "📨 발주처에 보냈어요 (제출)", "estSt('" + id + "','제출')");
  if(st === "제출"){ h += _estBtn("#16a34a", "✅ 승인 받았어요", "estApprove('" + id + "')") + _estBtn("#dc2626", "❌ 반려됐어요", "estReject('" + id + "')") + _estBtn("#475569", "↩ 작성중으로", "estSt('" + id + "','작성중')"); }
  if(st === "승인"){ h += _estBtn("#7c3aed", "📑 계약서 만들기", "estContract('" + id + "')") + _estBtn("#475569", "↩ 승인 취소", "estSt('" + id + "','제출')"); }
  if(st === "계약") h += _estBtn("#7c3aed", "📑 계약 내용 고치기", "estContract('" + id + "')") + _estBtn("#475569", "↩ 계약 취소 (승인 상태로)", "if(confirm('계약을 취소하고 승인 상태로 되돌릴까요? (계약 내용은 남아 있어요)'))estSt('" + id + "','승인')");
  h += '</div></div>';

  // 출력
  h += '<div class="card" style="margin-bottom:10px"><strong>🖨️ 뽑기</strong> <span class="mut" style="font-size:12px">인쇄 창에서 <b>PDF로 저장</b>을 고르면 파일로 받을 수 있어요</span>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px">';
  h += '<div style="border:2px solid #2563eb;border-radius:8px;padding:10px"><b>💰 견적서</b><div class="mut" style="font-size:12px;margin:4px 0 8px">공사 내역 · 금액 · 우리 회사 직인</div><div style="display:flex;gap:6px">' + _estBtn("#2563eb", "🖨️ 인쇄/PDF", "estPrintQuote('" + id + "')", "flex:1") + _estBtn("#15803d", "📥 엑셀", "estQuoteExcel('" + id + "')", "flex:1") + '</div>' + _estBtn("#b45309", "📷 현장사진 붙여서 인쇄" + (e.ph && e.ph.length ? " (" + e.ph.length + "장)" : ""), "phQuotePick('" + id + "')", "width:100%;margin-top:6px") + '</div>';
  var ok = st === "계약";
  h += '<div style="border:2px solid ' + (ok ? "#7c3aed" : "#cbd5e1") + ';border-radius:8px;padding:10px"><b>📑 계약서</b><div class="mut" style="font-size:12px;margin:4px 0 8px">' + (ok ? "공사 도급 계약서 (견적 금액 그대로)" : "승인 → 계약서 만들기를 하면 뽑을 수 있어요") + '</div>' + (ok ? _estBtn("#7c3aed", "🖨️ 인쇄/PDF", "estPrintContract('" + id + "')", "width:100%") : "") + '</div>';
  var canStmt = st === "승인" || st === "계약";
  h += '<div style="border:2px solid ' + (canStmt ? "#0f766e" : "#cbd5e1") + ';border-radius:8px;padding:10px"><b>🧾 거래명세표</b><div class="mut" style="font-size:12px;margin:4px 0 8px">' + (canStmt ? "전체 · 기성(%) · 금액 직접 — 여러 장 발행" : "승인된 견적부터 만들 수 있어요") + '</div>' + (canStmt ? _estBtn("#0f766e", "+ 거래명세표 만들기", "estStmtNew('" + id + "')", "width:100%") : "") + '</div>';
  h += '</div>';
  var sids = Object.keys(e.stmts || {}).sort(function(a, b){ return String(e.stmts[a].no).localeCompare(String(e.stmts[b].no)); });
  if(sids.length){
    var bs = _estStmtSum(e);
    h += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px"><thead><tr style="background:#f0fdfa"><th style="padding:6px;text-align:left">발행</th><th style="padding:6px;text-align:left">날짜</th><th style="padding:6px;text-align:left">내용</th><th style="padding:6px;text-align:right">금액(부가세 포함)</th><th></th></tr></thead><tbody>';
    sids.forEach(function(k){ var s = e.stmts[k];
      h += '<tr><td style="padding:6px;border-bottom:1px solid #f1f5f9">' + esc(s.no) + '</td><td style="padding:6px;border-bottom:1px solid #f1f5f9">' + esc(s.dt) + '</td><td style="padding:6px;border-bottom:1px solid #f1f5f9">' + esc(s.desc || "") + '</td><td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right"><b>' + _estW(_estN(s.sup) + _estN(s.vat)) + '</b></td>';
      h += '<td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap">' + _estBtn("#0f766e", "🖨️ 인쇄", "estPrintStmt('" + id + "','" + k + "')", "padding:4px 10px") + ' ' + _estBtn("#dc2626", "삭제", "estStmtDel('" + id + "','" + k + "')", "padding:4px 10px") + '</td></tr>'; });
    h += '</tbody></table><div style="text-align:right;font-size:13px;margin-top:6px">발행 합계 <b>' + _estW(bs) + '원</b> / 견적 ' + _estW(c.tot) + '원 · 남은 금액 <b style="color:#dc2626">' + _estW(c.tot - bs) + '원</b></div>';
  }
  h += '</div>';

  // 내역 미리보기
  if(typeof _rcvBox === "function") h += _rcvBox(id);   // 💵 받은 돈 (계약된 견적)
  h += '<div class="card"><strong>📋 내역</strong><div style="overflow-x:auto;margin-top:8px">' + _estItemsTable(e, false) + '</div><div style="margin-top:10px">' + _estTotHtml(e) + '</div>' + (e.memo ? '<div style="margin-top:8px;font-size:13px;white-space:pre-wrap;background:#f8fafc;padding:8px;border-radius:6px">' + esc(e.memo) + '</div>' : '') + '</div>';
  return h;
}

function estSt(id, st){ _estPatch(id, { st: st }, "상태: " + st); }
function estApprove(id){
  var n = prompt("승인 메모 (선택) — 예: 발주처 OOO 과장 구두 승인, 네고 후 확정", ""); if(n == null) return;
  _estPatch(id, { st: "승인", apAt: todayKST(), apBy: (ME && (ME.nm || ME.id)) || CID || "", apNote: n }, "✅ 승인 — 이제 계약서를 만들 수 있어요");
}
function estReject(id){
  var n = prompt("반려 사유 (선택)", ""); if(n == null) return;
  _estPatch(id, { st: "반려", apAt: todayKST(), apBy: (ME && (ME.nm || ME.id)) || CID || "", apNote: n }, "반려로 표시했어요");
}
function estDel(id){
  var e = EST[id];
  if(!confirm("견적 " + (e.no || "") + " (" + (e.nm || "") + ")을 삭제할까요?" + (e.st === "계약" ? "\n⚠ 계약·거래명세표 기록도 같이 지워져요." : ""))) return;
  showLoading("삭제 중...");
  _estRef(id).remove().then(function(){ hideLoading(); delete EST[id]; EST_CUR = ""; toast("삭제했어요"); draw(); }).catch(function(err){ hideLoading(); toast("삭제 실패: " + err.message, true); });
}

// ── 계약서 입력 ──
function estContract(id){
  var e = EST[id], c = _estCalc(e), ct = e.ct || {};
  var d = { dt: ct.dt || todayKST(), st: ct.st || "", en: ct.en || "", p1: ct.p1 != null ? ct.p1 : 30, p2: ct.p2 != null ? ct.p2 : 40, p2when: ct.p2when || "공정률 50% 시", p3: ct.p3 != null ? ct.p3 : 30,
    bond: ct.bond != null ? ct.bond : 10, warr: ct.warr || "준공일로부터 1년", late: ct.late || "1000분의 1", pay: ct.pay || "기성 청구 후 14일 이내 현금 지급", sp: ct.sp || "", gen: ct.gen !== false };
  var I = function(lb, k, ph){ return '<label style="font-size:13px">' + lb + '<input id="ct_' + k + '" value="' + esc(d[k]) + '" placeholder="' + esc(ph || "") + '" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box"></label>'; };
  var h = '<h3 style="margin:0 0 4px">📑 계약서 만들기 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3>';
  h += '<div style="font-size:13px;color:#334155;margin-bottom:10px">' + esc(e.nm) + ' · 계약 금액 <b style="color:#7c3aed">' + _estW(c.tot) + '원</b> (견적 금액 그대로)</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' + I("계약일", "dt") + I("착공일", "st", "2026-11-10") + I("준공일", "en", "2026-12-20") + '</div>';
  h += '<div style="margin:10px 0 4px;font-weight:700;font-size:13px">💵 대금 나눠 받기 (%) <span class="mut" style="font-weight:400">— 합이 100이어야 해요</span></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1.4fr 1fr;gap:8px">' + I("계약금 %", "p1") + I("중도금 %", "p2") + I("중도금 받는 때", "p2when") + I("잔금 % (준공 후)", "p3") + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">' + I("계약보증금 % (0이면 없음)", "bond") + I("하자 보수 기간", "warr") + I("지체상금률 (하루당)", "late") + '</div>';
  h += '<div style="margin-top:8px">' + I("대금 지급 방법", "pay") + '</div>';
  h += '<label style="font-size:13px;display:block;margin-top:8px">특약 사항<textarea id="ct_sp" style="width:100%;min-height:70px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box;font-family:inherit" placeholder="예: 자재는 발주처 확인 후 반입 / 추가 공사는 별도 견적">' + esc(d.sp) + '</textarea></label>';
  h += '<label style="font-size:13px;display:block;margin-top:6px"><input type="checkbox" id="ct_gen" ' + (d.gen ? "checked" : "") + '> 일반 조항(제1조~제10조) 넣기</label>';
  h += '<div style="font-size:12px;color:#92400e;background:#fef3c7;padding:6px 8px;border-radius:6px;margin-top:8px">ℹ️ 들어가는 조항은 보통 쓰는 기본 문구예요. 큰 공사는 국토교통부 <b>민간건설공사 표준도급계약서</b>와 한 번 비교해 보세요.</div>';
  h += '<div style="text-align:right;margin-top:12px">' + _estBtn("#7c3aed", "💾 저장하고 계약으로", "estContractSave('" + id + "')", "padding:9px 20px") + '</div>';
  openPopup(h, 680);
}
function estContractSave(id){
  var g = function(k){ var el = document.getElementById("ct_" + k); return el ? el.value.trim() : ""; };
  var ct = { dt: g("dt"), st: g("st"), en: g("en"), p1: _estN(g("p1")), p2: _estN(g("p2")), p2when: g("p2when"), p3: _estN(g("p3")), bond: _estN(g("bond")), warr: g("warr"), late: g("late"), pay: g("pay"), sp: g("sp"), gen: document.getElementById("ct_gen").checked };
  if(Math.abs(ct.p1 + ct.p2 + ct.p3 - 100) > 0.001) return toast("계약금+중도금+잔금이 100%가 아니에요 (지금 " + (ct.p1 + ct.p2 + ct.p3) + "%)", true);
  if(!ct.st || !ct.en) return toast("착공일과 준공일을 적어 주세요", true);
  closePopup();
  _estPatch(id, { ct: ct, st: "계약" }, "📑 계약으로 저장 — 계약서를 뽑을 수 있어요");
}

// ── 거래명세표 ──
function estStmtNew(id){
  var e = EST[id], c = _estCalc(e), billed = 0;
  Object.keys(e.stmts || {}).forEach(function(k){ billed += _estN(e.stmts[k].sup); });
  var h = '<h3 style="margin:0 0 8px">🧾 거래명세표 만들기 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3>';
  h += '<div style="font-size:13px;margin-bottom:10px">' + esc(e.nm) + ' · 공급가액 ' + _estW(c.sup) + '원 중 지금까지 ' + _estW(billed) + '원 발행</div>';
  h += '<label style="font-size:13px">작성일 <input id="st_dt" value="' + todayKST() + '" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px"></label>';
  h += '<div style="margin-top:10px;font-size:13.5px;line-height:2">';
  h += '<label><input type="radio" name="st_m" value="all" checked> <b>전체 내역</b> — 견적 항목 그대로 (공급가액 ' + _estW(c.sup) + '원)</label><br>';
  h += '<label><input type="radio" name="st_m" value="pct"> <b>기성 %</b> — 공사한 만큼만 <input id="st_pct" inputmode="decimal" placeholder="30" style="width:60px;padding:4px;border:1px solid #cbd5e1;border-radius:5px;text-align:right" onfocus="document.querySelector(\'input[name=st_m][value=pct]\').checked=true">% (차수 <input id="st_n" value="' + (Object.keys(e.stmts || {}).length + 1) + '" style="width:40px;padding:4px;border:1px solid #cbd5e1;border-radius:5px;text-align:center">차)</label><br>';
  h += '<label><input type="radio" name="st_m" value="amt"> <b>금액 직접</b> — 공급가액 <input id="st_amt" inputmode="numeric" placeholder="' + _estW(Math.max(0, c.sup - billed)) + '" style="width:120px;padding:4px;border:1px solid #cbd5e1;border-radius:5px;text-align:right" onfocus="document.querySelector(\'input[name=st_m][value=amt]\').checked=true">원 · 품목 <input id="st_desc" placeholder="잔금" style="width:120px;padding:4px;border:1px solid #cbd5e1;border-radius:5px"></label>';
  h += '</div><div style="text-align:right;margin-top:12px">' + _estBtn("#0f766e", "💾 만들고 인쇄", "estStmtSave('" + id + "')", "padding:9px 20px") + '</div>';
  openPopup(h, 560);
}
function estStmtSave(id){
  var e = EST[id], c = _estCalc(e), m = (document.querySelector("input[name=st_m]:checked") || {}).value || "all";
  var dt = document.getElementById("st_dt").value.trim() || todayKST(), lines = [], desc = "", sup = 0;
  if(m === "all"){
    (e.items || []).forEach(function(it){ if(it.hd) return; var q = _estN(it.qty), u = e.split ? _estUnit(it) : _estN(it.mat); lines.push({ nm: it.nm || "", spec: it.spec || "", qty: q, u: u, am: Math.round(q * u) }); });
    c.ext.forEach(function(r){ if(r.am) lines.push({ nm: r.nm || "제경비", spec: r.mode === "pct" ? _estN(r.v) + "%" : "", qty: 1, u: r.am, am: r.am }); });
    if(c.cutAm) lines.push({ nm: "끝자리 정리", spec: "", qty: 1, u: c.cutAm, am: c.cutAm });
    sup = c.sup; desc = "전체 내역";
  } else if(m === "pct"){
    var pct = _estN(document.getElementById("st_pct").value); if(!(pct > 0)) return toast("기성 %를 적어 주세요", true);
    var n = document.getElementById("st_n").value.trim() || "1";
    sup = Math.floor(c.sup * pct / 100); desc = n + "차 기성 (" + pct + "%)";
    lines.push({ nm: (e.nm || "공사") + " " + n + "차 기성금", spec: "기성률 " + pct + "%", qty: 1, u: sup, am: sup });
  } else {
    sup = Math.round(_estN(document.getElementById("st_amt").value)); if(!(sup > 0)) return toast("금액을 적어 주세요", true);
    desc = document.getElementById("st_desc").value.trim() || "공사 대금";
    lines.push({ nm: (e.nm || "공사") + " " + desc, spec: "", qty: 1, u: sup, am: sup });
  }
  var vat = e.vat === false ? 0 : Math.floor(sup / 10);
  var no = dt.replace(/-/g, "") + "-" + (Object.keys(e.stmts || {}).length + 1);
  var s = { no: no, dt: dt, mode: m, desc: desc, lines: lines, sup: sup, vat: vat, mkAt: new Date().toISOString(), mkBy: CID || "" };
  var ref = _estRef(id).child("stmts").push();
  closePopup(); showLoading("저장 중...");
  ref.set(_estClean(s)).then(function(){ hideLoading(); e.stmts = e.stmts || {}; e.stmts[ref.key] = s; draw(); estPrintStmt(id, ref.key); })
    .catch(function(err){ hideLoading(); toast("저장 실패: " + err.message, true); });
}
function estStmtDel(id, k){
  if(!confirm("이 거래명세표를 삭제할까요?")) return;
  _estRef(id).child("stmts/" + k).remove().then(function(){ delete EST[id].stmts[k]; toast("삭제했어요"); draw(); });
}

// ── 견적 내는 업체 (공급자) — 사업자 여러 개 · 다른 업체 대신 써 주기 ──
function estCompanyList(){
  var ids = _estCompIds();
  var h = '<h3 style="margin:0 0 6px">🏢 견적 내는 업체 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3>';
  h += '<div style="font-size:12.5px;color:#64748b;margin-bottom:10px">견적서·계약서·거래명세표의 <b>공급자</b> 칸에 들어가는 업체예요. 우리 사업자가 여러 개이거나, 다른 업체 이름으로 견적을 써 줄 때 등록해 두고 견적마다 골라 쓰세요.</div>';
  if(!ids.length) h += '<div class="mut" style="padding:14px;text-align:center">아직 없어요</div>';
  ids.forEach(function(k){ var c = COMPS[k];
    h += '<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px">' + (c.stamp ? '<img src="' + c.stamp + '" style="width:38px;height:38px;object-fit:contain">' : '<div style="width:38px;height:38px;border:1px dashed #cbd5e1;border-radius:6px"></div>');
    h += '<div style="flex:1;font-size:13px"><b>' + esc(c.nm || "") + '</b>' + (c.main ? ' <span style="font-size:11px;background:#1d4ed8;color:#fff;padding:1px 6px;border-radius:8px">기본</span>' : '') + '<div class="mut" style="font-size:12px">' + esc(c.biz || "사업자번호 없음") + ' · 대표 ' + esc(c.ceo || "-") + '</div></div>';
    h += _estBtn("#2563eb", "수정", "estCompanyEdit('" + k + "')", "padding:5px 10px") + _estBtn("#dc2626", "삭제", "estCompanyDel('" + k + "')", "padding:5px 10px") + '</div>'; });
  h += '<div style="margin-top:10px">' + _estBtn("#0f766e", "+ 업체 추가", "estCompanyEdit('')", "padding:8px 16px") + '</div>';
  openPopup(h, 560);
}
function estCompanyEdit(k, fromEditor){
  var c = (k && COMPS[k]) || {}, first = !_estCompIds().length;
  var F = [["nm", "상호", first ? SYS_NAME : ""], ["ceo", "대표자"], ["biz", "사업자등록번호", "000-00-00000"], ["addr", "주소"], ["up", "업태", "건설업"], ["jm", "종목", "실내건축·건축공사"], ["tel", "전화"], ["fax", "팩스"], ["mail", "이메일"], ["bank", "입금 계좌", "농협 000-0000-0000-00 (예금주)"]];
  var h = '<h3 style="margin:0 0 8px">🏢 ' + (k ? "업체 수정" : "업체 추가") + ' <button class="btn" style="background:#475569;float:right" onclick="' + (fromEditor ? "closePopup()" : "estCompanyList()") + '">' + (fromEditor ? "닫기" : "← 목록") + '</button></h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  F.forEach(function(f){ h += '<label style="font-size:13px">' + f[1] + '<input id="cp_' + f[0] + '" value="' + esc(c[f[0]] || (f[0] === "nm" && !k ? f[2] : "")) + '" placeholder="' + esc(f[2] || "") + '" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box"></label>'; });
  h += '</div><label style="font-size:13px;display:block;margin-top:8px"><input type="checkbox" id="cp_main" ' + (c.main || first ? "checked" : "") + '> 기본 업체 (새 견적에 자동으로 골라짐)</label>';
  h += '<div style="margin-top:10px;font-size:13px"><b>직인 이미지</b> <span class="mut">(흰 배경 사진 · 자동으로 작게 줄이고 흰색은 투명하게)</span><div style="display:flex;align-items:center;gap:10px;margin-top:6px"><div id="cp_stampPrev" style="width:70px;height:70px;border:1px dashed #94a3b8;border-radius:6px;display:flex;align-items:center;justify-content:center;background:#fff">' + (c.stamp ? '<img src="' + c.stamp + '" style="max-width:66px;max-height:66px">' : '<span class="mut" style="font-size:11px">없음</span>') + '</div>';
  h += '<input type="file" accept="image/*" onchange="estStampPick(this)"> ' + (c.stamp ? _estBtn("#dc2626", "직인 지우기", "window._cpStamp='';document.getElementById('cp_stampPrev').innerHTML='없음'", "padding:4px 10px") : "") + '</div></div>';
  h += '<div style="text-align:right;margin-top:12px">' + _estBtn("#16a34a", "💾 저장", "estCompanySave('" + (k || "") + "'," + (fromEditor ? 1 : 0) + ")", "padding:9px 20px") + '</div>';
  window._cpStamp = c.stamp || "";
  openPopup(h, 600);
}
function estStampPick(inp){
  var f = inp.files && inp.files[0]; if(!f) return;
  var rd = new FileReader();
  rd.onload = function(){
    var img = new Image();
    img.onload = function(){
      var S = 240, r = Math.min(S / img.width, S / img.height, 1), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
      var x = cv.getContext("2d"); x.drawImage(img, 0, 0, cv.width, cv.height);
      // 흰 배경을 투명하게 → 글자 위에 겹쳐 찍어도 자연스럽게
      var d = x.getImageData(0, 0, cv.width, cv.height), p = d.data;
      for(var i = 0; i < p.length; i += 4){ if(p[i] > 225 && p[i + 1] > 225 && p[i + 2] > 225) p[i + 3] = 0; }
      x.putImageData(d, 0, 0);
      window._cpStamp = cv.toDataURL("image/png");
      document.getElementById("cp_stampPrev").innerHTML = '<img src="' + window._cpStamp + '" style="max-width:66px;max-height:66px">';
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
}
function estCompanySave(k, fromEditor){
  var o = {}; ["nm", "ceo", "biz", "addr", "up", "jm", "tel", "fax", "mail", "bank"].forEach(function(f){ o[f] = document.getElementById("cp_" + f).value.trim(); });
  if(!o.nm) return toast("상호를 적어 주세요", true);
  o.main = document.getElementById("cp_main").checked; o.stamp = window._cpStamp || "";
  var key = k || fbDb.ref("/main/Companies").push().key, upd = {};
  upd[key] = o;
  if(o.main) Object.keys(COMPS).forEach(function(x){ if(x !== key && COMPS[x].main) upd[x + "/main"] = false; });   // 기본은 하나만
  showLoading("저장 중...");
  fbDb.ref("/main/Companies").update(upd).then(function(){
    hideLoading(); COMPS[key] = o; if(o.main) Object.keys(COMPS).forEach(function(x){ if(x !== key) COMPS[x].main = false; });
    if(fromEditor && EST_ED){ EST_ED.sup = key; closePopup(); draw(); } else { draw(); estCompanyList(); }
    toast(o.nm + " 저장했어요");
  }).catch(function(err){ hideLoading(); toast("저장 실패: " + err.message, true); });
}
function estCompanyDel(k){
  var used = Object.keys(EST || {}).filter(function(x){ return EST[x].sup === k; }).length;
  if(!confirm((COMPS[k].nm || "") + " 업체를 지울까요?" + (used ? "\n⚠ 이 공사의 견적 " + used + "건이 이 업체로 되어 있어요 — 지우면 기본 업체로 찍혀요." : ""))) return;
  fbDb.ref("/main/Companies/" + k).remove().then(function(){ delete COMPS[k]; toast("지웠어요"); draw(); estCompanyList(); });
}

// ── 인쇄 공통 ──
var EST_PCSS = '*{box-sizing:border-box}body{margin:0;font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;color:#111;font-size:12px}' +
  '.pg{width:190mm;margin:0 auto}h1{text-align:center;font-size:28px;letter-spacing:18px;margin:4mm 0 5mm;font-weight:900}' +
  'table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:4px 5px;vertical-align:middle}th{background:#eef2f7;font-weight:700}' +
  '.r{text-align:right}.c{text-align:center}.hd td{background:#f5f7fa;font-weight:700}.nb>tbody>tr>td,.nb>tr>td{border:none}.big{font-size:15px;font-weight:800}' +
  '.stamp{position:relative;display:inline-block}.stamp img{position:absolute;left:50%;top:50%;width:52px;height:52px;object-fit:contain;transform:translate(-50%,-50%);opacity:.9}' +
  '.tb{display:flex;justify-content:center;gap:8px;padding:10px;background:#1e293b;position:sticky;top:0}.tb button{padding:8px 18px;font-size:14px;font-weight:700;border:none;border-radius:6px;color:#fff;cursor:pointer}' +
  '@media print{.tb{display:none}.pg{width:auto}}';
function _estWin(title, body, land, css){
  var w = window.open("", "_blank", "width=1000,height=1100"); if(!w){ toast("팝업이 막혔어요 — 팝업 허용 후 다시", true); return; }
  w.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page{size:A4 ' + (land ? "landscape" : "portrait") + ';margin:10mm}' + EST_PCSS + (land ? '.pg{width:277mm}' : '') + (css || '') + '</style></head><body>' +
    '<div class="tb"><button style="background:#2563eb" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button><button style="background:#475569" onclick="window.close()">닫기</button></div>' + body + '</body></html>');
  w.document.close();
}
function _estStampHtml(cp, txt){ return cp && cp.stamp ? '<span class="stamp">' + txt + '<img src="' + cp.stamp + '"></span>' : txt; }
function _estSupBox(c, title){
  c = c || {};
  return '<table><tr><th rowspan="5" style="width:22px;writing-mode:vertical-lr;letter-spacing:6px">' + (title || "공급자") + '</th><th style="width:62px">등록번호</th><td colspan="3" class="c" style="font-weight:700;letter-spacing:2px">' + esc(c.biz || "") + '</td></tr>' +
    '<tr><th>상 호</th><td>' + esc(c.nm || SYS_NAME) + '</td><th style="width:40px">대표</th><td style="width:100px;white-space:nowrap">' + esc(c.ceo || "") + ' ' + _estStampHtml(c, '(인)') + '</td></tr>' +
    '<tr><th>주 소</th><td colspan="3">' + esc(c.addr || "") + '</td></tr><tr><th>업 태</th><td>' + esc(c.up || "") + '</td><th>종목</th><td>' + esc(c.jm || "") + '</td></tr>' +
    '<tr><th>전 화</th><td colspan="3">' + esc(c.tel || "") + (c.fax ? ' / 팩스 ' + esc(c.fax) : '') + '</td></tr></table>';
}

// 내역표 (print=true 이면 인쇄용 클래스)
function _estItemsTable(e, print){
  var sp = !!e.split, B = print ? "" : ' style="padding:5px;border:1px solid #e2e8f0"', TH = print ? "" : ' style="padding:5px;border:1px solid #e2e8f0;background:#f1f5f9"';
  var h = '<table' + (print ? "" : ' style="border-collapse:collapse;width:100%;font-size:12.5px"') + '><thead><tr><th' + TH + ' rowspan="' + (sp ? 2 : 1) + '">No</th><th' + TH + ' rowspan="' + (sp ? 2 : 1) + '">품 명</th><th' + TH + ' rowspan="' + (sp ? 2 : 1) + '">규 격</th><th' + TH + ' rowspan="' + (sp ? 2 : 1) + '">단위</th><th' + TH + ' rowspan="' + (sp ? 2 : 1) + '">수량</th>';
  if(sp) h += '<th' + TH + ' colspan="2">재 료 비</th><th' + TH + ' colspan="2">노 무 비</th><th' + TH + ' colspan="2">경 비</th><th' + TH + ' colspan="2">합 계</th><th' + TH + ' rowspan="2">비고</th></tr><tr>' + "<th" + TH + ">단가</th><th" + TH + ">금액</th>".repeat(1) + "<th" + TH + ">단가</th><th" + TH + ">금액</th>" + "<th" + TH + ">단가</th><th" + TH + ">금액</th>" + "<th" + TH + ">단가</th><th" + TH + ">금액</th>" + '</tr></thead><tbody>';
  else h += '<th' + TH + '>단 가</th><th' + TH + '>금 액</th><th' + TH + '>비고</th></tr></thead><tbody>';
  var n = 0, cols = sp ? 14 : 8;
  (e.items || []).forEach(function(it){
    if(it.hd){ h += '<tr class="hd"><td' + B + ' colspan="' + cols + '" style="' + (print ? "" : "padding:5px;border:1px solid #e2e8f0;background:#eff6ff;") + 'font-weight:700">' + esc(it.nm) + '</td></tr>'; return; }
    n++; var q = _estN(it.qty), R = function(v){ return '<td' + B + ' class="r"' + (print ? "" : ' align="right"') + '>' + (v ? _estW(v) : "") + '</td>'; };
    h += '<tr><td' + B + ' class="c">' + n + '</td><td' + B + '>' + esc(it.nm) + '</td><td' + B + '>' + esc(it.spec || "") + '</td><td' + B + ' class="c">' + esc(it.u || "") + '</td><td' + B + ' class="r">' + (q || "") + '</td>';
    if(sp) h += R(_estN(it.mat)) + R(q * _estN(it.mat)) + R(_estN(it.lab)) + R(q * _estN(it.lab)) + R(_estN(it.exp)) + R(q * _estN(it.exp)) + R(_estUnit(it)) + '<td' + B + ' class="r"' + (print ? "" : ' align="right"') + ' style="font-weight:700">' + _estW(q * _estUnit(it)) + '</td>';
    else h += R(_estN(it.mat)) + '<td' + B + ' class="r"' + (print ? "" : ' align="right"') + ' style="font-weight:700">' + _estW(q * _estN(it.mat)) + '</td>';
    h += '<td' + B + '>' + esc(it.note || "") + '</td></tr>';
  });
  h += '</tbody></table>';
  return h;
}

// ── 💰 견적서 인쇄 ──
function estPrintQuote(id, extra){   // extra: 뒤에 붙일 쪽 (현장 사진 등 — photo.js)
  var e = EST[id], c = _estCalc(e), cl = e.cl || {}, cp = _estComp(e);
  var b = '<div class="pg"><h1>견 적 서</h1><table class="nb"><tr><td style="width:50%;vertical-align:top;padding-right:4mm">';
  b += '<table class="nb" style="font-size:13px"><tr><td style="width:70px">견적번호</td><td>' + esc(e.no || "") + '</td></tr><tr><td>견적일자</td><td>' + esc(e.dt || "") + '</td></tr>';
  b += '<tr><td colspan="2" style="padding:6px 0;font-size:17px;font-weight:800;border-bottom:2px solid #111">' + esc(cl.nm || "") + ' 귀하</td></tr>';
  b += '<tr><td>공 사 명</td><td><b>' + esc(e.nm || "") + '</b></td></tr>' + (e.site ? '<tr><td>현장 위치</td><td>' + esc(e.site) + '</td></tr>' : '') + (e.term ? '<tr><td>공사 기간</td><td>' + esc(e.term) + '</td></tr>' : '') + (e.valid ? '<tr><td>유효 기간</td><td>' + esc(e.valid) + '</td></tr>' : '');
  b += '<tr><td colspan="2" style="padding-top:6px">아래와 같이 견적합니다.</td></tr></table></td><td style="width:50%;vertical-align:top">' + _estSupBox(cp) + '</td></tr></table>';
  b += '<table style="margin:4mm 0"><tr><th style="width:120px" class="big">합 계 금 액<br><span style="font-size:11px;font-weight:400">(부가세 ' + (e.vat === false ? "별도" : "포함") + ')</span></th><td class="big c">금 ' + _estKor(c.tot) + '원정 &nbsp; (₩' + _estW(c.tot) + ')</td></tr></table>';
  b += _estItemsTable(e, true);
  b += '<table style="margin-top:3mm;width:' + (e.split ? "45%" : "60%") + ';margin-left:auto">';
  var R = function(lb, v, st){ return '<tr><th style="text-align:left;' + (st || "") + '">' + lb + '</th><td class="r" style="' + (st || "") + '">' + _estW(v) + '</td></tr>'; };
  if(e.split) b += R("재료비", c.mat) + R("노무비", c.lab) + R("경비", c.exp);
  b += R("직접공사비 계", c.direct);
  c.ext.forEach(function(r){ b += R(esc(r.nm || "제경비") + (r.mode !== "amt" ? " (" + _estN(r.v) + "%)" : ""), r.am); });
  if(c.cutAm) b += R("끝자리 정리", c.cutAm);
  b += R("공급가액", c.sup, "font-weight:800") + R("부가세", c.vat) + R("총 액", c.tot, "font-weight:900;font-size:14px") + '</table>';
  if(e.memo) b += '<table style="margin-top:3mm"><tr><th style="width:80px">특기사항</th><td style="white-space:pre-wrap">' + esc(e.memo) + '</td></tr></table>';
  if(cp.bank) b += '<div style="margin-top:3mm;font-size:12px">입금 계좌: <b>' + esc(cp.bank) + '</b></div>';
  b += '</div>';
  _estWin("견적서_" + (e.nm || "") + "_" + (e.no || ""), b + (extra || ""), !!e.split, extra && typeof PH_PCSS !== "undefined" ? PH_PCSS : "");
}

// ── 📑 계약서 인쇄 ──
var EST_GEN = [
  ["목적", "수급인은 이 계약서와 붙임 공사 내역서(견적서)에 따라 공사를 완성하고, 도급인은 그 대가를 지급한다."],
  ["공사의 시행", "수급인은 관계 법령과 설계·내역서에 따라 성실히 시공하며, 현장의 안전관리와 환경관리에 책임을 진다."],
  ["대금 지급", "도급인은 제4항에서 정한 대로 공사 대금을 지급한다. 수급인은 대금을 받을 때 세금계산서를 발행한다."],
  ["설계 변경 및 추가 공사", "도급인의 요청이나 현장 여건으로 공사 내용이 바뀌는 경우, 양 당사자는 서면으로 협의하여 금액과 기간을 조정한다."],
  ["공사 기간 연장", "천재지변, 도급인의 사정 등 수급인의 책임이 아닌 사유로 공사가 늦어지는 경우 수급인은 공사 기간 연장을 요구할 수 있다."],
  ["지체상금", "수급인이 정당한 사유 없이 준공일까지 공사를 끝내지 못한 경우, 늦어진 날 하루마다 계약금액에 제8항의 지체상금률을 곱한 금액을 도급인에게 낸다."],
  ["검사 및 인도", "수급인은 공사를 끝내면 도급인에게 알리고, 도급인은 지체 없이 검사한 뒤 목적물을 인수한다."],
  ["하자 보수", "수급인은 제7항의 하자 보수 기간 동안 수급인의 책임으로 생긴 하자를 보수한다."],
  ["계약 해제·해지", "어느 한쪽이 계약을 위반하여 상당한 기간을 정해 이행을 요구하였는데도 이행하지 않으면, 상대방은 계약을 해제·해지하고 손해 배상을 청구할 수 있다."],
  ["분쟁 해결", "이 계약에 관한 분쟁은 서로 협의하여 해결하며, 협의가 되지 않으면 관계 법령과 일반 관례에 따른다."]
];
function estPrintContract(id){
  var e = EST[id], c = _estCalc(e), ct = e.ct || {}, cl = e.cl || {}, cp = _estComp(e);
  var a1 = Math.floor(c.tot * _estN(ct.p1) / 100), a2 = Math.floor(c.tot * _estN(ct.p2) / 100), a3 = c.tot - a1 - a2;
  var b = '<div class="pg"><h1 style="letter-spacing:10px">공사 도급 계약서</h1>';
  b += '<table style="font-size:12.5px">';
  var R = function(no, lb, v){ return '<tr><th style="width:26px" class="c">' + no + '</th><th style="width:110px;text-align:left">' + lb + '</th><td>' + v + '</td></tr>'; };
  b += R(1, "공 사 명", "<b>" + esc(e.nm || "") + "</b>");
  b += R(2, "공사 장소", esc(e.site || ""));
  b += R(3, "공사 기간", "착공 " + esc(ct.st || "") + " &nbsp;~&nbsp; 준공 " + esc(ct.en || ""));
  b += R(4, "계약 금액", '<b style="font-size:14px">금 ' + _estKor(c.tot) + '원정 (₩' + _estW(c.tot) + ')</b><br><span style="font-size:11.5px">공급가액 ₩' + _estW(c.sup) + ' · 부가세 ₩' + _estW(c.vat) + (e.vat === false ? " (부가세 별도)" : "") + '</span>');
  var pay = '<table style="margin:2px 0"><tr><th>구분</th><th>비율</th><th>금액</th><th>지급 시기</th></tr>' +
    '<tr><td class="c">계약금</td><td class="c">' + _estN(ct.p1) + '%</td><td class="r">₩' + _estW(a1) + '</td><td>계약 체결 시</td></tr>' +
    (_estN(ct.p2) ? '<tr><td class="c">중도금</td><td class="c">' + _estN(ct.p2) + '%</td><td class="r">₩' + _estW(a2) + '</td><td>' + esc(ct.p2when || "") + '</td></tr>' : '') +
    '<tr><td class="c">잔 금</td><td class="c">' + _estN(ct.p3) + '%</td><td class="r">₩' + _estW(a3) + '</td><td>준공 검사 후</td></tr></table>' + (ct.pay ? '<div style="font-size:11.5px">지급 방법: ' + esc(ct.pay) + (cp.bank ? ' · 입금 계좌: ' + esc(cp.bank) : '') + '</div>' : '');
  b += R(5, "대금 지급", pay);
  b += R(6, "계약 보증금", _estN(ct.bond) ? "계약금액의 " + _estN(ct.bond) + "% (₩" + _estW(Math.floor(c.tot * _estN(ct.bond) / 100)) + ")" : "없음");
  b += R(7, "하자 보수 기간", esc(ct.warr || ""));
  b += R(8, "지체상금률", "하루당 계약금액의 " + esc(ct.late || ""));
  b += R(9, "특약 사항", '<div style="white-space:pre-wrap;min-height:28px">' + esc(ct.sp || "") + '</div>');
  b += '</table>';
  b += '<p style="font-size:12.5px;line-height:1.7;margin:3mm 0">도급인과 수급인은 위 내용과 붙임 공사 내역서(견적서 No. ' + esc(e.no || "") + ')에 따라 이 계약을 맺고, 서로 믿음을 바탕으로 계약상의 의무를 성실히 이행할 것을 약속하며, 이 계약을 증명하기 위해 계약서 2부를 만들어 양 당사자가 기명날인한 뒤 각각 1부씩 보관한다.</p>';
  if(ct.gen !== false){
    b += '<div style="font-size:11.5px;line-height:1.6;border:1px solid #333;padding:3mm"><div style="font-weight:800;margin-bottom:1mm">일반 조항</div>';
    EST_GEN.forEach(function(g, i){ b += '<div><b>제' + (i + 1) + '조 (' + g[0] + ')</b> ' + g[1] + '</div>'; });
    b += '</div>';
  }
  b += '<div style="text-align:center;font-size:15px;font-weight:700;margin:5mm 0 3mm">' + esc((ct.dt || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1년 $2월 $3일")) + '</div>';
  b += '<table style="font-size:12.5px"><tr><th style="width:50%">도급인 (발주처)</th><th>수급인 (시공사)</th></tr><tr><td style="line-height:1.9;vertical-align:top">상호: ' + esc(cl.nm || "") + '<br>주소: ' + esc(cl.addr || "") + '<br>사업자번호: ' + esc(cl.biz || "") + '<br>대표: ' + esc(cl.ceo || "") + ' &nbsp; (인)</td>';
  b += '<td style="line-height:1.9;vertical-align:top">상호: ' + esc(cp.nm || SYS_NAME) + '<br>주소: ' + esc(cp.addr || "") + '<br>사업자번호: ' + esc(cp.biz || "") + '<br>대표: ' + esc(cp.ceo || "") + ' &nbsp; ' + _estStampHtml(cp, '(인)') + '</td></tr></table>';
  b += '<div style="font-size:11.5px;margin-top:2mm">붙임: 공사 내역서(견적서) 1부.</div></div>';
  _estWin("계약서_" + (e.nm || ""), b, false);
}

// ── 🧾 거래명세표 인쇄 (한 장에 공급받는자용 + 공급자용) ──
function estPrintStmt(id, k){
  var e = EST[id], s = (e.stmts || {})[k]; if(!s) return;
  var cl = e.cl || {}, cp = _estComp(e);
  var one = function(copy, col){
    var h = '<div style="border:2px solid ' + col + ';padding:3mm;margin-bottom:4mm"><div style="display:flex;justify-content:space-between;align-items:flex-end"><div style="font-size:11px">No. ' + esc(s.no) + '</div><div style="font-size:22px;font-weight:900;letter-spacing:10px;color:' + col + '">거래명세표</div><div style="font-size:11px">(' + copy + ')</div></div>';
    h += '<table class="nb" style="margin-top:2mm"><tr><td style="width:44%;vertical-align:top;padding-right:3mm"><table><tr><th style="width:70px">작성일</th><td>' + esc(s.dt) + '</td></tr><tr><th>공급받는자</th><td style="font-size:14px;font-weight:800">' + esc(cl.nm || "") + ' 귀하</td></tr><tr><th>공 사 명</th><td>' + esc(e.nm || "") + '</td></tr><tr><th>합계 금액</th><td style="font-weight:800">₩' + _estW(_estN(s.sup) + _estN(s.vat)) + '</td></tr></table></td>';
    h += '<td style="vertical-align:top">' + _estSupBox(cp) + '</td></tr></table>';
    h += '<table style="margin-top:2mm"><tr><th style="width:28px">No</th><th>품 목</th><th style="width:80px">규 격</th><th style="width:44px">수량</th><th style="width:90px">단 가</th><th style="width:100px">공급가액</th><th style="width:85px">세 액</th></tr>';
    var rows = s.lines || [], vt = 0, MIN = Math.max(rows.length, s.mode === "all" ? 0 : 5);
    for(var i = 0; i < MIN; i++){
      var L = rows[i];
      if(!L){ h += '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'; continue; }
      var lv = i === rows.length - 1 ? _estN(s.vat) - vt : (e.vat === false ? 0 : Math.floor(_estN(L.am) / 10)); vt += lv;
      h += '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(L.nm) + '</td><td>' + esc(L.spec || "") + '</td><td class="r">' + (L.qty || "") + '</td><td class="r">' + _estW(L.u) + '</td><td class="r">' + _estW(L.am) + '</td><td class="r">' + _estW(lv) + '</td></tr>';
    }
    h += '<tr style="font-weight:800"><td colspan="5" class="c">합 계</td><td class="r">' + _estW(s.sup) + '</td><td class="r">' + _estW(s.vat) + '</td></tr></table>';
    h += '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:2mm"><div>' + (cp.bank ? '입금 계좌: <b>' + esc(cp.bank) + '</b>' : '') + '</div><div>인수자: ____________ (인)</div></div></div>';
    return h;
  };
  var b = '<div class="pg">' + one("공급받는자 보관용", "#1d4ed8") + '<div style="border-top:1px dashed #999;margin:0 0 4mm"></div>' + one("공급자 보관용", "#b91c1c") + '</div>';
  _estWin("거래명세표_" + (e.nm || "") + "_" + s.no, b, false);
}

// ── 📥 견적서 엑셀 ──
async function estQuoteExcel(id){
  var e = EST[id], c = _estCalc(e), cl = e.cl || {}, cp = _estComp(e);
  showLoading("엑셀 만드는 중...");
  var EJ; try{ EJ = await _loadExcelJS(); }catch(err){ hideLoading(); toast(err.message, true); return; }
  var wb = new EJ.Workbook(), ws = wb.addWorksheet("견적서", { pageSetup: { paperSize: 9, orientation: e.split ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  var sp = !!e.split, NC = sp ? 14 : 8, thin = { style: "thin" }, BOX = { top: thin, left: thin, bottom: thin, right: thin };
  var colW = sp ? [5, 22, 14, 6, 7, 11, 12, 11, 12, 11, 12, 12, 13, 12] : [5, 30, 18, 7, 8, 13, 15, 16];
  ws.columns = colW.map(function(w){ return { width: w }; });
  var L = function(i){ return String.fromCharCode(64 + i); };
  ws.mergeCells("A1:" + L(NC) + "1"); ws.getCell("A1").value = "견   적   서"; ws.getCell("A1").font = { size: 22, bold: true }; ws.getCell("A1").alignment = { horizontal: "center" }; ws.getRow(1).height = 36;
  var info = [["견적번호", e.no], ["견적일자", e.dt], ["받는 곳", (cl.nm || "") + " 귀하"], ["공사명", e.nm], ["현장", e.site], ["공사 기간", e.term], ["유효 기간", e.valid]];
  var sup = [["상호", cp.nm || SYS_NAME], ["대표", cp.ceo], ["사업자번호", cp.biz], ["주소", cp.addr], ["업태/종목", (cp.up || "") + " / " + (cp.jm || "")], ["전화", cp.tel], ["", ""]];
  var half = Math.floor(NC / 2);
  for(var i = 0; i < info.length; i++){
    var r = 3 + i;
    ws.getCell(r, 1).value = info[i][0]; ws.mergeCells(r, 2, r, half); ws.getCell(r, 2).value = info[i][1] || "";
    ws.getCell(r, half + 1).value = sup[i][0]; ws.mergeCells(r, half + 2, r, NC); ws.getCell(r, half + 2).value = sup[i][1] || "";
    [1, half + 1].forEach(function(cc){ ws.getCell(r, cc).font = { bold: true }; });
  }
  ws.mergeCells(11, 1, 11, 2); ws.getCell(11, 1).value = "합계 금액 (부가세 " + (e.vat === false ? "별도" : "포함") + ")";
  ws.mergeCells(11, 3, 11, NC); ws.getCell(11, 3).value = "금 " + _estKor(c.tot) + "원정 (₩" + _estW(c.tot) + ")";
  ws.getRow(11).font = { bold: true, size: 13 }; ws.getRow(11).height = 24;
  for(var cc = 1; cc <= NC; cc++){ ws.getCell(11, cc).border = BOX; ws.getCell(11, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } }; }
  var hr = 13, H = sp ? ["No", "품명", "규격", "단위", "수량", "재료비 단가", "재료비 금액", "노무비 단가", "노무비 금액", "경비 단가", "경비 금액", "합계 단가", "합계 금액", "비고"] : ["No", "품명", "규격", "단위", "수량", "단가", "금액", "비고"];
  ws.getRow(hr).values = H; ws.getRow(hr).font = { bold: true }; ws.getRow(hr).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for(cc = 1; cc <= NC; cc++){ ws.getCell(hr, cc).border = BOX; ws.getCell(hr, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; }
  var r0 = hr + 1, n = 0, numCols = sp ? [6, 7, 8, 9, 10, 11, 12, 13] : [6, 7];
  (e.items || []).forEach(function(it){
    var row = ws.getRow(r0);
    if(it.hd){ ws.mergeCells(r0, 1, r0, NC); row.getCell(1).value = it.nm; row.font = { bold: true }; row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }; }
    else {
      n++; var q = _estN(it.qty), R = "E" + r0;
      var v = [n, it.nm || "", it.spec || "", it.u || "", q];
      if(sp) v = v.concat([_estN(it.mat), { formula: R + "*F" + r0, result: q * _estN(it.mat) }, _estN(it.lab), { formula: R + "*H" + r0, result: q * _estN(it.lab) }, _estN(it.exp), { formula: R + "*J" + r0, result: q * _estN(it.exp) }, { formula: "F" + r0 + "+H" + r0 + "+J" + r0, result: _estUnit(it) }, { formula: "G" + r0 + "+I" + r0 + "+K" + r0, result: q * _estUnit(it) }, it.note || ""]);
      else v = v.concat([_estN(it.mat), { formula: R + "*F" + r0, result: q * _estN(it.mat) }, it.note || ""]);
      row.values = v;
      numCols.forEach(function(cc){ row.getCell(cc).numFmt = "#,##0"; });
    }
    for(var cc2 = 1; cc2 <= NC; cc2++) row.getCell(cc2).border = BOX;
    r0++;
  });
  r0++;
  var T = [];
  if(sp) T.push(["재료비", c.mat], ["노무비", c.lab], ["경비", c.exp]);
  T.push(["직접공사비 계", c.direct]);
  c.ext.forEach(function(x){ T.push([(x.nm || "제경비") + (x.mode !== "amt" ? " (" + _estN(x.v) + "%)" : ""), x.am]); });
  if(c.cutAm) T.push(["끝자리 정리", c.cutAm]);
  T.push(["공급가액", c.sup], ["부가세", c.vat], ["총 액", c.tot]);
  T.forEach(function(t){ ws.mergeCells(r0, NC - 3, r0, NC - 1); ws.getCell(r0, NC - 3).value = t[0]; ws.getCell(r0, NC).value = t[1]; ws.getCell(r0, NC).numFmt = "#,##0";
    for(var cc3 = NC - 3; cc3 <= NC; cc3++) ws.getCell(r0, cc3).border = BOX;
    if(/공급가액|총 액/.test(t[0])) ws.getRow(r0).font = { bold: true }; r0++; });
  if(e.memo){ r0++; ws.getCell(r0, 1).value = "특기사항"; ws.getCell(r0, 1).font = { bold: true }; ws.mergeCells(r0, 2, r0, NC); ws.getCell(r0, 2).value = e.memo; ws.getCell(r0, 2).alignment = { wrapText: true, vertical: "top" }; ws.getRow(r0).height = 15 * Math.max(2, String(e.memo).split("\n").length); }
  var buf = await wb.xlsx.writeBuffer();
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = "견적서_" + (e.nm || "") + "_" + (e.no || "") + ".xlsx"; document.body.appendChild(a); a.click(); a.remove();
  hideLoading(); toast("엑셀 받았어요");
}
