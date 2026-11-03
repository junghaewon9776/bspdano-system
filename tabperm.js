// ============================================================================
// 🙈 계정별 탭 보기 + 견적·계약 묶음 모듈 켜고 끄기
//   /main/TabHide/{아이디} = { 탭키: true }  ← 체크 뺀(숨긴) 탭만 저장. 최고관리자(super)는 늘 다 보임
//   견적·계약 묶음 모듈: est(견적·계약·단가표) · photo(현장사진·보고서) · recv(받을 돈) · easy(쉬운 화면)
//     → 공사(행사)관리 '사용 모듈' 체크에 들어감. 건축·건설 시스템은 기본 켬, 그 밖은 체크해야 켜짐
//   ※ 화면에서 탭을 가리는 것 — 데이터 보안은 DB 규칙이 따로 지킴
// ============================================================================
var CONST_MODS = ["est", "photo", "recv", "easy"];
var CONST_MOD_LBL = { est: "📑 견적·계약", photo: "📷 현장사진·보고서", recv: "💸 받을 돈", easy: "📱 쉬운 화면" };
function _constDefOn(){ return /건축|건설/.test(typeof SYS_NAME !== "undefined" ? SYS_NAME : ""); }
function _evtWord(){ return _constDefOn() ? "공사" : "행사"; }
// 견적·계약 묶음 모듈은 '사용 모듈'에 적혀 있어야만 켜짐 (모듈 칸이 비어 있으면 건축 시스템만 켬)
function _hasConstMod(m){
  if(!CUR_EVT) return _constDefOn();
  var mods = CUR_EVT.modules;
  if(mods == null || mods === "") return _constDefOn();
  if(typeof mods === "string") mods = mods.split(",").map(function(s){ return s.trim(); });
  return mods.indexOf(m) >= 0;
}
function _constCat(){
  var it = [];
  if(_hasConstMod("easy")) it.push({ k: "easy", l: "📱 쉬운 화면" });
  if(_hasConstMod("est")) it.push({ k: "est", l: "견적·계약" });
  if(_hasConstMod("photo")) it.push({ k: "photo", l: "현장사진·보고서" });
  if(_hasConstMod("recv")) it.push({ k: "recv", l: "💸 받을 돈" });
  return it.length ? { id: "const", label: _constDefOn() ? "🏗️ 공사" : "📑 견적·계약", items: it } : null;
}

