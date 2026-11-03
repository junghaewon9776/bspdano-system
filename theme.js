// ============================================================================
// 🎨 화면 꾸미기 — 로그인 화면 배경(기본 무늬 / 색 / 사진) · 문구 · 상단바 색
//   저장: /main/PubTheme  (로그인 전에도 보여야 해서 누구나 읽기, 쓰기는 관리자만 — 보안 규칙)
//   무늬(설계도 격자 --hsGrid, 건물·크레인 --hsSky)는 한솔 index.html :root 에 있음 — 없는 시스템은 아래 점무늬
//   시스템마다 기본색: theme.js 앞에서 var TH_BASE = {c1,c2,bar,accent,label,ph} (없으면 한솔 갈색)
// ============================================================================
var TH_B = Object.assign({ c1: "#7c4a21", c2: "#3b220e", bar: "#5b3416", accent: "#7c4a21", label: "🏗️ 기본 (갈색 건축 무늬)", ph: "예: 정직한 시공, 믿을 수 있는 한솔건축", sky: true }, typeof TH_BASE !== "undefined" ? TH_BASE : {});
var TH_KEY = (typeof SEC_SYS !== "undefined" && SEC_SYS && SEC_SYS !== "hansol") ? "th_" + SEC_SYS : "hs_theme";   // 같은 주소(github.io)라 시스템마다 따로
var TH_DEF = { mode: "base", c1: TH_B.c1, c2: TH_B.c2, pat: true, photo: "", dim: 35, slogan: "", bar: "" };
(function(){ var st = document.createElement("style"); st.textContent = ":root{--thGrid:var(--hsGrid,url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%3E%3Ccircle%20cx=%272%27%20cy=%272%27%20r=%271.3%27%20fill=%27rgba%28255,255,255,.14%29%27/%3E%3C/svg%3E));--thSky:var(--hsSky,none)}"; document.head.appendChild(st); })();
var TH = null, TH_ED = null;

