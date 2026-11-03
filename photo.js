// ============================================================================
// 📷 현장사진 · 사진대지 · 결과보고서 — 공사별
//   /phData/{공사}/meta/{id}  = { st(구분), loc(위치), cap(설명), dt, t(작은 미리보기), at, by }
//   /phData/{공사}/full/{id}  = 원본(줄인 jpeg dataURL) — 볼 때·인쇄할 때만 받음
//   /phData/{공사}/rep        = 사진대지·결과보고서 설정 { lay, rows:[{loc,cap,a,b,c}], title, ... }
//   ※ /evtData/{공사} 는 공사 고를 때 통째로 받아서, 무거운 사진은 따로 둠
// ============================================================================
var PH = null, PH_EVT = "", PH_LOADING = false, PH_VIEW = "pool", PH_FILT = "", PH_UPST = "site", PH_REP = null;
var PH_ST = [["site", "현장"], ["pre", "공사 전"], ["mid", "공사 중"], ["post", "공사 후"], ["plan", "시공 계획"], ["etc", "기타"]];
var PH_STC = { site: "#0f766e", pre: "#b45309", mid: "#2563eb", post: "#16a34a", plan: "#7c3aed", etc: "#475569" };
var PH_LAY = { c3: { n: "전·중·후 비교", cols: [["a", "공사 전"], ["b", "공사 중"], ["c", "공사 후"]] }, c2: { n: "전·후 비교", cols: [["a", "공사 전"], ["c", "공사 후"]] }, one: { n: "사진 차례로", cols: [["a", "사진"]] }, none: { n: "사진 없이", cols: [] } };
var PH_FULL = {};   // 받아 둔 원본

function _phStN(k){ for(var i = 0; i < PH_ST.length; i++) if(PH_ST[i][0] === k) return PH_ST[i][1]; return "기타"; }
function _phRef(p){ return fbDb.ref("/phData/" + _estEvt() + (p ? "/" + p : "")); }
function _phIds(st){ return Object.keys((PH && PH.meta) || {}).filter(function(k){ return !st || PH.meta[k].st === st; }).sort(function(a, b){ var x = PH.meta[a], y = PH.meta[b]; return String(x.dt || "").localeCompare(String(y.dt || "")) || String(x.at || "").localeCompare(String(y.at || "")); }); }

function _phLoad(){
  var ev = _estEvt(); if(!ev || PH_LOADING) return;
  PH_LOADING = true;
  if(EST_EVT !== ev) _estLoad();   // 발주처·계약·업체 정보 (결과보고서 표지용)
  Promise.all([_phRef("meta").once("value"), _phRef("rep").once("value")]).then(function(r){
    PH_LOADING = false; PH = { meta: r[0].val() || {} }; PH_REP = r[1].val() || null; PH_EVT = ev; PH_FULL = {};
    if(CTAB === "photo" || CTAB === "easy") draw();
  }).catch(function(e){ PH_LOADING = false; toast("사진 불러오기 실패: " + e.message, true); });
}
function _phFull(ids){
  ids = ids.filter(function(k){ return k && !PH_FULL[k]; });
  return Promise.all(ids.map(function(k){ return _phRef("full/" + k).once("value").then(function(s){ PH_FULL[k] = s.val() || ""; }); }));
}