// ── 계정별 숨김 ──
function _tpKey(id){ return String(id || "").replace(/[.#$\[\]\/]/g, "_"); }
function _tpHidden(id){
  var all = (typeof _cache !== "undefined" && _cache && _cache.TabHide) || {};
  return all[_tpKey(id)] || null;
}
// mkTabs 가 만든 메뉴에서 이 계정이 숨긴 탭 빼기
function _tpFilter(cats){
  if(!ME || ME.r === "super") return cats;
  var hid = _tpHidden(ME.id || CID); if(!hid) return cats;
  var out = cats.map(function(c){ return Object.assign({}, c, { items: (c.items || []).filter(function(t){ return !hid[t.k]; }) }); }).filter(function(c){ return c.items.length; });
  var ok = out.some(function(c){ return c.items.some(function(t){ return t.k === CTAB; }); });
  if(!ok && out.length){ CTAB = out[0].items[0].k; _curCat = out[0].id; }
  return out;
}

// 모든 탭 목록 (체크표 칸) — mkTabs 와 같은 키
function _tpAllTabs(){
  var W = _evtWord(), L = [
    { c: _constDefOn() ? "🏗️ 공사" : "📑 견적·계약", t: [["easy", "📱 쉬운 화면"], ["est", "견적·계약"], ["photo", "현장사진·보고서"], ["recv", "💸 받을 돈"]] },
    { c: "👥 참가자", t: [["apply", "참가자 관리"], ["apstat", "참가자 현황"], ["awards", "상장현황"], ["apform", "신청폼"]] },
    { c: "💰 재정", t: [["inc", "세입관리"], ["exp", "예산관리 (세출)"], ["rpt", "결산서"], ["fee", "회비"], ["bank", "입출금 (통장)"]] },
    { c: "📋 운영", t: [["dash", "대시보드"], ["act", "활동일지"], ["pur", "물품/구매"], ["gal", "갤러리"]] },
    { c: "📁 관리", t: [["mem", "인원관리"], ["rental", "대여자산"], ["files", "자료실"], ["contract", "계약서"], ["quote", "견적서"]] },
    { c: "⚙️ 시스템", t: [["notice", "공지"], ["acct", "계정관리"], ["myinfo", "내 정보"], ["evtMgr", W + "관리"], ["forms", "폼 관리"], ["linkTabs", "🔗 연동 탭"], ["modMgr", "📦 모듈 관리"], ["tabPerm", "🙈 계정별 탭 보기"]] }
  ];
  if(typeof dTheme === "function") L[L.length - 1].t.push(["theme", "🎨 화면 꾸미기"]);
  if(typeof _modDefs !== "undefined" && _modDefs){ var m = Object.keys(_modDefs).map(function(k){ var d = _modDefs[k]; return ["mod_" + k, (d.icon ? d.icon + " " : "") + (d.label || k)]; }); if(m.length) L.push({ c: "📦 커스텀 모듈", t: m }); }
  if(typeof _getCustomTabs === "function"){ try { var ct = []; _getCustomTabs().forEach(function(cat){ (cat.items || []).forEach(function(it, ii){ ct.push(["ct_" + cat.id + "_" + ii, (cat.label || "") + " › " + (it.label || "")]); }); }); if(ct.length) L.push({ c: "🔗 연동 탭", t: ct }); } catch(e){} }
  if(typeof FIELD_MENU !== "undefined" && FIELD_MENU === "on") L.push({ c: "📍 현장", t: [["field_layout", "축제 배치도"], ["field_monitor", "본부 모니터링"], ["field_admin", "코스 관리"], ["field_today", "오늘의 운영"]] });
  return L;
}

// ── 🙈 계정별 탭 보기 화면 ──
var TP_ROLE_NM = { super: "최고관리자", admin: "관리자", subAdm: "부관리자", area: "부서 담당자", applyView: "전용 계정" };
function dTabPerm(){
  if(!ME || !(ME.r === "super" || ME.r === "admin")) return '<div class="card">관리자만 볼 수 있어요</div>';
  var cols = _tpAllTabs(), ids = Object.keys(US || {}).sort(function(a, b){ var o = { super: 0, admin: 1, subAdm: 2 }; return ((o[US[a].r] != null ? o[US[a].r] : 5) - (o[US[b].r] != null ? o[US[b].r] : 5)) || String(a).localeCompare(String(b)); });
  var h = '<div class="card" style="margin-bottom:10px"><strong style="font-size:18px">🙈 계정별 탭 보기</strong><div class="mut" style="font-size:12.5px;margin-top:4px">체크 = 그 계정에게 보임 · 체크 빼면 안 보임 (누르면 바로 저장) · <b>Shift</b>를 누르고 누르면 한 줄에서 사이가 한 번에 바뀌어요.<br>최고관리자(super)는 실수로 잠기지 않게 <b>늘 다 보여요</b>. 역할·' + _evtWord() + ' 모듈에서 원래 안 보이는 탭은 체크해도 안 보여요.</div></div>';
  h += '<div class="card" style="padding:0;overflow:auto;max-height:75vh"><table style="border-collapse:collapse;font-size:12px;min-width:100%"><thead style="position:sticky;top:0;z-index:2;background:#fff">';
  h += '<tr style="background:#f5f0e8"><th rowspan="2" style="padding:6px 8px;text-align:left;position:sticky;left:0;background:#f5f0e8;min-width:150px;border-right:2px solid #d6d3d1">계정</th>';
  cols.forEach(function(g){ h += '<th colspan="' + g.t.length + '" style="padding:5px;border-left:2px solid #d6d3d1;white-space:nowrap">' + esc(g.c) + '</th>'; });
  h += '</tr><tr style="background:#faf7f2">';
  cols.forEach(function(g){ g.t.forEach(function(t, i){ h += '<th style="padding:4px 3px;font-weight:600;font-size:11px;' + (i === 0 ? "border-left:2px solid #d6d3d1;" : "") + 'vertical-align:bottom"><div style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;max-height:120px;margin:0 auto">' + esc(t[1]) + '</div><button class="btn btn-s" style="background:#475569;color:#fff;padding:1px 4px;font-size:10px;margin-top:3px" title="모든 계정에서 켜기/끄기" onclick="tpCol(\'' + t[0] + '\')">⇅</button></th>'; }); });
  h += '</tr></thead><tbody>';
  ids.forEach(function(id, ri){
    var u = US[id], sup = u.r === "super", hid = _tpHidden(id) || {};
    h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:5px 8px;position:sticky;left:0;background:#fff;border-right:2px solid #d6d3d1;white-space:nowrap"><b>' + esc(id) + '</b> <span class="mut">' + esc(u.nm || "") + '</span><div style="font-size:11px;color:#7c4a21">' + esc(TP_ROLE_NM[u.r] || u.r || "") + (u.ar ? " · " + esc(u.ar) : "") + '</div>';
    if(!sup) h += '<div style="margin-top:2px"><button class="btn btn-s" style="background:#16a34a;color:#fff;padding:1px 6px;font-size:10px" onclick="tpRow(\'' + esc(id) + '\',1)">전부 보이기</button> <button class="btn btn-s" style="background:#dc2626;color:#fff;padding:1px 6px;font-size:10px" onclick="tpRow(\'' + esc(id) + '\',0)">전부 숨기기</button></div>';
    h += '</td>';
    cols.forEach(function(g){ g.t.forEach(function(t, i){
      h += '<td style="text-align:center;padding:3px;' + (i === 0 ? "border-left:2px solid #d6d3d1;" : "") + (hid[t[0]] ? "background:#fef2f2;" : "") + '">' + (sup ? '<span style="color:#16a34a">✔</span>' : '<input type="checkbox" class="tpr_' + ri + '" ' + (hid[t[0]] ? "" : "checked") + ' onchange="tpSet(\'' + esc(id) + '\',\'' + t[0] + '\',this.checked)">') + '</td>';
    }); });
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}
function _tpRef(id){ return fbDb.ref("/main/TabHide/" + _tpKey(id)); }
function _tpLocal(id, tab, show){
  if(typeof _cache === "undefined" || !_cache) return; _cache.TabHide = _cache.TabHide || {};
  var k = _tpKey(id), o = _cache.TabHide[k] = _cache.TabHide[k] || {};
  if(show) delete o[tab]; else o[tab] = true;
}
function tpSet(id, tab, show){
  _tpLocal(id, tab, show);
  _tpRef(id).child(tab).set(show ? null : true).catch(function(e){ toast("저장 실패: " + e.message, true); });
  if(ME && _tpKey(ME.id || CID) === _tpKey(id)) mkTabs();
}
function tpRow(id, show){
  var u = {}, tabs = []; _tpAllTabs().forEach(function(g){ g.t.forEach(function(t){ tabs.push(t[0]); }); });
  if(!show && ME && _tpKey(ME.id || CID) === _tpKey(id) && !confirm("내 계정의 탭을 전부 숨기면 이 화면도 안 보여요 (최고관리자가 다시 켤 수 있어요). 그래도 할까요?")) return;
  tabs.forEach(function(t){ u[t] = show ? null : true; _tpLocal(id, t, show); });
  _tpRef(id).update(u).then(function(){ toast(id + " — " + (show ? "전부 보이게" : "전부 숨김")); draw(); if(ME && _tpKey(ME.id || CID) === _tpKey(id)) mkTabs(); }).catch(function(e){ toast("실패: " + e.message, true); });
}
function tpCol(tab){
  var ids = Object.keys(US || {}).filter(function(id){ return US[id].r !== "super"; }); if(!ids.length) return;
  var anyShown = ids.some(function(id){ return !(_tpHidden(id) || {})[tab]; }), show = !anyShown, u = {};
  ids.forEach(function(id){ u[_tpKey(id) + "/" + tab] = show ? null : true; _tpLocal(id, tab, show); });
  fbDb.ref("/main/TabHide").update(u).then(function(){ toast("모든 계정 — " + (show ? "보이게" : "숨김")); draw(); mkTabs(); }).catch(function(e){ toast("실패: " + e.message, true); });
}