function _thOk(c){ return /^#[0-9a-f]{6}$/i.test(String(c || "")); }
function _thNorm(t){
  var o = Object.assign({}, TH_DEF, t || {});
  if(["base", "color", "photo"].indexOf(o.mode) < 0) o.mode = "base";
  if(!_thOk(o.c1)) o.c1 = TH_DEF.c1; if(!_thOk(o.c2)) o.c2 = TH_DEF.c2; if(o.bar && !_thOk(o.bar)) o.bar = "";
  if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(String(o.photo || ""))) o.photo = "";
  o.dim = Math.max(0, Math.min(85, Number(o.dim) || 0)); o.pat = o.pat !== false;
  o.slogan = String(o.slogan || "").slice(0, 60);
  return o;
}
// 로그인 배경 (base 는 index.html 기본 CSS 그대로 → "")
function _thBg(t){
  var pat = t.pat;
  if(t.mode === "color") return (pat ? (TH_B.sky ? "var(--thSky) center bottom/100% auto no-repeat," : "") + "var(--thGrid)," : "") + "linear-gradient(160deg," + t.c1 + "," + t.c2 + ")";
  if(t.mode === "photo" && t.photo){ var d = (t.dim / 100).toFixed(2); return (pat ? "var(--thGrid)," : "") + "linear-gradient(rgba(0,0,0," + d + "),rgba(0,0,0," + d + ")),url(" + t.photo + ") center/cover no-repeat"; }
  return "";
}
function _thApply(t){
  t = _thNorm(t);
  var css = "", bg = _thBg(t);
  if(bg) css += "#loginPage{background:" + bg + "!important;background-color:" + TH_B.c2 + "!important}";
  if(t.bar) css += ".topBar{background:var(--thGrid)," + t.bar + "!important}.cat-btn.on{background:" + t.bar + "!important}#loginBtn{background:" + t.bar + "!important}";
  var st = document.getElementById("thStyle");
  if(!st){ st = document.createElement("style"); st.id = "thStyle"; document.head.appendChild(st); }
  st.textContent = css;
  var box = document.getElementById("loginBox"), sl = document.getElementById("lgSlogan");
  if(box && !sl){ sl = document.createElement("div"); sl.id = "lgSlogan"; sl.style.cssText = "text-align:center;font-size:14px;font-weight:700;color:#92400e;margin:-14px 0 18px;letter-spacing:.5px"; var p = box.querySelector("p"); if(p) p.parentNode.insertBefore(sl, p.nextSibling); }
  if(sl){ sl.textContent = t.slogan || ""; sl.style.display = t.slogan ? "" : "none"; }
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
    h += '<div style="margin-top:12px;font-size:13px"><input type="file" accept="image/*" onchange="thPhoto(this)"> <span class="mut" style="font-size:12px">현장·회사 사진 (자동으로 줄여서 저장)</span></div>';
    h += '<label style="display:block;margin-top:10px;font-size:13px">사진 어둡게 <b id="thDimV">' + t.dim + '%</b> <span class="mut" style="font-size:12px">— 글씨가 잘 보이게</span><input type="range" min="0" max="85" value="' + t.dim + '" oninput="document.getElementById(\'thDimV\').textContent=this.value+\'%\';thSet(\'dim\',this.value)" style="width:100%"></label>';
    if(!t.photo) h += '<div style="margin-top:6px;font-size:12.5px;color:#92400e">⚠️ 사진을 골라 주세요 (없으면 기본 배경으로 보여요)</div>';
  }
  if(t.mode !== "base") h += '<label style="display:block;margin-top:12px;font-size:13px"><input type="checkbox" ' + (t.pat ? "checked" : "") + ' onchange="thSet(\'pat\',this.checked)"> ' + (TH_B.sky ? '설계도 격자' + (t.mode === "color" ? " · 건물 실루엣" : "") : "점") + ' 무늬 겹치기</label>';
  h += '<div style="font-weight:700;margin:16px 0 6px">② 로그인 화면 문구</div><input value="' + esc(t.slogan) + '" maxlength="60" placeholder="' + esc(TH_B.ph) + '" oninput="thSet(\'slogan\',this.value)" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box">';
  h += '<div class="mut" style="font-size:12px;margin-top:3px">제목 아래에 한 줄로 나와요 (비우면 안 나옴)</div>';
  h += '<div style="font-weight:700;margin:16px 0 6px">③ 상단바 · 버튼 색</div><label style="font-size:13px"><input type="checkbox" ' + (t.bar ? "checked" : "") + ' onchange="TH_ED.bar=this.checked?TH_B.bar:\'\';draw()"> 직접 고르기</label>' + (t.bar ? ' <input type="color" value="' + t.bar + '" oninput="thSet(\'bar\',this.value)" style="margin-left:8px">' : ' <span class="mut" style="font-size:12px">(기본색)</span>');
  h += '</div>';
  // 오른쪽: 미리보기
  h += '<div class="card"><div style="font-weight:700;margin-bottom:8px">👀 미리보기</div><div id="thPrev" style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">' + _thPrevInner(t) + '</div><div class="mut" style="font-size:12px;margin-top:6px">저장 전까지는 여기서만 바뀌어요.</div></div>';
  h += '</div>';
  return h;
}
function _thPrevInner(t){
  var bg = _thBg(t) || (TH_B.sky ? "var(--hsSky) center bottom/100% auto no-repeat,var(--hsGrid),radial-gradient(ellipse at 30% 20%,rgba(255,214,160,.18),transparent 60%),linear-gradient(160deg,#7c4a21,#5b3416 55%,#3b220e)" : "linear-gradient(135deg," + TH_B.c1 + "," + TH_B.c2 + ")");
  var bar = t.bar || TH_B.bar;
  var h = '<div style="background:' + (TH_B.sky ? "var(--thGrid)," : "") + bar + ';color:#fff;padding:8px 12px;font-size:13px;font-weight:700">' + esc((typeof SYS_ICON !== "undefined" ? SYS_ICON : "") + " " + (typeof SYS_NAME !== "undefined" ? SYS_NAME : "")) + ' <span style="font-weight:400;opacity:.8;font-size:11px">— 상단바</span></div>';
  h += '<div style="height:300px;display:flex;align-items:center;justify-content:center;background:' + bg + ';background-color:' + TH_B.c2 + '">';
  h += '<div style="background:#fffdf9;border-radius:12px;padding:18px 20px;width:220px;box-shadow:0 10px 30px rgba(0,0,0,.35);border-top:5px solid ' + TH_B.accent + ';text-align:center"><div style="font-weight:800;color:' + TH_B.bar + ';font-size:14px">' + esc((typeof SYS_ICON !== "undefined" ? SYS_ICON : "") + " " + (typeof SYS_NAME !== "undefined" ? SYS_NAME : "") + " 관리시스템") + '</div>';
  h += '<div style="font-size:10px;color:#888;margin:2px 0 6px">로그인 화면</div>' + (t.slogan ? '<div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px">' + esc(t.slogan) + '</div>' : '');
  h += '<div style="height:24px;border:1px solid #ddd;border-radius:6px;margin:6px 0"></div><div style="height:24px;border:1px solid #ddd;border-radius:6px;margin:6px 0"></div><div style="height:28px;border-radius:6px;background:' + (t.bar || TH_B.accent) + ';color:#fff;font-size:12px;font-weight:700;line-height:28px">로그인</div></div></div>';
  return h;
}
function thSet(k, v){ TH_ED[k] = v; var p = document.getElementById("thPrev"); if(p) p.innerHTML = _thPrevInner(_thNorm(TH_ED)); }
function thPhoto(inp){
  var f = inp.files && inp.files[0]; if(!f) return;
  var rd = new FileReader();
  rd.onload = function(){
    var img = new Image();
    img.onload = function(){
      var W = 1600, r = Math.min(1, W / img.width), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      var q = 0.78, d = cv.toDataURL("image/jpeg", q);
      while(d.length > 600000 && q > 0.35){ q -= 0.1; d = cv.toDataURL("image/jpeg", q); }   // DB 에 넣기 좋게 600KB 아래로
      TH_ED.photo = d; draw(); toast("사진 넣었어요 (" + Math.round(d.length / 1024) + "KB) — 저장을 눌러야 적용돼요");
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
function thReset(){ if(!confirm("처음 화면 색으로 되돌릴까요? (저장을 눌러야 적용돼요)")) return; TH_ED = _thNorm({}); draw(); }
