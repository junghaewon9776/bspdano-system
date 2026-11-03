// ============================================================================
// 📒 단가표 — 공종별 품명·규격·단위·단가(재료비/노무비/경비)를 미리 적어 두고 견적에 골라 넣기
//   /main/PriceBook/{id} = { cat(대분류=공종), sub(중분류, 비워도 됨), nm, spec, u, mat, lab, exp, note, upAt }
//   /main/PriceSets/{id} = { nm, note, lines:[{ pb(단가표 id), mode:"area"(면적×배수)|"fix"(고정 수량), v }] }
//   견적 화면: 📒 단가표에서 넣기 · 📐 세트로 넣기(면적만) · 품명 자동완성 · 이 견적 단가 저장
// ============================================================================
var PB = null, PSET = null, PB_VIEW = false, PB_TAB = "pb", PB_CAT = "", PB_SUB = "", PB_Q = "", PB_LOADING = false;
var PB_PY = 3.3058;   // 1평 = 3.3058㎡

function _pbRef(id){ return fbDb.ref("/main/PriceBook" + (id ? "/" + id : "")); }
var PB_WAIT = [];   // 불러오는 중에 들어온 요청 — 다 받은 뒤 차례로
function _pbLoad(cb){
  if(PB){ if(cb) cb(); return; }
  PB_WAIT.push(cb || function(){ draw(); });
  if(PB_LOADING) return; PB_LOADING = true;
  Promise.all([_pbRef().once("value"), fbDb.ref("/main/PriceSets").once("value")]).then(function(r){
    PB_LOADING = false; PB = r[0].val() || {}; PSET = r[1].val() || {};
    var w = PB_WAIT; PB_WAIT = []; w.forEach(function(f){ try { f(); } catch(e){ console.error(e); } });
  }).catch(function(e){ PB_LOADING = false; PB_WAIT = []; toast("단가표 불러오기 실패: " + e.message, true); });
}
function _pbIds(cat, q, sub){
  q = String(q || "").trim().toLowerCase();
  return Object.keys(PB || {}).filter(function(k){ var p = PB[k]; return (!cat || p.cat === cat) && (!sub || (p.sub || "") === sub) && (!q || (p.cat + " " + (p.sub || "") + " " + p.nm + " " + (p.spec || "") + " " + (p.note || "")).toLowerCase().indexOf(q) >= 0); })
    .sort(function(a, b){ var x = PB[a], y = PB[b]; return String(x.cat).localeCompare(String(y.cat)) || String(x.sub || "").localeCompare(String(y.sub || "")) || String(x.nm).localeCompare(String(y.nm)) || String(x.spec || "").localeCompare(String(y.spec || "")); });
}
function _pbSubs(cat){ var c = {}; Object.keys(PB || {}).forEach(function(k){ var p = PB[k]; if(p.cat === cat && p.sub) c[p.sub] = (c[p.sub] || 0) + 1; }); return c; }
// 대분류·중분류 칸 자동완성 (오타로 갈라지지 않게)
function _pbCatDL(){
  var cats = Object.keys(_pbCats()).sort(), subs = {};
  Object.keys(PB || {}).forEach(function(k){ if(PB[k].sub) subs[PB[k].sub] = 1; });
  return '<datalist id="pbCatDL">' + cats.map(function(c){ return '<option value="' + esc(c) + '">'; }).join("") + '</datalist><datalist id="pbSubDL">' + Object.keys(subs).sort().map(function(c){ return '<option value="' + esc(c) + '">'; }).join("") + '</datalist>';
}
// 대분류 → 중분류 버튼 줄 (vCat/vSub: 상태 변수 이름, re: 다시 그리기)
function _pbChips(cat, sub, vCat, vSub, re, total){
  var cats = _pbCats(), q = function(x){ return esc(x).replace(/'/g, "\\'"); };
  var h = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span style="font-size:12px;font-weight:700;color:#7c4a21">대분류</span><button class="btn" style="background:' + (!cat ? "#292524" : "#e7e5e4") + ';color:' + (!cat ? "#fff" : "#292524") + '" onclick="' + vCat + '=\'\';' + vSub + '=\'\';' + re + '">전체' + (total != null ? " " + total : "") + '</button>';
  Object.keys(cats).sort().forEach(function(c){ var on = cat === c; h += '<button class="btn" style="background:' + (on ? "#7c4a21" : "#fff") + ';color:' + (on ? "#fff" : "#7c4a21") + ';border:2px solid #7c4a21" onclick="' + vCat + '=\'' + q(c) + '\';' + vSub + '=\'\';' + re + '">' + esc(c) + ' ' + cats[c] + '</button>'; });
  h += '</div>';
  var subs = cat ? _pbSubs(cat) : {};
  if(Object.keys(subs).length){
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;padding-left:10px;border-left:3px solid #c08a52"><span style="font-size:12px;font-weight:700;color:#b45309">중분류</span><button class="btn" style="background:' + (!sub ? "#b45309" : "#fff") + ';color:' + (!sub ? "#fff" : "#b45309") + ';border:2px solid #b45309;padding:4px 10px" onclick="' + vSub + '=\'\';' + re + '">전체</button>';
    Object.keys(subs).sort().forEach(function(c){ var on = sub === c; h += '<button class="btn" style="background:' + (on ? "#b45309" : "#fff") + ';color:' + (on ? "#fff" : "#b45309") + ';border:2px solid #b45309;padding:4px 10px" onclick="' + vSub + '=\'' + q(c) + '\';' + re + '">' + esc(c) + ' ' + subs[c] + '</button>'; });
    h += '</div>';
  }
  return h;
}
function _pbCats(){ var c = {}; Object.keys(PB || {}).forEach(function(k){ var n = PB[k].cat || "기타"; c[n] = (c[n] || 0) + 1; }); return c; }
function _pbUnit(p){ return _estN(p.mat) + _estN(p.lab) + _estN(p.exp); }
// "30평" / "99㎡" / "99m2" → 품목 단위로 바꾼 수량
function _pbQty(s, u){
  s = String(s == null ? "" : s).replace(/,/g, "").trim(); if(!s) return 0;
  var m = s.match(/^([\d.]+)\s*(평|㎡|m2|m²|제곱미터)?$/i); if(!m) return _estN(s);
  var n = Number(m[1]) || 0, from = m[2] ? (m[2] === "평" ? "py" : "m2") : "", to = /평/.test(u || "") ? "py" : /㎡|m2|m²/i.test(u || "") ? "m2" : "";
  if(from && to && from !== to) n = from === "m2" ? n / PB_PY : n * PB_PY;
  return Math.round(n * 100) / 100;
}
function _pbCatOf(items, i){ for(var j = i; j >= 0; j--) if(items[j] && items[j].hd) return String(items[j].nm || "").replace(/^\s*[\dⅠ-Ⅻ]+[.)]\s*/, "").trim(); return ""; }

// ── 단가표 관리 화면 ──
function dPriceBook(){
  if(!PB){ _pbLoad(); return '<div class="card"><div class="mut">📡 단가표 불러오는 중...</div></div>'; }
  var B = _estBtn, ids = _pbIds(PB_CAT, PB_Q, PB_SUB);
  var h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<div>' + B("#475569", "← 견적 목록", "PB_VIEW=false;draw()") + ' <strong style="font-size:18px;margin-left:6px">📒 단가표</strong> <span class="mut" style="font-size:12px">' + Object.keys(PB).length + '개 · 회사 공통 (모든 공사에서 같이 써요)</span></div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">' + B("#2563eb", "+ 항목 추가", "pbAdd()") + B("#7c3aed", "📥 지금까지 쓴 견적에서 가져오기", "pbImport()") + '</div></div>';
  h += '<div class="mut" style="font-size:12.5px;margin-top:6px">여기 적어 둔 단가는 견적 쓸 때 <b>📒 단가표에서 넣기</b>로 골라 넣거나, 품명을 치면 자동으로 채워져요. 고친 칸은 바로 저장돼요.</div>';
  h += '<div style="display:flex;gap:6px;margin-top:10px">';
  [["pb", "📒 단가표"], ["set", "📐 세트 (면적만 넣으면 계산)"]].forEach(function(v){ h += '<button class="btn" style="background:' + (PB_TAB === v[0] ? "#7c4a21" : "#e7e5e4") + ';color:' + (PB_TAB === v[0] ? "#fff" : "#292524") + ';padding:8px 16px;font-size:13px" onclick="PB_TAB=\'' + v[0] + '\';draw()">' + v[1] + '</button>'; });
  h += '</div></div>';
  if(PB_TAB === "set") return h + _pbSetView();
  h += '<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1">' + _pbChips(PB_CAT, PB_SUB, "PB_CAT", "PB_SUB", "draw()", Object.keys(PB).length) + '</div>';
  h += '<input placeholder="🔍 찾기" value="' + esc(PB_Q) + '" onchange="PB_Q=this.value;draw()" style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;min-width:160px"></div></div>' + _pbCatDL();
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:1080px"><thead><tr style="background:#f5f0e8">';
  ["대분류 (공종)", "중분류", "품명", "규격", "단위", "재료비", "노무비", "경비", "합계 단가", "메모", ""].forEach(function(t){ h += '<th style="padding:7px 5px;text-align:left;font-size:12px">' + t + '</th>'; });
  h += '</tr></thead><tbody>';
  if(!ids.length) h += '<tr><td colspan="11" style="padding:30px;text-align:center;color:#94a3b8">' + (Object.keys(PB).length ? "찾는 항목이 없어요" : "아직 비어 있어요 — <b>+ 항목 추가</b> 또는 <b>📥 지금까지 쓴 견적에서 가져오기</b>") + '</td></tr>';
  var I = function(k, f, w, num){ var v = PB[k][f]; return '<input ' + (f === "cat" ? 'list="pbCatDL" ' : f === "sub" ? 'list="pbSubDL" ' : '') + (num ? 'inputmode="numeric" ' : '') + 'value="' + esc(num ? (_estN(v) ? _estW(_estN(v)) : "") : (v || "")) + '" onchange="pbSet(\'' + k + '\',\'' + f + '\',this.value,' + (num ? 1 : 0) + ')" style="width:' + w + ';padding:5px;border:1px solid #d6d3d1;border-radius:5px;box-sizing:border-box;' + (num ? "text-align:right" : "") + '">'; };
  ids.forEach(function(k){
    h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:3px">' + I(k, "cat", "110px") + '</td><td style="padding:3px">' + I(k, "sub", "90px") + '</td><td style="padding:3px">' + I(k, "nm", "100%") + '</td><td style="padding:3px">' + I(k, "spec", "110px") + '</td><td style="padding:3px">' + I(k, "u", "56px");
    h += '</td><td style="padding:3px">' + I(k, "mat", "100px", 1) + '</td><td style="padding:3px">' + I(k, "lab", "100px", 1) + '</td><td style="padding:3px">' + I(k, "exp", "90px", 1) + '</td><td style="padding:3px 8px;text-align:right;font-weight:800;white-space:nowrap" id="pbU_' + k + '">' + _estW(_pbUnit(PB[k])) + '</td><td style="padding:3px">' + I(k, "note", "120px") + '</td>';
    h += '<td style="padding:3px"><button class="btn btn-r btn-s" onclick="pbDel(\'' + k + '\')">삭제</button></td></tr>';
  });
  h += '</tbody></table></div><div class="mut" style="font-size:12px;margin-top:6px">단위가 <b>평</b>이면 견적 넣을 때 수량에 "30㎡"처럼 써도 평으로 바꿔 줘요 (1평 = 3.3058㎡)</div>';
  return h;
}
function pbSet(k, f, v, num){
  if(num) v = _estN(v); else v = String(v).trim();
  PB[k][f] = v; PB[k].upAt = new Date().toISOString();
  _pbRef(k).update({ [f]: v, upAt: PB[k].upAt }).catch(function(e){ toast("저장 실패: " + e.message, true); });
  var u = document.getElementById("pbU_" + k); if(u) u.textContent = _estW(_pbUnit(PB[k]));
}
function pbAdd(){
  var ref = _pbRef().push(), p = { cat: PB_CAT || "철거공사", sub: PB_SUB || "", nm: "", spec: "", u: "평", mat: 0, lab: 0, exp: 0, note: "", upAt: new Date().toISOString() };
  ref.set(p).then(function(){ PB[ref.key] = p; PB_Q = ""; draw(); toast("한 줄 추가했어요 — 품명·단가를 적어 주세요"); }).catch(function(e){ toast("추가 실패: " + e.message, true); });
}
function pbDel(k){
  if(!confirm((PB[k].nm || "이 항목") + " 을(를) 단가표에서 지울까요? (이미 쓴 견적은 그대로예요)")) return;
  _pbRef(k).remove().then(function(){ delete PB[k]; draw(); });
}
// 같은 품명·규격·단위가 있으면 그 줄 id
function _pbFind(nm, spec, u){ nm = String(nm || "").trim(); spec = String(spec || "").trim(); u = String(u || "").trim(); return Object.keys(PB || {}).filter(function(k){ var p = PB[k]; return String(p.nm || "").trim() === nm && String(p.spec || "").trim() === spec && String(p.u || "").trim() === u; })[0] || ""; }

// ── 📥 지금까지 쓴 견적에서 가져오기 (모든 공사) ──
var PB_IMP = [];
function pbImport(){
  var evs = (typeof EVENTS !== "undefined" && EVENTS) || []; if(!evs.length) return toast("공사가 없어요", true);
  showLoading("모든 공사의 견적 모으는 중...");
  Promise.all(evs.map(function(ev){ return fbDb.ref("/evtData/" + ev.evtId + "/Est").once("value").then(function(s){ return { ev: ev, est: s.val() || {} }; }).catch(function(){ return { ev: ev, est: {} }; }); })).then(function(all){
    hideLoading();
    var seen = {};
    all.forEach(function(x){ Object.keys(x.est).forEach(function(k){ var e = x.est[k];
      (e.items || []).forEach(function(it, i){
        if(it.hd || !String(it.nm || "").trim()) return;
        var mat = _estN(it.mat), lab = e.split ? _estN(it.lab) : 0, exp = e.split ? _estN(it.exp) : 0; if(!(mat + lab + exp)) return;
        var key = [it.nm, it.spec || "", it.u || ""].join("|"), c = { cat: _pbCatOf(e.items, i) || e.nm || "기타", nm: it.nm, spec: it.spec || "", u: it.u || "", mat: mat, lab: lab, exp: exp, src: (e.dt || "") + " " + (e.no || "") + " · " + (x.ev.nm || ""), dt: e.dt || "", has: _pbFind(it.nm, it.spec, it.u) };
        if(!seen[key] || String(c.dt) > String(seen[key].dt)) seen[key] = c;   // 같은 품목은 가장 최근 견적 금액
      });
    }); });
    PB_IMP = Object.keys(seen).map(function(k){ return seen[k]; }).sort(function(a, b){ return String(a.cat).localeCompare(String(b.cat)) || String(a.nm).localeCompare(String(b.nm)); });
    var h = '<h3 style="margin:0 0 6px">📥 지금까지 쓴 견적에서 가져오기 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3>';
    h += '<div class="mut" style="font-size:12.5px;margin-bottom:8px">모든 공사 견적에서 금액이 있는 항목 ' + PB_IMP.length + '개 (같은 품목은 가장 최근 금액). 공종은 견적의 공종 제목 줄(없으면 공사 이름)로 넣어요 — 넣은 뒤 단가표에서 고칠 수 있어요. Shift 범위 체크 돼요.</div>';
    if(!PB_IMP.length) h += '<div style="padding:20px;text-align:center;color:#94a3b8">금액이 적힌 견적 항목이 없어요</div>';
    else {
      h += '<div style="max-height:55vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#f5f0e8"><th style="padding:5px"><input type="checkbox" onclick="Array.prototype.forEach.call(document.querySelectorAll(\'input.pbImp\'),function(c){c.checked=this.checked}.bind(this))"></th><th style="text-align:left">공종</th><th style="text-align:left">품명</th><th style="text-align:left">규격</th><th>단위</th><th style="text-align:right">합계 단가</th><th style="text-align:left">어느 견적</th></tr></thead><tbody>';
      PB_IMP.forEach(function(c, i){ h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:4px;text-align:center"><input type="checkbox" class="pbImp" value="' + i + '"' + (c.has ? "" : " checked") + '></td><td>' + esc(c.cat) + '</td><td>' + esc(c.nm) + (c.has ? ' <span style="font-size:11px;color:#b45309">(이미 있음 → 금액 갱신)</span>' : '') + '</td><td>' + esc(c.spec) + '</td><td style="text-align:center">' + esc(c.u) + '</td><td style="text-align:right;font-weight:700">' + _estW(c.mat + c.lab + c.exp) + '</td><td style="font-size:11px;color:#64748b">' + esc(c.src) + '</td></tr>'; });
      h += '</tbody></table></div><div style="text-align:right;margin-top:10px">' + _estBtn("#7c3aed", "체크한 항목 단가표에 넣기", "pbImportGo()", "padding:9px 18px") + '</div>';
    }
    openPopup(h, 900);
  });
}
function pbImportGo(){
  var sel = Array.prototype.map.call(document.querySelectorAll("input.pbImp:checked"), function(c){ return PB_IMP[Number(c.value)]; }).filter(Boolean);
  if(!sel.length) return toast("체크한 항목이 없어요", true);
  var upd = {}, now = new Date().toISOString(), nNew = 0, nUp = 0;
  sel.forEach(function(c){
    var k = _pbFind(c.nm, c.spec, c.u);
    if(k){ upd[k + "/mat"] = c.mat; upd[k + "/lab"] = c.lab; upd[k + "/exp"] = c.exp; upd[k + "/upAt"] = now; nUp++; }
    else { k = _pbRef().push().key; upd[k] = { cat: c.cat, nm: c.nm, spec: c.spec, u: c.u, mat: c.mat, lab: c.lab, exp: c.exp, note: "", upAt: now }; nNew++; }
  });
  showLoading("넣는 중...");
  _pbRef().update(upd).then(function(){ PB = null; closePopup(); _pbLoad(function(){ hideLoading(); toast("📒 새로 " + nNew + "개 · 금액 갱신 " + nUp + "개"); draw(); }); })
    .catch(function(e){ hideLoading(); toast("실패: " + e.message, true); });
}

// ── 견적 쓰는 중: 📒 단가표에서 넣기 ──
var PB_PCAT = "", PB_PSUB = "", PB_PQ = "";
function pbPick(){
  if(!PB) return _pbLoad(pbPick);
  var ids = _pbIds(PB_PCAT, PB_PQ, PB_PSUB);
  var h = '<h3 style="margin:0 0 6px">📒 단가표에서 넣기 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3>';
  if(!Object.keys(PB).length){ openPopup(h + '<div style="padding:24px;text-align:center;color:#94a3b8">단가표가 비어 있어요 — 견적 목록의 <b>📒 단가표</b>에서 먼저 채워 주세요</div>', 600); return; }
  h += '<div style="margin-bottom:8px">' + _pbChips(PB_PCAT, PB_PSUB, "PB_PCAT", "PB_PSUB", "pbPick()") + '</div><input placeholder="🔍 찾기" value="' + esc(PB_PQ) + '" onchange="PB_PQ=this.value;pbPick()" style="padding:6px 9px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:8px">';
  h += '<div class="mut" style="font-size:12px;margin-bottom:6px">체크하고 <b>수량</b>을 적으세요 (평 단위는 "30㎡"처럼 써도 돼요). 금액은 바로 계산돼요.</div>';
  h += '<div style="max-height:52vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f5f0e8"><th></th><th style="text-align:left">공종</th><th style="text-align:left">품명 · 규격</th><th>단위</th><th style="text-align:right">단가</th><th>수량</th><th style="text-align:right">금액</th></tr></thead><tbody>';
  ids.forEach(function(k){ var p = PB[k];
    h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:4px;text-align:center"><input type="checkbox" class="pbPk" value="' + k + '" id="pbc_' + k + '"></td><td style="font-size:12px;color:#7c4a21">' + esc(p.cat || "") + (p.sub ? '<br><span style="color:#b45309">' + esc(p.sub) + '</span>' : '') + '</td><td><b>' + esc(p.nm) + '</b>' + (p.spec ? ' <span class="mut">' + esc(p.spec) + '</span>' : '') + '</td><td style="text-align:center">' + esc(p.u || "") + '</td><td style="text-align:right">' + _estW(_pbUnit(p)) + '</td>';
    h += '<td style="padding:3px"><input id="pbq_' + k + '" placeholder="' + esc(/평/.test(p.u || "") ? "예: 30 또는 99㎡" : "수량") + '" oninput="pbPickCalc(\'' + k + '\')" style="width:110px;padding:5px;border:1px solid #cbd5e1;border-radius:5px;text-align:right"></td><td style="text-align:right;font-weight:800;white-space:nowrap;padding-right:6px" id="pba_' + k + '"></td></tr>'; });
  h += '</tbody></table></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px"><label style="font-size:13px"><input type="checkbox" id="pbHd" checked> 공종 제목 줄도 같이 (없으면 만들어요)</label><div><b id="pbTot" style="margin-right:10px"></b>' + _estBtn("#7c4a21", "체크한 항목 견적에 넣기", "pbPickGo()", "padding:9px 18px") + '</div></div>';
  openPopup(h, 860);
}
function pbPickCalc(k){
  var p = PB[k], q = _pbQty(document.getElementById("pbq_" + k).value, p.u), a = document.getElementById("pba_" + k), c = document.getElementById("pbc_" + k);
  if(a) a.textContent = q ? _estW(q * _pbUnit(p)) + (/[㎡평m]/i.test(document.getElementById("pbq_" + k).value) && String(q) !== document.getElementById("pbq_" + k).value.replace(/,/g, "") ? " (" + q + p.u + ")" : "") : "";
  if(c && q) c.checked = true;
  var t = 0; Array.prototype.forEach.call(document.querySelectorAll("input.pbPk:checked"), function(x){ var qq = _pbQty(document.getElementById("pbq_" + x.value).value, PB[x.value].u) || 1; t += qq * _pbUnit(PB[x.value]); });
  var T = document.getElementById("pbTot"); if(T) T.textContent = t ? "고른 항목 " + _estW(t) + "원" : "";
}
function pbPickGo(){
  var sel = Array.prototype.map.call(document.querySelectorAll("input.pbPk:checked"), function(c){ return c.value; });
  if(!sel.length) return toast("체크한 항목이 없어요", true);
  _pbInsert(sel.map(function(k){ return { k: k, q: _pbQty(document.getElementById("pbq_" + k).value, PB[k].u) || 1 }; }), document.getElementById("pbHd").checked);
  closePopup(); draw(); toast("📒 " + sel.length + "개 넣었어요" + (!EST_ED.split ? " (단가 나누기가 꺼져 있어서 재료비+노무비+경비를 합쳐 넣었어요)" : ""));
}
// 품명 칠 때 자동완성 → 고르면 단가 채우기 (금액이 비어 있을 때만)
function pbDatalist(){
  if(!PB){ _pbLoad(function(){ var d = document.getElementById("pbDL"); if(d) d.outerHTML = pbDatalist(); }); return '<datalist id="pbDL"></datalist>'; }
  return '<datalist id="pbDL">' + _pbIds().map(function(k){ var p = PB[k]; return '<option value="' + esc(p.nm) + '">' + esc((p.cat ? p.cat + " · " : "") + (p.spec || "") + " " + (p.u || "") + " " + _estW(_pbUnit(p)) + "원") + '</option>'; }).join("") + '</datalist>';
}
function pbAutoFill(i, nm){
  if(!PB) return; var it = EST_ED.items[i]; if(!it || _estUnit(it)) return;
  var k = _pbIds().filter(function(x){ return String(PB[x].nm).trim() === String(nm).trim(); })[0]; if(!k) return;
  var p = PB[k], e = EST_ED;
  it.spec = it.spec || p.spec || ""; it.u = p.u || it.u; it.mat = e.split ? _estN(p.mat) : _pbUnit(p); it.lab = e.split ? _estN(p.lab) : 0; it.exp = e.split ? _estN(p.exp) : 0;
  draw(); toast("📒 단가표 금액을 넣었어요 — " + p.nm + " " + _estW(_pbUnit(p)) + "원/" + (p.u || ""));
}
// 이 견적의 단가를 단가표에 저장 (같은 품명·규격·단위면 금액만 갱신)
function pbSaveFromEst(){
  _pbLoad(function(){
    var e = EST_ED, upd = {}, now = new Date().toISOString(), nNew = 0, nUp = 0;
    e.items.forEach(function(it, i){
      if(it.hd || !String(it.nm || "").trim() || !_estUnit(it)) return;
      var mat = _estN(it.mat), lab = e.split ? _estN(it.lab) : 0, exp = e.split ? _estN(it.exp) : 0, k = _pbFind(it.nm, it.spec, it.u);
      if(k){ upd[k + "/mat"] = mat; upd[k + "/lab"] = lab; upd[k + "/exp"] = exp; upd[k + "/upAt"] = now; nUp++; }
      else { k = _pbRef().push().key; upd[k] = { cat: _pbCatOf(e.items, i) || e.nm || "기타", nm: String(it.nm).trim(), spec: it.spec || "", u: it.u || "", mat: mat, lab: lab, exp: exp, note: "", upAt: now }; nNew++; }
    });
    if(!nNew && !nUp) return toast("금액이 적힌 항목이 없어요", true);
    if(!confirm("단가표에 새로 " + nNew + "개, 금액 갱신 " + nUp + "개 — 저장할까요?")) return;
    _pbRef().update(upd).then(function(){ PB = null; _pbLoad(function(){ toast("📒 단가표에 저장했어요"); draw(); }); }).catch(function(err){ toast("실패: " + err.message, true); });
  });
}

// ============================================================================
// 📐 세트 — 자주 하는 공사를 묶어 두고 "면적만 넣으면" 항목 수량·금액이 다 계산
//   줄마다: 단가표 항목 + (면적 × 배수) 또는 (고정 수량)
//   면적은 평/㎡ 아무거나 → 항목 단위가 평이면 평으로, 그 밖은 ㎡ 기준으로 바꿔서 곱함
// ============================================================================
function _pbSetIds(){ return Object.keys(PSET || {}).sort(function(a, b){ return String(PSET[a].nm).localeCompare(String(PSET[b].nm)); }); }
function _pbOpts(sel){
  var h = '<option value="">— 단가표에서 고르기 —</option>', last = null;
  _pbIds().forEach(function(k){ var p = PB[k]; if(p.cat !== last){ if(last !== null) h += '</optgroup>'; h += '<optgroup label="' + esc(p.cat || "기타") + '">'; last = p.cat; } h += '<option value="' + k + '"' + (k === sel ? " selected" : "") + '>' + esc((p.sub ? "[" + p.sub + "] " : "") + p.nm + (p.spec ? " " + p.spec : "") + " (" + (p.u || "") + " " + _estW(_pbUnit(p)) + "원)") + '</option>'; });
  return h + (last !== null ? '</optgroup>' : '');
}
// 면적 → 이 항목 수량
function _pbLineQty(L, areaM2){
  var p = PB[L.pb]; if(!p) return 0;
  if(L.mode === "fix") return _estN(L.v);
  var a = /평/.test(p.u || "") ? areaM2 / PB_PY : areaM2;
  return Math.round(a * (_estN(L.v) || 1) * 100) / 100;
}
var PB_SED = null;   // 고치는 중인 세트
function _pbSetView(){
  var B = _estBtn, h = '';
  if(!Object.keys(PB).length) return '<div class="card" style="padding:24px;text-align:center;color:#94a3b8">세트는 단가표 항목을 묶는 거라, <b>📒 단가표</b>를 먼저 채워 주세요</div>';
  if(PB_SED) return _pbSetEditor();
  h += '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div class="mut" style="font-size:12.5px">예: <b>욕실 타일 세트</b> = 철거(면적×1) + 방수(면적×1.1) + 타일(면적×1.1) + 줄눈(면적×1) + 폐기물(고정 1식) → 견적에서 "욕실 4평"만 넣으면 끝</div>' + B("#2563eb", "+ 새 세트", "PB_SED={nm:'',note:'',lines:[{pb:'',mode:'area',v:1}]};draw()") + '</div></div>';
  var ids = _pbSetIds();
  if(!ids.length) h += '<div class="card" style="padding:24px;text-align:center;color:#94a3b8">아직 세트가 없어요</div>';
  ids.forEach(function(k){ var S = PSET[k];
    h += '<div class="card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b style="font-size:15px">📐 ' + esc(S.nm) + '</b> <span class="mut" style="font-size:12px">' + (S.lines || []).length + '개 항목' + (S.note ? ' · ' + esc(S.note) : '') + '</span></div><div>' + B("#2563eb", "고치기", "PB_SED=JSON.parse(JSON.stringify(PSET['" + k + "']));PB_SED._id='" + k + "';draw()", "padding:5px 10px") + ' ' + B("#dc2626", "삭제", "pbSetDel('" + k + "')", "padding:5px 10px") + '</div></div>';
    h += '<div style="font-size:12.5px;color:#475569;margin-top:4px">' + (S.lines || []).map(function(L){ var p = PB[L.pb]; return p ? esc(p.nm) + ' <span style="color:#b45309">' + (L.mode === "fix" ? _estN(L.v) + (p.u || "") : "면적×" + (_estN(L.v) || 1)) + '</span>' : '<span style="color:#dc2626">지워진 항목</span>'; }).join(" · ") + '</div></div>';
  });
  return h;
}
function _pbSetEditor(){
  var S = PB_SED, B = _estBtn;
  var h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><strong>' + (S._id ? "✏️ 세트 고치기" : "📐 새 세트") + '</strong><div>' + B("#16a34a", "💾 저장", "pbSetSave()") + ' ' + B("#475569", "취소", "PB_SED=null;draw()") + '</div></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><label style="font-size:13px">세트 이름<input value="' + esc(S.nm) + '" placeholder="예: 욕실 타일 세트" onchange="PB_SED.nm=this.value" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box"></label><label style="font-size:13px">메모<input value="' + esc(S.note || "") + '" placeholder="예: 바닥+벽 기준" onchange="PB_SED.note=this.value" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box"></label></div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px"><thead><tr style="background:#f5f0e8"><th style="text-align:left;padding:5px">단가표 항목</th><th style="text-align:left">수량 정하는 법</th><th style="text-align:left">값</th><th style="text-align:left">설명</th><th></th></tr></thead><tbody>';
  S.lines.forEach(function(L, i){
    var p = PB[L.pb];
    h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:3px"><select onchange="PB_SED.lines[' + i + '].pb=this.value;draw()" style="width:100%;padding:5px;border:1px solid #cbd5e1;border-radius:5px">' + _pbOpts(L.pb) + '</select></td>';
    h += '<td style="padding:3px"><select onchange="PB_SED.lines[' + i + '].mode=this.value;draw()" style="padding:5px;border:1px solid #cbd5e1;border-radius:5px"><option value="area"' + (L.mode !== "fix" ? " selected" : "") + '>면적 × 배수</option><option value="fix"' + (L.mode === "fix" ? " selected" : "") + '>고정 수량</option></select></td>';
    h += '<td style="padding:3px"><input inputmode="decimal" value="' + esc(L.v) + '" onchange="PB_SED.lines[' + i + '].v=this.value;draw()" style="width:80px;padding:5px;border:1px solid #cbd5e1;border-radius:5px;text-align:right"></td>';
    h += '<td style="padding:3px;font-size:12px;color:#64748b">' + (p ? (L.mode === "fix" ? "항상 " + _estN(L.v) + (p.u || "") : "면적 " + (/평/.test(p.u || "") ? "(평)" : "(㎡)") + " × " + (_estN(L.v) || 1) + (_estN(L.v) > 1 ? " — 로스 " + Math.round((_estN(L.v) - 1) * 100) + "%" : "")) : "") + '</td>';
    h += '<td style="padding:3px"><button class="btn btn-r btn-s" onclick="PB_SED.lines.splice(' + i + ',1);draw()">✕</button></td></tr>';
  });
  h += '</tbody></table><div style="margin-top:8px">' + B("#2563eb", "+ 줄 추가", "PB_SED.lines.push({pb:'',mode:'area',v:1});draw()") + '</div>';
  h += '<div class="mut" style="font-size:12px;margin-top:8px">면적은 견적에서 평이나 ㎡로 넣어요. 항목 단위가 <b>평</b>이면 평으로, 그 밖(㎡·m·kg 등)은 <b>㎡ 기준</b>으로 바꿔서 배수를 곱해요. 로스 10% → 배수 1.1</div></div>';
  return h;
}
function pbSetSave(){
  var S = PB_SED, id = S._id; if(!String(S.nm || "").trim()) return toast("세트 이름을 적어 주세요", true);
  var o = { nm: String(S.nm).trim(), note: S.note || "", lines: S.lines.filter(function(L){ return L.pb; }).map(function(L){ return { pb: L.pb, mode: L.mode === "fix" ? "fix" : "area", v: _estN(L.v) || (L.mode === "fix" ? 1 : 1) }; }) };
  if(!o.lines.length) return toast("항목을 하나 이상 골라 주세요", true);
  var ref = id ? fbDb.ref("/main/PriceSets/" + id) : fbDb.ref("/main/PriceSets").push();
  ref.set(o).then(function(){ PSET[ref.key] = o; PB_SED = null; toast("📐 " + o.nm + " 저장했어요"); draw(); }).catch(function(e){ toast("저장 실패: " + e.message, true); });
}
function pbSetDel(k){ if(!confirm(PSET[k].nm + " 세트를 지울까요? (단가표 항목은 그대로예요)")) return; fbDb.ref("/main/PriceSets/" + k).remove().then(function(){ delete PSET[k]; draw(); }); }

// ── 견적 쓰는 중: 📐 세트로 넣기 ──
var PB_SP = { id: "", a: "", u: "py" };
function pbSetPick(){
  if(!PB) return _pbLoad(pbSetPick);
  var ids = _pbSetIds(), B = _estBtn;
  var h = '<h3 style="margin:0 0 8px">📐 세트로 넣기 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3>';
  if(!ids.length){ openPopup(h + '<div style="padding:24px;text-align:center;color:#94a3b8">세트가 없어요 — 견적 목록의 <b>📒 단가표 · 세트</b> → <b>📐 세트</b>에서 만들어 주세요</div>', 600); return; }
  if(!PB_SP.id || !PSET[PB_SP.id]) PB_SP.id = ids[0];
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:14px"><select onchange="PB_SP.id=this.value;pbSetPick()" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-weight:700">';
  ids.forEach(function(k){ h += '<option value="' + k + '"' + (k === PB_SP.id ? " selected" : "") + '>📐 ' + esc(PSET[k].nm) + '</option>'; });
  h += '</select> 면적 <input id="pbSA" inputmode="decimal" value="' + esc(PB_SP.a) + '" oninput="PB_SP.a=this.value;_pbSetCalc()" placeholder="예: 4" style="width:90px;padding:8px;border:2px solid #b45309;border-radius:6px;text-align:right;font-size:15px;font-weight:700">';
  h += '<select onchange="PB_SP.u=this.value;_pbSetCalc()" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px"><option value="py"' + (PB_SP.u === "py" ? " selected" : "") + '>평</option><option value="m2"' + (PB_SP.u === "m2" ? " selected" : "") + '>㎡ (헤베)</option></select> <span id="pbSConv" class="mut" style="font-size:12px"></span></div>';
  h += '<div id="pbSTbl" style="margin-top:10px"></div>';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px"><label style="font-size:13px"><input type="checkbox" id="pbHd" checked> 공종 제목 줄도 같이</label>' + B("#b45309", "견적에 넣기", "pbSetGo()", "padding:9px 20px") + '</div>';
  openPopup(h, 820); _pbSetCalc();
}
function _pbSetArea(){ var a = _estN(PB_SP.a); return PB_SP.u === "py" ? a * PB_PY : a; }
function _pbSetCalc(){
  var S = PSET[PB_SP.id], am = _pbSetArea(), t = 0, e = EST_ED;
  var cv = document.getElementById("pbSConv"); if(cv) cv.textContent = am ? (PB_SP.u === "py" ? "= " + (Math.round(am * 100) / 100) + "㎡" : "= " + (Math.round(am / PB_PY * 100) / 100) + "평") : "";
  var h = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f5f0e8"><th style="text-align:left;padding:5px">공종</th><th style="text-align:left">품명</th><th>수량</th><th style="text-align:right">단가</th><th style="text-align:right">금액</th></tr></thead><tbody>';
  (S.lines || []).forEach(function(L){ var p = PB[L.pb]; if(!p) return; var q = _pbLineQty(L, am), a = Math.round(q * _pbUnit(p)); t += a;
    h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:4px;color:#7c4a21;font-size:12px">' + esc(p.cat || "") + '</td><td>' + esc(p.nm) + (p.spec ? ' <span class="mut">' + esc(p.spec) + '</span>' : '') + '</td><td style="text-align:center">' + (q || "-") + ' ' + esc(p.u || "") + '</td><td style="text-align:right">' + _estW(_pbUnit(p)) + '</td><td style="text-align:right;font-weight:700">' + (a ? _estW(a) : "-") + '</td></tr>'; });
  h += '<tr><td colspan="4" style="text-align:right;padding:6px;font-weight:800">직접공사비 (제경비·부가세 전)</td><td style="text-align:right;font-weight:900;color:#7c4a21;font-size:15px">' + _estW(t) + '</td></tr></tbody></table>';
  if(!am) h += '<div style="color:#b45309;font-size:12.5px;margin-top:4px">면적을 넣으면 수량·금액이 계산돼요 (고정 수량 항목은 그대로)</div>';
  var el = document.getElementById("pbSTbl"); if(el) el.innerHTML = h;
}
function pbSetGo(){
  var S = PSET[PB_SP.id], am = _pbSetArea();
  if(!am && (S.lines || []).some(function(L){ return L.mode !== "fix"; })) return toast("면적을 넣어 주세요", true);
  var rows = (S.lines || []).filter(function(L){ return PB[L.pb]; }).map(function(L){ return { k: L.pb, q: _pbLineQty(L, am) }; });
  _pbInsert(rows, document.getElementById("pbHd").checked, PB_SP.u === "py" ? _estN(PB_SP.a) + "평" : _estN(PB_SP.a) + "㎡");
  closePopup(); draw(); toast("📐 " + S.nm + " — " + rows.length + "개 항목 넣었어요");
}
// 단가표 항목들을 견적에 넣기 (공종별로 묶고, 공종 제목 줄은 없으면 만들고 있으면 그 끝에)
function _pbInsert(rows, withHd, note){
  var e = EST_ED, clean = function(x){ return String(x || "").replace(/^\s*[\dⅠ-Ⅻ]+[.)]\s*/, "").trim(); };
  e.items = e.items.filter(function(it){ return it.hd ? String(it.nm || "").trim() : (String(it.nm || "").trim() || _estN(it.qty) * _estUnit(it)); });
  var byCat = {}, order = [];
  rows.forEach(function(r){ var c = PB[r.k].cat || "기타"; if(!byCat[c]){ byCat[c] = []; order.push(c); } byCat[c].push(r); });
  order.forEach(function(cat){
    var its = byCat[cat].map(function(r){ var p = PB[r.k]; return { nm: p.nm, spec: p.spec || "", u: p.u || "", qty: r.q || 1, mat: e.split ? _estN(p.mat) : _pbUnit(p), lab: e.split ? _estN(p.lab) : 0, exp: e.split ? _estN(p.exp) : 0, note: note || "" }; });
    var at = -1; e.items.forEach(function(it, i){ if(it.hd && clean(it.nm) === cat) at = i; });
    if(withHd && at < 0){ e.items.push({ hd: 1, nm: (e.items.filter(function(it){ return it.hd; }).length + 1) + ". " + cat }); e.items = e.items.concat(its); }
    else if(withHd){ var end = at + 1; while(end < e.items.length && !e.items[end].hd) end++; Array.prototype.splice.apply(e.items, [end, 0].concat(its)); }
    else e.items = e.items.concat(its);
  });
}
