// ============================================================================
// 🙈 계정별 탭 권한(✏️ 쓰기 · 👁 읽기만 · 🚫 숨김) + 견적·계약 묶음 모듈 켜고 끄기
//   /main/TabHide/{아이디} = { 탭키: true(숨김) | "r"(읽기만) } — 쓰기(기본)는 저장 안 함. 최고관리자(super)는 늘 다 쓰기
//   견적·계약 묶음 모듈: est(견적·계약·단가표) · photo(현장사진·보고서) · recv(받을 돈) · easy(쉬운 화면)
//     → 공사(행사)관리 '사용 모듈' 체크에 들어감. 건축·건설 시스템은 기본 켬, 그 밖은 체크해야 켜짐
//   ※ 화면에서 가리고 막는 것(실수 방지용) — 데이터 보안은 DB 규칙이 따로 지킴
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

// ── 계정별 탭 권한: ✏️ 쓰기(기본) · 👁 읽기만 · 🚫 숨김 ──
//   /main/TabHide/{아이디}/{탭} = true(숨김) | "r"(읽기만) — 쓰기는 저장 안 함(기본)
var TP_ST = { w: { i: "✏️", n: "쓰기", bg: "#dcfce7", c: "#166534" }, r: { i: "👁", n: "읽기만", bg: "#fef9c3", c: "#854d0e" }, h: { i: "🚫", n: "숨김", bg: "#fee2e2", c: "#991b1b" } };
var TP_NEXT = { w: "r", r: "h", h: "w" };
function _tpKey(id){ return String(id || "").replace(/[.#$\[\]\/]/g, "_"); }
function _tpHidden(id){
  var all = (typeof _cache !== "undefined" && _cache && _cache.TabHide) || {};
  return all[_tpKey(id)] || null;
}
function _tpState(id, tab){ var v = (_tpHidden(id) || {})[tab]; return v === true ? "h" : v === "r" ? "r" : "w"; }
function _tpMe(){ return ME ? (ME.id || CID) : CID; }
// 지금 보는 탭이 이 계정에게 '읽기만'인가
function _tpRO(tab){ if(!ME || ME.r === "super") return false; return _tpState(_tpMe(), tab || CTAB) === "r"; }

// mkTabs 가 만든 메뉴에서 숨긴 탭 빼기 (+ 읽기만 막기 장치 한 번 설치)
function _tpFilter(cats){
  _tpGuard();
  if(!ME || ME.r === "super") return cats;
  var hid = _tpHidden(_tpMe()); if(!hid) return cats;
  var out = cats.map(function(c){ return Object.assign({}, c, { items: (c.items || []).filter(function(t){ return hid[t.k] !== true; }) }); }).filter(function(c){ return c.items.length; });
  var ok = out.some(function(c){ return c.items.some(function(t){ return t.k === CTAB; }); });
  if(!ok && out.length){ CTAB = out[0].items[0].k; _curCat = out[0].id; }
  return out;
}

// ── 👁 읽기만: 저장·고치기·지우기를 서버로 보내기 전에 막음 ──
var TP_READ_API = /^(ping|login|refresh|list|get|load|search|find|check|read|status|count|export|print|preview)/i;
var TP_OK_PATH = /^\/(main\/PubCfg|evtData\/[^\/]+\/(PubCfg|PubSeq)|secure)(\/|$)/;   // 화면 열 때 저절로 쓰는 칸은 통과
function _tpSay(){ var t = Date.now(); if(t - (window.__tpSaid || 0) > 1500){ window.__tpSaid = t; toast("👁 읽기만 가능한 탭이에요 — 저장·수정·삭제는 안 돼요", true); } }
function _tpGuard(){
  if(window.__tpGuarded) return; window.__tpGuarded = 1;
  // 1) api() — 예전 화면들의 저장
  if(typeof api === "function"){
    var api0 = api;
    window.api = api = function(action, params){
      if(_tpRO() && !TP_READ_API.test(String(action || ""))){ _tpSay(); return Promise.resolve({ ok: false, err: "읽기만 가능한 탭이에요" }); }
      return api0.apply(this, arguments);
    };
  }
  // 2) DB 직접 쓰기 — 견적·사진·단가표 등
  try {
    var P = firebase.database.Reference.prototype;
    ["set", "update", "remove", "setWithPriority", "transaction"].forEach(function(fn){
      var f0 = P[fn]; if(!f0) return;
      P[fn] = function(){
        var path = ""; try { path = decodeURIComponent(this.toString().replace(/^https?:\/\/[^\/]+/, "")); } catch(e){}
        if(_tpRO() && !TP_OK_PATH.test(path)){ _tpSay(); return Promise.reject(new Error("읽기만 가능한 탭이에요")); }
        return f0.apply(this, arguments);
      };
    });
    var push0 = P.push;
    P.push = function(v){ if(arguments.length && v !== undefined && _tpRO()){ _tpSay(); var r = push0.call(this); var p = Promise.reject(new Error("읽기만 가능한 탭이에요")); p.catch(function(){}); r.then = p.then.bind(p); r.catch = p.catch.bind(p); return r; } return push0.apply(this, arguments); };
  } catch(e){ console.warn("[tabperm] 읽기만 장치 설치 실패", e); }
  // 3) 화면 위 '읽기만' 띠
  if(typeof draw === "function"){
    var draw0 = draw;
    window.draw = draw = function(){ var r = draw0.apply(this, arguments); _tpBanner(); return r; };
  }
}
function _tpBanner(){
  var mc = document.getElementById("mc"); if(!mc) return;
  var b = document.getElementById("tpRoBar");
  if(!_tpRO()){ if(b) b.remove(); return; }
  if(!b){ b = document.createElement("div"); b.id = "tpRoBar"; b.style.cssText = "background:#fef9c3;border:2px solid #eab308;color:#854d0e;font-weight:800;padding:8px 12px;border-radius:8px;margin-bottom:10px;font-size:14px"; b.textContent = "👁 이 탭은 읽기만 할 수 있어요 — 보기·인쇄·엑셀은 되고, 저장·수정·삭제는 안 돼요"; }
  if(mc.firstChild !== b) mc.insertBefore(b, mc.firstChild);
}

// 모든 탭 목록 (표 칸) — mkTabs 와 같은 키
function _tpAllTabs(){
  var W = _evtWord(), L = [
    { c: _constDefOn() ? "🏗️ 공사" : "📑 견적·계약", t: [["easy", "📱 쉬운 화면"], ["est", "견적·계약"], ["photo", "현장사진·보고서"], ["recv", "💸 받을 돈"]] },
    { c: "👥 참가자", t: [["apply", "참가자 관리"], ["apstat", "참가자 현황"], ["awards", "상장현황"], ["apform", "신청폼"]] },
    { c: "💰 재정", t: [["inc", "세입관리"], ["exp", "예산관리 (세출)"], ["rpt", "결산서"], ["fee", "회비"], ["bank", "입출금 (통장)"]] },
    { c: "📋 운영", t: [["dash", "대시보드"], ["act", "활동일지"], ["pur", "물품/구매"], ["gal", "갤러리"]] },
    { c: "📁 관리", t: [["mem", "인원관리"], ["rental", "대여자산"], ["files", "자료실"], ["contract", "계약서"], ["quote", "견적서"]] },
    { c: "⚙️ 시스템", t: [["notice", "공지"], ["acct", "계정관리"], ["myinfo", "내 정보"], ["evtMgr", W + "관리"], ["forms", "폼 관리"], ["linkTabs", "🔗 연동 탭"], ["modMgr", "📦 모듈 관리"], ["tabPerm", "🙈 계정별 탭 권한"]] }
  ];
  if(typeof dTheme === "function") L[L.length - 1].t.push(["theme", "🎨 화면 꾸미기"]);
  if(typeof dKids === "function") L.push({ c: "👦 아이들", t: [["kids", "공부 기록"]] });
  if(typeof _modDefs !== "undefined" && _modDefs){ var m = Object.keys(_modDefs).map(function(k){ var d = _modDefs[k]; return ["mod_" + k, (d.icon ? d.icon + " " : "") + (d.label || k)]; }); if(m.length) L.push({ c: "📦 커스텀 모듈", t: m }); }
  if(typeof _getCustomTabs === "function"){ try { var ct = []; _getCustomTabs().forEach(function(cat){ (cat.items || []).forEach(function(it, ii){ ct.push(["ct_" + cat.id + "_" + ii, (cat.label || "") + " › " + (it.label || "")]); }); }); if(ct.length) L.push({ c: "🔗 연동 탭", t: ct }); } catch(e){} }
  if(typeof FIELD_MENU !== "undefined" && FIELD_MENU === "on") L.push({ c: "📍 현장", t: [["field_layout", "축제 배치도"], ["field_monitor", "본부 모니터링"], ["field_admin", "코스 관리"], ["field_today", "오늘의 운영"]] });
  return L;
}
function _tpTabKeys(){ var a = []; _tpAllTabs().forEach(function(g){ g.t.forEach(function(t){ a.push(t[0]); }); }); return a; }

// ── 🙈 계정별 탭 권한 화면 ──
var TP_ROLE_NM = { super: "최고관리자", admin: "관리자", subAdm: "부관리자", area: "부서 담당자", applyView: "전용 계정" };
var TP_LAST = null;   // Shift 범위용 (마지막으로 누른 칸)
function _tpIds(){ return Object.keys(US || {}).sort(function(a, b){ var o = { super: 0, admin: 1, subAdm: 2 }; return ((o[US[a].r] != null ? o[US[a].r] : 5) - (o[US[b].r] != null ? o[US[b].r] : 5)) || String(a).localeCompare(String(b)); }); }
function _tpCell(id, tab, st){ var S = TP_ST[st]; return '<button title="' + S.n + ' — 누르면 바뀜" onclick="tpCell(event,\'' + esc(id) + '\',\'' + tab + '\')" style="width:30px;height:28px;border:1px solid ' + S.c + ';border-radius:6px;background:' + S.bg + ';cursor:pointer;font-size:14px;padding:0">' + S.i + '</button>'; }
function dTabPerm(){
  if(!ME || !(ME.r === "super" || ME.r === "admin")) return '<div class="card">관리자만 볼 수 있어요</div>';
  var cols = _tpAllTabs(), ids = _tpIds();
  var h = '<div class="card" style="margin-bottom:10px"><strong style="font-size:18px">🙈 계정별 탭 권한</strong><div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0;font-size:13px">';
  ["w", "r", "h"].forEach(function(k){ var S = TP_ST[k]; h += '<span style="background:' + S.bg + ';color:' + S.c + ';border:1px solid ' + S.c + ';border-radius:8px;padding:3px 10px;font-weight:700">' + S.i + ' ' + S.n + '</span>'; });
  h += '</div><div class="mut" style="font-size:12.5px">칸을 누를 때마다 <b>✏️ 쓰기 → 👁 읽기만 → 🚫 숨김</b> 순서로 바뀌고 바로 저장돼요. <b>Shift</b>를 누르고 같은 줄의 다른 칸을 누르면 사이가 한꺼번에 같은 걸로 바뀌어요.<br>👁 읽기만 = 보기·인쇄·엑셀은 되고 저장·수정·삭제는 막아요 (화면에서 막는 것 — 실수 방지용).<br>최고관리자(super)는 늘 다 ✏️. 역할·' + _evtWord() + ' 모듈에서 원래 안 보이는 탭은 여기서 켜도 안 보여요.</div></div>';
  h += '<div class="card" style="padding:0;overflow:auto;max-height:75vh"><table style="border-collapse:collapse;font-size:12px;min-width:100%"><thead style="position:sticky;top:0;z-index:2;background:#fff">';
  h += '<tr style="background:#f5f0e8"><th rowspan="2" style="padding:6px 8px;text-align:left;position:sticky;left:0;background:#f5f0e8;min-width:170px;border-right:2px solid #d6d3d1">계정</th>';
  cols.forEach(function(g){ h += '<th colspan="' + g.t.length + '" style="padding:5px;border-left:2px solid #d6d3d1;white-space:nowrap">' + esc(g.c) + '</th>'; });
  h += '</tr><tr style="background:#faf7f2">';
  cols.forEach(function(g){ g.t.forEach(function(t, i){ h += '<th style="padding:4px 3px;font-weight:600;font-size:11px;' + (i === 0 ? "border-left:2px solid #d6d3d1;" : "") + 'vertical-align:bottom"><div style="writing-mode:vertical-rl;text-orientation:upright;letter-spacing:-1px;white-space:nowrap;max-height:120px;margin:0 auto">' + esc(t[1]) + '</div><button class="btn btn-s" style="background:#475569;color:#fff;padding:1px 4px;font-size:10px;margin-top:3px" title="모든 계정 같이 바꾸기 (✏️→👁→🚫)" onclick="tpCol(\'' + t[0] + '\')">⇅</button></th>'; }); });
  h += '</tr></thead><tbody>';
  ids.forEach(function(id){
    var u = US[id], sup = u.r === "super";
    h += '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:5px 8px;position:sticky;left:0;background:#fff;border-right:2px solid #d6d3d1;white-space:nowrap"><b>' + esc(id) + '</b> <span class="mut">' + esc(u.nm || "") + '</span><div style="font-size:11px;color:#7c4a21">' + esc(TP_ROLE_NM[u.r] || u.r || "") + (u.ar ? " · " + esc(u.ar) : "") + '</div>';
    if(!sup) h += '<div style="margin-top:2px;display:flex;gap:3px">' + ["w", "r", "h"].map(function(k){ var S = TP_ST[k]; return '<button class="btn btn-s" title="이 계정 전부 ' + S.n + '" style="background:' + S.c + ';color:#fff;padding:1px 6px;font-size:10px" onclick="tpRow(\'' + esc(id) + '\',\'' + k + '\')">전부 ' + S.i + '</button>'; }).join("") + '</div>';
    h += '</td>';
    cols.forEach(function(g){ g.t.forEach(function(t, i){ h += '<td style="text-align:center;padding:2px;' + (i === 0 ? "border-left:2px solid #d6d3d1;" : "") + '">' + (sup ? '<span style="color:#16a34a">✏️</span>' : _tpCell(id, t[0], _tpState(id, t[0]))) + '</td>'; }); });
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}
function _tpRef(id){ return fbDb.ref("/main/TabHide/" + _tpKey(id)); }
function _tpVal(st){ return st === "h" ? true : st === "r" ? "r" : null; }
function _tpLocal(id, tab, st){
  if(typeof _cache === "undefined" || !_cache) return; _cache.TabHide = _cache.TabHide || {};
  var k = _tpKey(id), o = _cache.TabHide[k] = _cache.TabHide[k] || {}, v = _tpVal(st);
  if(v === null) delete o[tab]; else o[tab] = v;
}
function _tpMine(id){ return ME && _tpKey(_tpMe()) === _tpKey(id); }
function _tpSave(id, map){   // map: {탭: 상태}
  var u = {}; Object.keys(map).forEach(function(t){ u[t] = _tpVal(map[t]); _tpLocal(id, t, map[t]); });
  return _tpRef(id).update(u).catch(function(e){ toast("저장 실패: " + e.message, true); });
}
function tpSet(id, tab, st){ _tpSave(id, { [tab]: st }); if(_tpMine(id)) mkTabs(); }
function tpCell(ev, id, tab){
  var keys = _tpTabKeys(), st, map = {};
  if(ev && ev.shiftKey && TP_LAST && TP_LAST.id === id){
    st = TP_LAST.st; var a = keys.indexOf(TP_LAST.tab), b = keys.indexOf(tab), lo = Math.min(a, b), hi = Math.max(a, b);
    for(var i = lo; i <= hi; i++) map[keys[i]] = st;
    try { var s = window.getSelection && window.getSelection(); if(s) s.removeAllRanges(); } catch(e){}
  } else { st = TP_NEXT[_tpState(id, tab)]; map[tab] = st; }
  if(_tpMine(id) && tab === "tabPerm" && st !== "w" && !confirm("내 계정에서 이 화면을 " + TP_ST[st].n + "(으)로 하면 다시 못 고칠 수도 있어요 (최고관리자는 고칠 수 있어요). 할까요?")) return;
  TP_LAST = { id: id, tab: tab, st: st };
  _tpSave(id, map); draw(); if(_tpMine(id)) mkTabs();
}
function tpRow(id, st){
  if(st !== "w" && _tpMine(id) && !confirm("내 계정의 탭을 전부 " + TP_ST[st].n + "(으)로 하면 이 화면도 막혀요 (최고관리자가 다시 고칠 수 있어요). 그래도 할까요?")) return;
  var map = {}; _tpTabKeys().forEach(function(t){ map[t] = st; });
  _tpSave(id, map).then(function(){ toast(id + " — 전부 " + TP_ST[st].i + " " + TP_ST[st].n); draw(); if(_tpMine(id)) mkTabs(); });
}
function tpCol(tab){
  var ids = _tpIds().filter(function(id){ return US[id].r !== "super"; }); if(!ids.length) return;
  var st = TP_NEXT[_tpState(ids[0], tab)], u = {};
  ids.forEach(function(id){ u[_tpKey(id) + "/" + tab] = _tpVal(st); _tpLocal(id, tab, st); });
  fbDb.ref("/main/TabHide").update(u).then(function(){ toast("모든 계정 — " + TP_ST[st].i + " " + TP_ST[st].n); draw(); mkTabs(); }).catch(function(e){ toast("실패: " + e.message, true); });
}
