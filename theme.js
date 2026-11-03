// ============================================================================
// 🎨 화면 꾸미기 — 로그인 화면 배경(기본 무늬 / 색 / 사진) · 문구 · 상단바 색
//   저장: /main/PubTheme  (로그인 전에도 보여야 해서 누구나 읽기, 쓰기는 관리자만 — 보안 규칙)
//   무늬(설계도 격자 --hsGrid, 건물·크레인 --hsSky)는 한솔 index.html :root 에 있음 — 없는 시스템은 아래 점무늬
//   시스템마다 기본색: theme.js 앞에서 var TH_BASE = {c1,c2,bar,accent,label,ph} (없으면 한솔 갈색)
// ============================================================================
var TH_B = Object.assign({ c1: "#7c4a21", c2: "#3b220e", bar: "#5b3416", accent: "#7c4a21", label: "🏗️ 기본 (갈색 건축 무늬)", ph: "예: 정직한 시공, 믿을 수 있는 한솔건축", sky: true }, typeof TH_BASE !== "undefined" ? TH_BASE : {});
var TH_KEY = (typeof SEC_SYS !== "undefined" && SEC_SYS && SEC_SYS !== "hansol") ? "th_" + SEC_SYS : "hs_theme";   // 같은 주소(github.io)라 시스템마다 따로
var TH_DEF = { mode: "base", c1: TH_B.c1, c2: TH_B.c2, pat: true, photo: "", dim: 35, slogan: "", bar: "", title: "", sub: "", box: "", pt: "", boxOp: 100 };
(function(){ var st = document.createElement("style"); st.textContent = ":root{--thGrid:var(--hsGrid,url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%3E%3Ccircle%20cx=%272%27%20cy=%272%27%20r=%271.3%27%20fill=%27rgba%28255,255,255,.14%29%27/%3E%3C/svg%3E));--thSky:var(--hsSky,none)}"; document.head.appendChild(st); })();
var TH = null, TH_ED = null;

