// ═══════════════════════════════════════════════════════════════
// mod-engine.js — 범용 CRUD 모듈 엔진  v1.0
// 설정(columns/features)만 정의하면 테이블+폼+CRUD+검색+엑셀 자동 생성
// ═══════════════════════════════════════════════════════════════

var _modDefs={};   // key → 모듈 정의
var _modData={};   // key → 데이터 배열
var _modSort={};   // key → {col, asc}
var _modSearch={}; // key → 검색어
var _modFilter={}; // key → 필터값
var _modSel={};    // key → {_id: true} 선택된 행
var _modSelLast={};// key → 마지막 클릭 인덱스 (Shift 범위선택)
var _modListeners={};
var MOD_DEFS_LOADED=false;

// ─── 유틸 ───
function _modId(){return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
// 현재 처리자(로그인 사용자) 이름/아이디
function _modActor(){ try{ return (typeof ME!=='undefined'&&ME)?(ME.nm||ME.id||''):''; }catch(e){ return ''; } }
// 행 대표 제목(첫 표시 컬럼 값)
function _modRowTitle(def,row){
  var c=(def.columns||[]).filter(function(x){return !x.adminOnly&&x.key!=='status'&&!x.hideTable;})[0];
  return c?String(row[c.key]||''):'';
}
// 모듈 처리 로그 저장 위치 (모듈 데이터와 같은 베이스의 ModLogs 노드)
function _modLogBase(key){
  var def=_modDefs[key]; if(!def) return '';
  if(def.global) return '/main/ModLogs';
  var evtId=(typeof CUR_EVT!=='undefined'&&CUR_EVT&&CUR_EVT.evtId)||'';
  return evtId?('/evtData/'+evtId+'/ModLogs'):'';
}
// 로그 한 건 기록 (act: '승인'/'거부'/'발급'/'추가'/'수정'/'삭제' 등)
function _modLogAdd(key,act,rowId,rowTitle,detail){
  try{
    var base=_modLogBase(key); if(!base||typeof fbDb==='undefined') return;
    var def=_modDefs[key]||{};
    fbDb.ref(base).push({
      t:new Date().toISOString(),
      by:(typeof CID!=='undefined'?CID:''),
      byName:_modActor(),
      modKey:key, modLabel:def.label||key,
      act:act||'', rowId:rowId||'', rowTitle:rowTitle||'', detail:detail||''
    });
  }catch(e){}
}

// 저장된 Drive 주소(썸네일·view 등 어떤 형식이든)에서 파일ID를 뽑아 정상 보기 링크로 변환
function _modDriveViewUrl(url){
  if(!url) return url;
  // 이미 정상 view 링크면 그대로
  if(/drive\.google\.com\/file\/d\/[-\w]{20,}\/view/.test(url)) return url;
  // /d/{id}, id={id}, 또는 첫 20자 이상 영숫자 토큰을 파일ID로 추출
  var m = url.match(/\/d\/([-\w]{20,})/) || url.match(/[?&]id=([-\w]{20,})/) || url.match(/([-\w]{25,})/);
  if(m && m[1]) return 'https://drive.google.com/file/d/'+m[1]+'/view';
  return url;
}

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
  // 이미 같은 경로를 구독 중이면 재등록하지 않음 (무한 재귀 방지)
  if(_modListeners[key] && _modListeners[key].path===path) return;
  if(_modListeners[key]){
    fbDb.ref(_modListeners[key].path).off('value',_modListeners[key].cb);
  }
  var cb=function(snap){
    var val=snap.val();
    if(!val) _modData[key]=[];
    else if(Array.isArray(val)) _modData[key]=val;
    else _modData[key]=Object.values(val);
    // 현재 이 모듈 탭을 보고 있을 때만 다시 그림 (modLoadData 재호출 없이 dMod만)
    if(typeof CTAB!=='undefined' && CTAB==='mod_'+key){
      var el=document.getElementById('mc');
      if(el) el.innerHTML=dMod(key);
    }
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
  // Firebase는 undefined 값을 거부 → JSON 직렬화로 undefined 필드 제거
  arr = JSON.parse(JSON.stringify(arr));
  return fbDb.ref('/main/ModDefs').set(arr);
}

// ═══════════════════════════════════════════
// 렌더링 엔진
// ═══════════════════════════════════════════

function dMod(key){
  var def=_modDefs[key];
  if(!def) return '<div class="card"><div class="empty2">모듈 정의 없음</div></div>';

  var search=_modSearch[key]||"";
  var filter=_modFilter[key]||"";
  var feat=def.features||{};
  var total=(_modData[key]||[]).length;
  var h='<div class="card">';

  // 헤더
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  h+='<h3 style="margin:0">'+(def.icon||"📦")+' '+esc(def.label)+' <span style="color:#94a3b8;font-weight:400">('+total+')</span></h3>';
  var _hasTel=(def.columns||[]).some(function(c){return c.type==='tel'});
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  if(isA() && feat.applyForm) h+='<button class="btn" style="background:#0ea5e9;color:#fff" onclick="popModFormLink(\''+key+'\')">🔗 신청폼 링크</button>';
  if(isA() && _hasTel) h+='<button class="btn" style="background:#8b5cf6;color:#fff" onclick="popModSms(\''+key+'\')">💬 문자 발송</button>';
  if(isA()) h+='<button class="btn" style="background:#475569;color:#fff" onclick="popModLabel(\''+key+'\')">🖨 라벨 출력</button>';
  if(isA()) h+='<button class="btn btn-b" onclick="popModAdd(\''+key+'\')">➕ 추가</button>';
  if(isA()) h+='<button class="btn" style="background:#16a34a;color:#fff" onclick="popModSheet(\''+key+'\')">📊 시트 편집</button>';
  if(isA()) h+='<button class="btn" style="background:#0d9488;color:#fff" onclick="modImportExcel(\''+key+'\')">📤 가져오기</button>';
  if(feat.excel!==false) h+='<button class="btn" onclick="modExportExcel(\''+key+'\')">📥 내보내기</button>';
  if(typeof isSuper==='function'&&isSuper()) h+='<button class="btn" style="background:#7c3aed;color:#fff" onclick="popModLog(\''+key+'\')">📋 로그</button>';
  h+='</div></div>';

  // 검색 + 필터 (검색은 목록 영역만 갱신 → 입력 포커스 유지)
  if(feat.search!==false){
    var fcur=(_modFilter[key]&&typeof _modFilter[key]==='object')?_modFilter[key]:{};
    h+='<div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
    h+='<input id="_modSearch_'+key+'" type="text" placeholder="🔍 검색..." value="'+esc(search)+'" oninput="_modSearchTyped(\''+key+'\',this.value)" style="flex:1;min-width:150px;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px">';
    // 필터 가능한 모든 컬럼을 각각 드롭다운으로
    var fcols=(def.columns||[]).filter(function(c){return c.filter;});
    var anyActive=false;
    fcols.forEach(function(fc){
      var fopts=_modFilterOpts(key,fc);
      if(!fopts.length) return;
      var cur=fcur[fc.key]||'';
      if(cur) anyActive=true;
      h+='<select onchange="_modSetFilter(\''+key+'\',\''+esc(fc.key)+'\',this.value)" style="padding:7px 10px;border:1px solid '+(cur?'#2563eb':'#d1d5db')+';border-radius:8px;font-size:13px;background:'+(cur?'#eff6ff':'#fff')+';color:#334155;font-weight:'+(cur?'700':'400')+'">';
      h+='<option value="">'+esc(fc.label)+' 전체</option>';
      fopts.forEach(function(o){
        h+='<option value="'+esc(String(o.v))+'"'+(String(cur)===String(o.v)?' selected':'')+'>'+esc(o.l)+'</option>';
      });
      h+='</select>';
    });
    if(anyActive) h+='<button class="btn btn-s" style="font-size:11px" onclick="_modClearFilter(\''+key+'\')">필터 해제</button>';
    h+='</div>';
  }

  // 목록 영역 (검색/정렬 시 이 안만 갱신)
  h+='<div id="_modBody_'+key+'">'+_modListHtml(key)+'</div>';
  h+='</div>';
  return h;
}

// 검색/필터/정렬 적용된 데이터
function _modFilteredData(key){
  var def=_modDefs[key]; if(!def) return [];
  var data=(_modData[key]||[]).slice();
  var search=_modSearch[key]||"", filter=_modFilter[key]||"", sort=_modSort[key]||{};
  if(search){
    var q=search.toLowerCase();
    data=data.filter(function(row){
      return (def.columns||[]).some(function(c){
        if(!c.search) return false;
        return String(row[c.key]||"").toLowerCase().indexOf(q)>=0;
      });
    });
  }
  if(filter && typeof filter==='object'){
    // 다중 필터 (모든 조건 AND)
    Object.keys(filter).forEach(function(ck){
      var fv=filter[ck]; if(fv==='') return;
      data=data.filter(function(row){return String(row[ck]||'')===String(fv)});
    });
  } else if(filter){
    // 레거시 단일 문자열 호환
    var fc=(def.columns||[]).find(function(c){return c.filter});
    if(fc) data=data.filter(function(row){return String(row[fc.key]||'')===filter});
  }
  if(sort.col){
    data.sort(function(a,b){
      var va=a[sort.col]||"",vb=b[sort.col]||"";
      var na=Number(va),nb=Number(vb);
      if(!isNaN(na)&&!isNaN(nb)) return sort.asc?na-nb:nb-na;
      return sort.asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
  }
  return data;
}

// 목록(테이블+합계) HTML
function _modListHtml(key){
  var def=_modDefs[key]; if(!def) return '';
  var data=_modFilteredData(key);
  var sort=_modSort[key]||{};
  var cols=(def.columns||[]).filter(function(c){return !c.hideTable});
  var feat=def.features||{};
  if(!data.length) return '<div class="empty2" style="padding:40px">데이터가 없습니다</div>';

  var statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge'});
  var hasSelect=feat.applyForm && statusCol;

  // 선택 상태 정리 (현재 데이터에 없는 id 제거) + 선택 작업 바
  var selMap=_modSel[key]||(_modSel[key]={});
  var dataIds={}; data.forEach(function(r){dataIds[r._id]=1;});
  Object.keys(selMap).forEach(function(id){ if(!dataIds[id]) delete selMap[id]; });
  var selCount=Object.keys(selMap).length;
  var h='';
  if(isA()){
    h+='<div id="_modSelBar_'+key+'" style="display:'+(selCount?'flex':'none')+';align-items:center;gap:8px;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;margin-bottom:8px">';
    h+='<b style="color:#2563eb;font-size:13px"><span id="_modSelCnt_'+key+'">'+selCount+'</span>개 선택</b>';
    h+='<button class="btn btn-s" style="background:#475569;color:#fff" onclick="popModLabelSel(\''+key+'\')">🖨 라벨 출력</button>';
    if((def.columns||[]).some(function(c){return c.type==='tel';})) h+='<button class="btn btn-s" style="background:#8b5cf6;color:#fff" onclick="popModSmsSel(\''+key+'\')">💬 문자 발송</button>';
    if(statusCol){
      Object.keys(statusCol.badgeMap||{}).forEach(function(sk){
        if(sk==='대기') return;
        var bm=statusCol.badgeMap[sk]||{};
        h+='<button class="btn btn-s" onclick="modSetStatusSel(\''+key+'\',\''+esc(sk)+'\')" style="background:'+(bm.bg||'#f1f5f9')+';color:'+(bm.color||'#475569')+';border:1px solid '+(bm.bg||'#cbd5e1')+';font-weight:700">'+esc(bm.label||sk)+' 처리</button>';
      });
    }
    h+='<button class="btn btn-s" style="color:#dc2626" onclick="modDelSel(\''+key+'\')">🗑 선택 삭제</button>';
    h+='<button class="btn btn-s" style="margin-left:auto" onclick="_modSelClear(\''+key+'\')">선택 해제</button>';
    h+='</div>';
  }

  h+='<div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:10px">';
  h+='<table class="tbl"><thead><tr>';
  if(isA()){
    var allOn=data.length>0 && selCount>=data.length;
    h+='<th style="width:32px"><input type="checkbox" id="_modSelAll_'+key+'"'+(allOn?' checked':'')+' onclick="_modSelAll(\''+key+'\',this.checked)" title="전체 선택/해제"></th>';
  }
  h+='<th style="width:36px">#</th>';
  cols.forEach(function(c){
    var arrow=sort.col===c.key?(sort.asc?' ▲':' ▼'):'';
    h+='<th style="cursor:pointer;white-space:nowrap" onclick="_modToggleSort(\''+key+'\',\''+c.key+'\')">'+esc(c.label)+arrow+'</th>';
  });
  if(isA()) h+='<th style="width:'+(hasSelect?'150':'80')+'px"></th>';
  h+='</tr></thead><tbody>';

  data.forEach(function(row,idx){
    var st=row.status||'';
    var sel=!!selMap[row._id];
    h+='<tr'+(st==='탈락'?' style="opacity:.5"':'')+(sel?' class="_modSelRow" style="background:#eff6ff"':'')+'>';
    if(isA()) h+='<td class="ctr"><input type="checkbox" class="_modChk" data-id="'+esc(row._id||'')+'" data-idx="'+idx+'"'+(sel?' checked':'')+' onclick="_modSelToggle(event,\''+key+'\',\''+esc(row._id||'')+'\','+idx+')"></td>';
    h+='<td class="ctr" style="color:#94a3b8">'+(idx+1)+'</td>';
    cols.forEach(function(c){ h+='<td>'+_modFmtCell(c,row[c.key])+'</td>'; });
    if(isA()){
      h+='<td class="ctr" style="white-space:nowrap">';
      if(hasSelect){
        // status 배지에 정의된 상태값(대기 제외)을 각각 버튼으로 (모듈마다 다른 라벨 지원: 선정/탈락 또는 승인/거부 등)
        Object.keys(statusCol.badgeMap||{}).forEach(function(sk){
          if(sk==='대기') return;
          var on=(st===sk), bm=statusCol.badgeMap[sk]||{};
          h+='<button class="btn btn-s" onclick="modSetStatus(\''+key+'\',\''+esc(row._id||'')+'\',\''+esc(sk)+'\')" style="background:'+(on?(bm.bg||'#16a34a'):'#f1f5f9')+';color:'+(on?(bm.color||'#16a34a'):'#475569')+';font-weight:700;border:1px solid '+(bm.bg||'#cbd5e1')+'" title="'+esc(sk)+'">'+esc(bm.label||sk)+'</button> ';
        });
      }
      var _pc=pn(row._printCount);
      h+='<button class="btn btn-s" onclick="modPrintOne(\''+key+'\',\''+esc(row._id||'')+'\')" title="'+(_pc?'재출력 ('+_pc+'회 출력됨)':'라벨 출력')+'" style="'+(_pc?'background:#475569;color:#fff':'')+'">🖨'+(_pc?_pc:'')+'</button> ';
      h+='<button class="btn btn-s" onclick="popModEdit(\''+key+'\',\''+esc(row._id||'')+'\')">✏️</button> ';
      h+='<button class="btn btn-s" onclick="modDel(\''+key+'\',\''+esc(row._id||'')+'\')" style="color:#dc2626">🗑</button>';
      h+='</td>';
    }
    h+='</tr>';
  });
  h+='</tbody></table></div>';

  var sumCols=cols.filter(function(c){return c.type==='number'&&c.comma});
  if(sumCols.length){
    h+='<div style="text-align:right;margin-top:8px;font-size:13px;color:#475569">';
    sumCols.forEach(function(sc){
      var tot=0; data.forEach(function(r){tot+=pn(r[sc.key])});
      h+='<span style="margin-left:16px"><b>'+esc(sc.label)+' 합계:</b> '+tot.toLocaleString()+'원</span>';
    });
    h+='</div>';
  }
  return h;
}

// 검색 입력 — 목록 영역만 갱신 (input 재생성 안 함 → 포커스/한글조합 유지)
function _modSearchTyped(key,val){
  _modSearch[key]=val;
  var b=document.getElementById('_modBody_'+key);
  if(b) b.innerHTML=_modListHtml(key);
}

// ─── 필터 (컬럼별 드롭다운, 다중 동시 적용) ───
function _modFilterOpts(key,fc){
  if(fc.type==='select') return (fc.options||[]).map(function(o){ return {v:typeof o==='object'?o.value:o, l:typeof o==='object'?o.label:o}; });
  if(fc.type==='badge') return Object.keys(fc.badgeMap||{}).map(function(k){ return {v:k, l:(fc.badgeMap[k].label||k)}; });
  // 그 외(텍스트 등) → 실제 데이터의 고유값 자동 수집
  var seen={}, out=[];
  (_modData[key]||[]).forEach(function(r){ var v=String(r[fc.key]||''); if(v&&!seen[v]){seen[v]=1;out.push({v:v,l:v});} });
  out.sort(function(a,b){return String(a.l).localeCompare(String(b.l));});
  return out;
}
function _modSetFilter(key,colKey,val){
  if(!_modFilter[key]||typeof _modFilter[key]!=='object') _modFilter[key]={};
  if(val==='') delete _modFilter[key][colKey]; else _modFilter[key][colKey]=val;
  draw();
}
function _modClearFilter(key){ _modFilter[key]={}; draw(); }

// ─── 명단 행 선택(체크박스) ───
function _modSelToggle(ev,key,id,idx){
  var selMap=_modSel[key]||(_modSel[key]={});
  var data=_modFilteredData(key);
  var checked=ev.target.checked;
  if(ev.shiftKey && _modSelLast[key]!=null && _modSelLast[key]!==idx){
    var a=Math.min(_modSelLast[key],idx), b=Math.max(_modSelLast[key],idx);
    for(var i=a;i<=b;i++){ if(data[i]){ if(checked) selMap[data[i]._id]=true; else delete selMap[data[i]._id]; } }
  } else {
    if(checked) selMap[id]=true; else delete selMap[id];
  }
  _modSelLast[key]=idx;
  _modSelRefresh(key);
}
function _modSelAll(key,on){
  var selMap=_modSel[key]={};
  if(on){ _modFilteredData(key).forEach(function(r){ selMap[r._id]=true; }); }
  _modSelLast[key]=null;
  _modSelRefresh(key);
}
function _modSelClear(key){ _modSel[key]={}; _modSelLast[key]=null; _modSelRefresh(key); }
function _modSelIds(key){ return Object.keys(_modSel[key]||{}); }
// 목록 영역만 다시 그려 체크 상태/작업바 반영
function _modSelRefresh(key){
  var b=document.getElementById('_modBody_'+key);
  if(b) b.innerHTML=_modListHtml(key);
}
// 선택 항목 → 라벨 출력
function popModLabelSel(key){
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  popModLabel(key,null,ids);
}
// 선택 항목 → 일괄 상태 변경
function modSetStatusSel(key,statusKey){
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  var path=_modFbPath(key); if(!path) return;
  var def=_modDefs[key];
  var bm=(def.columns.find(function(c){return c.key==='status';})||{}).badgeMap||{};
  var lbl=(bm[statusKey]&&bm[statusKey].label)||statusKey;
  var actor=_modActor();
  if(!confirm(ids.length+'개 항목을 '+lbl+' 처리하시겠습니까?'+(actor?'\n\n처리자: '+actor:''))) return;
  var data=(_modData[key]||[]).slice();
  var now=new Date().toISOString();
  data.forEach(function(r){ if(ids.indexOf(r._id)>=0){ r.status=statusKey; r._updatedAt=now; r._statusBy=(typeof CID!=='undefined'?CID:''); r._statusByName=actor; r._statusAt=now; } });
  showLoading('처리 중...');
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('✅ '+ids.length+'개 "'+lbl+'" 처리'+(actor?' · '+actor:'')); _modLogAdd(key,lbl,'','('+ids.length+'개 일괄)','상태변경'); _modSel[key]={}; })
    .catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
}
// 선택 항목 → 일괄 삭제
function modDelSel(key){
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  var path=_modFbPath(key); if(!path) return;
  if(!confirm(ids.length+'개 항목을 삭제할까요? (되돌릴 수 없습니다)')) return;
  var data=(_modData[key]||[]).filter(function(r){ return ids.indexOf(r._id)<0; });
  showLoading('삭제 중...');
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('🗑 '+ids.length+'개 삭제됨'); _modLogAdd(key,'삭제','','('+ids.length+'개 일괄)','행 삭제'); _modSel[key]={}; })
    .catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
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
      var _fparts=String(val).split(/\n/).filter(function(u){return u.trim()});
      return _fparts.map(function(p){
        var bi=p.indexOf('|');
        var nm=bi>=0?p.slice(0,bi).trim():'';
        var u =bi>=0?p.slice(bi+1).trim():p.trim();
        return '<a href="'+esc(_modDriveViewUrl(u))+'" target="_blank" style="color:#2563eb;text-decoration:none;white-space:nowrap">📎'+(nm?' <span style="color:#94a3b8;font-weight:400;font-size:11px">'+esc(nm)+'</span>':'')+'</a>';
      }).join('<br>');
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
  var b=document.getElementById('_modBody_'+key);
  if(b) b.innerHTML=_modListHtml(key); else draw();
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
  var _w='width:100%;box-sizing:border-box;';  // 입력칸 너비 통일
  switch(col.type){
    case 'textarea':
      return '<textarea id="'+id+'" rows="3" style="'+_w+'resize:vertical"'+ph+'>'+ev+'</textarea>';
    case 'select':
      var _sopts=col.options||[];
      var _inList=false;
      var _etcId=id+'_etc';
      var h='<select id="'+id+'" style="'+_w+'" onchange="var _e=document.getElementById(\''+_etcId+'\');if(_e)_e.style.display=(this.value===\'__etc__\')?\'block\':\'none\'"><option value="">— 선택 —</option>';
      _sopts.forEach(function(o){
        var ov=typeof o==='object'?o.value:o, ol=typeof o==='object'?o.label:o;
        if(String(ov)===String(val)) _inList=true;
        h+='<option value="'+esc(ov)+'"'+(String(ov)==String(val)?' selected':'')+'>'+esc(ol)+'</option>';
      });
      var _etcOn=(!_inList && val!=null && val!=='');
      h+='<option value="__etc__"'+(_etcOn?' selected':'')+'>+ 직접 입력</option>';
      h+='</select>';
      h+='<input id="'+_etcId+'" placeholder="직접 입력" value="'+(_etcOn?ev:'')+'" style="'+_w+'margin-top:4px;display:'+(_etcOn?'block':'none')+'">';
      return h;
    case 'badge':
      var h='<select id="'+id+'" style="'+_w+'"><option value="">— 선택 —</option>';
      if(col.badgeMap) Object.keys(col.badgeMap).forEach(function(k){
        h+='<option value="'+esc(k)+'"'+(k==val?' selected':'')+'>'+esc(col.badgeMap[k].label||k)+'</option>';
      });
      return h+'</select>';
    case 'number':
      if(col.comma){
        return '<input id="'+id+'" type="text" inputmode="numeric"'+ph+' value="'+(val?Number(val).toLocaleString():'')+'" style="'+_w+'" oninput="this.value=this.value.replace(/[^\\d,]/g,\'\').replace(/,/g,\'\').replace(/\\B(?=(\\d{3})+(?!\\d))/g,\',\')">';
      }
      return '<input id="'+id+'" type="number"'+ph+' value="'+ev+'" style="'+_w+'">';
    case 'date':
      return '<input id="'+id+'" type="date" value="'+ev+'" style="'+_w+'">';
    case 'tel':
      return '<input id="'+id+'" type="tel" value="'+ev+'" placeholder="'+esc(col.placeholder||'010-0000-0000')+'" maxlength="13" style="'+_w+'" oninput="var v=this.value.replace(/[^0-9]/g,\'\');if(v.length<=3)this.value=v;else if(v.length<=7)this.value=v.slice(0,3)+\'-\'+v.slice(3);else this.value=v.slice(0,3)+\'-\'+v.slice(3,7)+\'-\'+v.slice(7,11)">';
    case 'file':
      var fh='';
      if(val){
        String(val).split(/\n/).filter(function(u){return u.trim()}).forEach(function(p,i){
          var bi=p.indexOf('|');
          var nm=bi>=0?p.slice(0,bi).trim():('기존 파일'+(i+1));
          var u =bi>=0?p.slice(bi+1).trim():p.trim();
          fh+='<div style="font-size:12px;margin-bottom:4px"><a href="'+esc(_modDriveViewUrl(u))+'" target="_blank" style="color:#2563eb">📎 <span style="color:#64748b">'+esc(nm)+'</span></a></div>';
        });
      }
      fh+='<input id="'+id+'" type="file" multiple'+(col.accept?' accept="'+esc(col.accept)+'"':'')+' style="font-size:13px">';
      fh+='<div style="font-size:11px;color:#94a3b8;margin-top:2px">여러 개 선택 가능 (새로 선택하면 기존 파일은 교체됩니다)</div>';
      fh+='<input type="hidden" id="'+id+'_prev" value="'+ev+'">';
      return fh;
    case 'consent':
      return '<label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;cursor:pointer;line-height:1.5"><input type="checkbox" id="'+id+'" style="margin-top:3px;flex-shrink:0"'+(val==='동의'?' checked':'')+'> <span>'+esc(col.consentText||col.label||'개인정보 수집·이용에 동의합니다')+'</span></label>';
    default:
      return '<input id="'+id+'" type="text" value="'+ev+'"'+(col.placeholder?' placeholder="'+esc(col.placeholder)+'"':'')+' style="'+_w+'">';
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
      if(el.files&&el.files.length){ fileTasks.push({col:c,files:Array.prototype.slice.call(el.files)}); }
      else { obj[c.key]=prev; if(c.required&&!prev){ toast(c.label+' 파일을 첨부하세요',true); valid=false; } }
      return;
    }
    var v=(el.value||"").trim();
    if(c.type==='select'&&v==='__etc__'){ var _et=document.getElementById('mod_f_'+c.key+'_etc'); v=_et?(_et.value||'').trim():''; }
    if(c.type==='number'&&c.comma) v=v.replace(/,/g,'');
    if(c.type==='number'&&v) v=Number(v);
    if(c.required&&!v&&v!==0){ toast(c.label+'을(를) 입력하세요',true); valid=false; }
    obj[c.key]=v;
  });
  if(!valid) return;

  var path=_modFbPath(key);
  if(!path) return toast('행사를 선택하세요',true);

  showLoading(fileTasks.length?'파일 업로드 중...':'저장 중...');

  // 파일 업로드 전: 전역 Drive URL 비어있으면 모듈 정의에 저장된 URL 사용
  if(fileTasks.length && def.driveUploadUrl && (typeof DRIVE_UPLOAD_URL==='undefined' || !DRIVE_UPLOAD_URL)){
    try{ DRIVE_UPLOAD_URL=def.driveUploadUrl; }catch(e){}
  }

  // 파일 업로드 먼저 (컬럼당 여러 파일 → 줄바꿈으로 연결)
  var upChain=Promise.resolve();
  fileTasks.forEach(function(t){
    upChain=upChain.then(function(){
      var urls=[];
      var sub=Promise.resolve();
      t.files.forEach(function(f){
        sub=sub.then(function(){ return _uploadToDrive(f,'mod_'+key,t.col.label).then(function(url){ urls.push(f.name.replace(/[|\n]/g,' ')+'|'+url); }); });
      });
      return sub.then(function(){ obj[t.col.key]=urls.join('\n'); });
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
  // 첫 열은 고유번호(QR id) — 다시 가져올 때 기존 행을 식별/업데이트하기 위함
  var rows=[['고유번호'].concat(cols.map(function(c){return c.label}))];
  data.forEach(function(row){
    rows.push([row._id||''].concat(cols.map(function(c){
      var v=row[c.key]; if(v==null) return '';
      if(c.type==='badge'&&c.badgeMap&&c.badgeMap[v]) return c.badgeMap[v].label||v;
      return v;
    })));
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
// 시트 편집 (인라인 표 + 엑셀 붙여넣기)
// ═══════════════════════════════════════════

// 시트에서 편집 가능한 컬럼 (파일/동의 제외)
function _mshCols(def){
  return (def.columns||[]).filter(function(c){return !c.hideTable&&c.type!=='file'&&c.type!=='consent';});
}
// badge 라벨↔키 역매핑 (저장 시 입력값이 라벨이면 키로)
function _mshBadgeToKey(col,val){
  if(col.type!=='badge'||!col.badgeMap) return val;
  if(col.badgeMap[val]) return val; // 이미 키
  for(var k in col.badgeMap){ if((col.badgeMap[k].label||k)===val) return k; }
  return val;
}
function _mshCellShow(col,v){
  if(v==null||v==='') return '';
  if(col.type==='badge'&&col.badgeMap&&col.badgeMap[v]) return col.badgeMap[v].label||v;
  if(col.type==='number'&&col.comma&&v!=='') { var n=Number(v); return isNaN(n)?v:n.toLocaleString(); }
  return String(v);
}

function popModSheet(key){
  var def=_modDefs[key]; if(!def) return;
  if(!_modFbPath(key)) return toast('행사를 선택하세요',true);
  var cols=_mshCols(def);
  if(!cols.length) return toast('편집할 컬럼이 없습니다',true);
  window.__mshKey=key; window.__mshDef=def; window.__mshCols=cols;
  var data=(_modData[key]||[]).slice();

  var h='<div class="pop-head"><h3>📊 '+esc(def.label)+' 시트 편집</h3></div>';
  h+='<div style="padding:12px 14px">';
  h+='<div style="font-size:11px;color:#64748b;margin-bottom:8px;line-height:1.6">셀을 직접 수정하거나, 엑셀에서 영역을 복사(Ctrl+C)해 첫 칸 클릭 후 붙여넣기(Ctrl+V)하면 여러 칸이 한 번에 채워집니다. · <b style="color:#16a34a">저장</b>을 눌러야 반영됩니다.</div>';
  h+='<div style="overflow:auto;max-height:60vh;border:1px solid #e2e8f0;border-radius:8px">';
  h+='<table id="msh_table" style="border-collapse:collapse;font-size:13px;white-space:nowrap;min-width:100%">';
  h+='<thead><tr style="background:#f1f5f9;position:sticky;top:0;z-index:2">';
  h+='<th style="padding:6px 8px;border:1px solid #e2e8f0;color:#94a3b8;font-size:11px;position:sticky;left:0;background:#f1f5f9;z-index:3">#</th>';
  cols.forEach(function(c){
    h+='<th style="padding:6px 10px;border:1px solid #e2e8f0;color:#334155;text-align:left;font-weight:700">'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</th>';
  });
  h+='<th style="padding:6px 8px;border:1px solid #e2e8f0;background:#f1f5f9;position:sticky;right:0"></th>';
  h+='</tr></thead><tbody id="msh_tbody">';
  data.forEach(function(row,i){ h+=_mshRowHtml(cols,row,i); });
  h+='</tbody></table>';
  h+='</div>';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:8px">';
  h+='<div><button class="btn btn-s" style="background:#475569;color:#fff" onclick="_mshAddRow()">➕ 행 추가</button> <span id="msh_cnt" style="font-size:12px;color:#94a3b8;margin-left:6px"></span></div>';
  h+='<div><button class="btn" onclick="closePopup()">취소</button> <button class="btn btn-b" style="background:#16a34a" onclick="_mshSave()">💾 저장</button></div>';
  h+='</div></div>';
  openPopup(h, Math.min(960, 320+cols.length*130));
  setTimeout(function(){ _mshBindPaste(); _mshUpdateCnt(); },50);
}

function _mshRowHtml(cols,row,rIdx){
  row=row||{};
  var h='<tr data-id="'+esc(row._id||'')+'">';
  h+='<td style="padding:0;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;background:#f8fafc;position:sticky;left:0;width:30px"><span class="msh_rownum">'+(rIdx+1)+'</span></td>';
  cols.forEach(function(c,ci){
    var v=_mshCellShow(c,row[c.key]);
    h+='<td style="padding:0;border:1px solid #e2e8f0"><input class="msh_cell" data-r="'+rIdx+'" data-ci="'+ci+'" data-key="'+esc(c.key)+'" value="'+esc(v)+'" style="border:none;outline:none;padding:6px 9px;width:100%;min-width:110px;font-size:13px;background:transparent;box-sizing:border-box" onfocus="this.style.background=\'#eff6ff\'" onblur="this.style.background=\'transparent\'"></td>';
  });
  h+='<td style="padding:0 4px;border:1px solid #e2e8f0;text-align:center;background:#f8fafc;position:sticky;right:0"><button onclick="_mshDelRow(this)" style="border:none;background:none;color:#ef4444;cursor:pointer;font-size:14px" title="행 삭제">✕</button></td>';
  h+='</tr>';
  return h;
}

function _mshAddRow(){
  var tbody=document.getElementById('msh_tbody'); if(!tbody) return;
  var rIdx=tbody.querySelectorAll('tr').length;
  tbody.insertAdjacentHTML('beforeend', _mshRowHtml(window.__mshCols, {}, rIdx));
  _mshUpdateCnt();
  return tbody.lastElementChild;
}
function _mshDelRow(btn){
  var tr=btn.closest('tr'); if(tr) tr.parentNode.removeChild(tr);
  _mshRenumber(); _mshUpdateCnt();
}
function _mshRenumber(){
  var trs=document.querySelectorAll('#msh_tbody tr');
  trs.forEach(function(tr,i){
    var n=tr.querySelector('.msh_rownum'); if(n) n.textContent=(i+1);
    tr.querySelectorAll('.msh_cell').forEach(function(inp){ inp.setAttribute('data-r',i); });
  });
}
function _mshUpdateCnt(){
  var el=document.getElementById('msh_cnt'); if(!el) return;
  el.textContent=document.querySelectorAll('#msh_tbody tr').length+'행';
}

// 엑셀 영역 붙여넣기 (\t=열, \n=행)
function _mshBindPaste(){
  var table=document.getElementById('msh_table'); if(!table) return;
  table.addEventListener('paste', function(e){
    var t=e.target;
    if(!t.classList||!t.classList.contains('msh_cell')) return;
    var text=(e.clipboardData||window.clipboardData).getData('text');
    if(text.indexOf('\t')<0 && text.indexOf('\n')<0) return; // 단일 셀은 기본 동작
    e.preventDefault();
    var startR=pn(t.getAttribute('data-r')), startCi=pn(t.getAttribute('data-ci'));
    var lines=text.replace(/\r/g,'').replace(/\n+$/,'').split('\n');
    var nCols=window.__mshCols.length;
    // 필요한 행 수 확보
    var have=document.querySelectorAll('#msh_tbody tr').length;
    var need=startR+lines.length;
    for(var k=have;k<need;k++) _mshAddRow();
    lines.forEach(function(line,ri){
      var cells=line.split('\t');
      cells.forEach(function(val,cii){
        var cc=startCi+cii; if(cc>=nCols) return;
        var inp=table.querySelector('input.msh_cell[data-r="'+(startR+ri)+'"][data-ci="'+cc+'"]');
        if(inp) inp.value=val.trim();
      });
    });
    toast('📋 '+lines.length+'행 붙여넣기');
  });
  // 방향키/엔터 이동
  table.addEventListener('keydown', function(e){
    var t=e.target; if(!t.classList||!t.classList.contains('msh_cell')) return;
    var r=pn(t.getAttribute('data-r')), ci=pn(t.getAttribute('data-ci'));
    var nr=r,nci=ci, move=false;
    if(e.key==='Enter'){ nr=r+1; move=true; }
    else if(e.key==='ArrowDown'){ nr=r+1; move=true; }
    else if(e.key==='ArrowUp'){ nr=r-1; move=true; }
    if(move){
      var nx=table.querySelector('input.msh_cell[data-r="'+nr+'"][data-ci="'+nci+'"]');
      if(nx){ e.preventDefault(); nx.focus(); nx.select(); }
      else if(e.key==='Enter'&&nr>=document.querySelectorAll('#msh_tbody tr').length){ e.preventDefault(); _mshAddRow(); var add=table.querySelector('input.msh_cell[data-r="'+nr+'"][data-ci="'+nci+'"]'); if(add){add.focus();} }
    }
  });
}

function _mshSave(){
  var key=window.__mshKey, def=window.__mshDef, cols=window.__mshCols;
  if(!def) return;
  var path=_modFbPath(key); if(!path) return toast('행사를 선택하세요',true);
  var orig=(_modData[key]||[]);
  var origById={}; orig.forEach(function(r){ if(r._id) origById[r._id]=r; });
  var out=[], invalid=null;
  var trs=document.querySelectorAll('#msh_tbody tr');
  trs.forEach(function(tr){
    var id=tr.getAttribute('data-id')||'';
    var obj=id&&origById[id]?JSON.parse(JSON.stringify(origById[id])):{};
    var anyVal=false;
    tr.querySelectorAll('.msh_cell').forEach(function(inp){
      var c=cols[pn(inp.getAttribute('data-ci'))]; if(!c) return;
      var v=(inp.value||'').trim();
      if(v!=='') anyVal=true;
      if(c.type==='number'){ v=v.replace(/,/g,''); if(v!=='') v=Number(v); }
      else if(c.type==='badge') v=_mshBadgeToKey(c,v);
      obj[c.key]=v;
    });
    // 완전히 빈 신규행은 스킵
    if(!id && !anyVal) return;
    if(!id){ obj._id=_modId(); obj._createdAt=new Date().toISOString(); }
    else obj._updatedAt=new Date().toISOString();
    // 필수값 체크
    cols.forEach(function(c){ if(c.required && (obj[c.key]==null||obj[c.key]==='') && !invalid){ invalid=c.label; } });
    out.push(obj);
  });
  if(invalid) return toast('필수 항목 "'+invalid+'"이(가) 비어있습니다',true);
  showLoading('저장 중...');
  fbDb.ref(path).set(out).then(function(){ hideLoading(); toast('✅ '+out.length+'행 저장됨'); closePopup(); })
    .catch(function(e){ hideLoading(); toast('저장 실패: '+(e.message||e),true); });
}

// ═══════════════════════════════════════════
// 엑셀 가져오기
// ═══════════════════════════════════════════
function modImportExcel(key){
  var def=_modDefs[key]; if(!def) return;
  if(!_modFbPath(key)) return toast('행사를 선택하세요',true);
  if(typeof XLSX==='undefined') return toast('엑셀 라이브러리 로딩 중입니다. 잠시 후 다시 시도하세요',true);
  var inp=document.createElement('input');
  inp.type='file'; inp.accept='.xlsx,.xls,.csv';
  inp.onchange=function(){
    var f=inp.files&&inp.files[0]; if(!f) return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var wb=XLSX.read(ev.target.result,{type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        var aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        _mshImportAoa(key, aoa);
      }catch(e){ toast('파일 읽기 실패: '+(e.message||e),true); }
    };
    reader.readAsArrayBuffer(f);
  };
  inp.click();
}
function _mshImportAoa(key, aoa){
  var def=_modDefs[key]; var cols=_mshCols(def);
  aoa=(aoa||[]).filter(function(r){ return r&&r.some(function(v){return String(v).trim()!==''; }); });
  if(aoa.length<2) return toast('데이터가 없습니다 (첫 행=제목, 둘째 행부터 데이터)',true);
  var header=aoa[0].map(function(s){return String(s).trim();});
  // "고유번호" 열 위치 (있으면 그 행은 기존 데이터 업데이트, 비었으면 신규)
  var idCol=-1;
  header.forEach(function(hl,i){ if(hl==='고유번호'||hl==='_id'||hl==='QR번호') idCol=i; });
  // 헤더 라벨 → 컬럼 인덱스 매핑
  var colMap=header.map(function(hLabel){
    for(var i=0;i<cols.length;i++){ if(cols[i].label===hLabel||cols[i].key===hLabel) return cols[i]; }
    return null;
  });
  var matched=colMap.filter(Boolean).length;
  if(!matched) return toast('일치하는 컬럼명이 없습니다. 제목 행이 "'+cols.map(function(c){return c.label;}).join(', ')+'" 와 같아야 합니다',true);

  // 기존 데이터 (고유번호로 찾기)
  var data=(_modData[key]||[]).slice();
  var byId={}; data.forEach(function(r,i){ if(r._id) byId[r._id]=i; });
  var now=new Date().toISOString();
  var nNew=0, nUpd=0, nMiss=0;

  for(var r=1;r<aoa.length;r++){
    var fields={}, anyVal=false;
    colMap.forEach(function(c,ci){
      if(!c) return;
      var v=String(aoa[r][ci]==null?'':aoa[r][ci]).trim();
      if(v!=='') anyVal=true;
      if(c.type==='number'){ v=v.replace(/,/g,''); if(v!=='') v=Number(v); }
      else if(c.type==='badge') v=_mshBadgeToKey(c,v);
      fields[c.key]=v;
    });
    if(!anyVal) continue;
    var rid = idCol>=0 ? String(aoa[r][idCol]==null?'':aoa[r][idCol]).trim() : '';
    if(rid && byId[rid]!=null){
      // 기존 행 업데이트 (고유번호·QR 유지)
      var idx=byId[rid];
      var merged={}; for(var k in data[idx]) merged[k]=data[idx][k];
      for(var k2 in fields) merged[k2]=fields[k2];
      merged._id=rid; merged._updatedAt=now;
      data[idx]=merged; nUpd++;
    } else {
      if(rid) nMiss++; // 엑셀엔 번호 있는데 기존에 없음 → 신규로 처리
      fields._id=_modId(); fields._createdAt=now; data.push(fields); nNew++;
    }
  }
  if(!nNew && !nUpd) return toast('가져올 데이터 행이 없습니다',true);
  var msg='엑셀 가져오기 결과\n\n';
  msg+='• 새로 추가: '+nNew+'행'+(nMiss?' (그중 '+nMiss+'행은 고유번호가 기존에 없어 신규 생성)':'')+'\n';
  msg+='• 기존 업데이트: '+nUpd+'행 (고유번호/QR 유지)\n\n';
  msg+=(idCol<0?'※ "고유번호" 열이 없어 모두 새로 추가됩니다.\n   (기존 행을 수정하려면 내보내기 파일의 고유번호 열을 그대로 두고 편집하세요)\n\n':'');
  msg+='적용할까요?';
  if(!confirm(msg)) return;
  var path=_modFbPath(key);
  showLoading('가져오는 중...');
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('✅ 신규 '+nNew+' / 수정 '+nUpd+'행 반영'); })
    .catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
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
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">탭 노출 권한</label>';
  h+='<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569"><input type="checkbox" id="mdf_adminTab"'+(def.adminTab?' checked':'')+'> 관리자(SUBADMIN 이상)만 이 탭 보기 <span style="color:#94a3b8">(체크 안 하면 모든 사용자에게 표시)</span></label>';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">공개 신청폼</label>';
  var afOn=def.features&&def.features.applyForm;
  h+='<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569"><input type="checkbox" id="mdf_applyForm"'+(afOn?' checked':'')+'> 켜면 신청폼 링크가 생기고 외부에서 신청 → 선정/탈락 처리 가능</label>';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">신청폼 제목</label>';
  h+='<input id="mdf_formTitle" value="'+esc(def.formTitle||"")+'" placeholder="비우면 「'+esc(def.label||"모듈명")+' 신청」">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">신청폼 안내문</label>';
  h+='<input id="mdf_formDesc" value="'+esc(def.formDesc||"")+'" placeholder="예: 아래 내용을 작성 후 신청해 주세요">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">파일 업로드 URL</label>';
  var _curDrive=def.driveUploadUrl||(typeof DRIVE_UPLOAD_URL!=='undefined'?DRIVE_UPLOAD_URL:'')||'';
  h+='<div><input id="mdf_driveUrl" value="'+esc(_curDrive)+'" placeholder="파일첨부 컬럼 쓸 때만 — 신청 설정의 Drive URL 붙여넣기" style="width:100%;font-family:monospace;font-size:11px"><div style="font-size:10px;color:#94a3b8;margin-top:2px">신청폼에서 파일첨부를 받으려면 필요 (참가신청 설정의 📤 Drive 업로드 URL과 동일한 값)</div></div>';
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
    // 필터 (긴글·파일·동의 제외한 모든 타입) — 체크하면 그 컬럼 값으로 거르는 버튼 자동 생성
    if(['select','badge','text','tel','number','date'].indexOf(c.type)>=0) h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px" title="체크하면 이 컬럼 값(예: 선정/대기)으로 거르는 필터 버튼이 생깁니다"><input type="checkbox"'+(c.filter?' checked':'')+' onchange="_modDefEditCols['+i+'].filter=this.checked">필터</label>';
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
  var adminTab=((document.getElementById('mdf_adminTab')||{}).checked)||false;
  var formTitle=((document.getElementById('mdf_formTitle')||{}).value||'').trim();
  var formDesc=((document.getElementById('mdf_formDesc')||{}).value||'').trim();

  // 신청폼 켜면 선정용 status 컬럼 자동 보장
  if(applyForm && !cols.some(function(c){return c.key==='status'})){
    cols.push({key:'status',label:'선정상태',type:'badge',adminOnly:true,filter:true,
      badgeMap:{'대기':{label:'대기',bg:'#fef3c7',color:'#d97706'},'선정':{label:'선정',bg:'#dcfce7',color:'#16a34a'},'탈락':{label:'탈락',bg:'#fee2e2',color:'#dc2626'}}});
  }

  // 파일첨부용 Drive URL — 입력칸 값 우선, 없으면 현재 행사 로드값
  // (신청폼은 비로그인이라 evtData를 못 읽으므로 공개 경로 ModDefs에 저장)
  var driveInput=((document.getElementById('mdf_driveUrl')||{}).value||'').trim();
  var driveUrl=driveInput || ((typeof DRIVE_UPLOAD_URL!=='undefined' && DRIVE_UPLOAD_URL)||'');

  // 행사별 모듈은 현재 행사에 소속 (그 행사에서만 탭 표시) / 공통은 evtId 없음(전체 표시)
  var modEvtId = global ? '' : ((typeof CUR_EVT!=='undefined' && CUR_EVT && CUR_EVT.evtId)||'');

  var def={
    key:key, label:label, icon:icon,
    cat:'custom', catLabel:catLabel||'', catIcon:icon,
    fbPath:'Mod_'+key, global:global, evtId:modEvtId,
    adminTab:adminTab,
    columns:cols,
    formTitle:formTitle, formDesc:formDesc,
    driveUploadUrl:driveUrl,
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
  var def=_modDefs[key]||{};
  var bm=((def.columns||[]).find(function(c){return c.key==='status';})||{}).badgeMap||{};
  var data=(_modData[key]||[]).slice();
  var idx=-1; for(var i=0;i<data.length;i++){if(data[i]._id===id){idx=i;break}}
  if(idx<0) return;
  // 이미 같은 상태면 '대기'로 토글
  var newStatus = (data[idx].status===status) ? '대기' : status;
  var lbl=(bm[newStatus]&&bm[newStatus].label)||newStatus;
  var actor=_modActor();
  var nm=_modRowTitle(def,data[idx]);
  var q;
  if(newStatus==='대기') q=(nm?'"'+nm+'" ':'')+'대기 상태로 되돌릴까요?';
  else q=(nm?'"'+nm+'"\n\n':'')+lbl+'하시겠습니까?';
  if(!confirm(q+(actor?'\n\n처리자: '+actor:''))) return;
  var now=new Date().toISOString();
  var merged={}; for(var k in data[idx])merged[k]=data[idx][k];
  merged.status=newStatus; merged._updatedAt=now;
  if(newStatus==='대기'){ merged._statusBy=''; merged._statusByName=''; merged._statusAt=''; }
  else { merged._statusBy=(typeof CID!=='undefined'?CID:''); merged._statusByName=actor; merged._statusAt=now; }
  data[idx]=merged;
  showLoading('처리 중...');
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('✅ "'+lbl+'" 처리됨'+(actor?' · '+actor:'')); _modLogAdd(key,lbl,id,nm,'상태변경'); })
    .catch(function(e){ hideLoading(); toast('실패: '+e.message,true); });
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
    // 파일첨부용 Drive URL — 모듈 정의에 저장된 값 사용 (비로그인은 evtData 접근 불가)
    if(def.driveUploadUrl){ try{ DRIVE_UPLOAD_URL=def.driveUploadUrl; }catch(e){} }
    _renderModApplyUI(def,evtId);
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
      if(el.files&&el.files.length){ fileTasks.push({col:c,files:Array.prototype.slice.call(el.files)}); }
      else if(c.required){ valid=false; if(!firstBad)firstBad=c.label+' 파일을 첨부해 주세요'; }
      return;
    }
    var v=(el.value||'').trim();
    if(c.type==='select'&&v==='__etc__'){ var _et=document.getElementById('mod_f_'+c.key+'_etc'); v=_et?(_et.value||'').trim():''; }
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

  // 파일 업로드 먼저 (Drive) — 컬럼당 여러 파일 → 줄바꿈으로 연결
  var upChain=Promise.resolve();
  fileTasks.forEach(function(t){
    upChain=upChain.then(function(){
      var urls=[];
      var sub=Promise.resolve();
      t.files.forEach(function(f){
        sub=sub.then(function(){ return _uploadToDrive(f,'mod_'+def.key,t.col.label).then(function(url){ urls.push(f.name.replace(/[|\n]/g,' ')+'|'+url); }); });
      });
      return sub.then(function(){ obj[t.col.key]=urls.join('\n'); });
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

function popModSmsSel(key){
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  popModSms(key, ids);
}
function popModSms(key, preSelIds){
  var def=_modDefs[key]; if(!def) return;
  var telCol=(def.columns||[]).find(function(c){return c.type==='tel'});
  if(!telCol) return toast('연락처 컬럼이 없습니다',true);
  var hasStatus=(def.columns||[]).some(function(c){return c.key==='status'&&c.type==='badge'});
  window.__modSmsKey=key; window.__modSmsTelKey=telCol.key;
  window.__modSmsPreSel=(preSelIds&&preSelIds.length)?preSelIds.slice():null;
  window.__modSmsFilter={};

  var h='<div class="pop-head"><h3>💬 '+esc(def.label)+' 문자 발송</h3></div>';
  h+='<div style="padding:14px">';
  if(window.__modSmsPreSel){
    // 명단에서 선택한 대상에게
    h+='<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:#2563eb;font-weight:700">📋 명단에서 선택한 '+window.__modSmsPreSel.length+'명에게 발송</div>';
  } else {
    // 대상 선택 (상태 + 필터)
    h+='<label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:6px">발송 대상</label>';
    h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
    if(hasStatus){
      h+='<select id="modSmsTarget" onchange="_modSmsCount()" style="flex:1;min-width:130px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">';
      h+='<option value="all">상태 전체</option>';
      h+='<option value="선정" selected>선정된 항목만</option>';
      h+='<option value="대기">대기 항목만</option>';
      h+='<option value="notReject">탈락 제외</option>';
      h+='</select>';
    }
    // 필터 가능한 모든 컬럼 드롭다운 (status 컬럼 제외)
    (def.columns||[]).filter(function(c){return c.filter && c.key!=='status';}).forEach(function(fc){
      var fopts=_modFilterOpts(key,fc); if(!fopts.length) return;
      h+='<select onchange="_modSmsSetFilter(\''+esc(fc.key)+'\',this.value)" style="flex:1;min-width:130px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">';
      h+='<option value="">'+esc(fc.label)+' 전체</option>';
      fopts.forEach(function(o){ h+='<option value="'+esc(String(o.v))+'">'+esc(o.l)+'</option>'; });
      h+='</select>';
    });
    h+='</div>';
  }
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
function _modSmsSetFilter(colKey,val){
  if(!window.__modSmsFilter) window.__modSmsFilter={};
  if(val==='') delete window.__modSmsFilter[colKey]; else window.__modSmsFilter[colKey]=val;
  _modSmsCount();
}

function _modSmsTargetRows(){
  var key=window.__modSmsKey;
  var rows=(_modData[key]||[]).slice();
  // 명단 선택분이면 그것만
  if(window.__modSmsPreSel){
    var sel=window.__modSmsPreSel;
    return rows.filter(function(r){return sel.indexOf(r._id)>=0;});
  }
  // 상태 필터
  var tgt=(document.getElementById('modSmsTarget')||{}).value||'all';
  if(tgt==='notReject') rows=rows.filter(function(r){return r.status!=='탈락'});
  else if(tgt!=='all') rows=rows.filter(function(r){return r.status===tgt});
  // 컬럼 필터 (다중 AND)
  var f=window.__modSmsFilter||{};
  Object.keys(f).forEach(function(ck){
    if(f[ck]==='') return;
    rows=rows.filter(function(r){return String(r[ck]||'')===String(f[ck]);});
  });
  return rows;
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

// ═══════════════════════════════════════════
// 라벨 출력 (QR 포함) + 출력 카운팅
// ═══════════════════════════════════════════

// 모드별 기본 크기 — 낱장은 크게, A4 모아찍기는 작게
var _MODLBL_DEFAULTS={
  label:{w:90,h:50,pt:4,pr:4,pb:4,pl:4,gap:0,sheetMargin:0,border:false,qr:0,orientation:'portrait'},
  a4:{w:50,h:30,pt:2,pr:2,pb:2,pl:2,gap:2,sheetMargin:10,border:true,qr:0,orientation:'portrait'}
};
// 모드별 크기 세트 로드 (+ 구버전 평면 구조 마이그레이션)
function _modLabelSizes(key){
  var sz={label:Object.assign({},_MODLBL_DEFAULTS.label), a4:Object.assign({},_MODLBL_DEFAULTS.a4)};
  try{
    var s=localStorage.getItem('modLabelOpt_'+key);
    if(s){
      var o=JSON.parse(s);
      if(o.sizes){
        if(o.sizes.label) sz.label=Object.assign(sz.label,o.sizes.label);
        if(o.sizes.a4)    sz.a4=Object.assign(sz.a4,o.sizes.a4);
      } else if(o.w!=null){
        // 구버전: 평면 {w,h,...} → 그 당시 모드 슬롯으로 이전
        var slot=(o.mode==='a4')?'a4':'label';
        sz[slot]=Object.assign(sz[slot],{w:o.w,h:o.h,pt:o.pt,pr:o.pr,pb:o.pb,pl:o.pl});
        if(o.mode==='a4'){ sz.a4.gap=o.gap; sz.a4.sheetMargin=o.sheetMargin; sz.a4.border=o.border; }
      }
    }
  }catch(e){}
  return sz;
}
// 모드별 배치(레이아웃) — 위치도 낱장/A4 완전 분리
function _modLabelLayout(key,mode){
  try{ var s=localStorage.getItem('modLabelLayout_'+key+'_'+mode); if(s) return JSON.parse(s); }catch(e){}
  // 구버전(모드 무관 단일 레이아웃)은 낱장에만 승계
  if(mode==='label'){ try{ var s2=localStorage.getItem('modLabelLayout_'+key); if(s2) return JSON.parse(s2); }catch(e){} }
  return null;
}
function _saveModLabelLayout(key,mode,layout){ try{ localStorage.setItem('modLabelLayout_'+key+'_'+mode, JSON.stringify(layout)); }catch(e){} }

function _modLabelOpt(key){
  var def=_modDefs[key]||{};
  var mode='label', titleKey='', fields=null;
  try{ var s=localStorage.getItem('modLabelOpt_'+key); if(s){ var o=JSON.parse(s); mode=o.mode||'label'; titleKey=o.titleKey||''; fields=o.fields||null; } }catch(e){}
  if(!titleKey){ var c0=(def.columns||[]).filter(function(c){return !c.adminOnly&&c.key!=='status'&&!c.hideTable})[0]; titleKey=c0?c0.key:''; }
  var sizes=_modLabelSizes(key);
  var cur=sizes[mode]||sizes.label;
  var d=Object.assign({mode:mode,titleKey:titleKey,fields:fields,sizes:sizes}, cur);
  d.layout=_modLabelLayout(key,mode);
  return d;
}
function _saveModLabelOpt(key,opt){
  try{
    var save={mode:opt.mode,titleKey:opt.titleKey,fields:opt.fields,sizes:opt.sizes};
    localStorage.setItem('modLabelOpt_'+key, JSON.stringify(save));
  }catch(e){}
}

// ─── 라벨 프리셋 (커스텀 규격: 크기·여백·표시항목·배치 통째 저장) ───
function _mlPresets(key){
  try{ var s=localStorage.getItem('modLabelPresets_'+key); if(s) return JSON.parse(s)||[]; }catch(e){}
  return [];
}
function _mlSavePresets(key,arr){ try{ localStorage.setItem('modLabelPresets_'+key, JSON.stringify(arr)); }catch(e){} }
function _mlPresetOptions(key){
  return _mlPresets(key).map(function(p,i){ return '<option value="'+i+'">'+esc(p.name||('프리셋'+(i+1)))+(p.mode==='a4'?' (A4)':' (낱장)')+'</option>'; }).join('');
}
function _mlRefreshPresetSelect(key,selIdx){
  var sel=document.getElementById('ml_preset'); if(!sel) return;
  sel.innerHTML='<option value="">— 직접 설정 —</option>'+_mlPresetOptions(key);
  if(selIdx!=null) sel.value=String(selIdx);
}
// 현재 설정을 프리셋 객체로
function _mlCurrentPreset(name){
  var opt=_modLabelReadOpt();
  return {
    name:name, mode:opt.mode,
    w:opt.w,h:opt.h,pt:opt.pt,pr:opt.pr,pb:opt.pb,pl:opt.pl,
    gap:opt.gap,sheetMargin:opt.sheetMargin,border:opt.border,qr:opt.qr,orientation:opt.orientation,
    titleKey:opt.titleKey, fields:opt.fields, layout:opt.layout
  };
}
function _mlPresetSaveNew(){
  var key=window.__modLabelKey; if(!key) return;
  var name=(prompt('프리셋 이름을 입력하세요 (예: 100x30 라벨)','')||'').trim();
  if(!name) return;
  var arr=_mlPresets(key);
  arr.push(_mlCurrentPreset(name));
  _mlSavePresets(key,arr);
  _mlRefreshPresetSelect(key, arr.length-1);
  toast('프리셋 "'+name+'" 저장됨');
}
function _mlPresetUpdate(){
  var key=window.__modLabelKey; if(!key) return;
  var sel=document.getElementById('ml_preset'); if(!sel||sel.value==='') return toast('수정할 프리셋을 먼저 선택하세요',true);
  var arr=_mlPresets(key); var i=pn(sel.value); if(!arr[i]) return;
  var name=arr[i].name;
  if(!confirm('"'+name+'" 프리셋을 현재 설정으로 덮어쓸까요?')) return;
  arr[i]=_mlCurrentPreset(name);
  _mlSavePresets(key,arr);
  toast('프리셋 "'+name+'" 수정됨');
}
function _mlPresetDelete(){
  var key=window.__modLabelKey; if(!key) return;
  var sel=document.getElementById('ml_preset'); if(!sel||sel.value==='') return toast('삭제할 프리셋을 선택하세요',true);
  var arr=_mlPresets(key); var i=pn(sel.value); if(!arr[i]) return;
  if(!confirm('"'+arr[i].name+'" 프리셋을 삭제할까요?')) return;
  arr.splice(i,1);
  _mlSavePresets(key,arr);
  _mlRefreshPresetSelect(key, '');
  toast('삭제됨');
}
function _mlPresetLoad(){
  var key=window.__modLabelKey; if(!key) return;
  var sel=document.getElementById('ml_preset'); if(!sel||sel.value==='') return; // 직접 설정 — 조용히
  var arr=_mlPresets(key); var p=arr[pn(sel.value)]; if(!p) return;
  var mode=p.mode||'label';
  window.__mlMode=mode;
  if(!window.__mlSizes) window.__mlSizes={};
  window.__mlSizes[mode]=Object.assign(window.__mlSizes[mode]||{},{
    w:p.w,h:p.h,pt:p.pt,pr:p.pr,pb:p.pb,pl:p.pl,gap:p.gap,sheetMargin:p.sheetMargin,border:p.border,qr:p.qr,orientation:p.orientation
  });
  // 모드 UI 토글
  document.querySelectorAll('.ml_mode_opt').forEach(function(el){
    var on=el.querySelector('input').value===mode;
    el.style.borderColor=on?'#6366f1':'#cbd5e1'; el.style.background=on?'#eef2ff':'#fff'; el.querySelector('input').checked=on;
  });
  var a4=document.getElementById('ml_a4opts'); if(a4) a4.style.display=(mode==='a4')?'block':'none';
  _mlSetSizeInputs(window.__mlSizes[mode]);
  var t=document.getElementById('ml_title'); if(t&&p.titleKey) t.value=p.titleKey;
  document.querySelectorAll('.ml_field').forEach(function(cb){ cb.checked = p.fields ? (p.fields.indexOf(cb.value)>=0) : true; });
  if(p.layout) _saveModLabelLayout(key, mode, p.layout);
  else { try{ localStorage.removeItem('modLabelLayout_'+key+'_'+mode); }catch(e){} }
  _modLabelPreview();
  toast('프리셋 "'+p.name+'" 적용');
}

// QR이 가리킬 조회 URL (스캔 시 그 항목 정보 페이지)
function _modViewUrl(def,row){
  var base=location.href.split('?')[0];
  var evtId=def.global?'':((typeof CUR_EVT!=='undefined'&&CUR_EVT&&CUR_EVT.evtId)||'');
  return base+'?modview='+encodeURIComponent(def.key)+'&id='+encodeURIComponent(row._id||'')+(evtId?'&evtId='+encodeURIComponent(evtId):'');
}
function _modPlain(c,v){ if(c.type==='number'&&c.comma) return Number(v).toLocaleString(); return String(v); }

function _modLabelHtml(def,row,opt){
  var allc=(def.columns||[]).filter(function(c){return !c.adminOnly&&c.key!=='status'&&!c.hideTable&&c.type!=='file'&&c.type!=='consent'});
  var hasFields=!!(opt.fields&&opt.fields.length);
  var cols=hasFields ? allc.filter(function(c){return opt.fields.indexOf(c.key)>=0;}) : allc;
  // 표시 여부: 항목 체크가 있으면 그에 따름. 제목/ QR도 동일하게 제어
  var showTitle = !hasFields || opt.fields.indexOf(opt.titleKey)>=0;
  var showQr = !hasFields || opt.fields.indexOf('_qr')>=0;
  var url=_modViewUrl(def,row);
  var qr='https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data='+encodeURIComponent(url);
  var titleV = opt.titleKey ? (row[opt.titleKey]||'') : (cols[0]?row[cols[0].key]:'');
  // QR 크기: 지정(opt.qr>0)하면 그 mm로 정사각형, 아니면 자동. 라벨 안 넘치게 제한
  var qrmm = (opt.qr&&opt.qr>0) ? opt.qr : Math.min((opt.h-opt.pt-opt.pb), opt.w*0.34);
  qrmm = Math.max(8, Math.min(qrmm, opt.h-opt.pt-opt.pb, opt.w-opt.pl-opt.pr));
  var layout = opt.layout || null;
  if(layout && layout.mode==='free' && layout.pos){
    var pos=layout.pos;
    var h='<div class="mlabel" style="width:'+opt.w+'mm;height:'+opt.h+'mm;position:relative;box-sizing:border-box;overflow:hidden">';
    if(showQr){
      var qp=pos['_qr']||{x:70,y:4,w:25};
      h+='<img src="'+qr+'" style="position:absolute;left:'+qp.x+'%;top:'+qp.y+'%;width:'+(qp.w||25)+'mm;height:'+(qp.w||25)+'mm">';
    }
    if(showTitle){
      var tp=pos['_title']||{x:4,y:4,fs:14};
      h+='<div style="position:absolute;left:'+tp.x+'%;top:'+tp.y+'%;font-size:'+(tp.fs||14)+'pt;font-weight:800;line-height:1.1;white-space:nowrap">'+esc(String(titleV))+'</div>';
    }
    cols.forEach(function(c){
      if(c.key===opt.titleKey) return;
      var v=row[c.key]; if(v==null||v==='') return;
      var fp=pos[c.key]||null;
      if(!fp) return;
      h+='<div style="position:absolute;left:'+fp.x+'%;top:'+fp.y+'%;font-size:'+(fp.fs||7.5)+'pt;line-height:1.3;color:#222;white-space:nowrap"><b>'+esc(c.label)+'</b> '+esc(_modPlain(c,v))+'</div>';
    });
    h+='</div>';
    return h;
  }
  var h='<div class="mlabel" style="width:'+opt.w+'mm;height:'+opt.h+'mm;padding:'+opt.pt+'mm '+opt.pr+'mm '+opt.pb+'mm '+opt.pl+'mm;box-sizing:border-box;display:flex;gap:2mm;overflow:hidden">';
  h+='<div style="flex:1;min-width:0;overflow:hidden">';
  if(showTitle) h+='<div style="font-size:14pt;font-weight:800;line-height:1.1;margin-bottom:1mm;word-break:break-all">'+esc(String(titleV))+'</div>';
  cols.forEach(function(c){
    if(c.key===opt.titleKey) return;
    var v=row[c.key]; if(v==null||v==='') return;
    h+='<div style="font-size:7.5pt;line-height:1.3;color:#222"><b>'+esc(c.label)+'</b> '+esc(_modPlain(c,v))+'</div>';
  });
  h+='</div>';
  if(showQr) h+='<img src="'+qr+'" style="width:'+qrmm+'mm;height:'+qrmm+'mm;align-self:flex-start;flex-shrink:0">';
  h+='</div>';
  return h;
}

function popModLabel(key,singleId,idsList){
  var def=_modDefs[key]; if(!def) return;
  var opt=_modLabelOpt(key);
  var rows;
  if(singleId) rows=(_modData[key]||[]).filter(function(r){return r._id===singleId});
  else if(idsList&&idsList.length) rows=(_modData[key]||[]).filter(function(r){return idsList.indexOf(r._id)>=0});
  else rows=_modFilteredData(key);
  if(!rows.length) return toast('출력할 항목이 없습니다',true);
  window.__modLabelKey = key;
  window.__modLabelAll = rows;            // 후보 행 객체(순서 유지)
  window.__modLabelRows = rows.map(function(r){return r._id;});  // 미리보기용(첫 행)
  window.__mlPickLast = -1;
  window.__mlMode = opt.mode||'label';    // 현재 출력 모드
  window.__mlSizes = JSON.parse(JSON.stringify(opt.sizes||{})); // 모드별 크기 작업 사본
  var allCols=(def.columns||[]).filter(function(c){return !c.adminOnly&&c.key!=='status'&&!c.hideTable&&c.type!=='file'&&c.type!=='consent'});
  var fieldOpts=allCols.map(function(c){return '<option value="'+esc(c.key)+'"'+(opt.titleKey===c.key?' selected':'')+'>'+esc(c.label)+'</option>';}).join('');
  var checkedFields=(opt.fields&&opt.fields.length)?opt.fields:allCols.map(function(c){return c.key;}).concat(['_qr']);
  var isA4=(opt.mode==='a4');

  var h='<div class="pop-head"><h3>🖨 '+esc(def.label)+' 라벨 출력</h3></div>';
  h+='<div style="padding:14px;max-height:78vh;overflow:auto">';

  // ── 라벨 프리셋 (커스텀 규격 저장/불러오기) ──
  h+='<div style="margin-bottom:12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:10px">';
  h+='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">';
  h+='<span style="font-size:13px;font-weight:800;color:#334155">📐 라벨 프리셋</span>';
  h+='<select id="ml_preset" onchange="_mlPresetLoad()" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid #94a3b8;border-radius:6px;font-size:13px;background:#fff;font-weight:600"><option value="">— 프리셋 선택 (바로 적용) —</option>'+_mlPresetOptions(key)+'</select>';
  h+='</div>';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  h+='<button class="btn btn-s" style="background:#16a34a;color:#fff;font-weight:700;font-size:12px;flex:1" onclick="_mlPresetSaveNew()">＋ 새 프리셋 저장</button>';
  h+='<button class="btn btn-s" style="background:#f59e0b;color:#fff;font-weight:700;font-size:12px;flex:1" onclick="_mlPresetUpdate()">✎ 현재설정으로 수정</button>';
  h+='<button class="btn btn-s" style="background:#ef4444;color:#fff;font-weight:700;font-size:12px" onclick="_mlPresetDelete()">🗑 삭제</button>';
  h+='</div>';
  h+='</div>';

  // ── 출력 방식 선택 ──
  h+='<div style="display:flex;gap:8px;margin-bottom:12px">';
  h+='<label class="ml_mode_opt" style="flex:1;display:flex;align-items:center;gap:6px;padding:9px 10px;border:2px solid '+(isA4?'#cbd5e1':'#6366f1')+';border-radius:8px;cursor:pointer;background:'+(isA4?'#fff':'#eef2ff')+'" onclick="_mlSetMode(\'label\')"><input type="radio" name="ml_mode" value="label"'+(isA4?'':' checked')+'> <span style="font-size:13px;font-weight:700">🏷 라벨 낱장</span><span style="font-size:10px;color:#94a3b8">라벨 프린터</span></label>';
  h+='<label class="ml_mode_opt" style="flex:1;display:flex;align-items:center;gap:6px;padding:9px 10px;border:2px solid '+(isA4?'#6366f1':'#cbd5e1')+';border-radius:8px;cursor:pointer;background:'+(isA4?'#eef2ff':'#fff')+'" onclick="_mlSetMode(\'a4\')"><input type="radio" name="ml_mode" value="a4"'+(isA4?' checked':'')+'> <span style="font-size:13px;font-weight:700">📄 A4 용지</span><span style="font-size:10px;color:#94a3b8">여러 칸 모아찍기</span></label>';
  h+='</div>';

  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">';
  h+='<label style="font-size:12px;color:#475569">라벨 가로(mm)<input id="ml_w" type="number" value="'+opt.w+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569">라벨 세로(mm)<input id="ml_h" type="number" value="'+opt.h+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569">위 여백(mm)<input id="ml_pt" type="number" value="'+opt.pt+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569">아래 여백(mm)<input id="ml_pb" type="number" value="'+opt.pb+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569">왼쪽 여백(mm)<input id="ml_pl" type="number" value="'+opt.pl+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569">오른쪽 여백(mm)<input id="ml_pr" type="number" value="'+opt.pr+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569;grid-column:1/3">QR 크기(mm) <span style="font-size:10px;color:#94a3b8">(0=자동, 정사각형)</span><input id="ml_qr" type="number" value="'+(opt.qr||0)+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='</div>';

  // ── A4 전용 옵션 ──
  h+='<div id="ml_a4opts" style="display:'+(isA4?'block':'none')+';background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px">';
  h+='<div style="font-size:11px;font-weight:700;color:#6366f1;margin-bottom:6px">📄 A4 모아찍기 설정</div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:8px">';
  var isLand=(opt.orientation==='landscape');
  h+='<label class="ml_ori_opt" style="flex:1;text-align:center;padding:7px;border:2px solid '+(isLand?'#cbd5e1':'#6366f1')+';border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;background:'+(isLand?'#fff':'#eef2ff')+'" onclick="_mlSetOri(\'portrait\')"><input type="radio" name="ml_ori" value="portrait"'+(isLand?'':' checked')+' style="display:none">📄 세로</label>';
  h+='<label class="ml_ori_opt" style="flex:1;text-align:center;padding:7px;border:2px solid '+(isLand?'#6366f1':'#cbd5e1')+';border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;background:'+(isLand?'#eef2ff':'#fff')+'" onclick="_mlSetOri(\'landscape\')"><input type="radio" name="ml_ori" value="landscape"'+(isLand?' checked':'')+' style="display:none">📄 가로</label>';
  h+='</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  h+='<label style="font-size:12px;color:#475569">라벨 간격(mm)<input id="ml_gap" type="number" value="'+opt.gap+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569">용지 여백(mm)<input id="ml_smargin" type="number" value="'+opt.sheetMargin+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='</div>';
  h+='<label style="font-size:12px;color:#475569;display:flex;align-items:center;gap:5px;margin-top:8px"><input id="ml_border" type="checkbox"'+(opt.border?' checked':'')+' onchange="_modLabelPreview()"> 라벨 테두리선 표시 (자르는 선)</label>';
  h+='<div id="ml_a4info" style="font-size:11px;color:#64748b;margin-top:6px"></div>';
  h+='</div>';

  h+='<label style="font-size:12px;color:#475569;display:block;margin-bottom:10px">크게 표시할 항목<select id="ml_title" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" onchange="_modLabelPreview()">'+fieldOpts+'</select></label>';
  h+='<div style="font-size:12px;color:#475569;margin-bottom:10px">라벨에 표시할 항목 <span style="font-size:10px;color:#94a3b8">(체크한 것만, 컬럼 순서대로 · 위치/글씨크기는 「📐 배치 편집」)</span>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px">';
  allCols.forEach(function(c){
    h+='<label style="font-size:12px;display:flex;align-items:center;gap:3px;background:#f1f5f9;padding:3px 8px;border-radius:6px"><input type="checkbox" class="ml_field" value="'+esc(c.key)+'"'+(checkedFields.indexOf(c.key)>=0?' checked':'')+' onchange="_modLabelPreview()"> '+esc(c.label)+'</label>';
  });
  // QR 코드 표시 항목 (작은 라벨에선 끌 수 있게)
  h+='<label style="font-size:12px;display:flex;align-items:center;gap:3px;background:#ede9fe;padding:3px 8px;border-radius:6px;font-weight:700;color:#6d28d9"><input type="checkbox" class="ml_field" value="_qr"'+(checkedFields.indexOf('_qr')>=0?' checked':'')+' onchange="_modLabelPreview()"> ▣ QR코드</label>';
  h+='</div></div>';

  // ── 출력 대상 선택 (체크 / 전체선택·해제 / Shift 범위 / 상태별) ──
  if(!singleId){
    var statusColL=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge';});
    h+='<div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">출력 대상 선택';
    h+='<button class="btn btn-s" style="font-size:11px;padding:2px 8px" onclick="_mlPickAll(true)">전체 선택</button>';
    h+='<button class="btn btn-s" style="font-size:11px;padding:2px 8px" onclick="_mlPickAll(false)">전체 해제</button>';
    if(statusColL){
      h+='<select onchange="_mlPickByStatus(this.value)" style="font-size:11px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:6px" title="상태별로 체크">';
      h+='<option value="">상태별 선택…</option>';
      Object.keys(statusColL.badgeMap||{}).forEach(function(sk){
        h+='<option value="'+esc(sk)+'">'+esc((statusColL.badgeMap[sk].label||sk))+'만</option>';
      });
      h+='</select>';
    }
    h+='<span style="font-size:10px;color:#94a3b8;font-weight:400">(Shift+클릭: 범위)</span>';
    h+='<span id="ml_pickcnt" style="margin-left:auto;color:#2563eb;font-weight:700"></span></div>';
    h+='<div style="border:1px solid #e2e8f0;border-radius:8px;max-height:200px;overflow:auto;margin-bottom:12px">';
    rows.forEach(function(r,i){
      var nm=opt.titleKey?(r[opt.titleKey]||''):(allCols[0]?r[allCols[0].key]:'');
      if(nm==null||nm==='') nm='(제목없음)';
      var sub=allCols.filter(function(c){return c.key!==opt.titleKey;}).slice(0,2).map(function(c){var v=r[c.key];return (v==null||v==='')?'':_modPlain(c,v);}).filter(Boolean).join(' · ');
      h+='<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:13px">';
      h+='<input type="checkbox" class="ml_pick" data-idx="'+i+'" checked onclick="_mlPickClick(event,'+i+')" style="flex-shrink:0">';
      h+='<span style="color:#94a3b8;font-size:11px;width:24px;text-align:right;flex-shrink:0">'+(i+1)+'</span>';
      h+='<span style="font-weight:600;color:#0f172a">'+esc(String(nm))+'</span>';
      if(sub) h+='<span style="color:#94a3b8;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(sub)+'</span>';
      h+='</label>';
    });
    h+='</div>';
  }

  h+='<div style="font-size:12px;font-weight:700;margin-bottom:4px;color:#475569">미리보기 (QR 스캔 → 정보 조회 페이지)</div>';
  h+='<div id="ml_preview" style="background:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;text-align:center"></div>';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><button class="btn" style="background:#6366f1;color:#fff" onclick="popModLabelLayout(\''+key+'\')">📐 배치 편집</button><div><button class="btn" onclick="closePopup()">취소</button> <button class="btn btn-b" style="background:#475569" onclick="modDoPrint()">🖨 <span id="ml_printcnt">'+rows.length+'</span>장 출력</button></div></div>';
  h+='</div>';
  openPopup(h,560);
  setTimeout(function(){ _modLabelPreview(); _mlUpdatePickCount(); },60);
}

// 입력칸 → 현재 모드 크기 슬롯에 동기화
function _mlSyncSizeFromInputs(){
  if(!window.__mlSizes||!window.__mlMode) return;
  var g=function(id){ var e=document.getElementById(id); return e?(pn(e.value)||0):0; };
  var prev=window.__mlSizes[window.__mlMode]||{};
  var s={w:g('ml_w')||90,h:g('ml_h')||50,pt:g('ml_pt'),pr:g('ml_pr'),pb:g('ml_pb'),pl:g('ml_pl'),qr:g('ml_qr')};
  if(window.__mlMode==='a4'){
    s.gap=g('ml_gap'); s.sheetMargin=g('ml_smargin'); s.border=!!(document.getElementById('ml_border')||{}).checked;
    var oriEl=document.querySelector('input[name="ml_ori"]:checked'); s.orientation=oriEl?oriEl.value:(prev.orientation||'portrait');
  }
  window.__mlSizes[window.__mlMode]=Object.assign(prev,s);
}
// 모드 크기 슬롯 → 입력칸 반영
function _mlSetSizeInputs(sz){
  sz=sz||{};
  var set=function(id,v){ var e=document.getElementById(id); if(e) e.value=(v==null?'':v); };
  set('ml_w',sz.w); set('ml_h',sz.h); set('ml_pt',sz.pt); set('ml_pr',sz.pr); set('ml_pb',sz.pb); set('ml_pl',sz.pl); set('ml_qr',sz.qr||0);
  set('ml_gap',sz.gap); set('ml_smargin',sz.sheetMargin);
  var b=document.getElementById('ml_border'); if(b) b.checked=!!sz.border;
  _mlSetOriUI(sz.orientation||'portrait');
}
// A4 방향 토글
function _mlSetOriUI(ori){
  document.querySelectorAll('.ml_ori_opt').forEach(function(el){
    var inp=el.querySelector('input'); var on=inp&&inp.value===ori;
    if(inp) inp.checked=on;
    el.style.borderColor=on?'#6366f1':'#cbd5e1';
    el.style.background=on?'#eef2ff':'#fff';
  });
}
function _mlSetOri(ori){ _mlSetOriUI(ori); _modLabelPreview(); }
// 상태별 체크 (예: 승인된 것만)
function _mlPickByStatus(status){
  if(status==='') return;
  var all=window.__modLabelAll||[];
  _mlPicks().forEach(function(cb){
    var r=all[pn(cb.getAttribute('data-idx'))];
    cb.checked = !!(r && r.status===status);
  });
  _mlUpdatePickCount();
}
// 출력 모드 전환 — 크기/여백/간격/배치를 모드별로 스왑
function _mlSetMode(mode){
  if(window.__mlMode===mode) return;
  _mlSyncSizeFromInputs();                 // 현재 모드 입력값 보존
  window.__mlMode=mode;
  _mlSetSizeInputs((window.__mlSizes||{})[mode]); // 새 모드 크기 로드
  var a4=document.getElementById('ml_a4opts'); if(a4) a4.style.display=(mode==='a4')?'block':'none';
  document.querySelectorAll('.ml_mode_opt').forEach(function(el){
    var on=el.querySelector('input').value===mode;
    el.style.borderColor=on?'#6366f1':'#cbd5e1';
    el.style.background=on?'#eef2ff':'#fff';
    el.querySelector('input').checked=on;
  });
  _modLabelPreview();
}
// 출력 대상 체크 헬퍼
function _mlPicks(){ return Array.prototype.slice.call(document.querySelectorAll('.ml_pick')); }
function _mlPickAll(on){ _mlPicks().forEach(function(cb){ cb.checked=on; }); _mlUpdatePickCount(); }
function _mlPickClick(ev,idx){
  var picks=_mlPicks();
  if(ev.shiftKey && window.__mlPickLast>=0 && window.__mlPickLast!==idx){
    var a=Math.min(window.__mlPickLast,idx), b=Math.max(window.__mlPickLast,idx);
    var target=picks[idx].checked;
    for(var i=a;i<=b;i++){ if(picks[i]) picks[i].checked=target; }
  }
  window.__mlPickLast=idx;
  _mlUpdatePickCount();
}
function _mlUpdatePickCount(){
  var picks=_mlPicks();
  var n = picks.length ? picks.filter(function(cb){return cb.checked;}).length : (window.__modLabelAll||[]).length;
  var cntEl=document.getElementById('ml_pickcnt'); if(cntEl) cntEl.textContent='선택 '+n+'개';
  var pc=document.getElementById('ml_printcnt'); if(pc) pc.textContent=n;
  // A4 예상 장수 갱신
  var modeEl=document.querySelector('input[name="ml_mode"]:checked');
  if(modeEl && modeEl.value==='a4') _modLabelPreview();
}
function _mlSelectedIds(){
  var picks=_mlPicks();
  var all=window.__modLabelAll||[];
  if(!picks.length) return all.map(function(r){return r._id;});  // 단일출력 등
  var ids=[];
  picks.forEach(function(cb){ if(cb.checked){ var i=pn(cb.getAttribute('data-idx')); if(all[i]) ids.push(all[i]._id); } });
  return ids;
}
function _modLabelReadOpt(){
  var key=window.__modLabelKey||'';
  var mode=window.__mlMode||'label';
  _mlSyncSizeFromInputs();
  var sizes=window.__mlSizes||_modLabelSizes(key);
  var cur=sizes[mode]||{};
  var fields=[];
  document.querySelectorAll('.ml_field:checked').forEach(function(el){ fields.push(el.value); });
  var layout=_modLabelLayout(key,mode);
  return Object.assign({
    mode:mode,
    titleKey:(document.getElementById('ml_title')||{}).value||'',
    fields:fields,
    layout:layout,
    sizes:sizes
  }, cur);
}
// A4 한 장에 들어가는 칸 수 계산 (세로 210x297, 가로 297x210)
function _mlA4Grid(opt){
  var land=(opt.orientation==='landscape');
  var pw=land?297:210, ph=land?210:297;
  var availW=pw-opt.sheetMargin*2, availH=ph-opt.sheetMargin*2;
  var cols=Math.max(1,Math.floor((availW+opt.gap)/(opt.w+opt.gap)));
  var rowsN=Math.max(1,Math.floor((availH+opt.gap)/(opt.h+opt.gap)));
  return {cols:cols, rows:rowsN, perPage:cols*rowsN};
}
function _modLabelPreview(){
  var key=window.__modLabelKey, def=_modDefs[key]; if(!def) return;
  var opt=_modLabelReadOpt();
  var ids=window.__modLabelRows||[];
  var row=(_modData[key]||[]).filter(function(r){return r._id===ids[0]})[0] || (_modData[key]||[])[0];
  var el=document.getElementById('ml_preview');
  if(el) el.innerHTML = row ? '<div style="display:inline-block;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25)">'+_modLabelHtml(def,row,opt)+'</div>' : '데이터 없음';
  // A4 정보 표시
  var info=document.getElementById('ml_a4info');
  if(info && opt.mode==='a4'){
    var g=_mlA4Grid(opt);
    var sel = _mlPicks().length ? _mlPicks().filter(function(c){return c.checked;}).length : (window.__modLabelAll||[]).length;
    var pages=Math.ceil((sel||1)/g.perPage);
    info.innerHTML='A4 한 장에 <b>'+g.cols+'×'+g.rows+' = '+g.perPage+'칸</b> · 선택 '+sel+'개 → 약 <b>'+pages+'장</b> 인쇄';
  }
}
function modDoPrint(){
  var key=window.__modLabelKey, def=_modDefs[key]; if(!def) return;
  var opt=_modLabelReadOpt();
  _saveModLabelOpt(key,opt);
  var ids=_mlSelectedIds();
  if(!ids.length) return toast('출력할 항목을 선택하세요',true);
  // 선택 순서 유지
  var all=window.__modLabelAll||(_modData[key]||[]);
  var rows=all.filter(function(r){return ids.indexOf(r._id)>=0});
  if(!rows.length) return toast('출력할 항목이 없습니다',true);
  var labels=rows.map(function(r){return _modLabelHtml(def,r,opt);}).join('');
  var win=window.open('','_modprint','width=600,height=720');
  if(!win){ toast('팝업 차단을 해제해 주세요',true); return; }
  var css, bodyHtml;
  if(opt.mode==='a4'){
    var bd=opt.border?'.mlabel{border:1px dashed #bbb}':'';
    var land=(opt.orientation==='landscape');
    var sheetW=land?'297mm':'210mm';
    css='@page{size:A4 '+(land?'landscape':'portrait')+';margin:'+opt.sheetMargin+'mm}html,body{margin:0;padding:0}'
      +'.sheet{display:flex;flex-wrap:wrap;align-content:flex-start;gap:'+opt.gap+'mm}'
      +'.mlabel{box-sizing:border-box;break-inside:avoid;page-break-inside:avoid}'+bd
      +'@media screen{body{background:#e2e8f0;padding:10px}.sheet{background:#fff;width:'+sheetW+';margin:0 auto;padding:'+opt.sheetMargin+'mm;box-sizing:border-box;box-shadow:0 1px 6px rgba(0,0,0,.2)}}';
    bodyHtml='<div class="sheet">'+labels+'</div>';
  } else {
    css='@page{size:'+opt.w+'mm '+opt.h+'mm;margin:0}html,body{margin:0;padding:0}.mlabel{page-break-after:always}'
      +'@media screen{body{background:#e2e8f0;padding:10px}.mlabel{background:#fff;margin:0 auto 8px;box-shadow:0 1px 4px rgba(0,0,0,.2)}}';
    bodyHtml=labels;
  }
  win.document.write('<html><head><meta charset="utf-8"><title>라벨 출력</title><style>'+css+'</style></head><body>'+bodyHtml+'<scr'+'ipt>setTimeout(function(){window.print();},800);</scr'+'ipt></body></html>');
  win.document.close(); win.focus();
  modBumpPrint(key, ids);
  closePopup();
}
function modPrintOne(key,id){ popModLabel(key,id); }
function modBumpPrint(key,ids){
  var path=_modFbPath(key); if(!path) return;
  var data=(_modData[key]||[]).slice();
  var now=new Date().toISOString();
  var actor=_modActor();
  data.forEach(function(r){ if(ids.indexOf(r._id)>=0){ r._printCount=pn(r._printCount)+1; r._printedAt=now; r._printBy=(typeof CID!=='undefined'?CID:''); r._printByName=actor; } });
  fbDb.ref(path).set(data).then(function(){ toast('🖨 '+ids.length+'장 발급'+(actor?' · '+actor:'')); _modLogAdd(key,'발급','',(ids.length>1?'('+ids.length+'장)':_modRowTitle(_modDefs[key]||{},data.filter(function(r){return r._id===ids[0]})[0]||{})),'라벨 발급'); }).catch(function(e){toast('발급 기록 저장 실패: '+(e.message||e),true)});
}

// 📋 처리 로그 조회 (super 전용)
function popModLog(key){
  if(typeof isSuper==='function' && !isSuper()) return toast('super 관리자만 볼 수 있습니다',true);
  var def=_modDefs[key]; if(!def) return;
  var base=_modLogBase(key);
  if(!base) return toast('로그 위치를 찾을 수 없습니다 (행사를 선택하세요)',true);
  showLoading('로그 불러오는 중...');
  fbDb.ref(base).once('value').then(function(s){
    hideLoading();
    var obj=s.val()||{};
    var arr=Object.keys(obj).map(function(k){return obj[k];}).filter(function(l){return l&&l.modKey===key;});
    arr.sort(function(a,b){return String(b.t||'').localeCompare(String(a.t||''));});
    var h='<div class="pop-head"><h3>📋 '+esc(def.label)+' 처리 로그 <span style="font-size:11px;color:#94a3b8;font-weight:400">('+arr.length+'건 · super 전용)</span></h3></div>';
    h+='<div style="padding:14px;max-height:75vh;overflow:auto">';
    if(!arr.length){
      h+='<div style="text-align:center;color:#94a3b8;padding:30px">기록된 로그가 없습니다</div>';
    } else {
      h+='<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f1f5f9;position:sticky;top:0">';
      h+='<th style="padding:6px 8px;text-align:left">일시</th><th style="padding:6px 8px;text-align:left">처리자</th><th style="padding:6px 8px;text-align:left">동작</th><th style="padding:6px 8px;text-align:left">대상</th></tr></thead><tbody>';
      arr.forEach(function(l){
        var dt=String(l.t||'').replace('T',' ').slice(0,16);
        var actColor = (l.act==='거부'||l.act==='탈락'||l.act==='삭제')?'#dc2626':(l.act==='발급'?'#475569':'#16a34a');
        h+='<tr style="border-bottom:1px solid #f1f5f9">';
        h+='<td style="padding:5px 8px;white-space:nowrap;color:#64748b">'+esc(dt)+'</td>';
        h+='<td style="padding:5px 8px;font-weight:600;color:#0f172a">'+esc(l.byName||l.by||'-')+'</td>';
        h+='<td style="padding:5px 8px"><b style="color:'+actColor+'">'+esc(l.act||'')+'</b>'+(l.detail?' <span style="color:#94a3b8;font-size:11px">'+esc(l.detail)+'</span>':'')+'</td>';
        h+='<td style="padding:5px 8px">'+esc(l.rowTitle||'')+'</td></tr>';
      });
      h+='</tbody></table>';
    }
    h+='<div style="text-align:right;margin-top:12px"><button class="btn" onclick="closePopup()">닫기</button></div></div>';
    openPopup(h,640);
  }).catch(function(e){ hideLoading(); toast('로그 조회 실패: '+(e.message||e),true); });
}

// ═══════════════════════════════════════════
// 라벨 배치 편집기 (드래그 자유 배치)
// ═══════════════════════════════════════════

function popModLabelLayout(key){
  var def=_modDefs[key]; if(!def) return;
  var opt=_modLabelOpt(key);
  // 라벨 팝업이 열려있으면 그 모드/입력값을 우선 사용 (모드별 분리)
  var mode=window.__mlMode||opt.mode||'label';
  if(window.__mlMode && window.__mlSizes){ _mlSyncSizeFromInputs(); opt=Object.assign({},opt,window.__mlSizes[mode]||{}); }
  var allCols=(def.columns||[]).filter(function(c){return !c.adminOnly&&c.key!=='status'&&!c.hideTable&&c.type!=='file'&&c.type!=='consent'});
  var checkedFields=(opt.fields&&opt.fields.length)?opt.fields:allCols.map(function(c){return c.key;});
  var cols=allCols.filter(function(c){return checkedFields.indexOf(c.key)>=0;});
  var existing=_modLabelLayout(key,mode);
  var pos=(existing&&existing.pos)?JSON.parse(JSON.stringify(existing.pos)):{};
  if(!pos['_qr']) pos['_qr']={x:70,y:4,w:25};
  if(!pos['_title']) pos['_title']={x:4,y:4,fs:14};
  var yOff=18;
  cols.forEach(function(c){
    if(c.key===opt.titleKey) return;
    if(!pos[c.key]) { pos[c.key]={x:4,y:yOff,fs:7.5}; yOff+=10; }
  });
  window.__mlLayout={key:key,def:def,opt:opt,mode:mode,cols:cols,pos:pos,dragging:null};

  // 캔버스 크기를 화면에 맞게 제한 (우측 조절 패널이 잘리지 않도록)
  var SCALE=Math.min(6, 320/opt.w, 360/opt.h);
  if(!(SCALE>0)) SCALE=4;
  window.__mlLayout.SCALE=SCALE;
  var cW=Math.round(opt.w*SCALE), cH=Math.round(opt.h*SCALE);

  var modeName=(mode==='a4')?'📄 A4용':'🏷 낱장용';
  var h='<div class="pop-head"><h3>📐 '+esc(def.label)+' 라벨 배치 편집 <span style="font-size:12px;color:#6366f1;font-weight:700">('+modeName+' '+opt.w+'×'+opt.h+'mm)</span></h3></div>';
  h+='<div style="padding:14px;max-height:80vh;overflow:auto">';
  h+='<div style="font-size:12px;color:#64748b;margin-bottom:10px">요소를 드래그하여 위치를 조정하세요. 클릭하면 크기 조절 패널이 나타납니다.</div>';
  h+='<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">';
  h+='<div style="flex-shrink:0">';
  h+='<div id="mll_canvas" style="position:relative;width:'+cW+'px;height:'+cH+'px;background:#fff;border:2px solid #334155;border-radius:4px;overflow:hidden;cursor:default;box-shadow:0 2px 10px rgba(0,0,0,.15);user-select:none"></div>';
  h+='</div>';
  h+='<div style="width:190px;flex-shrink:0" id="mll_panel">';
  h+='<div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:6px">요소 선택하면 여기서 조절</div>';
  h+='<div id="mll_ctrl" style="font-size:12px;color:#94a3b8">요소를 클릭하세요</div>';
  h+='</div>';
  h+='</div>';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">';
  h+='<div><button class="btn" style="background:#ef4444;color:#fff;font-size:12px" onclick="_mllReset()">🔄 기본 배치로 초기화</button>';
  h+=' <button class="btn" style="background:#94a3b8;color:#fff;font-size:12px" onclick="_mllClearLayout()">자동 배치로 되돌리기</button></div>';
  h+='<div><button class="btn" onclick="closePopup()">취소</button> <button class="btn btn-b" style="background:#6366f1" onclick="_mllSave()">💾 저장</button></div>';
  h+='</div></div>';
  openPopup(h,Math.max(620,cW+250));
  setTimeout(function(){ _mllRender(); _mllBindEvents(); },50);
}

function _mllRender(){
  var L=window.__mlLayout; if(!L) return;
  var canvas=document.getElementById('mll_canvas'); if(!canvas) return;
  var SCALE=L.SCALE||5;
  var cW=L.opt.w*SCALE, cH=L.opt.h*SCALE;
  var pos=L.pos;
  var row=(_modData[L.key]||[])[0]||{};
  var titleV=L.opt.titleKey?(row[L.opt.titleKey]||'샘플제목'):'샘플제목';
  var html='';
  var colors=['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
  var ci=0;

  var items=[];
  var tp=pos['_title']||{x:4,y:4,fs:14};
  items.push({id:'_title',label:'제목',text:String(titleV),x:tp.x,y:tp.y,fs:tp.fs||14,bold:true,color:'#6366f1'});
  L.cols.forEach(function(c){
    if(c.key===L.opt.titleKey) return;
    var fp=pos[c.key]||{x:4,y:20,fs:7.5};
    ci=(ci+1)%colors.length;
    var v=row[c.key]||'샘플';
    items.push({id:c.key,label:c.label,text:c.label+' '+v,x:fp.x,y:fp.y,fs:fp.fs||7.5,bold:false,color:colors[ci]});
  });
  var qp=pos['_qr']||{x:70,y:4,w:25};
  var qSize=Math.round((qp.w||25)*SCALE);
  items.push({id:'_qr',label:'QR코드',isQr:true,x:qp.x,y:qp.y,w:qp.w||25,color:'#334155'});

  items.forEach(function(it){
    var left=it.x/100*cW, top=it.y/100*cH;
    if(it.isQr){
      html+='<div class="mll_el" data-id="'+it.id+'" style="position:absolute;left:'+left+'px;top:'+top+'px;width:'+qSize+'px;height:'+qSize+'px;border:2px dashed '+it.color+';border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;color:'+it.color+';font-weight:700;cursor:move;background:rgba(51,65,85,.08)">QR</div>';
    } else {
      var fsPx=it.fs*SCALE*0.35;
      html+='<div class="mll_el" data-id="'+it.id+'" style="position:absolute;left:'+left+'px;top:'+top+'px;border:1.5px dashed '+it.color+';border-radius:3px;padding:2px 4px;font-size:'+fsPx+'px;'+(it.bold?'font-weight:800;':'')+'color:'+it.color+';cursor:move;white-space:nowrap;background:rgba(255,255,255,.85)">'+esc(it.text)+'</div>';
    }
  });
  canvas.innerHTML=html;
}

function _mllBindEvents(){
  var canvas=document.getElementById('mll_canvas'); if(!canvas) return;
  var L=window.__mlLayout; if(!L) return;
  var SCALE=L.SCALE||5;
  var cW=L.opt.w*SCALE, cH=L.opt.h*SCALE;
  var dragging=null, offX=0, offY=0;

  function onStart(e){
    var el=e.target.closest('.mll_el'); if(!el) return;
    var id=el.getAttribute('data-id');
    dragging={el:el,id:id};
    var rect=el.getBoundingClientRect();
    var pt=e.touches?e.touches[0]:e;
    offX=pt.clientX-rect.left;
    offY=pt.clientY-rect.top;
    el.style.zIndex='10';
    el.style.opacity='0.8';
    _mllShowCtrl(id);
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging) return;
    var pt=e.touches?e.touches[0]:e;
    var cr=canvas.getBoundingClientRect();
    var nx=pt.clientX-cr.left-offX;
    var ny=pt.clientY-cr.top-offY;
    nx=Math.max(0,Math.min(nx,cW-20));
    ny=Math.max(0,Math.min(ny,cH-10));
    dragging.el.style.left=nx+'px';
    dragging.el.style.top=ny+'px';
    var pctX=Math.round(nx/cW*1000)/10;
    var pctY=Math.round(ny/cH*1000)/10;
    if(!L.pos[dragging.id]) L.pos[dragging.id]={};
    L.pos[dragging.id].x=pctX;
    L.pos[dragging.id].y=pctY;
    e.preventDefault();
  }
  function onEnd(){
    if(dragging){
      dragging.el.style.zIndex='';
      dragging.el.style.opacity='1';
      dragging=null;
    }
  }
  canvas.addEventListener('mousedown',onStart);
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onEnd);
  canvas.addEventListener('touchstart',onStart,{passive:false});
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('touchend',onEnd);
  canvas.addEventListener('click',function(e){
    var el=e.target.closest('.mll_el');
    if(el) _mllShowCtrl(el.getAttribute('data-id'));
  });
  window.__mllCleanup=function(){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onEnd);
    document.removeEventListener('touchmove',onMove);
    document.removeEventListener('touchend',onEnd);
  };
}

function _mllShowCtrl(id){
  var L=window.__mlLayout; if(!L) return;
  var el=document.getElementById('mll_ctrl'); if(!el) return;
  var p=L.pos[id]||{};
  var isQr=(id==='_qr');
  var label=id==='_title'?'제목':id==='_qr'?'QR코드':((L.cols.find(function(c){return c.key===id;})||{}).label||id);
  var h='<div style="font-weight:700;color:#334155;margin-bottom:8px;font-size:13px">'+esc(label)+'</div>';
  h+='<label style="display:block;margin-bottom:6px">X위치 <b>'+((p.x||0).toFixed(1))+'%</b></label>';
  h+='<input type="range" min="0" max="95" step="0.5" value="'+(p.x||0)+'" style="width:100%" oninput="_mllSetPos(\''+id+'\',\'x\',this.value)">';
  h+='<label style="display:block;margin-bottom:6px;margin-top:6px">Y위치 <b>'+((p.y||0).toFixed(1))+'%</b></label>';
  h+='<input type="range" min="0" max="95" step="0.5" value="'+(p.y||0)+'" style="width:100%" oninput="_mllSetPos(\''+id+'\',\'y\',this.value)">';
  if(isQr){
    h+='<label style="display:block;margin-bottom:6px;margin-top:6px">QR 크기 <b>'+(p.w||25)+'mm</b></label>';
    h+='<input type="range" min="8" max="45" step="1" value="'+(p.w||25)+'" style="width:100%" oninput="_mllSetPos(\''+id+'\',\'w\',this.value)">';
  } else {
    h+='<label style="display:block;margin-bottom:6px;margin-top:6px">글자 크기 <b>'+(p.fs||(id==='_title'?14:7.5))+'pt</b></label>';
    h+='<input type="range" min="5" max="24" step="0.5" value="'+(p.fs||(id==='_title'?14:7.5))+'" style="width:100%" oninput="_mllSetPos(\''+id+'\',\'fs\',this.value)">';
  }
  el.innerHTML=h;
}

function _mllSetPos(id,prop,val){
  var L=window.__mlLayout; if(!L) return;
  if(!L.pos[id]) L.pos[id]={};
  L.pos[id][prop]=parseFloat(val);
  _mllRender();
  _mllBindEvents();
  _mllShowCtrl(id);
}

function _mllReset(){
  var L=window.__mlLayout; if(!L) return;
  L.pos={};
  L.pos['_qr']={x:70,y:4,w:25};
  L.pos['_title']={x:4,y:4,fs:14};
  var yOff=18;
  L.cols.forEach(function(c){
    if(c.key===L.opt.titleKey) return;
    L.pos[c.key]={x:4,y:yOff,fs:7.5}; yOff+=10;
  });
  _mllRender();
  _mllBindEvents();
  toast('기본 배치로 초기화됨');
}

function _mllClearLayout(){
  var L=window.__mlLayout; if(!L) return;
  try{ localStorage.removeItem('modLabelLayout_'+L.key+'_'+L.mode); }catch(e){}
  if(window.__mllCleanup) window.__mllCleanup();
  closePopup();
  toast('자동 배치로 복원됨 ('+(L.mode==='a4'?'A4용':'낱장용')+')');
  popModLabel(L.key);
}

function _mllSave(){
  var L=window.__mlLayout; if(!L) return;
  var layout={mode:'free',pos:L.pos};
  _saveModLabelLayout(L.key,L.mode,layout);
  if(window.__mllCleanup) window.__mllCleanup();
  closePopup();
  toast('라벨 배치 저장됨 ('+(L.mode==='a4'?'A4용':'낱장용')+')');
  popModLabel(L.key);
}

// ═══════════════════════════════════════════
// QR 조회 페이지 (비로그인) — ?modview={key}&id={id}
// ═══════════════════════════════════════════
function renderModView(key,id,evtId){
  document.body.innerHTML='<div style="min-height:100vh;display:flex;align-items:flex-start;justify-content:center;background:linear-gradient(135deg,#334155,#0f172a);padding:24px 16px"><div id="modViewCard" style="background:#fff;border-radius:16px;padding:24px;width:420px;max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)"><div style="text-align:center;color:#94a3b8;padding:30px">불러오는 중...</div></div></div>';
  if(typeof fbDb==='undefined'){ document.getElementById('modViewCard').innerHTML='<div style="text-align:center;color:#ef4444">시스템 오류</div>'; return; }
  fbDb.ref('/main/ModDefs').once('value').then(function(s){
    var defs=s.val()||[]; if(!Array.isArray(defs))defs=Object.values(defs);
    var def=null; for(var i=0;i<defs.length;i++){if(defs[i]&&defs[i].key===key){def=defs[i];break}}
    if(!def){ document.getElementById('modViewCard').innerHTML='<div style="text-align:center;color:#64748b;padding:20px">정보를 찾을 수 없습니다</div>'; return; }
    var path=def.global?'/main/'+def.fbPath:'/evtData/'+evtId+'/'+def.fbPath;
    fbDb.ref(path).once('value').then(function(s2){
      var arr=s2.val()||[]; if(!Array.isArray(arr))arr=Object.values(arr);
      var row=null; for(var j=0;j<arr.length;j++){if(arr[j]&&arr[j]._id===id){row=arr[j];break}}
      if(!row){ document.getElementById('modViewCard').innerHTML='<div style="text-align:center;color:#64748b;padding:20px">해당 정보가 없습니다</div>'; return; }
      _renderModViewUI(def,row);
    }).catch(function(e){ document.getElementById('modViewCard').innerHTML='<div style="text-align:center;color:#ef4444">오류: '+esc(e.message)+'</div>'; });
  }).catch(function(e){ document.getElementById('modViewCard').innerHTML='<div style="text-align:center;color:#ef4444">오류: '+esc(e.message)+'</div>'; });
}
function _renderModViewUI(def,row){
  var h='<div style="text-align:center;margin-bottom:14px"><div style="font-size:40px">'+(def.icon||'📋')+'</div><h2 style="color:#0f172a;margin:6px 0;font-size:19px">'+esc(def.label)+'</h2></div>';

  // 기간 정상 판정 (날짜 컬럼 2개 = 시작/종료) → 오늘이 기간 안이면 정상
  var dateCols=(def.columns||[]).filter(function(c){return c.type==='date'});
  if(dateCols.length>=2){
    var from=row[dateCols[0].key], to=row[dateCols[1].key];
    if(from&&to){
      var today=new Date().toISOString().slice(0,10);
      var bg,txt,ic,msg;
      if(today>=from && today<=to){ bg='#dcfce7';txt='#15803d';ic='✅';msg='정상 — 사용 가능'; }
      else if(today<from){ bg='#fef9c3';txt='#a16207';ic='⏳';msg='사용 기간 전'; }
      else { bg='#fee2e2';txt='#b91c1c';ic='⛔';msg='사용 기간 만료'; }
      h+='<div style="background:'+bg+';color:'+txt+';border-radius:12px;padding:14px;text-align:center;font-weight:800;font-size:17px;margin-bottom:14px">'+ic+' '+msg+'<div style="font-size:12px;font-weight:600;margin-top:4px;opacity:.85">'+esc(from)+' ~ '+esc(to)+'</div></div>';
    }
  }

  // 상태 배지 + 처리자
  var statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge'});
  if(statusCol && row.status && statusCol.badgeMap && statusCol.badgeMap[row.status]){
    var bm=statusCol.badgeMap[row.status];
    h+='<div style="text-align:center;margin-bottom:14px"><span style="padding:6px 18px;border-radius:20px;font-size:15px;font-weight:800;background:'+(bm.bg||'#e2e8f0')+';color:'+(bm.color||'#475569')+'">'+esc(bm.label||row.status)+'</span>';
    if(row._statusByName){
      var atd=row._statusAt?(' · '+String(row._statusAt).slice(0,10)):'';
      h+='<div style="font-size:11px;color:#94a3b8;margin-top:5px">처리: '+esc(row._statusByName)+esc(atd)+'</div>';
    }
    h+='</div>';
  }

  h+='<table style="width:100%;border-collapse:collapse;font-size:14px">';
  (def.columns||[]).forEach(function(c){
    if(c.key==='status'||c.type==='consent'||c.hideTable) return;
    var v=row[c.key]; if(v==null||v==='') return;
    var valHtml;
    if(c.type==='tel'){
      var cl=String(v).replace(/[^0-9+]/g,'');
      valHtml='<a href="tel:'+cl+'" style="display:inline-block;background:#16a34a;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">📞 '+esc(String(v))+'</a>';
    } else {
      valHtml=_modFmtCell(c,v);
    }
    h+='<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:9px 4px;color:#64748b;width:36%;vertical-align:middle">'+esc(c.label)+'</td><td style="padding:9px 4px;font-weight:600;color:#0f172a">'+valHtml+'</td></tr>';
  });
  h+='</table>';
  document.getElementById('modViewCard').innerHTML=h;
}