// ── 사진 줄이기 + 올리기 ──
function _phShrink(file, W, q){
  return new Promise(function(res, rej){
    var rd = new FileReader();
    rd.onload = function(){
      var img = new Image();
      img.onload = function(){
        var r = Math.min(1, W / Math.max(img.width, img.height)), cv = document.createElement("canvas");
        cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        var x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL("image/jpeg", q));
      };
      img.onerror = function(){ rej(new Error((file.name || "사진") + " — 열 수 없는 사진이에요")); };
      img.src = rd.result;
    };
    rd.onerror = function(){ rej(new Error("파일을 읽지 못했어요")); };
    rd.readAsDataURL(file);
  });
}
function _phDate(f){ var d = f.lastModified ? new Date(f.lastModified) : new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
// how: "cam"(바로 찍기) | "album"(사진첩, 여러 장)  → cb(올린 id 목록)
function phPick(how, st, cb, one){
  var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  if(how === "cam") inp.setAttribute("capture", "environment"); else if(!one) inp.multiple = true;
  inp.style.display = "none"; document.body.appendChild(inp);
  inp.onchange = function(){
    var fs = Array.prototype.slice.call(inp.files || []); inp.remove(); if(!fs.length) return;
    var ids = [], i = 0, fail = 0;
    var next = function(){
      if(i >= fs.length){ hideLoading(); toast("📷 " + ids.length + "장 올렸어요" + (fail ? " (" + fail + "장 실패)" : "")); if(cb) cb(ids); else draw(); return; }
      var f = fs[i++]; showLoading("사진 올리는 중... (" + i + "/" + fs.length + ")");
      Promise.all([_phShrink(f, 1600, 0.75), _phShrink(f, 360, 0.6)]).then(function(r){
        var ref = _phRef("meta").push(), m = { st: st || "site", loc: "", cap: "", dt: _phDate(f), t: r[1], at: new Date().toISOString(), by: CID || "" };
        return Promise.all([ref.set(m), _phRef("full/" + ref.key).set(r[0])]).then(function(){ PH.meta[ref.key] = m; PH_FULL[ref.key] = r[0]; ids.push(ref.key); });
      }).catch(function(e){ fail++; toast(e.message, true); }).then(next);
    };
    next();
  };
  inp.click();
}

// ── 화면 ──
function dPhoto(){
  if(!CUR_EVT) return '<div class="card">먼저 위에서 공사를 골라 주세요.</div>';
  if(PH_EVT !== _estEvt() || !PH){ _phLoad(); return '<div class="card"><div class="mut">📡 사진 불러오는 중...</div></div>'; }
  var B = _estBtn, h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<div><strong style="font-size:18px">📷 현장사진</strong> <span class="mut" style="font-size:12px;margin-left:6px">' + esc(CUR_EVT.nm || "") + ' · ' + _phIds().length + '장</span></div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select onchange="PH_UPST=this.value" style="padding:7px;border:1px solid #cbd5e1;border-radius:6px;font-weight:700">';
  PH_ST.forEach(function(s){ h += '<option value="' + s[0] + '"' + (s[0] === PH_UPST ? " selected" : "") + '>' + s[1] + ' 사진으로</option>'; });
  h += '</select>' + B("#0f766e", "📷 사진 찍기", "phPick('cam',PH_UPST)") + B("#2563eb", "🖼 사진첩에서 올리기", "phPick('album',PH_UPST)") + '</div></div>';
  h += '<div style="display:flex;gap:6px;margin-top:10px">';
  [["pool", "📷 사진 모음"], ["rep", "📑 사진대지 · 결과보고서"]].forEach(function(v){ h += '<button class="btn" style="background:' + (PH_VIEW === v[0] ? "#7c4a21" : "#e7e5e4") + ';color:' + (PH_VIEW === v[0] ? "#fff" : "#292524") + ';padding:8px 16px;font-size:13px" onclick="PH_VIEW=\'' + v[0] + '\';draw()">' + v[1] + '</button>'; });
  h += '</div></div>';
  return h + (PH_VIEW === "rep" ? _phRepView() : _phPoolView());
}

function _phThumb(k, size){
  var m = PH.meta[k]; if(!m) return '<div style="width:' + size + 'px;height:' + Math.round(size * .75) + 'px;background:#f1f5f9;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px">지워진 사진</div>';
  return '<img src="' + m.t + '" onclick="phView(\'' + k + '\')" style="width:' + size + 'px;height:' + Math.round(size * .75) + 'px;object-fit:cover;border-radius:6px;cursor:zoom-in;display:block">';
}
function _phPoolView(){
  var all = _phIds(), cnt = {};
  all.forEach(function(k){ var s = PH.meta[k].st; cnt[s] = (cnt[s] || 0) + 1; });
  var h = '<div class="card" style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
  h += '<button class="btn" style="background:' + (!PH_FILT ? "#292524" : "#e7e5e4") + ';color:' + (!PH_FILT ? "#fff" : "#292524") + '" onclick="PH_FILT=\'\';draw()">전체 ' + all.length + '</button>';
  PH_ST.forEach(function(s){ var on = PH_FILT === s[0]; h += '<button class="btn" style="background:' + (on ? PH_STC[s[0]] : "#fff") + ';color:' + (on ? "#fff" : PH_STC[s[0]]) + ';border:2px solid ' + PH_STC[s[0]] + '" onclick="PH_FILT=\'' + s[0] + '\';draw()">' + s[1] + ' ' + (cnt[s[0]] || 0) + '</button>'; });
  h += '<span style="margin-left:auto;display:flex;gap:6px;align-items:center;font-size:13px">체크한 사진 <select id="phBulkSt" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px">';
  PH_ST.forEach(function(s){ h += '<option value="' + s[0] + '">' + s[1] + '</option>'; });
  h += '</select>' + _estBtn("#2563eb", "구분 바꾸기", "phBulkSt()") + _estBtn("#dc2626", "삭제", "phBulkDel()") + '</span></div>';
  var ids = _phIds(PH_FILT);
  h += '<div class="card"><div class="mut" style="font-size:12px;margin-bottom:8px">사진을 누르면 크게 보여요 · 체크칸은 <b>Shift</b>를 누르고 누르면 사이가 한 번에 체크돼요</div>';
  if(!ids.length) h += '<div style="padding:40px;text-align:center;color:#94a3b8">아직 사진이 없어요 — 위에서 <b>📷 사진 찍기</b> 또는 <b>🖼 사진첩에서 올리기</b></div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">';
  ids.forEach(function(k){ var m = PH.meta[k];
    h += '<div style="border:2px solid ' + PH_STC[m.st] + ';border-radius:8px;padding:6px;background:#fff"><div style="position:relative">' + _phThumb(k, 174) + '<label style="position:absolute;top:4px;left:4px;background:#fff;border-radius:4px;padding:2px 4px"><input type="checkbox" class="phChk" value="' + k + '"></label>';
    h += '<span style="position:absolute;top:4px;right:4px;background:' + PH_STC[m.st] + ';color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:9px">' + _phStN(m.st) + '</span></div>';
    h += '<div style="display:flex;gap:4px;margin-top:5px"><select onchange="phMeta(\'' + k + '\',\'st\',this.value);draw()" style="flex:1;padding:4px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px">';
    PH_ST.forEach(function(s){ h += '<option value="' + s[0] + '"' + (s[0] === m.st ? " selected" : "") + '>' + s[1] + '</option>'; });
    h += '</select><input value="' + esc(m.dt || "") + '" onchange="phMeta(\'' + k + '\',\'dt\',this.value)" style="width:86px;padding:4px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px"></div>';
    h += '<input value="' + esc(m.loc || "") + '" placeholder="위치 (예: 2층 화장실)" onchange="phMeta(\'' + k + '\',\'loc\',this.value)" style="width:100%;margin-top:4px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;box-sizing:border-box">';
    h += '<input value="' + esc(m.cap || "") + '" placeholder="설명 (예: 타일 들뜸)" onchange="phMeta(\'' + k + '\',\'cap\',this.value)" style="width:100%;margin-top:4px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;box-sizing:border-box"></div>';
  });
  h += '</div></div>';
  return h;
}
function phMeta(k, f, v){ PH.meta[k][f] = v; _phRef("meta/" + k + "/" + f).set(v).catch(function(e){ toast("저장 실패: " + e.message, true); }); }
function _phChecked(){ return Array.prototype.map.call(document.querySelectorAll("input.phChk:checked"), function(c){ return c.value; }); }
function phBulkSt(){
  var ids = _phChecked(), st = document.getElementById("phBulkSt").value; if(!ids.length) return toast("사진을 체크해 주세요", true);
  var u = {}; ids.forEach(function(k){ u["meta/" + k + "/st"] = st; PH.meta[k].st = st; });
  _phRef().update(u).then(function(){ toast(ids.length + "장 → " + _phStN(st)); draw(); }).catch(function(e){ toast("실패: " + e.message, true); });
}
function phBulkDel(){
  var ids = _phChecked(); if(!ids.length) return toast("사진을 체크해 주세요", true);
  if(!confirm("체크한 사진 " + ids.length + "장을 지울까요? (사진대지·견적서에 넣어 둔 것도 빠져요)")) return;
  var u = {}; ids.forEach(function(k){ u["meta/" + k] = null; u["full/" + k] = null; });
  showLoading("지우는 중...");
  _phRef().update(u).then(function(){ hideLoading(); ids.forEach(function(k){ delete PH.meta[k]; delete PH_FULL[k]; }); toast(ids.length + "장 지웠어요"); draw(); }).catch(function(e){ hideLoading(); toast("실패: " + e.message, true); });
}
function phView(k){
  var m = PH.meta[k]; if(!m) return;
  showLoading("사진 여는 중...");
  _phFull([k]).then(function(){
    hideLoading();
    openPopup('<div style="text-align:right;margin-bottom:6px">' + _estBtn("#475569", "닫기", "closePopup()") + '</div><img src="' + (PH_FULL[k] || m.t) + '" style="width:100%;border-radius:8px"><div style="margin-top:6px;font-size:13px"><b>' + _phStN(m.st) + '</b> · ' + esc(m.dt || "") + (m.loc ? ' · ' + esc(m.loc) : '') + (m.cap ? ' — ' + esc(m.cap) : '') + '</div>', 900);
  });
}

// ── 사진 고르기 창 (현장사진에서 / 사진첩 / 찍기) → cb(id) ──
var PH_PICK_CB = null, PH_PICK_F = "";
function phChoose(st, cb){
  PH_PICK_CB = cb; PH_PICK_F = PH_PICK_F || "";
  var h = '<h3 style="margin:0 0 8px">📷 사진 고르기 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + _estBtn("#0f766e", "📷 지금 찍기", "closePopup();phPick('cam','" + st + "',function(ids){PH_PICK_CB(ids[0]);},1)") + _estBtn("#2563eb", "🖼 사진첩에서", "closePopup();phPick('album','" + st + "',function(ids){PH_PICK_CB(ids[0]);},1)") + '</div>';
  h += '<div style="font-weight:700;font-size:13px;margin-bottom:6px">또는 올려 둔 현장사진에서 고르기</div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">';
  h += '<button class="btn" style="background:' + (!PH_PICK_F ? "#292524" : "#e7e5e4") + ';color:' + (!PH_PICK_F ? "#fff" : "#292524") + ';padding:4px 10px" onclick="PH_PICK_F=\'\';phChoose(\'' + st + '\',PH_PICK_CB)">전체</button>';
  PH_ST.forEach(function(s){ var on = PH_PICK_F === s[0]; h += '<button class="btn" style="background:' + (on ? PH_STC[s[0]] : "#fff") + ';color:' + (on ? "#fff" : PH_STC[s[0]]) + ';border:2px solid ' + PH_STC[s[0]] + ';padding:3px 9px" onclick="PH_PICK_F=\'' + s[0] + '\';phChoose(\'' + st + '\',PH_PICK_CB)">' + s[1] + '</button>'; });
  h += '</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;max-height:55vh;overflow:auto">';
  var ids = _phIds(PH_PICK_F);
  if(!ids.length) h += '<div class="mut" style="padding:20px">사진이 없어요</div>';
  ids.forEach(function(k){ var m = PH.meta[k]; h += '<div onclick="closePopup();PH_PICK_CB(\'' + k + '\')" style="cursor:pointer;border:2px solid ' + PH_STC[m.st] + ';border-radius:6px;padding:3px"><img src="' + m.t + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;display:block"><div style="font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _phStN(m.st) + (m.loc ? ' · ' + esc(m.loc) : '') + '</div></div>'; });
  h += '</div>';
  openPopup(h, 760);
}

// ── 📑 사진대지 · 결과보고서 ──
function _phCtEst(){   // 계약 견적 → 없으면 승인 → 없으면 최근
  var ids = Object.keys(EST || {}); if(!ids.length) return null;
  var pick = function(st){ return ids.filter(function(k){ return EST[k].st === st; }).sort(function(a, b){ return String(EST[b].dt).localeCompare(String(EST[a].dt)); })[0]; };
  var k = pick("계약") || pick("승인") || ids.sort(function(a, b){ return String(EST[b].dt).localeCompare(String(EST[a].dt)); })[0];
  return k ? { id: k, e: EST[k] } : null;
}
function _phRepDef(){
  var c = _phCtEst(), e = c ? c.e : {}, ct = e.ct || {};
  return { lay: "c2", cover: true, title: "공사 결과 보고서", sup: e.sup || _estDefComp(), cl: (e.cl && e.cl.nm) || "", site: e.site || "", st: ct.st || "", en: ct.en || "", sum: "", showAm: !!c, estId: c ? c.id : "", dt: todayKST(), rows: [] };
}
function _phRep(){ if(!PH_REP) PH_REP = _phRepDef(); PH_REP.rows = PH_REP.rows || []; return PH_REP; }
function _phRepView(){
  var r = _phRep(), L = PH_LAY[r.lay] || PH_LAY.c2, B = _estBtn;
  var h = '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><strong>📑 사진대지 · 결과보고서</strong><div style="display:flex;gap:6px">' + B("#16a34a", "💾 저장", "phRepSave()") + B("#7c4a21", "🖨️ 인쇄 / PDF", "phRepPrint()") + '</div></div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">';
  Object.keys(PH_LAY).forEach(function(k){ var on = r.lay === k; h += '<label style="display:inline-flex;align-items:center;gap:5px;padding:8px 12px;border:2px solid ' + (on ? "#7c4a21" : "#e5e7eb") + ';border-radius:8px;cursor:pointer;background:' + (on ? "#fbf3e8" : "#fff") + ';font-weight:700;font-size:13px"><input type="radio" name="phLay" ' + (on ? "checked" : "") + ' onchange="_phRep().lay=\'' + k + '\';draw()"> ' + PH_LAY[k].n + '</label>'; });
  h += '</div></div>';
  // 표지
  var F = function(lb, k, ph){ return '<label style="font-size:13px">' + lb + '<input value="' + esc(r[k] || "") + '" placeholder="' + esc(ph || "") + '" onchange="_phRep().' + k + '=this.value" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box"></label>'; };
  h += '<div class="card" style="margin-bottom:10px"><label style="font-size:13px;font-weight:700"><input type="checkbox" ' + (r.cover || r.lay === "none" ? "checked" : "") + (r.lay === "none" ? " disabled" : "") + ' onchange="_phRep().cover=this.checked;draw()"> 📄 표지(공사 개요) 넣기</label>' + (r.lay === "none" ? ' <span class="mut" style="font-size:12px">— 사진 없이는 표지만 나가요</span>' : '');
  if(r.cover || r.lay === "none"){
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:8px">' + F("제목", "title") + F("받는 곳(발주처)", "cl") + F("현장 위치", "site") + F("착공일", "st", "2026-11-10") + F("준공일", "en", "2026-12-20") + F("보고 날짜", "dt");
    h += '<label style="font-size:13px">시공사 (우리 쪽)<select onchange="_phRep().sup=this.value" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:5px">';
    _estCompIds().forEach(function(k){ h += '<option value="' + k + '"' + (k === r.sup ? " selected" : "") + '>' + esc(COMPS[k].nm) + '</option>'; });
    h += '</select></label></div>';
    var c = r.estId && EST && EST[r.estId];
    h += '<label style="font-size:13px;display:block;margin-top:8px"><input type="checkbox" ' + (r.showAm ? "checked" : "") + ' onchange="_phRep().showAm=this.checked"> 공사 금액 넣기 ' + (c ? '<span class="mut">(' + esc(c.no) + ' · ' + _estW(_estCalc(c).tot) + '원)</span>' : '<span class="mut">(이 공사에 견적이 없어요)</span>') + '</label>';
    h += '<label style="font-size:13px;display:block;margin-top:8px">공사 개요 · 한 일<textarea onchange="_phRep().sum=this.value" placeholder="예: 2공장 외곽 오염 부위 고압세척 후 외벽 도장(하도 1회·상도 2회), 화장실 칸막이 교체" style="width:100%;min-height:80px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-family:inherit">' + esc(r.sum || "") + '</textarea></label></div>';
  }
  if(r.lay !== "none"){
    h += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px"><strong>🖼 사진 칸</strong><div style="display:flex;gap:6px;flex-wrap:wrap">' + B("#7c3aed", "⚡ 자동 채우기", "phRepAuto()") + B("#2563eb", "+ 줄 추가", "_phRep().rows.push({});draw()") + '</div></div>';
    h += '<div class="mut" style="font-size:12px;margin-bottom:8px">' + (r.lay === "one" ? "한 줄에 사진 한 장 + 위치·내용" : "한 줄 = 같은 곳의 " + L.cols.map(function(c){ return c[1]; }).join(" → ") + " 사진") + ' · 빈칸을 눌러 <b>현장사진에서 고르기 / 사진첩 / 바로 찍기</b> · ⚡ 자동 채우기는 <b>위치</b>가 같은 사진끼리 묶어요</div>';
    if(!r.rows.length) h += '<div style="padding:24px;text-align:center;color:#94a3b8">줄이 없어요 — ⚡ 자동 채우기 또는 + 줄 추가</div>';
    r.rows.forEach(function(row, i){
      h += '<div style="display:flex;gap:8px;align-items:flex-start;border:1px solid #e7e5e4;border-radius:8px;padding:8px;margin-bottom:8px;flex-wrap:wrap;background:#fdfaf5"><div style="font-weight:800;color:#7c4a21;min-width:22px">' + (i + 1) + '</div>';
      L.cols.forEach(function(c){
        var k = row[c[0]], stK = c[0] === "a" ? (r.lay === "one" ? "site" : "pre") : c[0] === "b" ? "mid" : "post";
        h += '<div style="text-align:center"><div style="font-size:11px;font-weight:700;color:' + PH_STC[stK] + '">' + c[1] + '</div>';
        if(k) h += '<div style="position:relative">' + _phThumb(k, 150) + '<button class="btn btn-r btn-s" style="position:absolute;top:3px;right:3px;padding:1px 6px" onclick="_phRep().rows[' + i + '].' + c[0] + '=\'\';draw()">✕</button><button class="btn btn-s" style="background:#2563eb;color:#fff;position:absolute;bottom:3px;right:3px;padding:1px 6px" onclick="phSlot(' + i + ',\'' + c[0] + '\',\'' + stK + '\')">바꾸기</button></div>';
        else h += '<div onclick="phSlot(' + i + ',\'' + c[0] + '\',\'' + stK + '\')" style="width:150px;height:112px;border:2px dashed #c08a52;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#92400e;font-size:12px;font-weight:700;background:#fff">+ 사진 넣기</div>';
        h += '</div>';
      });
      h += '<div style="flex:1;min-width:180px"><input value="' + esc(row.loc || "") + '" placeholder="위치 (예: 2층 화장실)" onchange="_phRep().rows[' + i + '].loc=this.value" style="width:100%;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box;font-size:13px">';
      h += '<textarea placeholder="내용 (예: 노후 칸막이 철거 후 신규 설치)" onchange="_phRep().rows[' + i + '].cap=this.value" style="width:100%;margin-top:4px;min-height:52px;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box;font-size:13px;font-family:inherit">' + esc(row.cap || "") + '</textarea>';
      h += '<div style="display:flex;gap:4px;margin-top:4px"><button class="btn btn-s" style="background:#475569;color:#fff" onclick="phRowMv(' + i + ',-1)">▲</button><button class="btn btn-s" style="background:#475569;color:#fff" onclick="phRowMv(' + i + ',1)">▼</button><button class="btn btn-r btn-s" onclick="_phRep().rows.splice(' + i + ',1);draw()">줄 삭제</button></div></div></div>';
    });
    h += '</div>';
  }
  return h;
}
function phSlot(i, col, st){
  phChoose(st, function(k){
    if(!k) return; var row = _phRep().rows[i], m = PH.meta[k];
    row[col] = k; if(m && !row.loc && m.loc) row.loc = m.loc; if(m && !row.cap && m.cap) row.cap = m.cap;
    draw();
  });
}
function phRowMv(i, d){ var a = _phRep().rows, j = i + d; if(j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; draw(); }
function phRepAuto(){
  var r = _phRep(), used = {};
  r.rows.forEach(function(row){ ["a", "b", "c"].forEach(function(c){ if(row[c]) used[row[c]] = 1; }); });
  var add = 0;
  if(r.lay === "one"){
    _phIds().forEach(function(k){ var m = PH.meta[k]; if(used[k] || m.st === "plan") return; r.rows.push({ a: k, loc: m.loc || "", cap: (m.cap || "") }); add++; });
  } else {
    // 위치가 같은 공사 전/중/후 → 한 줄. 위치 없는 사진은 순서대로 짝짓기
    var by = {}, free = { pre: [], mid: [], post: [] };
    _phIds().forEach(function(k){ var m = PH.meta[k]; if(used[k] || !free[m.st]) return; var key = String(m.loc || "").trim(); if(key){ by[key] = by[key] || { pre: [], mid: [], post: [] }; by[key][m.st].push(k); } else free[m.st].push(k); });
    var mk = function(g, loc){ var n = Math.max(g.pre.length, g.post.length, r.lay === "c3" ? g.mid.length : 0); for(var i = 0; i < n; i++){ var row = { a: g.pre[i] || "", c: g.post[i] || "", loc: loc }; if(r.lay === "c3") row.b = g.mid[i] || ""; var cap = [g.pre[i], g.mid[i], g.post[i]].map(function(k){ return k && PH.meta[k].cap; }).filter(Boolean)[0]; row.cap = cap || ""; r.rows.push(row); add++; } };
    Object.keys(by).sort().forEach(function(loc){ mk(by[loc], loc); });
    mk(free, "");
  }
  toast(add ? "⚡ " + add + "줄 채웠어요 — 확인 후 저장하세요" : "새로 넣을 사진이 없어요 (공사 전·후 사진을 먼저 올려 주세요)", !add); draw();
}
function phRepSave(){
  var r = _estClean(_phRep());
  r.rows = (r.rows || []).filter(function(x){ return x && (x.a || x.b || x.c || x.loc || x.cap); });
  showLoading("저장 중...");
  _phRef("rep").set(r).then(function(){ hideLoading(); PH_REP = r; toast("💾 저장했어요"); draw(); }).catch(function(e){ hideLoading(); toast("저장 실패: " + e.message, true); });
}

// ── 인쇄 ──
var PH_PCSS = '.pb{page-break-before:always;break-before:page}.ph{width:100%;object-fit:contain;background:#f8fafc;display:block}.cap td,.cap th{font-size:11.5px}.sec{font-size:20px;font-weight:900;text-align:center;letter-spacing:10px;margin:2mm 0 4mm}';
function _phImg(k, hmm){ var src = k && (PH_FULL[k] || (PH.meta[k] && PH.meta[k].t)); return src ? '<img class="ph" src="' + src + '" style="height:' + hmm + 'mm">' : '<div style="height:' + hmm + 'mm;display:flex;align-items:center;justify-content:center;color:#94a3b8;background:#f8fafc">사진 없음</div>'; }
function _phChunk(a, n){ var o = []; for(var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
function phRepPrint(){
  var r = _phRep(), L = PH_LAY[r.lay] || PH_LAY.c2, rows = (r.rows || []).filter(function(x){ return x.a || x.b || x.c; });
  if(r.lay !== "none" && !rows.length && !r.cover) return toast("사진 칸이 비어 있어요", true);
  var need = []; if(r.lay !== "none") rows.forEach(function(x){ L.cols.forEach(function(c){ if(x[c[0]]) need.push(x[c[0]]); }); });
  showLoading("사진 준비 중... (" + need.length + "장)");
  _phFull(need).then(function(){
    hideLoading();
    var cp = COMPS[r.sup] || _estComp({}), nm = CUR_EVT.nm || "", b = '<style>' + PH_PCSS + '</style><div class="pg">', first = true;
    var D = function(s){ return String(s || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1년 $2월 $3일"); };
    if(r.cover || r.lay === "none"){
      var c = r.showAm && r.estId && EST && EST[r.estId], cc = c ? _estCalc(c) : null;
      b += '<h1 style="letter-spacing:8px;margin-top:14mm">' + esc(r.title || "공사 결과 보고서") + '</h1><table style="font-size:13px;margin-top:8mm">';
      var R = function(lb, v){ return '<tr><th style="width:110px;text-align:left;padding:7px 8px">' + lb + '</th><td style="padding:7px 8px">' + v + '</td></tr>'; };
      b += R("공 사 명", "<b>" + esc(nm) + "</b>") + R("발 주 처", esc(r.cl || "")) + R("현장 위치", esc(r.site || "")) + R("공사 기간", (r.st || r.en) ? esc(D(r.st)) + " ~ " + esc(D(r.en)) : "");
      if(cc) b += R("공사 금액", "금 " + _estKor(cc.tot) + "원정 (₩" + _estW(cc.tot) + ")" + (c.vat === false ? "" : " · 부가세 포함"));
      b += R("시 공 사", esc(cp.nm || "") + (cp.ceo ? " (대표 " + esc(cp.ceo) + ")" : ""));
      b += '<tr><th style="text-align:left;padding:7px 8px;vertical-align:top">공사 개요</th><td style="padding:8px;white-space:pre-wrap;min-height:60mm;height:70mm;vertical-align:top">' + esc(r.sum || "") + '</td></tr></table>';
      if(r.lay !== "none" && rows.length) b += '<div style="font-size:12px;margin-top:3mm">붙임: 사진대지 ' + _phChunk(rows, r.lay === "one" ? 3 : 3).length + '쪽</div>';
      b += '<p style="text-align:center;font-size:14px;margin-top:12mm">위와 같이 공사를 마쳤기에 결과를 보고합니다.</p><div style="text-align:center;font-size:15px;font-weight:700;margin-top:8mm">' + esc(D(r.dt || todayKST())) + '</div>';
      b += '<div style="text-align:center;font-size:15px;margin-top:8mm;line-height:2">' + esc(cp.nm || "") + '<br>대표 ' + esc(cp.ceo || "") + ' &nbsp;' + _estStampHtml(cp, "(인)") + '</div>';
      if(r.cl) b += '<div style="font-size:16px;font-weight:800;margin-top:12mm">' + esc(r.cl) + ' 귀하</div>';
      first = false;
    }
    if(r.lay !== "none"){
      var per = 3, pages = _phChunk(rows, per), n = 0;
      pages.forEach(function(pg){
        b += '<div class="' + (first ? "" : "pb") + '"><div class="sec">사 진 대 지</div><div style="font-size:12px;margin-bottom:2mm">공사명: <b>' + esc(nm) + '</b></div>'; first = false;
        if(r.lay === "one"){
          pg.forEach(function(x){ n++; var m = PH.meta[x.a] || {};
            b += '<table style="margin-bottom:3mm"><tr><td style="width:64%;padding:2px">' + _phImg(x.a, 74) + '</td><td style="vertical-align:top;padding:0"><table class="cap" style="height:100%"><tr><th style="width:52px">번호</th><td>' + n + '</td></tr><tr><th>위치</th><td>' + esc(x.loc || "") + '</td></tr><tr><th>일자</th><td>' + esc(m.dt || "") + '</td></tr><tr><th style="vertical-align:top">내용</th><td style="vertical-align:top;height:40mm;white-space:pre-wrap">' + esc(x.cap || "") + '</td></tr></table></td></tr></table>';
          });
        } else {
          var H = L.cols.length === 3 ? 52 : 66;
          b += '<table><tr><th style="width:28px">No</th>' + L.cols.map(function(c){ return '<th>' + c[1] + '</th>'; }).join("") + '</tr>';
          pg.forEach(function(x){ n++;
            b += '<tr><td class="c" rowspan="2">' + n + '</td>' + L.cols.map(function(c){ return '<td style="padding:2px;width:' + Math.floor(100 / L.cols.length) + '%">' + _phImg(x[c[0]], H) + '</td>'; }).join("") + '</tr>';
            b += '<tr class="cap"><td colspan="' + L.cols.length + '" style="padding:4px 6px">' + (x.loc ? '<b>' + esc(x.loc) + '</b> — ' : '') + esc(x.cap || "") + '</td></tr>';
          });
          b += '</table>';
        }
        b += '</div>';
      });
    }
    b += '</div>';
    _estWin((r.title || "결과보고서") + "_" + nm, b, false);
  });
}

// ── 💰 견적서 + 사진 (현장·시공 계획 사진을 견적서 뒤에) ──
function estPrintQuotePh(id){
  var e = EST[id];
  var go = function(){
    var sel = e.ph || _phIds().filter(function(k){ var s = PH.meta[k].st; return s === "site" || s === "pre" || s === "plan"; });
    var h = '<h3 style="margin:0 0 6px">📷 견적서에 붙일 사진 <button class="btn" style="background:#475569;float:right" onclick="closePopup()">닫기</button></h3><div class="mut" style="font-size:12.5px;margin-bottom:8px">체크한 사진이 견적서 뒤에 <b>현장 사진</b> · <b>시공 계획</b> 쪽으로 붙어요 (Shift 범위 체크 됨)</div>';
    if(!_phIds().length) h += '<div style="padding:20px;text-align:center;color:#94a3b8">이 공사에 올린 사진이 없어요 — 📷 현장사진 탭에서 먼저 올려 주세요</div>';
    h += '<div class="card" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;max-height:55vh;overflow:auto;padding:4px">';
    _phIds().forEach(function(k){ var m = PH.meta[k]; h += '<label style="cursor:pointer;border:2px solid ' + PH_STC[m.st] + ';border-radius:6px;padding:3px;display:block"><img src="' + m.t + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;display:block"><div style="font-size:11px;margin-top:2px"><input type="checkbox" class="phQ" value="' + k + '"' + (sel.indexOf(k) >= 0 ? " checked" : "") + '> ' + _phStN(m.st) + (m.loc ? ' · ' + esc(m.loc) : '') + '</div></label>'; });
    h += '</div><div style="text-align:right;margin-top:10px">' + _estBtn("#475569", "사진 없이 견적서만", "closePopup();estPrintQuote('" + id + "')") + ' ' + _estBtn("#2563eb", "🖨️ 사진 붙여서 인쇄", "estPrintQuotePhGo('" + id + "')", "padding:9px 18px") + '</div>';
    openPopup(h, 760);
  };
  if(PH_EVT !== _estEvt() || !PH){ showLoading("사진 불러오는 중..."); PH_LOADING = false; Promise.all([_phRef("meta").once("value"), _phRef("rep").once("value")]).then(function(r){ hideLoading(); PH = { meta: r[0].val() || {} }; PH_REP = r[1].val() || null; PH_EVT = _estEvt(); PH_FULL = {}; go(); }).catch(function(err){ hideLoading(); toast("사진 불러오기 실패: " + err.message, true); }); }
  else go();
}
function estPrintQuotePhGo(id){
  var sel = Array.prototype.map.call(document.querySelectorAll("input.phQ:checked"), function(c){ return c.value; });
  closePopup();
  EST[id].ph = sel; _estRef(id).child("ph").set(sel.length ? sel : null).catch(function(){});
  if(!sel.length) return estPrintQuote(id);
  showLoading("사진 준비 중... (" + sel.length + "장)");
  _phFull(sel).then(function(){
    hideLoading();
    var groups = [["현 장 사 진", sel.filter(function(k){ return PH.meta[k] && PH.meta[k].st !== "plan"; })], ["시 공 계 획", sel.filter(function(k){ return PH.meta[k] && PH.meta[k].st === "plan"; })]];
    var x = '<style>' + PH_PCSS + '</style>';
    groups.forEach(function(g){
      _phChunk(g[1], 6).forEach(function(pg){
        x += '<div class="pg pb"><div class="sec">' + g[0] + '</div><div style="font-size:12px;margin-bottom:2mm">공사명: <b>' + esc(EST[id].nm || "") + '</b> · 견적번호 ' + esc(EST[id].no || "") + '</div><table>';
        _phChunk(pg, 2).forEach(function(two){
          x += '<tr>' + two.map(function(k){ return '<td style="width:50%;padding:2px">' + _phImg(k, 68) + '</td>'; }).join("") + (two.length < 2 ? '<td style="width:50%"></td>' : '') + '</tr>';
          x += '<tr class="cap">' + two.map(function(k){ var m = PH.meta[k]; return '<td style="padding:3px 6px">' + (m.loc ? '<b>' + esc(m.loc) + '</b> ' : '') + esc(m.cap || "") + ' <span style="color:#64748b">(' + _phStN(m.st) + ' · ' + esc(m.dt || "") + ')</span></td>'; }).join("") + (two.length < 2 ? '<td></td>' : '') + '</tr>';
        });
        x += '</table></div>';
      });
    });
    estPrintQuote(id, x);
  });
}

// est.js 견적 화면의 "📷 현장사진 붙여서 인쇄" 버튼
var phQuotePick = estPrintQuotePh;
