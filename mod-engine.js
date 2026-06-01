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
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
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
    if(isA()) h+='<th style="width:80px"></th>';
    h+='</tr></thead><tbody>';

    data.forEach(function(row,idx){
      h+='<tr>';
      h+='<td class="ctr" style="color:#94a3b8">'+(idx+1)+'</td>';
      cols.forEach(function(c){ h+='<td>'+_modFmtCell(c,row[c.key])+'</td>'; });
      if(isA()){
        h+='<td class="ctr">';
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
  switch(col.type){
    case 'textarea':
      return '<textarea id="'+id+'" rows="3" style="resize:vertical">'+ev+'</textarea>';
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
        return '<input id="'+id+'" type="text" inputmode="numeric" value="'+(val?Number(val).toLocaleString():'')+'" oninput="this.value=this.value.replace(/[^\\d,]/g,\'\').replace(/,/g,\'\').replace(/\\B(?=(\\d{3})+(?!\\d))/g,\',\')">';
      }
      return '<input id="'+id+'" type="number" value="'+ev+'">';
    case 'date':
      return '<input id="'+id+'" type="date" value="'+ev+'">';
    case 'tel':
      return '<input id="'+id+'" type="tel" value="'+ev+'" placeholder="010-0000-0000" maxlength="13" oninput="var v=this.value.replace(/[^0-9]/g,\'\');if(v.length<=3)this.value=v;else if(v.length<=7)this.value=v.slice(0,3)+\'-\'+v.slice(3);else this.value=v.slice(0,3)+\'-\'+v.slice(3,7)+\'-\'+v.slice(7,11)">';
    default:
      return '<input id="'+id+'" type="text" value="'+ev+'"'+(col.placeholder?' placeholder="'+esc(col.placeholder)+'"':'')+'>';
  }
}

// ═══════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════

function modSave(key,editId){
  var def=_modDefs[key]; if(!def) return;
  var obj={}, valid=true;
  (def.columns||[]).forEach(function(c){
    if(c.auto) return;
    var el=document.getElementById('mod_f_'+c.key); if(!el) return;
    var v=(el.value||"").trim();
    if(c.type==='number'&&c.comma) v=v.replace(/,/g,'');
    if(c.type==='number'&&v) v=Number(v);
    if(c.required&&!v&&v!==0){ toast(c.label+'을(를) 입력하세요',true); valid=false; }
    obj[c.key]=v;
  });
  if(!valid) return;

  var path=_modFbPath(key);
  if(!path) return toast('행사를 선택하세요',true);

  showLoading('저장 중...');

  if(editId){
    var data=(_modData[key]||[]).slice();
    var idx=-1;
    for(var i=0;i<data.length;i++){if(data[i]._id===editId){idx=i;break}}
    if(idx<0){hideLoading();toast('데이터를 찾을 수 없습니다',true);return}
    obj._id=editId;
    obj._updatedAt=new Date().toISOString();
    var merged={}; for(var k in data[idx])merged[k]=data[idx][k]; for(var k in obj)merged[k]=obj[k];
    data[idx]=merged;
    fbDb.ref(path).set(data).then(function(){hideLoading();toast('✅ 수정됨');closePopup()})
      .catch(function(e){hideLoading();toast('실패: '+e.message,true)});
  } else {
    obj._id=_modId();
    obj._createdAt=new Date().toISOString();
    var data=(_modData[key]||[]).slice();
    data.push(obj);
    fbDb.ref(path).set(data).then(function(){hideLoading();toast('✅ 추가됨');closePopup()})
      .catch(function(e){hideLoading();toast('실패: '+e.message,true)});
  }
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
  {v:"text",l:"텍스트"},{v:"number",l:"숫자"},{v:"date",l:"날짜"},{v:"tel",l:"연락처"},
  {v:"select",l:"선택(드롭다운)"},{v:"textarea",l:"긴 텍스트"},{v:"badge",l:"상태배지"}
];

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
  if(isNew){
    h+='<label style="font-size:12px;font-weight:700;color:#64748b">키 (영문)</label>';
    h+='<input id="mdf_key" value="'+esc(def.key||"")+'" placeholder="예: vehicle" style="font-family:monospace" oninput="this.value=this.value.replace(/[^a-zA-Z0-9_]/g,\'\')">';
  }
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">카테고리</label>';
  h+='<input id="mdf_catLabel" value="'+esc(def.catLabel||"")+'" placeholder="비우면 기본 📦 커스텀">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">데이터 범위</label>';
  h+='<select id="mdf_global"><option value="false"'+(def.global?'':' selected')+'>행사별 (각 행사 데이터 분리)</option><option value="true"'+(def.global?' selected':'')+'>공통 (전체 행사 공유)</option></select>';
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
  if(!_modDefEditCols.length) return '<div style="color:#94a3b8;font-size:12px;padding:12px;text-align:center">컬럼을 추가하세요</div>';
  var h='';
  _modDefEditCols.forEach(function(c,i){
    h+='<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:6px;background:#fff">';
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
    // 키
    h+='<input value="'+esc(c.key||'')+'" placeholder="key" style="width:80px;font-family:monospace;font-size:11px;padding:4px 6px" onchange="_modDefEditCols['+i+'].key=this.value.replace(/[^a-zA-Z0-9_]/g,\'\')">';
    // 이름
    h+='<input value="'+esc(c.label||'')+'" placeholder="이름" style="width:80px;font-size:12px;padding:4px 6px" onchange="_modDefEditCols['+i+'].label=this.value">';
    // 타입
    h+='<select style="font-size:11px;padding:3px" onchange="_modDefEditCols['+i+'].type=this.value;_modDefRefreshCols()">';
    MOD_COL_TYPES.forEach(function(t){
      h+='<option value="'+t.v+'"'+(c.type===t.v?' selected':'')+'>'+t.l+'</option>';
    });
    h+='</select>';
    // 체크박스들
    h+='<label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="checkbox"'+(c.required?' checked':'')+' onchange="_modDefEditCols['+i+'].required=this.checked">필수</label>';
    h+='<label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="checkbox"'+(c.search?' checked':'')+' onchange="_modDefEditCols['+i+'].search=this.checked">검색</label>';
    h+='<label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="checkbox"'+(c.filter?' checked':'')+' onchange="_modDefEditCols['+i+'].filter=this.checked">필터</label>';
    h+='<label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="checkbox"'+(c.comma?' checked':'')+' onchange="_modDefEditCols['+i+'].comma=this.checked">콤마</label>';
    // 순서 / 삭제
    if(i>0) h+='<button onclick="_modDefMoveCol('+i+',-1)" style="border:none;background:none;cursor:pointer;font-size:12px">▲</button>';
    if(i<_modDefEditCols.length-1) h+='<button onclick="_modDefMoveCol('+i+',1)" style="border:none;background:none;cursor:pointer;font-size:12px">▼</button>';
    h+='<button onclick="_modDefRemoveCol('+i+')" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:12px">✕</button>';
    h+='</div>';
    // select/badge일 때 옵션 입력
    if(c.type==='select'){
      h+='<div style="margin-top:4px"><input placeholder="옵션 (쉼표로 구분: 대기,승인,거부)" value="'+esc((c.options||[]).join(','))+'" style="width:100%;font-size:11px;padding:4px 6px" onchange="_modDefEditCols['+i+'].options=this.value.split(\',\').map(function(s){return s.trim()}).filter(Boolean)"></div>';
    }
    if(c.type==='badge'){
      h+='<div style="margin-top:4px"><input placeholder="배지 (key:이름:배경색:글자색, 쉼표구분)" value="'+esc(_badgeMapToStr(c.badgeMap||{}))+'" style="width:100%;font-size:11px;padding:4px 6px" onchange="_modDefEditCols['+i+'].badgeMap=_strToBadgeMap(this.value)"></div>';
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
  _modDefEditCols.push({key:'',label:'',type:'text',required:false,search:true,filter:false,comma:false});
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

  var key=isNew?(document.getElementById('mdf_key').value||'').trim().toLowerCase():keyOrNew;
  if(!key) return toast('키를 입력하세요',true);
  if(isNew&&_modDefs[key]) return toast('이미 존재하는 키입니다',true);

  // 컬럼 검증
  var cols=_modDefEditCols.filter(function(c){return c.key&&c.label});
  if(!cols.length) return toast('컬럼을 최소 1개 추가하세요',true);

  var icon=(document.getElementById('mdf_icon').value||'📦').trim();
  var catLabel=(document.getElementById('mdf_catLabel').value||'').trim();
  var global=document.getElementById('mdf_global').value==='true';

  var def={
    key:key, label:label, icon:icon,
    cat:'custom', catLabel:catLabel||'', catIcon:icon,
    fbPath:'Mod_'+key, global:global,
    columns:cols,
    features:{search:true,excel:true}
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