function _thOk(c){ return /^#[0-9a-f]{6}$/i.test(String(c || "")); }
function _thNorm(t){
  var o = Object.assign({}, TH_DEF, t || {});
  if(["base", "color", "photo"].indexOf(o.mode) < 0) o.mode = "base";
  if(!_thOk(o.c1)) o.c1 = TH_DEF.c1; if(!_thOk(o.c2)) o.c2 = TH_DEF.c2; if(o.bar && !_thOk(o.bar)) o.bar = "";
  if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(String(o.photo || ""))) o.photo = "";
  o.dim = Math.max(0, Math.min(85, Number(o.dim) || 0)); o.pat = o.pat !== false;
  o.pfit = o.pfit === "size" ? "size" : "cover";
  o.pz = Math.max(20, Math.min(200, Number(o.pz) || 100));
  o.px = Math.max(0, Math.min(100, o.px == null || o.px === "" ? 50 : Number(o.px)));
  o.py = Math.max(0, Math.min(100, o.py == null || o.py === "" ? 50 : Number(o.py)));
  if(o.fill && !_thOk(o.fill)) o.fill = "";
  o.slogan = String(o.slogan || "").slice(0, 60);
  o.title = String(o.title || "").slice(0, 40); o.sub = String(o.sub || "").slice(0, 60);
  if(o.box && !_thOk(o.box)) o.box = ""; if(o.pt && !_thOk(o.pt)) o.pt = "";
  o.boxOp = Math.max(60, Math.min(100, Number(o.boxOp) || 100));
  return o;
}
// 로그인 배경 (base 는 index.html 기본 CSS 그대로 → "")
// 사진이 화면보다 작을 때 남는 곳 색
function _thFill(t){ return (t.mode === "photo" && t.fill) ? t.fill : TH_B.c2; }
function _thBg(t){
  var pat = t.pat;
  if(t.mode === "color") return (pat ? (TH_B.sky ? "var(--thSky) center bottom/100% auto no-repeat," : "") + "var(--thGrid)," : "") + "linear-gradient(160deg," + t.c1 + "," + t.c2 + ")";
  if(t.mode === "photo" && t.photo){ var d = (t.dim / 100).toFixed(2); return (pat ? "var(--thGrid)," : "") + "linear-gradient(rgba(0,0,0," + d + "),rgba(0,0,0," + d + ")),url(" + t.photo + ") " + t.px + "% " + t.py + "%/" + (t.pfit === "size" ? t.pz + "% auto" : "cover") + " no-repeat"; }
  return "";
}
function _thEsc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function _thRgb(h){ return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
function _thDark(h){ var c = _thRgb(h); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) < 128; }
// 로그인 상자 (가운데 흰 상자) — 상자 색 · 글자·단추 색 · 비침
function _thBoxCss(t){
  var css = "";
  if(t.box){
    var c = _thRgb(t.box);
    css += "#loginBox{background:rgba(" + c.join(",") + "," + (t.boxOp / 100) + ")!important}";
    if(_thDark(t.box)) css += "#loginBox label,#loginBox p,#loginBox .acctInfo,#loginBox .acctInfo b{color:#cbd5e1!important}#loginBox .acctInfo{border-top-color:rgba(255,255,255,.15)!important}#loginBox input:not([type=checkbox]){background:rgba(255,255,255,.08)!important;color:#fff!important;border-color:rgba(255,255,255,.25)!important}#loginBox input::placeholder{color:rgba(255,255,255,.45)}";
  } else if(t.boxOp < 100) css += "#loginBox{background:rgba(255,255,255," + (t.boxOp / 100) + ")!important}";
  if(t.pt) css += "#loginBox h1{color:" + t.pt + "!important}#loginBox{border-top:5px solid " + t.pt + "}#loginBtn{background:" + t.pt + "!important;color:" + (_thDark(t.pt) ? "#fff" : "#111") + "!important}#loginBox input:focus{border-color:" + t.pt + "!important}#lgSlogan{color:" + t.pt + "!important}";
  return css;
}
// 로그인 제목·작은 글 바꾸기 (로고 그림은 그대로 두고 글자만)
function _thTexts(t){
  var box = document.getElementById("loginBox"); if(!box) return;
  var h1 = box.querySelector("h1"), p = box.querySelector("p");
  if(h1){
    if(t.title){ var img = h1.querySelector("img"); h1.innerHTML = (img ? img.outerHTML : "") + _thEsc(t.title); h1.setAttribute("data-th", "1"); }
    else if(h1.getAttribute("data-th") && typeof SYS_TITLE !== "undefined"){ var im2 = h1.querySelector("img"); h1.innerHTML = (im2 ? im2.outerHTML : (typeof SYS_ICON !== "undefined" ? SYS_ICON + " " : "")) + _thEsc(SYS_TITLE); h1.removeAttribute("data-th"); }
  }
  if(p){
    if(t.sub){ p.textContent = t.sub; p.setAttribute("data-th", "1"); }
    else if(p.getAttribute("data-th") && typeof SYS_LOGIN_SUB !== "undefined"){ p.textContent = SYS_LOGIN_SUB; p.removeAttribute("data-th"); }
  }
}
var TH_LAST = null;
function _thApply(t){
  t = _thNorm(t); TH_LAST = t;
  var css = "", bg = _thBg(t);
  if(bg) css += "#loginPage{background:" + bg + "!important;background-color:" + _thFill(t) + "!important}";
  if(t.bar) css += ".topBar{background:var(--thGrid)," + t.bar + "!important}.cat-btn.on{background:" + t.bar + "!important}#loginBtn{background:" + t.bar + "!important}";
  css += _thBoxCss(t);
  var st = document.getElementById("thStyle");
  if(!st){ st = document.createElement("style"); st.id = "thStyle"; document.head.appendChild(st); }
  st.textContent = css;
  var box = document.getElementById("loginBox"), sl = document.getElementById("lgSlogan");
  if(box && !sl){ sl = document.createElement("div"); sl.id = "lgSlogan"; sl.style.cssText = "text-align:center;font-size:14px;font-weight:700;color:#92400e;margin:-14px 0 18px;letter-spacing:.5px"; var p = box.querySelector("p"); if(p) p.parentNode.insertBefore(sl, p.nextSibling); }
  if(sl){ sl.textContent = t.slogan || ""; sl.style.display = t.slogan ? "" : "none"; }
  _thTexts(t);
}
// 처음 열 때: 지난번 설정(이 기기) 먼저 → DB 에서 최신
(function(){
  try { var c = localStorage.getItem(TH_KEY); if(c) _thApply(JSON.parse(c)); } catch(e){}
  function load(){
    if(typeof fbDb === "undefined") return;
    fbDb.ref("/main/PubTheme").once("value").then(function(s){
      TH = _thNorm(s.val()); _thApply(TH);
      try { localStorage.setItem(TH_KEY, JSON.stringify(TH)); } catch(e){}
    }).catch(function(){});
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
  // 시스템이 로그인 제목을 다시 써도 꾸민 이름이 이기게 한 번 더
  document.addEventListener("DOMContentLoaded", function(){ setTimeout(function(){ if(TH_LAST) _thApply(TH_LAST); }, 0); });
})();

// ── 설정 화면 ──
function dTheme(){
  if(!TH_ED) TH_ED = _thNorm(TH);
  var t = TH_ED, B = function(bg, label, on, ex){ return '<button class="btn" style="background:' + bg + ';color:#fff;' + (ex || "") + '" onclick="' + on + '">' + label + '</button>'; };
  var R = function(v, label){ return '<label style="display:inline-flex;align-items:center;gap:5px;padding:8px 12px;border:2px solid ' + (t.mode === v ? TH_B.accent : "#e5e7eb") + ';border-radius:8px;cursor:pointer;background:' + (t.mode === v ? "#f8fafc" : "#fff") + ';font-weight:700"><input type="radio" name="thMode" ' + (t.mode === v ? "checked" : "") + ' onchange="TH_ED.mode=\'' + v + '\';draw()"> ' + label + '</label>'; };
  var h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><strong style="font-size:18px">🎨 화면 꾸미기</strong>';
  h += '<div style="display:flex;gap:6px">' + B("#16a34a", "💾 저장 (모두에게 적용)", "thSave()") + B("#475569", "↺ 처음 색으로", "thReset()") + '</div></div>';
  h += '<div class="mut" style="font-size:12.5px;margin-top:4px">로그인 화면 배경 · 문구 · 상단바 색을 바꿔요. 저장하면 이 시스템을 여는 모든 사람에게 보여요.</div></div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px">';
  // 왼쪽: 고르기
  h += '<div class="card"><div style="font-weight:700;margin-bottom:8px">① 로그인 화면 배경</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + R("base", TH_B.label) + R("color", "🎨 색 고르기") + R("photo", "🖼 사진") + '</div>';
  if(t.mode === "color"){
    h += '<div style="display:flex;gap:16px;align-items:center;margin-top:12px;font-size:13px;flex-wrap:wrap"><label>위쪽 색 <input type="color" value="' + t.c1 + '" oninput="thSet(\'c1\',this.value)"></label><label>아래쪽 색 <input type="color" value="' + t.c2 + '" oninput="thSet(\'c2\',this.value)"></label><span class="mut" style="font-size:12px">두 색을 같게 하면 단색</span></div>';
    h += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">';
    [[TH_B.c1, TH_B.c2, "기본색"], ["#2563eb", "#1d4ed8", "파랑"], ["#7c4a21", "#3b220e", "갈색"], ["#92400e", "#451a03", "진갈색"], ["#a16207", "#422006", "황토"], ["#1e3a5f", "#0f172a", "남색"], ["#166534", "#052e16", "초록"], ["#374151", "#111827", "회색"]].forEach(function(p){
      h += '<button class="btn" style="background:linear-gradient(160deg,' + p[0] + ',' + p[1] + ');color:#fff;padding:6px 12px" onclick="TH_ED.c1=\'' + p[0] + '\';TH_ED.c2=\'' + p[1] + '\';draw()">' + p[2] + '</button>'; });
    h += '</div>';
  }
  if(t.mode === "photo"){
    // 🖼 등록해 둔 사진들 — 눌러서 고르기 · 🗑 지우기 · ➕ 새로 올리기
    if(!TH_LIB){ _thLibLoad(); h += '<div class="mut" style="margin-top:12px;font-size:13px">📡 등록한 사진 불러오는 중...</div>'; }
    else {
      var ids = Object.keys(TH_LIB).sort(function(a, b){ return String(TH_LIB[b].at || "").localeCompare(String(TH_LIB[a].at || "")); });
      h += '<div style="font-size:13px;font-weight:700;margin:12px 0 6px">🖼 등록한 사진 <span class="mut" style="font-weight:400;font-size:12px">' + ids.length + '장 · 눌러서 고르기</span></div>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">';
      ids.forEach(function(id){
        var p = TH_LIB[id], on = t.photoId === id;
        h += '<div style="position:relative;border:3px solid ' + (on ? "#16a34a" : "#e5e7eb") + ';border-radius:8px;overflow:hidden;cursor:pointer;background:#000" onclick="thUse(\'' + id + '\')" title="' + esc(p.nm || "") + '">';
        h += '<img src="' + p.thumb + '" alt="" style="display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#000">';
        if(on) h += '<span style="position:absolute;left:4px;top:4px;background:#16a34a;color:#fff;font-size:11px;font-weight:800;padding:2px 6px;border-radius:5px">✅ 고름</span>';
        h += '<button class="btn" style="position:absolute;right:4px;top:4px;background:#b91c1c;color:#fff;padding:2px 7px;font-size:12px" onclick="event.stopPropagation();thDelPhoto(\'' + id + '\')" title="지우기">🗑</button>';
        h += '<div style="font-size:11px;color:#fff;background:rgba(0,0,0,.55);padding:2px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.nm || "사진") + '</div></div>';
      });
      h += '<label style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:3px dashed #94a3b8;border-radius:8px;cursor:pointer;min-height:90px;color:#334155;font-weight:800;font-size:13px;background:#f8fafc">➕ 새 사진 올리기<span style="font-weight:400;font-size:11px;color:#64748b">자동으로 줄여서 보관</span><input type="file" accept="image/*" style="display:none" onchange="thPhoto(this)"></label>';
      h += '</div>';
    }
    if(t.photo){
      var S = function(k, lab, min, max, v, unit, hint){ return '<label style="display:block;margin-top:6px;font-size:13px">' + lab + ' <b id="thV_' + k + '">' + v + unit + '</b>' + (hint ? ' <span class="mut" style="font-size:12px">' + hint + '</span>' : '') + '<input type="range" min="' + min + '" max="' + max + '" value="' + v + '" oninput="document.getElementById(\'thV_' + k + '\').textContent=this.value+\'' + unit + '\';thSet(\'' + k + '\',Number(this.value))" style="width:100%"></label>'; };
      h += '<div style="margin-top:12px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc"><div style="font-size:13px;font-weight:700;margin-bottom:6px">🔍 사진 크기 · 위치 <span class="mut" style="font-weight:400;font-size:12px">— 실제 로그인 화면에도 그대로 적용</span></div>';
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap">' + B(t.pfit === "cover" ? "#1e3a8a" : "#94a3b8", "🖼 화면 꽉 채우기", "TH_ED.pfit=\'cover\';draw()", "padding:5px 10px") + B(t.pfit === "size" ? "#1e3a8a" : "#94a3b8", "🔍 크기 직접 정하기", "TH_ED.pfit=\'size\';draw()", "padding:5px 10px") + '</div>';
      if(t.pfit === "size"){
        h += S("pz", "사진 크기", 20, 200, t.pz, "%", "100% = 화면 너비만큼 · 줄이면 작게");
        h += '<label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px">사진 밖 남는 곳 색 <input type="color" value="' + (t.fill || TH_B.c2) + '" oninput="thSet(\'fill\',this.value)"></label>';
      }
      h += S("px", "가로 위치", 0, 100, t.px, "%", "0 = 왼쪽 · 100 = 오른쪽");
      h += S("py", "세로 위치", 0, 100, t.py, "%", "0 = 위 · 100 = 아래");
      h += '<div style="margin-top:6px">' + B("#64748b", "↺ 크기·위치 처음대로", "TH_ED.pfit=\'cover\';TH_ED.pz=100;TH_ED.px=50;TH_ED.py=50;TH_ED.fill=\'\';draw()", "padding:4px 10px;font-size:12px") + '</div></div>';
    }
    h += '<label style="display:block;margin-top:10px;font-size:13px">사진 어둡게 <b id="thDimV">' + t.dim + '%</b> <span class="mut" style="font-size:12px">— 글씨가 잘 보이게</span><input type="range" min="0" max="85" value="' + t.dim + '" oninput="document.getElementById(\'thDimV\').textContent=this.value+\'%\';thSet(\'dim\',this.value)" style="width:100%"></label>';
    if(!t.photo) h += '<div style="margin-top:6px;font-size:12.5px;color:#92400e">⚠️ 사진을 골라 주세요 (없으면 기본 배경으로 보여요)</div>';
  }
  if(t.mode !== "base") h += '<label style="display:block;margin-top:12px;font-size:13px"><input type="checkbox" ' + (t.pat ? "checked" : "") + ' onchange="thSet(\'pat\',this.checked)"> ' + (TH_B.sky ? '설계도 격자' + (t.mode === "color" ? " · 건물 실루엣" : "") : "점") + ' 무늬 겹치기</label>';
  h += '<div style="font-weight:700;margin:16px 0 6px">② 로그인 화면 한 줄 문구</div><input value="' + esc(t.slogan) + '" maxlength="60" placeholder="' + esc(TH_B.ph) + '" oninput="thSet(\'slogan\',this.value)" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box">';
  h += '<div class="mut" style="font-size:12px;margin-top:3px">제목 아래에 한 줄로 나와요 (비우면 안 나옴)</div>';
  h += '<div style="font-weight:700;margin:16px 0 6px">③ 로그인 상자 (가운데)</div>';
  h += '<div style="display:grid;grid-template-columns:1fr;gap:6px;font-size:13px"><label>이름 (제목) <input value="' + esc(t.title) + '" maxlength="40" placeholder="' + esc(typeof SYS_TITLE !== "undefined" ? SYS_TITLE : "") + '" oninput="thSet(\'title\',this.value)" style="width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box"></label>';
  h += '<label>작은 글 (제목 아래) <input value="' + esc(t.sub) + '" maxlength="60" placeholder="' + esc(typeof SYS_LOGIN_SUB !== "undefined" ? SYS_LOGIN_SUB : "") + '" oninput="thSet(\'sub\',this.value)" style="width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box"></label></div>';
  h += '<div class="mut" style="font-size:12px;margin:3px 0 8px">비우면 원래 이름 그대로</div>';
  h += '<div style="font-size:13px;margin-bottom:4px">상자 색 고르기</div><div style="display:flex;gap:6px;flex-wrap:wrap">';
  [["", "", "흰색 · 기본"], ["", "#1e3a8a", "흰색 · 남색"], ["#f5ecd9", "#7c4a21", "한지 · 갈색"], ["#e8eef7", "#1e3a8a", "옅은 하늘 · 남색"], ["#111827", "#c9a24a", "검정 · 금색"], ["#0f1e3d", "#c9a24a", "남색 · 금색"], ["#3b0d0d", "#e8c37a", "자주 · 금색"], ["#1f2a1f", "#d4b46a", "먹색 · 금색"]].forEach(function(p){
    var on = t.box === p[0] && t.pt === p[1];
    h += '<button class="btn" style="background:' + (p[0] || "#fff") + ';color:' + (p[1] || TH_B.accent) + ';border:2px solid ' + (on ? "#16a34a" : (p[1] || TH_B.accent)) + ';padding:6px 10px;font-weight:800' + (on ? ';box-shadow:0 0 0 3px #bbf7d0' : '') + '" onclick="TH_ED.box=\'' + p[0] + '\';TH_ED.pt=\'' + p[1] + '\';draw()">' + p[2] + '</button>'; });
  h += '</div><div style="display:flex;gap:14px;align-items:center;margin-top:8px;font-size:13px;flex-wrap:wrap"><label>상자 색 직접 <input type="color" value="' + (t.box || "#ffffff") + '" oninput="thSet(\'box\',this.value)"></label><label>글자·단추 색 <input type="color" value="' + (t.pt || TH_B.accent) + '" oninput="thSet(\'pt\',this.value)"></label></div>';
  h += '<label style="display:block;margin-top:8px;font-size:13px">상자 비침 <b id="thOpV">' + (100 - t.boxOp) + '%</b> <span class="mut" style="font-size:12px">— 높이면 뒤 배경이 살짝 비쳐요</span><input type="range" min="0" max="40" value="' + (100 - t.boxOp) + '" oninput="document.getElementById(\'thOpV\').textContent=this.value+\'%\';thSet(\'boxOp\',100-this.value)" style="width:100%"></label>';
  h += '<div style="font-weight:700;margin:16px 0 6px">④ 상단바 · 버튼 색</div><label style="font-size:13px"><input type="checkbox" ' + (t.bar ? "checked" : "") + ' onchange="TH_ED.bar=this.checked?TH_B.bar:\'\';draw()"> 직접 고르기</label>' + (t.bar ? ' <input type="color" value="' + t.bar + '" oninput="thSet(\'bar\',this.value)" style="margin-left:8px">' : ' <span class="mut" style="font-size:12px">(기본색)</span>');
  h += '</div>';
  // 오른쪽: 미리보기
  h += '<div class="card"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px"><b style="margin-right:auto">👀 미리보기</b>' + B("#475569", "➖", "thZoom(-1)", "padding:4px 12px") + '<b id="thZoomV" style="min-width:46px;text-align:center;font-size:13px">' + Math.round(TH_ZOOM * 100) + '%</b>' + B("#475569", "➕", "thZoom(1)", "padding:4px 12px") + B("#1e3a8a", "🖥 크게 보기", "thFull('pc')", "padding:4px 10px") + B("#0f766e", "📱 폰으로 보기", "thFull('phone')", "padding:4px 10px") + '</div><div id="thPrevWrap" style="overflow:auto;max-height:75vh;border-radius:10px;border:1px solid #e5e7eb"><div id="thPrev" style="width:' + Math.round(TH_ZOOM * 100) + '%">' + _thPrevInner(t) + '</div></div><div class="mut" style="font-size:12px;margin-top:6px">저장 전까지는 여기서만 바뀌어요.</div></div>';
  h += '</div>';
  return h;
}
function _thPrevInner(t, opt){
  opt = opt || {};
  var bg = _thBg(t) || (TH_B.sky ? "var(--hsSky) center bottom/100% auto no-repeat,var(--hsGrid),radial-gradient(ellipse at 30% 20%,rgba(255,214,160,.18),transparent 60%),linear-gradient(160deg,#7c4a21,#5b3416 55%,#3b220e)" : "linear-gradient(135deg," + TH_B.c1 + "," + TH_B.c2 + ")");
  var bar = t.bar || TH_B.bar;
  var h = (opt.full ? '<div style="display:flex;flex-direction:column;height:100%">' : '') + '<div style="background:' + (TH_B.sky ? "var(--thGrid)," : "") + bar + ';color:#fff;padding:8px 12px;font-size:13px;font-weight:700;flex:0 0 auto">' + esc((typeof SYS_ICON !== "undefined" ? SYS_ICON : "") + " " + (typeof SYS_NAME !== "undefined" ? SYS_NAME : "")) + ' <span style="font-weight:400;opacity:.8;font-size:11px">— 상단바</span></div>';
  h += '<div style="' + (opt.full ? "flex:1;min-height:0;" : "aspect-ratio:16/9;min-height:190px;") + 'overflow:hidden;display:flex;align-items:center;justify-content:center;background:' + bg + ';background-color:' + _thFill(t) + '">';
  var bxc = t.box ? _thRgb(t.box) : [255, 253, 249], dk = t.box && _thDark(t.box), pc = t.pt || TH_B.accent;
  h += '<div style="background:rgba(' + bxc.join(",") + ',' + (t.boxOp / 100) + ');border-radius:12px;padding:18px 20px;width:' + (opt.full ? 340 : 220) + 'px;max-width:88%;transform:scale(' + (opt.scale || 0.68) + ');box-shadow:0 10px 30px rgba(0,0,0,.35);border-top:5px solid ' + pc + ';text-align:center"><div style="font-weight:800;color:' + (t.pt || TH_B.bar) + ';font-size:14px">' + esc(t.title || (typeof SYS_TITLE !== "undefined" ? SYS_TITLE : (typeof SYS_NAME !== "undefined" ? SYS_NAME : "") + " 관리시스템")) + '</div>';
  h += '<div style="font-size:10px;color:' + (dk ? "#cbd5e1" : "#888") + ';margin:2px 0 6px">' + esc(t.sub || (typeof SYS_LOGIN_SUB !== "undefined" ? SYS_LOGIN_SUB : "로그인 화면")) + '</div>' + (t.slogan ? '<div style="font-size:12px;font-weight:700;color:' + (t.pt || "#92400e") + ';margin-bottom:8px">' + esc(t.slogan) + '</div>' : '');
  var ib = dk ? "background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25)" : "border:1px solid #ddd";
  h += '<div style="height:24px;' + ib + ';border-radius:6px;margin:6px 0"></div><div style="height:24px;' + ib + ';border-radius:6px;margin:6px 0"></div><div style="height:28px;border-radius:6px;background:' + (t.pt || t.bar || TH_B.accent) + ';color:' + (t.pt && !_thDark(t.pt) ? "#111" : "#fff") + ';font-size:12px;font-weight:700;line-height:28px">로그인</div></div></div>' + (opt.full ? '</div>' : '');
  return h;
}
// 🔍 미리보기 확대·축소 + 크게 보기(컴퓨터 화면 / 폰 화면 그대로)
var TH_ZOOM = 1;
function thZoom(d){
  TH_ZOOM = Math.max(0.5, Math.min(3, Math.round((TH_ZOOM + d * 0.25) * 100) / 100));
  var p = document.getElementById("thPrev"), v = document.getElementById("thZoomV");
  if(p){ p.style.width = Math.round(TH_ZOOM * 100) + "%"; p.innerHTML = _thPrevInner(_thNorm(TH_ED)); }
  if(v) v.textContent = Math.round(TH_ZOOM * 100) + "%";
}
function thFull(mode){
  var t = _thNorm(TH_ED), old = document.getElementById("thFullBox"); if(old) old.remove();
  var o = document.createElement("div"); o.id = "thFullBox";
  o.style.cssText = "position:fixed;inset:0;z-index:99999;background:#111;display:flex;flex-direction:column";
  var bar = '<div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#0f172a;color:#fff;flex:0 0 auto"><b style="margin-right:auto">👀 ' + (mode === "phone" ? "📱 폰 화면" : "🖥 컴퓨터 화면") + ' 미리보기 <span style="font-weight:400;font-size:12px;opacity:.75">(저장 전)</span></b>'
    + '<button class="btn" style="background:' + (mode === "pc" ? "#2563eb" : "#475569") + ';color:#fff" onclick="thFull(\'pc\')">🖥 컴퓨터</button><button class="btn" style="background:' + (mode === "phone" ? "#2563eb" : "#475569") + ';color:#fff" onclick="thFull(\'phone\')">📱 폰</button>'
    + '<button class="btn" style="background:#b91c1c;color:#fff" onclick="document.getElementById(\'thFullBox\').remove()">✕ 닫기</button></div>';
  var stage = mode === "phone"
    ? '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto"><div style="width:min(390px,92vw);aspect-ratio:9/19.5;max-height:calc(100vh - 90px);border:10px solid #000;border-radius:34px;overflow:hidden;box-shadow:0 0 0 2px #444">' + _thPrevInner(t, { full: true, scale: 0.86 }) + '</div></div>'
    : '<div style="flex:1;overflow:hidden">' + _thPrevInner(t, { full: true, scale: 1 }) + '</div>';
  o.innerHTML = bar + stage; document.body.appendChild(o);
  o.addEventListener("keydown", function(e){ if(e.key === "Escape") o.remove(); });
}
function thSet(k, v){ TH_ED[k] = v; var p = document.getElementById("thPrev"); if(p) p.innerHTML = _thPrevInner(_thNorm(TH_ED)); }
function thPhoto(inp){
  var f = inp.files && inp.files[0]; if(!f) return;
  var rd = new FileReader();
  rd.onload = function(){
    var img = new Image();
    img.onload = function(){
      // 큰 모니터에서도 선명하게: 가로 2560까지, WebP(되는 기기) 고화질 → 안 되면 JPEG
      var W = 2560, r = Math.min(1, W / img.width), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
      var g2 = cv.getContext("2d"); g2.imageSmoothingQuality = "high"; g2.drawImage(img, 0, 0, cv.width, cv.height);
      var MAX = 1300000, q = 0.92, d = cv.toDataURL("image/webp", q), fmt = d.indexOf("data:image/webp") === 0 ? "image/webp" : "image/jpeg";
      if(fmt !== "image/webp") d = cv.toDataURL(fmt, q);
      while(d.length > MAX && q > 0.5){ q -= 0.06; d = cv.toDataURL(fmt, q); }
      // 원본이 이미 알맞은 크기면 다시 압축하지 않고 그대로 (화질 그대로)
      if(r === 1 && /^data:image\/(jpeg|png|webp);base64,/.test(rd.result) && rd.result.length <= MAX) d = rd.result;
      // 작은 미리보기 (목록용)
      var tw = 320, tr = tw / cv.width, tc = document.createElement("canvas"); tc.width = tw; tc.height = Math.round(cv.height * tr);
      tc.getContext("2d").drawImage(cv, 0, 0, tc.width, tc.height);
      var id = "p" + Date.now().toString(36), meta = { thumb: tc.toDataURL("image/jpeg", 0.7), nm: String(f.name || "사진").replace(/\.[^.]+$/, "").slice(0, 40), at: new Date().toISOString() };
      showLoading("사진 보관하는 중...");
      Promise.all([fbDb.ref("/phData/_themeFull/" + id).set(d), fbDb.ref("/phData/_theme/" + id).set(meta)]).then(function(){
        hideLoading(); TH_LIB = TH_LIB || {}; TH_LIB[id] = meta; TH_FULL[id] = d;
        TH_ED.photo = d; TH_ED.photoId = id; draw(); toast("🖼 사진 등록했어요 (" + Math.round(d.length / 1024) + "KB) — 💾 저장을 눌러야 로그인 화면에 적용돼요");
      }).catch(function(e){ hideLoading(); toast("사진 보관 실패: " + e.message, true); });
    };
    img.onerror = function(){ toast("이 사진은 열 수 없어요 — 다른 사진(jpg/png)으로 해 주세요", true); };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
}
function thSave(){
  var t = _thNorm(TH_ED);
  if(t.mode === "photo" && !t.photo) return toast("사진을 먼저 골라 주세요", true);
  if(t.mode !== "photo") t.photo = "";   // 안 쓰는 사진은 지워서 가볍게
  showLoading("저장 중...");
  fbDb.ref("/main/PubTheme").set(t).then(function(){
    hideLoading(); TH = t; TH_ED = _thNorm(t); _thApply(t);
    try { localStorage.setItem(TH_KEY, JSON.stringify(t)); } catch(e){}
    toast("🎨 저장했어요 — 모두에게 적용돼요"); draw();
  }).catch(function(e){ hideLoading(); toast("저장 실패: " + e.message, true); });
}
// 🖼 사진 보관함 — /phData/_theme/{id} = {thumb, nm, at} (목록용 작은 그림) · /phData/_themeFull/{id} = 큰 사진
//   (/main 은 모두가 늘 받아 오는 곳이라 무거운 사진은 여기 따로 둠)
var TH_LIB = null, TH_FULL = {}, TH_LIB_LOADING = false;
function _thLibLoad(){
  if(TH_LIB_LOADING) return; TH_LIB_LOADING = true;
  fbDb.ref("/phData/_theme").once("value").then(function(s){
    TH_LIB = s.val() || {}; TH_LIB_LOADING = false;
    // 예전에 저장해 둔 지금 사진(보관함에 없는 것)은 보관함에도 넣어 둠
    if(TH && TH.photo && (!TH.photoId || !TH_LIB[TH.photoId])){
      var id = "p" + Date.now().toString(36), img = new Image();
      img.onload = function(){
        var tc = document.createElement("canvas"); tc.width = 320; tc.height = Math.round(img.height * 320 / img.width); tc.getContext("2d").drawImage(img, 0, 0, tc.width, tc.height);
        var meta = { thumb: tc.toDataURL("image/jpeg", 0.7), nm: "지금 쓰는 사진", at: new Date().toISOString() };
        Promise.all([fbDb.ref("/phData/_themeFull/" + id).set(TH.photo), fbDb.ref("/phData/_theme/" + id).set(meta)]).then(function(){
          TH_LIB[id] = meta; TH_FULL[id] = TH.photo; TH.photoId = id; if(TH_ED && TH_ED.photo === TH.photo) TH_ED.photoId = id;
          fbDb.ref("/main/PubTheme/photoId").set(id).catch(function(){});
          if(CTAB === "theme") draw();
        }).catch(function(){});
      };
      img.src = TH.photo;
    }
    if(CTAB === "theme") draw();
  }).catch(function(e){ TH_LIB_LOADING = false; TH_LIB = {}; toast("사진 목록을 못 읽었어요: " + e.message, true); });
}
function thUse(id){
  var go = function(d){ TH_FULL[id] = d; TH_ED.photo = d; TH_ED.photoId = id; draw(); toast("🖼 골랐어요 — 💾 저장을 눌러야 로그인 화면에 적용돼요"); };
  if(TH_FULL[id]) return go(TH_FULL[id]);
  showLoading("사진 불러오는 중...");
  fbDb.ref("/phData/_themeFull/" + id).once("value").then(function(s){ hideLoading(); if(!s.val()) return toast("사진을 찾을 수 없어요", true); go(s.val()); })
    .catch(function(e){ hideLoading(); toast("불러오기 실패: " + e.message, true); });
}
function thDelPhoto(id){
  var inUse = TH && TH.photoId === id && TH.mode === "photo";
  if(!confirm((TH_LIB[id] && TH_LIB[id].nm ? "「" + TH_LIB[id].nm + "」 " : "") + "사진을 지울까요?" + (inUse ? "\n\n⚠️ 지금 로그인 화면에 쓰는 사진이에요. 지워도 다른 걸 골라 저장하기 전까지는 그대로 보여요." : ""))) return;
  Promise.all([fbDb.ref("/phData/_theme/" + id).remove(), fbDb.ref("/phData/_themeFull/" + id).remove()]).then(function(){
    delete TH_LIB[id]; delete TH_FULL[id];
    if(TH_ED && TH_ED.photoId === id && !inUse){ TH_ED.photoId = ""; TH_ED.photo = ""; }
    toast("🗑 사진 지웠어요"); draw();
  }).catch(function(e){ toast("지우기 실패: " + e.message, true); });
}
function thReset(){ if(!confirm("처음 화면 색으로 되돌릴까요? (저장을 눌러야 적용돼요)")) return; TH_ED = _thNorm({}); draw(); }
