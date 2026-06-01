// ═══════════════════════════════════════════════════════════════
// mod-engine.js — 범용 CRUD 모듈 엔진  v1.0
// 설정(columns/features)만 정의하면 테이블+폼+CRUD+검색+엑셀 자동 생성
// ═══════════════════════════════════════════════════════════════

var _modDefs={};   // key → 모듈 정의
var _modData={};   // key → 데이터 배열
var _modSort={};   // key → {col, asc}
var _modSearch={}; // key → 검색어
var _modFilter={}; // key → 필터값
var _modListeners={};
var MOD_DEFS_LOADED=false;

// ─── 유틸 ───
function _modId(){return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}

// ─── 모듈 정의 등록 ───
function defMod(cfg){
  /* cfg = {
    key:"mymod", label:"내모듈", icon:"📦",
    cat:"custom", catLabel:"📦 커스텀", catIcon:"📦",
    fbPath:"ModMymod", global:false,   // global=true → /main/, false → /evtData/{evtId}/
    columns:[ {key,label,type,required,search,filter,comma,options,badgeMap,placeholder,hideTable,auto} ],
    features:{ search:true, excel:true }
  } */
  _modDefs[cfg.key]=cfg;
  if(!_modData[cfg.key]) _modData[cfg.key]=[];
  if(!_modSort[cfg.key]) _modSort[cfg.key]={col:null,asc:true};
  if(!_modSearch[cfg.key]) _modSearch[cfg.key]="";
  if(!_modFilter[cfg.key]) _modFilter[cfg.key]="";
}

// ─── Firebase 경로 ───
function _modFbPath(key){
  var def=_modDefs[key]; if(!def) return null;
  if(def.global) return '/main/'+def.fbPath;
  if(typeof CUR_EVT!=='undefined' && CUR_EVT && CUR_EVT.evtId) return '/evtData/'+CUR_EVT.evtId+'/'+def.fbPath;
  return null;
}

// ─── 데이터 실시간 동기화 ───
function modLoadData(key){
  var path=_modFbPath(key); if(!path) return;
  if(_modListeners[key]){
    fbDb.ref(_modListeners[key].path).off('value',_modListeners[key].cb);
  }
  var cb=function(snap){
    var val=snap.val();
    if(!val) _modData[key]=[];
    else if(Array.isArray(val)) _modData[key]=val;
    else _modData[key]=Object.values(val);
    if(typeof CTAB!=='undefined' && CTAB==='mod_'+key) draw();
  };
  fbDb.ref(path).on('value',cb);
  _modListeners[key]={path:path,cb:cb};
}

// 모든 커스텀 모듈 데이터 로드
function modLoadAll(){
  Object.keys(_modDefs).forEach(function(k){ modLoadData(k); });
}

// ─── Firebase에서 모듈 정의 로드 ───
function loadModDefs(callback){
  if(typeof fbDb==='undefined') return;
  fbDb.ref('/main/ModDefs').on('value',function(snap){
    var defs=snap.val()||[];
    if(!Array.isArray(defs)) defs=Object.values(defs);
    // 기존 정의 초기화 후 재등록
    _modDefs={};
    defs.forEach(function(d){ if(d && d.key) defMod(d); });
    MOD_DEFS_LOADED=true;
    if(callback) callback();
  });
}

// ─── 모듈 정의 저장 ───
function _saveModDefs(){
  var arr=[];
  Object.keys(_modDefs).forEach(function(k){ arr.push(_modDefs[k]); });
  return fbDb.ref('/main/ModDefs').set(arr);
}

// ═══════════════════════════════════════════
// 렌더링 엔진
// ═══════════════════════════════════════════

function dMod(key){
  var def=_modDefs[key];
  if(!def) return '<div class="card"><div class="empty2">모듈 정의 없음</div></div>';

  var data=(_modData[key]||[]).slice();
  var search=_modSearch[key]||"";
  var filter=_modFilter[key]||"";
  var sort=_modSort[key]||{};

  // 검색
  if(search){
    var q=search.toLowerCase();
    data=data.filter(function(row){
      return (def.columns||[]).some(function(c){
        if(!c.search) return false;
        return String(row[c.key]||"").toLowerCase().indexOf(q)>=0;
      });
    });
  }

  // 필터
  if(filter){
    var fc=(def.columns||[]).find(function(c){return c.filter&&(c.type==="select"||c.type==="badge")});
    if(fc) data=data.filter(function(row){return row[fc.key]===filter});
  }

  // 정렬
  if(sort.col){
    data.sort(function(a,b){
      var va=a[sort.col]||"",vb=b[sort.col]||"";
      var na=Number(va),nb=Number(vb);
      if(!isNaN(na)&&!isNaN(nb)) return sort.asc?na-nb:nb-na;
      return sort.asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
  }

  var cols=(def.columns||[]).filter(function(c){return !c.hideTable});
  var feat=def.features||{};
  var h='<div class="card">';

  // 헤더
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  h+='<h3 style="margin:0">'+(def.icon||"📦")+' '+esc(def.label)+' <span style="color:#94a3b8;font-weight:400">('+data.length+')</span></h3>';
  var _hasTel=(def.columns||[]).some(function(c){return c.type==='tel'});
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  if(isA() && feat.applyForm) h+='<button class="btn" style="background:#0ea5e9;color:#fff" onclick="popModFormLink(\''+key+'\')">🔗 신청폼 링크</button>';
  if(isA() && _hasTel) h+='<button class="btn" style="background:#8b5cf6;color:#fff" onclick="popModSms(\''+key+'\')">💬 문자 발송</button>';
  if(isA()) h+='<button class="btn btn-b" onclick="popModAdd(\''+key+'\')">➕ 추가</button>';
  if(feat.excel) h+='<button class="btn" onclick="modExportExcel(\''+key+'\')">📥 엑셀</button>';
  h+='</div></div>';

  // 검색 + 필터
  if(feat.search!==false){
    h+='<div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
    h+='<input type="text" placeholder="🔍 검색..." value="'+esc(search)+'" oninput="_modSearch[\''+key+'\']=this.value;draw()" style="flex:1;min-width:150px;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px">';
    var fc=(def.columns||[]).find(function(c){return c.filter&&(c.type==="select"||c.type==="badge")});
    if(fc){
      var fopts=fc.options||(fc.badgeMap?Object.keys(fc.badgeMap):[]);
      h+='<button class="btn btn-s'+(!filter?' btn-b':'')+'" onclick="_modFilter[\''+key+'\']=\'\';draw()" style="font-size:11px">전체</button>';
      fopts.forEach(function(o){
        var ov=typeof o==='object'?o.value:o;
        var ol=typeof o==='object'?o.label:(fc.badgeMap&&fc.badgeMap[ov]?fc.badgeMap[ov].label:ov);
        h+='<button class="btn btn-s'+(filter===ov?' btn-b':'')+'" onclick="_modFilter[\''+key+'\']=\''+esc(ov)+'\';draw()" style="font-size:11px">'+esc(ol)+'</button>';
      });
    }
    h+='</div>';
  }

  // 테이블
  if(!data.length){
    h+='<div class="empty2" style="padding:40px">데이터가 없습니다</div>';
  } else {
    h+='<div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:10px">';
    h+='<table class="tbl"><thead><tr>';
    h+='<th style="width:36px">#</th>';
    cols.forEach(function(c){
      var arrow=sort.col===c.key?(sort.asc?' ▲':' ▼'):'';
      h+='<th style="cursor:pointer;white-space:nowrap" onclick="_modToggleSort(\''+key+'\',\''+c.key+'\')">'+esc(c.label)+arrow+'</th>';
    });
    // 선정 기능: status 컬럼(badge)이 있으면 선정/탈락 버튼 노출
    var statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge'});
    var hasSelect=feat.applyForm && statusCol;
    if(isA()) h+='<th style="width:'+(hasSelect?'150':'80')+'px"></th>';
    h+='</tr></thead><tbody>';

    data.forEach(function(row,idx){
      var st=row.status||'';
      h+='<tr'+(st==='탈락'?' style="opacity:.5"':'')+'>';
      h+='<td class="ctr" style="color:#94a3b8">'+(idx+1)+'</td>';
      cols.forEach(function(c){ h+='<td>'+_modFmtCell(c,row[c.key])+'</td>'; });
      if(isA()){
        h+='<td class="ctr" style="white-space:nowrap">';
        if(hasSelect){
          h+='<button class="btn btn-s" onclick="modSetStatus(\''+key+'\',\''+esc(row._id||'')+'\',\'선정\')" style="background:'+(st==='선정'?'#16a34a':'#dcfce7')+';color:'+(st==='선정'?'#fff':'#16a34a')+';font-weight:700" title="선정">✓</button> ';
          h+='<button class="btn btn-s" onclick="modSetStatus(\''+key+'\',\''+esc(row._id||'')+'\',\'탈락\')" style="background:'+(st==='탈락'?'#dc2626':'#fee2e2')+';color:'+(st==='탈락'?'#fff':'#dc2626')+';font-weight:700" title="탈락">✕</button> ';
        }
        h+='<button class="btn btn-s" onclick="popModEdit(\''+key+'\',\''+esc(row._id||'')+'\')">✏️</button> ';
        h+='<button class="btn btn-s" onclick="modDel(\''+key+'\',\''+esc(row._id||'')+'\')" style="color:#dc2626">🗑</button>';
        h+='</td>';
      }
      h+='</tr>';
    });
    h+='</tbody></table></div>';

    // 합계 (number+comma)
    var sumCols=cols.filter(function(c){return c.type==='number'&&c.comma});
    if(sumCols.length){
      h+='<div style="text-align:right;margin-top:8px;font-size:13px;color:#475569">';
      sumCols.forEach(function(sc){
        var tot=0; data.forEach(function(r){tot+=pn(r[sc.key])});
        h+='<span style="margin-left:16px"><b>'+esc(sc.label)+' 합계:</b> '+tot.toLocaleString()+'원</span>';
      });
      h+='</div>';
    }
  }

  h+='</div>';
  return h;
}

// ─── 셀 포맷 ───
function _modFmtCell(col,val){
  if(val==null||val==="") return '<span style="color:#cbd5e1">—</span>';
  switch(col.type){
    case 'number':
      return col.comma?'<b>'+Number(val).toLocaleString()+'</b>':String(val);
    case 'tel':
      var cl=String(val).replace(/[^0-9+]/g,'');
      return '<a href="tel:'+cl+'" style="color:#2563eb;text-decoration:none">'+esc(String(val))+'</a>';
    case 'badge':
      if(col.badgeMap&&col.badgeMap[val]){
        var bm=col.badgeMap[val];
        return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:'+(bm.bg||'#e2e8f0')+';color:'+(bm.color||'#475569')+'">'+esc(bm.label||val)+'</span>';
      }
      return esc(String(val));
    case 'textarea':
      var s=String(val); return '<span title="'+esc(s)+'">'+esc(s.length>40?s.slice(0,40)+'…':s)+'</span>';
    case 'file':
      return '<a href="'+esc(String(val))+'" target="_blank" style="color:#2563eb;text-decoration:none">📎 파일</a>';
    case 'consent':
      return val==='동의'?'<span style="color:#16a34a;font-weight:700">✅ 동의</span>':'<span style="color:#cbd5e1">미동의</span>';
    default:
      return esc(String(val));
  }
}

// ─── 정렬 토글 ───
function _modToggleSort(key,col){
  var s=_modSort[key];
  if(s.col===col) s.asc=!s.asc; else {s.col=col;s.asc=true;}
  draw();
}

// ═══════════════════════════════════════════
// 폼 (추가/수정)
// ═══════════════════════════════════════════

function popModAdd(key){
  var def=_modDefs[key]; if(!def) return;
  var h='<div class="pop-head"><h3>➕ '+esc(def.label)+' 추가</h3></div>';
  h+='<div style="padding:14px">';
  (def.columns||[]).forEach(function(c){
    if(c.auto) return;
    h+='<div class="fr"><label>'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</label>';
    h+=_modFormField(c,'');
    h+='</div>';
  });
  h+='<div style="text-align:right;margin-top:14px">';
  h+='<button class="btn" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" onclick="modSave(\''+key+'\')">저장</button>';
  h+='</div></div>';
  openPopup(h,460);
}

function popModEdit(key,id){
  var def=_modDefs[key]; if(!def) return;
  var row=(_modData[key]||[]).find(function(r){return r._id===id});
  if(!row) return toast("데이터를 찾을 수 없습니다",true);

  var h='<div class="pop-head"><h3>✏️ '+esc(def.label)+' 수정</h3></div>';
  h+='<div style="padding:14px">';
  h+='<input type="hidden" id="mod_edit_id" value="'+esc(id)+'">';
  (def.columns||[]).forEach(function(c){
    if(c.auto) return;
    h+='<div class="fr"><label>'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</label>';
    h+=_modFormField(c,row[c.key]||'');
    h+='</div>';
  });
  h+='<div style="text-align:right;margin-top:14px">';
  h+='<button class="btn" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" onclick="modSave(\''+key+'\',\''+esc(id)+'\')">저장</button>';
  h+='</div></div>';
  openPopup(h,460);
}

function _modFormField(col,val){
  var id='mod_f_'+col.key;
  var ev=esc(String(val==null?'':val));
  var ph=col.placeholder?' placeholder="'+esc(col.placeholder)+'"':'';
  switch(col.type){
    case 'textarea':
      return '<textarea id="'+id+'" rows="3" style="resize:vertical"'+ph+'>'+ev+'</textarea>';
    case 'select':
      var h='<select id="'+id+'"><option value="">— 선택 —</option>';
      (col.options||[]).forEach(function(o){
        var ov=typeof o==='object'?o.value:o, ol=typeof o==='object'?o.label:o;
        h+='<option value="'+esc(ov)+'"'+(ov==val?' selected':'')+'>'+esc(ol)+'</option>';
      });
      return h+'</select>';
    case 'badge':
      var h='<select id="'+id+'"><option value="">— 선택 —</option>';
      if(col.badgeMap) Object.keys(col.badgeMap).forEach(function(k){
        h+='<option value="'+esc(k)+'"'+(k==val?' selected':'')+'>'+esc(col.badgeMap[k].label||k)+'</option>';
      });
      return h+'</select>';
    case 'number':
      if(col.comma){
        return '<input id="'+id+'" type="text" inputmode="numeric"'+ph+' value="'+(val?Number(val).toLocaleString():'')+'" oninput="this.value=this.value.replace(/[^\\d,]/g,\'\').replace(/,/g,\'\').replace(/\\B(?=(\\d{3})+(?!\\d))/g,\',\')">';
      }
      return '<input id="'+id+'" type="number"'+ph+' value="'+ev+'">';
    case 'date':
      return '<input id="'+id+'" type="date" value="'+ev+'">';
    case 'tel':
      return '<input id="'+id+'" type="tel" value="'+ev+'" placeholder="'+esc(col.placeholder||'010-0000-0000')+'" maxlength="13" oninput="var v=this.value.replace(/[^0-9]/g,\'\');if(v.length<=3)this.value=v;else if(v.length<=7)this.value=v.slice(0,3)+\'-\'+v.slice(3);else this.value=v.slice(0,3)+\'-\'+v.slice(3,7)+\'-\'+v.slice(7,11)">';
    case 'file':
      var fh='';
      if(val) fh+='<div style="font-size:12px;margin-bottom:4px"><a href="'+esc(String(val))+'" target="_blank" style="color:#2563eb">📎 기존 파일</a></div>';
      fh+='<input id="'+id+'" type="file"'+(col.accept?' accept="'+esc(col.accept)+'"':'')+' style="font-size:13px">';
      fh+='<input type="hidden" id="'+id+'_prev" value="'+ev+'">';
      return fh;
    case 'consent':
      return '<label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;cursor:pointer;line-height:1.5"><input type="checkbox" id="'+id+'" style="margin-top:3px;flex-shrink:0"'+(val==='동의'?' checked':'')+'> <span>'+esc(col.consentText||col.label||'개인정보 수집·이용에 동의합니다')+'</span></label>';
    default:
      return '<input id="'+id+'" type="text" value="'+ev+'"'+(col.placeholder?' placeholder="'+esc(col.placeholder)+'"':'')+'>';
  }
}

// ═══════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════

function modSave(key,editId){
  var def=_modDefs[key]; if(!def) return;
  var obj={}, valid=true, fileTasks=[];
  (def.columns||[]).forEach(function(c){
    if(c.auto) return;
    var el=document.getElementById('mod_f_'+c.key); if(!el) return;
    if(c.type==='consent'){
      var ok=el.checked;
      if(c.required&&!ok){ toast(c.label+'에 동의가 필요합니다',true); valid=false; }
      obj[c.key]=ok?'동의':''; return;
    }
    if(c.type==='file'){
      var prev=(document.getElementById('mod_f_'+c.key+'_prev')||{}).value||'';
      if(el.files&&el.files[0]){ fileTasks.push({col:c,file:el.files[0]}); }
      else { obj[c.key]=prev; if(c.required&&!prev){ toast(c.label+' 파일을 첨부하세요',true); valid=false; } }
      return;
    }
    var v=(el.value||"").trim();
    if(c.type==='number'&&c.comma) v=v.replace(/,/g,'');
    if(c.type==='number'&&v) v=Number(v);
    if(c.required&&!v&&v!==0){ toast(c.label+'을(를) 입력하세요',true); valid=false; }
    obj[c.key]=v;
  });
  if(!valid) return;

  var path=_modFbPath(key);
  if(!path) return toast('행사를 선택하세요',true);

  showLoading(fileTasks.length?'파일 업로드 중...':'저장 중...');

  // 파일 업로드 먼저
  var upChain=Promise.resolve();
  fileTasks.forEach(function(t){
    upChain=upChain.then(function(){
      return _uploadToDrive(t.file,'mod_'+key,t.col.label).then(function(url){ obj[t.col.key]=url; });
    });
  });

  upChain.then(function(){
    if(editId){
      var data=(_modData[key]||[]).slice();
      var idx=-1;
      for(var i=0;i<data.length;i++){if(data[i]._id===editId){idx=i;break}}
      if(idx<0){hideLoading();toast('데이터를 찾을 수 없습니다',true);return}
      obj._id=editId;
      obj._updatedAt=new Date().toISOString();
      var merged={}; for(var k in data[idx])merged[k]=data[idx][k]; for(var k in obj)merged[k]=obj[k];
      data[idx]=merged;
      return fbDb.ref(path).set(data).then(function(){hideLoading();toast('✅ 수정됨');closePopup()});
    } else {
      obj._id=_modId();
      obj._createdAt=new Date().toISOString();
      var data=(_modData[key]||[]).slice();
      data.push(obj);
      return fbDb.ref(path).set(data).then(function(){hideLoading();toast('✅ 추가됨');closePopup()});
    }
  }).catch(function(e){hideLoading();toast('실패: '+(e.message||e),true)});
}

function modDel(key,id){
  var def=_modDefs[key]; if(!def) return;
  if(!confirm(def.label+' 항목을 삭제할까요?')) return;
  var path=_modFbPath(key); if(!path) return;
  var data=(_modData[key]||[]).filter(function(r){return r._id!==id});
  showLoading('삭제 중...');
  fbDb.ref(path).set(data).then(function(){hideLoading();toast('삭제됨')})
    .catch(function(e){hideLoading();toast('실패: '+e.message,true)});
}

// ═══════════════════════════════════════════
// 엑셀 내보내기
// ═══════════════════════════════════════════

function modExportExcel(key){
  var def=_modDefs[key]; if(!def) return;
  var data=_modData[key]||[];
  var cols=(def.columns||[]).filter(function(c){return !c.hideTable});
  var rows=[cols.map(function(c){return c.label})];
  data.forEach(function(row){
    rows.push(cols.map(function(c){
      var v=row[c.key]; if(v==null) return '';
      if(c.type==='badge'&&c.badgeMap&&c.badgeMap[v]) return c.badgeMap[v].label||v;
      return v;
    }));
  });
  if(typeof XLSX!=='undefined'){
    var wb=XLSX.utils.book_new();
    var ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,def.label);
    XLSX.writeFile(wb,def.label+'_'+(new Date().toISOString().slice(0,10))+'.xlsx');
  } else {
    var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"'}).join(',')}).join('\n');
    var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download=def.label+'_'+(new Date().toISOString().slice(0,10))+'.csv';a.click();
  }
}

// ═══════════════════════════════════════════
// 모듈 관리 UI (시스템 설정에서 모듈 정의 CRUD)
// ═══════════════════════════════════════════

var MOD_COL_TYPES=[
  {v:"text",l:"텍스트"},{v:"number",l:"숫자/금액"},{v:"date",l:"날짜"},{v:"tel",l:"연락처(하이픈)"},
  {v:"select",l:"선택(드롭다운)"},{v:"textarea",l:"긴 텍스트"},{v:"badge",l:"상태배지"},
  {v:"file",l:"파일첨부"},{v:"consent",l:"개인정보 동의"}
];
function _modColKey(){ return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }

function dModManager(){
  var defs=[];
  Object.keys(_modDefs).forEach(function(k){defs.push(_modDefs[k])});

  var h='<div class="card"><h3 style="margin-bottom:4px">📦 모듈 관리</h3>';
  h+='<p class="mut" style="margin-bottom:16px">코드 없이 데이터 관리 탭을 추가합니다. 모듈을 정의하면 자동으로 테이블·추가/수정 폼·검색·엑셀이 생성됩니다.</p>';
  h+='<button class="btn btn-b" onclick="popModDef(-1)" style="margin-bottom:16px">➕ 새 모듈 만들기</button>';

  if(!defs.length){
    h+='<div class="empty2" style="padding:40px">정의된 모듈이 없습니다</div>';
  } else {
    defs.forEach(function(d,di){
      h+='<div style="border:1.5px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;background:#f8fafc">';
      h+='<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">';
      h+='<div style="display:flex;align-items:center;gap:10px">';
      h+='<span style="font-size:20px">'+(d.icon||"📦")+'</span>';
      h+='<div><span style="font-size:15px;font-weight:700">'+esc(d.label)+'</span>';
      h+='<span style="color:#94a3b8;font-size:12px;margin-left:8px">key: '+esc(d.key)+'</span>';
      h+='<span style="color:#94a3b8;font-size:12px;margin-left:8px">컬럼 '+(d.columns||[]).length+'개</span></div></div>';
      h+='<div style="display:flex;gap:6px">';
      h+='<button class="btn btn-s" onclick="popModDef(\''+esc(d.key)+'\')" style="font-size:11px">✏️ 수정</button>';
      h+='<button class="btn btn-s" onclick="delModDef(\''+esc(d.key)+'\')" style="font-size:11px;color:#dc2626">🗑 삭제</button>';
      h+='</div></div>';

      // 컬럼 미리보기
      if((d.columns||[]).length){
        h+='<div style="display:flex;flex-wrap:wrap;gap:4px">';
        (d.columns||[]).forEach(function(c){
          var tl=MOD_COL_TYPES.find(function(t){return t.v===c.type});
          h+='<span style="padding:2px 8px;border-radius:6px;font-size:11px;background:#e2e8f0;color:#475569">'+esc(c.label)+' <span style="color:#94a3b8">'+(tl?tl.l:c.type)+'</span>'+(c.required?' ✱':'')+'</span>';
        });
        h+='</div>';
      }
      h+='</div>';
    });
  }
  h+='</div>';
  return h;
}

// ─── 모듈 정의 팝업 ───
var _modDefEditCols=[];

function popModDef(keyOrIdx){
  var isNew=keyOrIdx===-1;
  var def=isNew?{key:'',label:'',icon:'📦',cat:'custom',catLabel:'',catIcon:'📦',fbPath:'',global:false,columns:[],features:{search:true,excel:true}}:_modDefs[keyOrIdx];
  if(!def) return;
  _modDefEditCols=JSON.parse(JSON.stringify(def.columns||[]));

  var h='<div class="pop-head"><h3>'+(isNew?'➕ 새 모듈 만들기':'✏️ 모듈 수정: '+esc(def.label))+'</h3></div>';
  h+='<div style="padding:14px;max-height:70vh;overflow-y:auto">';

  // 기본 정보
  h+='<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;margin-bottom:16px">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">아이콘</label>';
  h+=_emojiSelect("mdf_icon",def.icon||"📦");
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">이름 <span style="color:#ef4444">*</span></label>';
  h+='<input id="mdf_label" value="'+esc(def.label||"")+'" placeholder="예: 행사차량">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">카테고리</label>';
  h+='<input id="mdf_catLabel" value="'+esc(def.catLabel||"")+'" placeholder="비우면 기본 커스텀 (이모지 제외)">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">데이터 범위</label>';
  h+='<select id="mdf_global"><option value="false"'+(def.global?'':' selected')+'>행사별 (각 행사 데이터 분리)</option><option value="true"'+(def.global?' selected':'')+'>공통 (전체 행사 공유)</option></select>';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">공개 신청폼</label>';
  var afOn=def.features&&def.features.applyForm;
  h+='<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569"><input type="checkbox" id="mdf_applyForm"'+(afOn?' checked':'')+'> 켜면 신청폼 링크가 생기고 외부에서 신청 → 선정/탈락 처리 가능</label>';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">신청폼 제목</label>';
  h+='<input id="mdf_formTitle" value="'+esc(def.formTitle||"")+'" placeholder="비우면 「'+esc(def.label||"모듈명")+' 신청」">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">신청폼 안내문</label>';
  h+='<input id="mdf_formDesc" value="'+esc(def.formDesc||"")+'" placeholder="예: 아래 내용을 작성 후 신청해 주세요">';
  h+='</div>';

  // 컬럼 섹션
  h+='<div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-bottom:8px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  h+='<span style="font-size:14px;font-weight:700">📋 컬럼 정의</span>';
  h+='<button class="btn btn-s" onclick="_modDefAddCol()" style="font-size:11px;color:#2563eb">➕ 컬럼 추가</button>';
  h+='</div>';
  h+='<div id="mdf_cols_area">';
  h+=_renderModDefCols();
  h+='</div></div>';

  h+='<div style="text-align:right;margin-top:14px;border-top:1px solid #e5e7eb;padding-top:12px">';
  h+='<button class="btn" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" onclick="saveModDef('+(isNew?'-1':('\''+esc(def.key)+'\''))+')">💾 저장</button>';
  h+='</div></div>';
  openPopup(h,600);
}

function _renderModDefCols(){
  if(!_modDefEditCols.length) return '<div style="color:#94a3b8;font-size:12px;padding:16px;text-align:center;border:1px dashed #cbd5e1;border-radius:8px">아직 컬럼이 없습니다. <b>➕ 컬럼 추가</b>를 눌러 항목(열)을 만드세요.</div>';
  var h='';
  _modDefEditCols.forEach(function(c,i){
    h+='<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:6px;background:#fff">';
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
    h+='<span style="font-size:11px;color:#cbd5e1;font-weight:700;width:16px">'+(i+1)+'</span>';
    // 이름 (넓게)
    h+='<input value="'+esc(c.label||'')+'" placeholder="항목 이름 (예: 업체명)" style="flex:1;min-width:120px;font-size:13px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px" onchange="_modDefEditCols['+i+'].label=this.value">';
    // 타입
    h+='<select style="font-size:12px;padding:5px;border:1px solid #cbd5e1;border-radius:6px" onchange="_modDefEditCols['+i+'].type=this.value;_modDefRefreshCols()">';
    MOD_COL_TYPES.forEach(function(t){
      h+='<option value="'+t.v+'"'+(c.type===t.v?' selected':'')+'>'+t.l+'</option>';
    });
    h+='</select>';
    // 필수 (모든 타입)
    h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px;background:#fef2f2;padding:3px 6px;border-radius:5px"><input type="checkbox"'+(c.required?' checked':'')+' onchange="_modDefEditCols['+i+'].required=this.checked"><b style="color:#dc2626">필수</b></label>';
    // 콤마 (숫자/금액만)
    if(c.type==='number') h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px"><input type="checkbox"'+(c.comma?' checked':'')+' onchange="_modDefEditCols['+i+'].comma=this.checked">금액(콤마)</label>';
    // 필터 (선택/배지만)
    if(c.type==='select'||c.type==='badge') h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px"><input type="checkbox"'+(c.filter?' checked':'')+' onchange="_modDefEditCols['+i+'].filter=this.checked">필터</label>';
    // 검색 (텍스트류만)
    if(['text','tel','textarea','number','select'].indexOf(c.type)>=0) h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px"><input type="checkbox"'+(c.search?' checked':'')+' onchange="_modDefEditCols['+i+'].search=this.checked">검색</label>';
    // 관리자전용
    h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px" title="체크 시 공개 신청폼엔 안 보이고 관리자만 입력/조회"><input type="checkbox"'+(c.adminOnly?' checked':'')+' onchange="_modDefEditCols['+i+'].adminOnly=this.checked">관리자전용</label>';
    // 순서 / 삭제
    if(i>0) h+='<button onclick="_modDefMoveCol('+i+',-1)" style="border:none;background:none;cursor:pointer;font-size:13px">▲</button>';
    if(i<_modDefEditCols.length-1) h+='<button onclick="_modDefMoveCol('+i+',1)" style="border:none;background:none;cursor:pointer;font-size:13px">▼</button>';
    h+='<button onclick="_modDefRemoveCol('+i+')" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:14px">✕</button>';
    h+='</div>';
    // 타입별 추가 옵션
    if(c.type==='select'){
      h+='<div style="margin-top:6px"><input placeholder="선택 항목 (쉼표로 구분: 대기,승인,거부)" value="'+esc((c.options||[]).join(','))+'" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px" onchange="_modDefEditCols['+i+'].options=this.value.split(\',\').map(function(s){return s.trim()}).filter(Boolean)"></div>';
    }
    if(c.type==='badge'){
      h+='<div style="margin-top:6px"><input placeholder="배지 (key:이름:배경색:글자색, 쉼표구분)" value="'+esc(_badgeMapToStr(c.badgeMap||{}))+'" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px" onchange="_modDefEditCols['+i+'].badgeMap=_strToBadgeMap(this.value)"></div>';
    }
    if(c.type==='consent'){
      h+='<div style="margin-top:6px"><input placeholder="동의 문구 (예: 개인정보 수집·이용에 동의합니다)" value="'+esc(c.consentText||'')+'" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px" onchange="_modDefEditCols['+i+'].consentText=this.value"></div>';
    }
    if(c.type==='file'){
      h+='<div style="margin-top:6px;font-size:11px;color:#94a3b8">📎 파일첨부는 자료실의 Drive 업로드 설정이 필요합니다. 신청자가 파일을 올리면 링크로 저장됩니다.</div>';
    }
    // 예시 문구(placeholder) — 텍스트 입력류만
    if(['text','tel','number','textarea'].indexOf(c.type)>=0){
      h+='<div style="margin-top:6px"><input placeholder="입력칸 예시 문구 (회색 글씨, 예: 12가 3456)" value="'+esc(c.placeholder||'')+'" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;color:#64748b" onchange="_modDefEditCols['+i+'].placeholder=this.value"></div>';
    }
    h+='</div>';
  });
  return h;
}

function _badgeMapToStr(bm){
  return Object.keys(bm).map(function(k){
    var b=bm[k]; return k+':'+( b.label||k)+':'+(b.bg||'#e2e8f0')+':'+(b.color||'#475569');
  }).join(', ');
}
function _strToBadgeMap(s){
  var m={};
  s.split(',').forEach(function(p){
    var a=p.trim().split(':');
    if(a[0]) m[a[0].trim()]={label:a[1]?a[1].trim():a[0].trim(),bg:a[2]?a[2].trim():'#e2e8f0',color:a[3]?a[3].trim():'#475569'};
  });
  return m;
}

function _modDefAddCol(){
  _modDefEditCols.push({key:_modColKey(),label:'',type:'text',required:false,search:true,filter:false,comma:false});
  _modDefRefreshCols();
}
function _modDefRemoveCol(i){
  _modDefEditCols.splice(i,1);
  _modDefRefreshCols();
}
function _modDefMoveCol(i,dir){
  var j=i+dir;if(j<0||j>=_modDefEditCols.length) return;
  var tmp=_modDefEditCols[i];_modDefEditCols[i]=_modDefEditCols[j];_modDefEditCols[j]=tmp;
  _modDefRefreshCols();
}
function _modDefRefreshCols(){
  var el=document.getElementById('mdf_cols_area');
  if(el) el.innerHTML=_renderModDefCols();
}

function saveModDef(keyOrNew){
  var isNew=keyOrNew===-1;
  var label=(document.getElementById('mdf_label').value||'').trim();
  if(!label) return toast('이름을 입력하세요',true);

  var key=isNew ? ('m'+Date.now().toString(36)) : keyOrNew;

  // 컬럼 검증 (key 자동 부여)
  var cols=_modDefEditCols.filter(function(c){return (c.label||'').trim()});
  cols.forEach(function(c){ if(!c.key) c.key=_modColKey(); });
  if(!cols.length) return toast('항목(컬럼)을 최소 1개 추가하세요',true);

  var icon=(document.getElementById('mdf_icon').value||'📦').trim();
  var catLabel=(document.getElementById('mdf_catLabel').value||'').trim();
  var global=document.getElementById('mdf_global').value==='true';
  var afEl=document.getElementById('mdf_applyForm');
  var applyForm=afEl?afEl.checked:false;
  var formTitle=((document.getElementById('mdf_formTitle')||{}).value||'').trim();
  var formDesc=((document.getElementById('mdf_formDesc')||{}).value||'').trim();

  // 신청폼 켜면 선정용 status 컬럼 자동 보장
  if(applyForm && !cols.some(function(c){return c.key==='status'})){
    cols.push({key:'status',label:'선정상태',type:'badge',adminOnly:true,filter:true,
      badgeMap:{'대기':{label:'대기',bg:'#fef3c7',color:'#d97706'},'선정':{label:'선정',bg:'#dcfce7',color:'#16a34a'},'탈락':{label:'탈락',bg:'#fee2e2',color:'#dc2626'}}});
  }

  var def={
    key:key, label:label, icon:icon,
    cat:'custom', catLabel:catLabel||'', catIcon:icon,
    fbPath:'Mod_'+key, global:global,
    columns:cols,
    formTitle:formTitle, formDesc:formDesc,
    features:{search:true,excel:true,applyForm:applyForm}
  };

  showLoading('저장 중...');
  defMod(def);
  _saveModDefs().then(function(){
    hideLoading();toast('✅ 모듈 저장됨');
    closePopup();
    // 탭 갱신
    mkTabs();draw();
    // 데이터 리스너 연결
    modLoadData(key);
  }).catch(function(e){hideLoading();toast('실패: '+e.message,true)});
}

function delModDef(key){
  var def=_modDefs[key]; if(!def) return;
  if(!confirm('"'+def.label+'" 모듈 정의를 삭제할까요?\n(이미 입력된 데이터는 유지됩니다)')) return;
  // 리스너 해제
  if(_modListeners[key]){
    fbDb.ref(_modListeners[key].path).off('value',_modListeners[key].cb);
    delete _modListeners[key];
  }
  delete _modDefs[key];
  delete _modData[key];
  showLoading('삭제 중...');
  _saveModDefs().then(function(){
    hideLoading();toast('삭제됨');mkTabs();draw();
  }).catch(function(e){hideLoading();toast('실패: '+e.message,true)});
}

// ═══════════════════════════════════════════
// 공개 신청폼 + 선정
// ═══════════════════════════════════════════

// 선정/탈락 상태 변경
function modSetStatus(key,id,status){
  var path=_modFbPath(key); if(!path) return;
  var data=(_modData[key]||[]).slice();
  var idx=-1; for(var i=0;i<data.length;i++){if(data[i]._id===id){idx=i;break}}
  if(idx<0) return;
  // 이미 같은 상태면 '대기'로 토글
  var newStatus = (data[idx].status===status) ? '대기' : status;
  var merged={}; for(var k in data[idx])merged[k]=data[idx][k];
  merged.status=newStatus; merged._updatedAt=new Date().toISOString();
  data[idx]=merged;
  fbDb.ref(path).set(data).then(function(){toast(newStatus+' 처리됨')})
    .catch(function(e){toast('실패: '+e.message,true)});
}

// 신청폼 링크 팝업
function popModFormLink(key){
  var def=_modDefs[key]; if(!def) return;
  var base=location.href.split('?')[0];
  var evtId=def.global?'':((CUR_EVT&&CUR_EVT.evtId)||'');
  var url=base+'?modform='+encodeURIComponent(key)+(evtId?'&evtId='+encodeURIComponent(evtId):'');
  var h='<div class="pop-head"><h3>🔗 '+esc(def.label)+' 신청폼 공유</h3></div>';
  h+='<div style="padding:14px">';
  h+='<p style="color:#64748b;font-size:13px;margin-bottom:14px;line-height:1.6">아래 링크를 카톡·문자로 공유하면 누구나 신청할 수 있습니다.<br>신청 내용은 이 목록에 쌓이고, <b>✓ 선정</b> / <b>✕ 탈락</b> 버튼으로 처리할 수 있습니다.</p>';
  h+='<div style="display:flex;gap:6px"><input id="modFormLinkInput" type="text" readonly value="'+esc(url)+'" onclick="this.select()" style="flex:1;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-family:monospace">';
  h+='<button class="btn btn-b" onclick="_copyModFormLink()" style="white-space:nowrap">📋 복사</button></div>';
  h+='<div style="margin-top:14px;text-align:right"><button class="btn" onclick="closePopup()">닫기</button></div>';
  h+='</div>';
  openPopup(h,520);
}
function _copyModFormLink(){
  var el=document.getElementById('modFormLinkInput'); if(!el) return;
  el.select();
  if(navigator.clipboard) navigator.clipboard.writeText(el.value).then(function(){toast('링크 복사됨')}).catch(function(){document.execCommand('copy');toast('링크 복사됨')});
  else { document.execCommand('copy'); toast('링크 복사됨'); }
}

// ── 비로그인 공개 신청폼 렌더 ──
function renderModApplyForm(key,evtId){
  document.body.innerHTML='<div style="min-height:100vh;display:flex;align-items:flex-start;justify-content:center;background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:24px 16px"><div id="modApplyCard" style="background:#fff;border-radius:16px;padding:28px 24px;width:480px;max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)"><div style="text-align:center;color:#94a3b8;padding:30px">불러오는 중...</div></div></div>';
  if(typeof fbDb==='undefined'){ document.getElementById('modApplyCard').innerHTML='<div style="text-align:center;color:#ef4444">시스템 초기화 오류</div>'; return; }
  fbDb.ref('/main/ModDefs').once('value').then(function(snap){
    var defs=snap.val()||[]; if(!Array.isArray(defs))defs=Object.values(defs);
    var def=null; for(var i=0;i<defs.length;i++){if(defs[i]&&defs[i].key===key){def=defs[i];break}}
    if(!def){ document.getElementById('modApplyCard').innerHTML='<div style="text-align:center;color:#64748b;padding:20px">신청폼을 찾을 수 없습니다</div>'; return; }
    if(!(def.features&&def.features.applyForm)){ document.getElementById('modApplyCard').innerHTML='<div style="text-align:center;color:#64748b;padding:20px">이 모듈은 공개 신청을 받지 않습니다</div>'; return; }
    // 파일첨부 컬럼이 있으면 Drive 업로드 URL 로드 (비로그인)
    var hasFile=(def.columns||[]).some(function(c){return c.type==='file'&&!c.adminOnly});
    if(hasFile && evtId && typeof api==='function'){
      api('getApplyConfig',{evtId:evtId}).then(function(cfg){
        if(cfg&&cfg.driveUploadUrl){ try{DRIVE_UPLOAD_URL=cfg.driveUploadUrl;}catch(e){} }
        _renderModApplyUI(def,evtId);
      }).catch(function(){ _renderModApplyUI(def,evtId); });
    } else {
      _renderModApplyUI(def,evtId);
    }
  }).catch(function(e){ document.getElementById('modApplyCard').innerHTML='<div style="text-align:center;color:#ef4444">오류: '+esc(e.message)+'</div>'; });
}

function _renderModApplyUI(def,evtId){
  window.__modApplyDef=def; window.__modApplyEvt=evtId;
  var title=def.formTitle?esc(def.formTitle):((def.icon||'📝')+' '+esc(def.label)+' 신청');
  var desc=def.formDesc?esc(def.formDesc):'아래 내용을 작성 후 신청해 주세요';
  var h='<h2 style="text-align:center;color:#2563eb;margin-bottom:4px;font-size:20px">'+title+'</h2>';
  h+='<p style="text-align:center;color:#94a3b8;font-size:12px;margin-bottom:20px">'+desc+'</p>';
  (def.columns||[]).forEach(function(c){
    if(c.auto||c.adminOnly||c.key==='status') return;
    h+='<div style="margin-bottom:12px"><label style="display:block;font-size:13px;color:#475569;font-weight:600;margin-bottom:4px">'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</label>';
    h+=_modFormField(c,'');
    h+='</div>';
  });
  h+='<button id="modApplyBtn" onclick="submitModApply()" style="width:100%;padding:14px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-top:10px">신청하기</button>';
  h+='<div id="modApplyMsg" style="text-align:center;margin-top:12px;font-size:13px"></div>';
  document.getElementById('modApplyCard').innerHTML=h;
}

function submitModApply(){
  var def=window.__modApplyDef, evtId=window.__modApplyEvt;
  if(!def) return;
  var obj={}, valid=true, firstBad=null, fileTasks=[];
  (def.columns||[]).forEach(function(c){
    if(c.auto||c.adminOnly||c.key==='status') return;
    var el=document.getElementById('mod_f_'+c.key); if(!el) return;
    if(c.type==='consent'){
      if(c.required&&!el.checked){ valid=false; if(!firstBad)firstBad=c.label+'에 동의해 주세요'; }
      obj[c.key]=el.checked?'동의':''; return;
    }
    if(c.type==='file'){
      if(el.files&&el.files[0]){ fileTasks.push({col:c,file:el.files[0]}); }
      else if(c.required){ valid=false; if(!firstBad)firstBad=c.label+' 파일을 첨부해 주세요'; }
      return;
    }
    var v=(el.value||'').trim();
    if(c.type==='number'&&c.comma) v=v.replace(/,/g,'');
    if(c.type==='number'&&v) v=Number(v);
    if(c.required&&!v&&v!==0){ valid=false; if(!firstBad)firstBad=c.label+'을(를) 입력하세요'; }
    obj[c.key]=v;
  });
  var msg=document.getElementById('modApplyMsg');
  if(!valid){ if(msg)msg.innerHTML='<span style="color:#ef4444">'+esc(firstBad)+'</span>'; return; }
  obj._id='m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  obj._createdAt=new Date().toISOString();
  obj.status='대기';
  var btn=document.getElementById('modApplyBtn'); if(btn){btn.disabled=true;btn.textContent=fileTasks.length?'파일 업로드 중...':'신청 중...';}

  // 파일 업로드 먼저 (Drive)
  var upChain=Promise.resolve();
  fileTasks.forEach(function(t){
    upChain=upChain.then(function(){
      return _uploadToDrive(t.file,'mod_'+def.key,t.col.label).then(function(url){ obj[t.col.key]=url; });
    });
  });

  var path=def.global?'/main/'+def.fbPath:'/evtData/'+evtId+'/'+def.fbPath;
  upChain.then(function(){
    if(btn)btn.textContent='신청 중...';
    return fbDb.ref(path).once('value');
  }).then(function(snap){
    var arr=snap.val()||[]; if(!Array.isArray(arr))arr=Object.values(arr);
    arr.push(obj);
    return fbDb.ref(path).set(arr);
  }).then(function(){
    document.getElementById('modApplyCard').innerHTML='<div style="text-align:center;padding:30px"><div style="font-size:48px">✅</div><h2 style="color:#16a34a;margin:12px 0;font-size:20px">신청 완료</h2><p style="color:#64748b;font-size:14px;line-height:1.6">신청이 정상 접수되었습니다.<br>검토 후 개별 안내드리겠습니다.</p></div>';
  }).catch(function(e){
    if(btn){btn.disabled=false;btn.textContent='신청하기';}
    if(msg)msg.innerHTML='<span style="color:#ef4444">제출 실패: '+esc(e.message||e)+'</span>';
  });
}

// ═══════════════════════════════════════════
// 문자(SMS) 발송 — 연락처 컬럼이 있는 모듈
// ═══════════════════════════════════════════

function popModSms(key){
  var def=_modDefs[key]; if(!def) return;
  var telCol=(def.columns||[]).find(function(c){return c.type==='tel'});
  if(!telCol) return toast('연락처 컬럼이 없습니다',true);
  var hasStatus=(def.columns||[]).some(function(c){return c.key==='status'&&c.type==='badge'});
  window.__modSmsKey=key; window.__modSmsTelKey=telCol.key;

  var h='<div class="pop-head"><h3>💬 '+esc(def.label)+' 문자 발송</h3></div>';
  h+='<div style="padding:14px">';
  // 대상 선택
  h+='<label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:6px">발송 대상</label>';
  h+='<select id="modSmsTarget" onchange="_modSmsCount()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;margin-bottom:12px">';
  h+='<option value="all">전체</option>';
  if(hasStatus){
    h+='<option value="선정" selected>선정된 항목만</option>';
    h+='<option value="대기">대기 항목만</option>';
    h+='<option value="notReject">탈락 제외</option>';
  }
  h+='</select>';
  // 본문
  h+='<label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:6px">메시지 내용</label>';
  h+='<textarea id="modSmsBody" rows="5" placeholder="예: [법성포단오제] 푸드트럭 입점 선정 안내드립니다. ..." style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box"></textarea>';
  h+='<div style="font-size:11px;color:#94a3b8;margin-top:4px">90byte 초과 시 LMS(장문)로 자동 전환됩니다</div>';
  h+='<div id="modSmsCount" style="font-size:13px;color:#2563eb;font-weight:700;margin-top:10px"></div>';
  h+='<div style="text-align:right;margin-top:14px">';
  h+='<button class="btn" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" style="background:#8b5cf6" onclick="modSmsSend()">💬 발송</button>';
  h+='</div></div>';
  openPopup(h,460);
  setTimeout(_modSmsCount,50);
}

function _modSmsTargetRows(){
  var key=window.__modSmsKey, telKey=window.__modSmsTelKey;
  var tgt=(document.getElementById('modSmsTarget')||{}).value||'all';
  var rows=(_modData[key]||[]).slice();
  if(tgt==='all') return rows;
  if(tgt==='notReject') return rows.filter(function(r){return r.status!=='탈락'});
  return rows.filter(function(r){return r.status===tgt});
}
function _modSmsCount(){
  var telKey=window.__modSmsTelKey;
  var rows=_modSmsTargetRows().filter(function(r){return (r[telKey]||'').replace(/[^0-9]/g,'').length>=10});
  var el=document.getElementById('modSmsCount');
  if(el) el.textContent='📨 '+rows.length+'명에게 발송됩니다';
}
function modSmsSend(){
  var telKey=window.__modSmsTelKey;
  var body=(document.getElementById('modSmsBody').value||'').trim();
  if(!body) return toast('메시지 내용을 입력하세요',true);
  var rows=_modSmsTargetRows();
  var tels=rows.map(function(r){return (r[telKey]||'').replace(/[^0-9]/g,'')}).filter(function(t){return t.length>=10});
  if(!tels.length) return toast('발송할 연락처가 없습니다',true);
  if(!confirm(tels.length+'명에게 문자를 발송할까요?')) return;
  showLoading('발송 중...');
  api('sendSmsAligo',{id:CID, tels:tels, msg:body}).then(function(r){
    hideLoading();
    if(r&&r.ok){ toast('✅ '+tels.length+'건 발송 완료'); closePopup(); }
    else toast('발송 실패: '+((r&&r.err)||'알 수 없는 오류'),true);
  }).catch(function(e){hideLoading();toast('발송 오류: '+(e.message||e),true)});
}
