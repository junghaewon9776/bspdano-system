// ═══════════════════════════════════════════════════════════════
// mod-engine.js — 범용 CRUD 모듈 엔진  v1.0
// 설정(columns/features)만 정의하면 테이블+폼+CRUD+검색+엑셀 자동 생성
// ═══════════════════════════════════════════════════════════════
var _MOD_ENGINE_VER='20260619v131';
console.log('%c[mod-engine] v='+_MOD_ENGINE_VER+' loaded','color:#6366f1;font-weight:bold;font-size:14px');
// 일회성 로컬 초기화 (v20260609v2)
try{if(!localStorage.getItem('_mlClear0609v2')){var _ks=Object.keys(localStorage);_ks.forEach(function(k){if(/^modLabel/.test(k))localStorage.removeItem(k);});localStorage.setItem('_mlClear0609v2','1');console.log('[mod-engine] 라벨 로컬설정 초기화 완료');}}catch(e){}

var _modDefs={};   // key → 모듈 정의
var _modData={};   // key → 데이터 배열
var _modSort={};   // key → {col, asc}
var _modSearch={}; // key → 검색어
var _modFilter={}; // key → 필터값
var _modPrintFilter={}; // key → 'no'|'yes'|''
var _modSel={};    // key → {_id: true} 선택된 행
var _modSelLast={};// key → 마지막 클릭 인덱스 (Shift 범위선택)
var _modListeners={};
var MOD_DEFS_LOADED=false;

// ─── 유틸 ───
function _modId(){return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
// 현재 처리자(로그인 사용자) 이름/아이디
function _modActor(){ try{ return (typeof ME!=='undefined'&&ME)?(ME.nm||ME.id||''):''; }catch(e){ return ''; } }
// ISO 타임스탬프 → 로컬(KST) "YYYY-MM-DD HH:MM"
function _modFmtDateTime(iso){
  if(!iso) return '';
  var d=new Date(iso); if(isNaN(d.getTime())) return String(iso).slice(0,16).replace('T',' ');
  var p=function(n){return n<10?'0'+n:''+n;};
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
// 행 대표 제목(첫 표시 컬럼 값)
function _modRowTitle(def,row){
  var cols=(def.columns||[]).filter(function(x){return !x.adminOnly&&x.key!=='status'&&!x.hideTable;});
  // 1) 모듈에 titleKey 지정돼 있으면 그것
  if(def.titleKey){ var tc=cols.find(function(x){return x.key===def.titleKey;}); if(tc&&row[tc.key]) return String(row[tc.key]); }
  // 2) 이름/성함/성명/대표자/신청자 같은 이름컬럼 우선
  var nameRe=/(이름|성함|성명|대표자|신청자|참가자|회원명|업체명|상호|닉네임|name)/i;
  var nc=cols.find(function(x){ return nameRe.test(String(x.label||''))&&row[x.key]!=null&&row[x.key]!==''; });
  if(nc) return String(row[nc.key]);
  // 3) 그래도 없으면 값이 있는 첫 컬럼
  var fc=cols.find(function(x){ return row[x.key]!=null&&row[x.key]!==''; }) || cols[0];
  return fc?String(row[fc.key]||''):'';
}
// 행 상세 설명(표시 컬럼 전체 조합) — 로그/구분용 (열이 늘어도 다 표시)
function _modRowDesc(def,row){
  var cs=(def.columns||[]).filter(function(x){return !x.adminOnly&&x.key!=='status'&&!x.hideTable&&x.type!=='file'&&x.type!=='consent';});
  var s=cs.map(function(c){ var v=row[c.key]; return (v==null||v==='')?'':_modPlain(c,v); }).filter(Boolean).join(' / ');
  return s||_modRowTitle(def,row);
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
// Drive 썸네일 URL (이미지 미리보기용, 가벼움). 파일이 '링크 가진 모두' 공개여야 보임
function _modDriveThumb(url, sz){
  if(!url) return '';
  var m = url.match(/\/d\/([-\w]{20,})/) || url.match(/[?&]id=([-\w]{20,})/) || url.match(/([-\w]{25,})/);
  return (m&&m[1]) ? 'https://drive.google.com/thumbnail?id='+m[1]+'&sz=w'+(sz||120) : '';
}
function _modIsImg(s){ return /\.(jpe?g|png|gif|webp|bmp|heic|heif)(\?|$)/i.test(String(s||'')); }

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
      if(el){
        // 스크롤 위치 보존 (저장/처리 후 맨 위로 튀는 것 방지)
        var _sc=document.getElementById('_modScroll_'+key);
        var _st=_sc?_sc.scrollTop:0, _sl=_sc?_sc.scrollLeft:0;
        var _wy=window.scrollY||window.pageYOffset||0;
        el.innerHTML=dMod(key);
        var _sc2=document.getElementById('_modScroll_'+key);
        if(_sc2){ _sc2.scrollTop=_st; _sc2.scrollLeft=_sl; }
        try{ window.scrollTo(0,_wy); }catch(e){}
      }
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
  if(isA()) h+='<button class="btn" style="background:#0891b2;color:#fff" onclick="_modCopyShortcut(\''+key+'\')" title="이 모듈로 바로 가는 링크 복사 (담당자용 — 로그인하면 이 화면)">🔗 바로가기 링크</button>';
  if(isA() && _hasTel) h+='<button class="btn" style="background:#8b5cf6;color:#fff" onclick="popModSms(\''+key+'\')">💬 문자 발송</button>';
  if(isA()) h+='<button class="btn" style="background:#475569;color:#fff" onclick="popModLabel(\''+key+'\')">🖨 라벨 출력</button>';
  if(isA()) h+='<button class="btn btn-b" onclick="popModAdd(\''+key+'\')">➕ 추가</button>';
  if(isA()) h+='<button class="btn" style="background:#e67e22;color:#fff" onclick="popModStat(\''+key+'\')">📊 통계</button>';
  if(isA() && (def.columns||[]).some(function(c){return c.type==='select'&&c.stockOn;})) h+='<button class="btn" style="background:#0f766e;color:#fff" onclick="popModStock(\''+key+'\')">📦 재고</button>';
  if(isA()) h+='<button class="btn" style="background:#16a34a;color:#fff" onclick="popModSheet(\''+key+'\')">📝 시트 편집</button>';
  if(isA()) h+='<button class="btn" style="background:#0d9488;color:#fff" onclick="modImportExcel(\''+key+'\')">📤 가져오기</button>';
  if(isA() && _modTrackingCol(def)) h+='<button class="btn" style="background:#7c3aed;color:#fff" onclick="popModTrackImport(\''+key+'\')">📦 송장 일괄등록</button>';
  if(feat.excel!==false) h+='<button class="btn" onclick="modExportExcel(\''+key+'\')">📥 내보내기</button>';
  if(typeof isSuper==='function'&&isSuper()) h+='<button class="btn" style="background:#7c3aed;color:#fff" onclick="popModLog(\''+key+'\')">📋 로그</button>';
  if(typeof isSuper==='function'&&isSuper()) h+='<button class="btn" style="background:#dc2626;color:#fff" onclick="modResetPrintCount(\''+key+'\')">🖨 출력횟수 초기화</button>';
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
      var raw=fcur[fc.key];
      var selArr=Array.isArray(raw)?raw.slice():(raw?[raw]:[]);  // 다중값 지원
      if(selArr.length) anyActive=true;
      var on=selArr.length>0;
      // 드롭다운: 아직 안 고른 값만 (고르면 칩으로 추가)
      h+='<select onchange="_modSetFilter(\''+key+'\',\''+esc(fc.key)+'\',this.value);this.value=\'\'" style="padding:7px 10px;border:1px solid '+(on?'#2563eb':'#d1d5db')+';border-radius:8px;font-size:13px;background:'+(on?'#eff6ff':'#fff')+';color:#334155;font-weight:'+(on?'700':'400')+'">';
      h+='<option value="">'+esc(fc.label)+(on?' +추가':' 전체')+'</option>';
      fopts.forEach(function(o){
        if(selArr.indexOf(String(o.v))>=0) return; // 이미 선택된 건 제외
        h+='<option value="'+esc(String(o.v))+'">'+esc(o.l)+'</option>';
      });
      h+='</select>';
      // 선택된 값 칩 (클릭하면 제거)
      selArr.forEach(function(v){
        var lo=fopts.filter(function(o){return String(o.v)===String(v);})[0];
        var lbl=lo?lo.l:v;
        h+='<span onclick="_modRemoveFilter(\''+key+'\',\''+esc(fc.key)+'\',\''+esc(String(v))+'\')" style="display:inline-flex;align-items:center;gap:4px;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:14px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer" title="클릭하면 제거">'+esc(lbl)+' ✕</span>';
      });
    });
    // 출력 필터
    var _pf=_modPrintFilter[key]||'';
    h+='<select onchange="_modSetPrintFilter(\''+key+'\',this.value)" style="padding:7px 10px;border:1px solid '+(_pf?'#7c3aed':'#d1d5db')+';border-radius:8px;font-size:13px;background:'+(_pf?'#f5f3ff':'#fff')+';color:#334155;font-weight:'+(_pf?'700':'400')+'">';
    h+='<option value="">🖨 출력 전체</option>';
    h+='<option value="no"'+(_pf==='no'?' selected':'')+'>미출력만</option>';
    h+='<option value="yes"'+(_pf==='yes'?' selected':'')+'>출력됨만</option>';
    h+='</select>';
    if(anyActive||_pf) h+='<button class="btn btn-s" style="font-size:11px" onclick="_modClearFilter(\''+key+'\')">필터 해제</button>';
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
      var vals=Array.isArray(fv)?fv:[fv]; if(!vals.length) return;
      var _fcol=(def.columns||[]).find(function(c){return c.key===ck;});
      var _cdef=(_fcol&&_fcol.type==='badge')?_modBadgeDefault(_fcol):'';  // 배지 기본값
      data=data.filter(function(row){
        var rv=String(row[ck]||'');
        return vals.some(function(v){  // 같은 칼럼 내 여러 값은 OR
          if(v==='__has__') return rv.trim()!=='';
          if(v==='__none__') return rv.trim()==='';
          if(rv==='' && _cdef && String(_cdef)===String(v)) return true; // 빈값=기본값(대기)으로 매칭
          return rv===String(v);
        });
      });
    });
  } else if(filter){
    // 레거시 단일 문자열 호환
    var fc=(def.columns||[]).find(function(c){return c.filter});
    if(fc) data=data.filter(function(row){return String(row[fc.key]||'')===filter});
  }
  // 출력 필터
  var pf=_modPrintFilter[key]||'';
  if(pf==='no') data=data.filter(function(r){return !r._printCount||pn(r._printCount)===0;});
  else if(pf==='yes') data=data.filter(function(r){return pn(r._printCount)>0;});
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

  // 👥 중복 표시 — dupCheck 켠 칼럼은 같은 값 몇 건인지 집계 (칼럼별 독립)
  var dupCols=(def.columns||[]).filter(function(c){return c.dupCheck;});
  var dupCounts={};
  if(dupCols.length){
    dupCols.forEach(function(c){ dupCounts[c.key]={}; });
    data.forEach(function(r){ dupCols.forEach(function(c){ var val=String(r[c.key]==null?'':r[c.key]).trim(); if(val) dupCounts[c.key][val]=(dupCounts[c.key][val]||0)+1; }); });
  }
  // 🔗 묶음(조합) — dupGroup 켠 칼럼들이 모두 같으면 동일인으로 묶어 집계
  var grpCols=(def.columns||[]).filter(function(c){return c.dupGroup;});
  var grpFirstKey=grpCols.length?grpCols[0].key:null;
  var grpCounts={};
  function _grpKey(r){ return grpCols.map(function(c){return String(r[c.key]==null?'':r[c.key]).trim();}).join('␟'); }
  if(grpCols.length){
    data.forEach(function(r){ var k=_grpKey(r); if(k.replace(/␟/g,'')) grpCounts[k]=(grpCounts[k]||0)+1; });
  }

  var statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge'});
  var hasSelect=feat.applyForm && statusCol;

  // 선택 상태 정리 (현재 데이터에 없는 id 제거) + 선택 작업 바
  var selMap=_modSel[key]||(_modSel[key]={});
  var dataIds={}; data.forEach(function(r){dataIds[r._id]=1;});
  Object.keys(selMap).forEach(function(id){ if(!dataIds[id]) delete selMap[id]; });
  var selCount=Object.keys(selMap).length;
  var h='';
  if(isA()){
    h+='<div id="_modSelBar_'+key+'" style="display:'+(selCount?'flex':'none')+';align-items:center;gap:8px;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;margin-bottom:8px;position:sticky;top:0;z-index:20;box-shadow:0 2px 8px rgba(37,99,235,.15)">';
    h+='<b style="color:#2563eb;font-size:13px"><span id="_modSelCnt_'+key+'">'+selCount+'</span>개 선택</b>';
    h+='<button class="btn btn-s" style="background:#475569;color:#fff" onclick="popModLabelSel(\''+key+'\')">🖨 라벨 출력</button>';
    if((def.columns||[]).some(function(c){return c.type==='tel';})) h+='<button class="btn btn-s" style="background:#8b5cf6;color:#fff" onclick="popModSmsSel(\''+key+'\')">💬 문자 발송</button>';
    // 상태배지 칼럼 전부 처리 버튼 표시 (2개 이상이면 칼럼명 prefix)
    var _badgeCols=(def.columns||[]).filter(function(c){return c.type==='badge'&&c.badgeMap;});
    var _multiBadge=_badgeCols.length>1;
    _badgeCols.forEach(function(bc){
      Object.keys(bc.badgeMap||{}).forEach(function(sk){
        if(sk==='대기') return; // 기본값(대기)은 처리버튼 제외
        var bm=bc.badgeMap[sk]||{};
        var pre=_multiBadge?(esc(bc.label)+' '):'';
        h+='<button class="btn btn-s" onclick="modSetStatusSel(\''+key+'\',\''+esc(bc.key)+'\',\''+esc(sk)+'\')" style="background:'+(bm.bg||'#f1f5f9')+';color:'+(bm.color||'#475569')+';border:1px solid '+(bm.bg||'#cbd5e1')+';font-weight:700">'+pre+esc(bm.label||sk)+' 처리</button>';
      });
    });
    h+='<button class="btn btn-s" style="background:#0891b2;color:#fff" onclick="popModMarkSel(\''+key+'\')">🎨 색칠</button>';
    h+='<button class="btn btn-s" style="background:#dc2626;color:#fff" onclick="modDelSel(\''+key+'\')">🗑 선택 삭제</button>';
    h+='<button class="btn btn-s" style="margin-left:auto;background:#64748b;color:#fff" onclick="_modSelClear(\''+key+'\')">선택 해제</button>';
    h+='</div>';
  }

  // 표 영역: 최대 높이 제한 → 가로 스크롤바가 항상 보이는 위치(박스 하단)에 고정 + 제목줄(thead) 고정
  var _hSticky='position:sticky;top:0;z-index:3;background:#f8fafc;';
  h+='<div id="_modScroll_'+key+'" style="overflow:auto;max-height:72vh;border:1px solid #e5e7eb;border-radius:10px">';
  h+='<table class="tbl"><thead><tr>';
  if(isA()){
    var allOn=data.length>0 && selCount>=data.length;
    h+='<th style="width:32px;'+_hSticky+'"><input type="checkbox" id="_modSelAll_'+key+'"'+(allOn?' checked':'')+' onclick="_modSelAll(\''+key+'\',this.checked)" title="전체 선택/해제"></th>';
  }
  h+='<th style="width:36px;'+_hSticky+'">#</th>';
  if(isA()) h+='<th style="white-space:nowrap;font-size:11px;color:#64748b;'+_hSticky+'">접수일</th>';
  cols.forEach(function(c){
    var arrow=sort.col===c.key?(sort.asc?' ▲':' ▼'):'';
    h+='<th style="cursor:pointer;white-space:nowrap;'+_hSticky+'" onclick="_modToggleSort(\''+key+'\',\''+c.key+'\')">'+esc(c.label)+arrow+'</th>';
  });
  if(hasSelect && isA()) h+='<th style="white-space:nowrap;font-size:11px;color:#64748b;'+_hSticky+'">상태일시</th>';
  if(isA()) h+='<th style="min-width:'+(hasSelect?'120':'100')+'px;position:sticky;right:0;top:0;background:#f8fafc;z-index:4;text-align:center;font-size:10px;color:#94a3b8">관리</th>';
  h+='</tr></thead><tbody>';

  data.forEach(function(row,idx){
    var st=row.status||'';
    var sel=!!selMap[row._id];
    var mk=row._mark||'';
    // 중복/묶음 줄 자동 색칠 (묶음=연파랑, 칼럼중복=연노랑)
    var _grpDup = grpCols.length ? (function(){ var k=_grpKey(row); return k.replace(/␟/g,'') && (grpCounts[k]||0)>1; })() : false;
    var _colDup = dupCols.length ? dupCols.some(function(c){ var v=String(row[c.key]==null?'':row[c.key]).trim(); return v && (dupCounts[c.key][v]||0)>1; }) : false;
    var dupBg = _grpDup ? '#e0f2fe' : (_colDup ? '#fef9c3' : '');
    var rowBg = sel ? '#eff6ff' : (mk || dupBg || '');
    var mkBorder = mk ? ';border-left:5px solid '+_modMarkDot(mk) : (_grpDup ? ';border-left:4px solid #3b82f6' : (_colDup ? ';border-left:4px solid #f59e0b' : ''));
    h+='<tr'+' ondblclick="popModEdit(\''+key+'\',\''+esc(row._id||'')+'\');event.stopPropagation()" style="cursor:pointer'+(st==='탈락'?';opacity:.5':'')+(rowBg?';background:'+rowBg:'')+mkBorder+'">';
    if(isA()) h+='<td class="ctr"><input type="checkbox" class="_modChk" data-id="'+esc(row._id||'')+'" data-idx="'+idx+'"'+(sel?' checked':'')+' onclick="_modSelToggle(event,\''+key+'\',\''+esc(row._id||'')+'\','+idx+')"></td>';
    var _memoChip = row._markMemo ? ' <span style="display:inline-block;background:'+(mk||'#e2e8f0')+';color:#334155;border:1px solid '+_modMarkDot(mk||'#e2e8f0')+';border-radius:8px;padding:0 6px;font-size:10px;font-weight:700;white-space:nowrap;vertical-align:middle" title="메모">'+esc(row._markMemo)+'</span>' : '';
    h+='<td class="ctr" style="color:#94a3b8;white-space:nowrap">'+(idx+1)+_memoChip+'</td>';
    // 접수일
    if(isA()){
      var _ca=row._createdAt?_modFmtDateTime(row._createdAt):'';
      h+='<td style="white-space:nowrap;font-size:11px;color:#94a3b8" title="ID: '+esc(row._id||'')+'">'+esc(_ca)+'</td>';
    }
    cols.forEach(function(c){
      var raw=esc(String(row[c.key]==null?'':row[c.key]));
      var cellHtml=_modFmtCell(c,row[c.key]);
      if(c.dupCheck){ var dv=String(row[c.key]==null?'':row[c.key]).trim(); var dn=dv?(dupCounts[c.key][dv]||0):0; if(dn>1) cellHtml+=' <span style="display:inline-block;background:#fef3c7;color:#b45309;border:1px solid #fcd34d;border-radius:8px;padding:0 6px;font-size:10px;font-weight:800;white-space:nowrap" title="같은 값 '+dn+'건">총 '+dn+'건</span>'; }
      if(grpFirstKey===c.key){ var gk=_grpKey(row); var gn=gk.replace(/␟/g,'')?(grpCounts[gk]||0):0; if(gn>1) cellHtml+=' <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:8px;padding:0 6px;font-size:10px;font-weight:800;white-space:nowrap" title="동일인(묶음) '+gn+'건">👤 '+gn+'건</span>'; }
      h+='<td style="white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis" title="'+raw+'">'+cellHtml+'</td>';
    });
    // 상태일시
    if(hasSelect && isA()){
      var _sa=row._statusAt?_modFmtDateTime(row._statusAt):'';
      var _sb=row._statusByName||'';
      h+='<td style="white-space:nowrap;font-size:11px;color:#94a3b8" title="처리자: '+esc(_sb)+'">'+esc(_sa)+(_sb?' <span style="color:#64748b">'+esc(_sb)+'</span>':'')+'</td>';
    }
    if(isA()){
      h+='<td style="position:sticky;right:0;background:#fff;z-index:1;box-shadow:-4px 0 8px rgba(0,0,0,.04);padding:2px 4px;vertical-align:middle">';
      if(hasSelect){
        h+='<div style="display:flex;gap:2px;margin-bottom:2px">';
        Object.keys(statusCol.badgeMap||{}).forEach(function(sk){
          if(sk==='대기') return;
          var on=(st===sk), bm=statusCol.badgeMap[sk]||{};
          // 미선택=연하게(opacity .5) 선택=찐하게
          var bg=bm.bg||'#16a34a';
          h+='<button onclick="modSetStatus(\''+key+'\',\''+esc(row._id||'')+'\',\''+esc(sk)+'\')" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;background:'+bg+';color:'+(bm.color||'#fff')+';line-height:1.4;border:none;opacity:'+(on?'1':'0.45')+'" title="'+esc(sk)+'">'+esc(bm.label||sk)+'</button>';
        });
        h+='</div>';
      }
      h+='<div style="display:flex;gap:1px">';
      var _pc=pn(row._printCount);
      h+='<button onclick="modPrintOne(\''+key+'\',\''+esc(row._id||'')+'\')" title="'+(_pc?'재출력('+_pc+'회 출력됨)':'라벨 출력')+'" style="'+(_pc?'min-width:32px;':'width:24px;')+'height:22px;border-radius:4px;border:1px solid '+(_pc?'#475569':'#e2e8f0')+';cursor:pointer;font-size:11px;background:'+(_pc?'#475569':'#f8fafc')+';color:'+(_pc?'#fff':'#334155')+';padding:0 2px;line-height:1">🖨'+(_pc?'<b>'+_pc+'</b>':'')+'</button>';
      if(typeof isSuper==='function'&&isSuper()) h+='<button onclick="popModLog(\''+key+'\',\''+esc(row._id||'')+'\')" title="로그" style="width:24px;height:22px;border-radius:4px;border:1px solid #e2e8f0;cursor:pointer;font-size:11px;background:#f8fafc;color:#334155;padding:0;line-height:1">📋</button>';
      h+='<button onclick="popModEdit(\''+key+'\',\''+esc(row._id||'')+'\')" title="수정" style="width:24px;height:22px;border-radius:4px;border:1px solid #e2e8f0;cursor:pointer;font-size:11px;background:#f8fafc;color:#334155;padding:0;line-height:1">✏️</button>';
      h+='<button onclick="modDupRow(\''+key+'\',\''+esc(row._id||'')+'\')" title="복제 — 같은 주문자로 새 박스(받는분만 수정)" style="width:24px;height:22px;border-radius:4px;border:1px solid #c7d2fe;cursor:pointer;font-size:11px;background:#eef2ff;color:#4338ca;padding:0;line-height:1">📑</button>';
      h+='<button onclick="modDel(\''+key+'\',\''+esc(row._id||'')+'\')" title="삭제" style="width:24px;height:22px;border-radius:4px;border:1px solid #fecaca;cursor:pointer;font-size:11px;background:#fef2f2;color:#dc2626;padding:0;line-height:1">🗑</button>';
      h+='</div>';
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
  if(fc.type==='file'||fc.type==='consent') return [{v:'__has__',l:'✅ 등록됨'},{v:'__none__',l:'⬜ 미등록'}];
  // 그 외(텍스트 등) → 실제 데이터의 고유값 자동 수집
  var seen={}, out=[];
  (_modData[key]||[]).forEach(function(r){ var v=String(r[fc.key]||''); if(v&&!seen[v]){seen[v]=1;out.push({v:v,l:v});} });
  out.sort(function(a,b){return String(a.l).localeCompare(String(b.l));});
  return out;
}
function _modSetFilter(key,colKey,val){
  if(!_modFilter[key]||typeof _modFilter[key]!=='object') _modFilter[key]={};
  if(val===''){ draw(); return; }
  var cur=_modFilter[key][colKey];
  var arr=Array.isArray(cur)?cur.slice():(cur?[cur]:[]);
  if(arr.indexOf(String(val))<0) arr.push(String(val));  // 다중값 추가
  _modFilter[key][colKey]=arr;
  draw();
}
function _modRemoveFilter(key,colKey,val){
  var cur=(_modFilter[key]||{})[colKey];
  var arr=Array.isArray(cur)?cur.slice():(cur?[cur]:[]);
  arr=arr.filter(function(v){return String(v)!==String(val);});
  if(arr.length) _modFilter[key][colKey]=arr; else delete _modFilter[key][colKey];
  draw();
}
function _modClearFilter(key){ _modFilter[key]={}; _modPrintFilter[key]=''; draw(); }
function _modSetPrintFilter(key,val){ _modPrintFilter[key]=val; draw(); }

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
  if(!b) return;
  // 스크롤 위치 보존 (재렌더 시 맨 위로 튀는 것 방지)
  var sc=document.getElementById('_modScroll_'+key);
  var st=sc?sc.scrollTop:0, sl=sc?sc.scrollLeft:0;
  b.innerHTML=_modListHtml(key);
  var sc2=document.getElementById('_modScroll_'+key);
  if(sc2){ sc2.scrollTop=st; sc2.scrollLeft=sl; }
}
// 선택 항목 → 라벨 출력
function popModLabelSel(key){
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  popModLabel(key,null,ids);
}
// 선택 항목 → 일괄 상태 변경
function modSetStatusSel(key,colKey,statusKey){
  if(statusKey===undefined){ statusKey=colKey; colKey='status'; } // 구버전 2인자 호환
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  var path=_modFbPath(key); if(!path) return;
  var def=_modDefs[key];
  var bm=(def.columns.find(function(c){return c.key===colKey;})||{}).badgeMap||{};
  var lbl=(bm[statusKey]&&bm[statusKey].label)||statusKey;
  var actor=_modActor();
  if(!confirm(ids.length+'개 항목을 "'+lbl+'" 처리하시겠습니까?'+(actor?'\n\n처리자: '+actor:''))) return;
  var data=(_modData[key]||[]).slice();
  var now=new Date().toISOString();
  data.forEach(function(r){ if(ids.indexOf(r._id)>=0){ r[colKey]=statusKey; r._updatedAt=now; if(colKey==='status'){ r._statusBy=(typeof CID!=='undefined'?CID:''); r._statusByName=actor; r._statusAt=now; } } });
  showLoading('처리 중...');
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('✅ '+ids.length+'개 "'+lbl+'" 처리'+(actor?' · '+actor:'')); _modLogAdd(key,lbl,'','('+ids.length+'개 일괄)','상태변경'); _modSelRefresh(key); })
    .catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
}
// 선택 항목 → 일괄 색칠 + 메모
function popModMarkSel(key){
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  var h='<div class="pop-head"><h3>🎨 '+ids.length+'개 색칠 · 메모</h3></div>';
  h+='<div style="padding:16px">';
  h+='<div style="font-size:12px;color:#475569;font-weight:600;margin-bottom:8px">색상 <span style="font-size:10px;color:#94a3b8;font-weight:400">(클릭하면 바로 적용)</span></div>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">';
  _MOD_MARK_COLORS.forEach(function(c){
    var inner = c.k==='' ? '<span style="font-size:16px;color:#94a3b8">✕</span>' : '';
    h+='<button onclick="_modSetMarkSel(\''+key+'\',\''+c.k+'\')" title="'+c.name+'" style="width:40px;height:40px;border-radius:10px;cursor:pointer;background:'+(c.bg||'#fff')+';border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center">'+inner+'</button>';
  });
  h+='</div>';
  h+='<div style="font-size:12px;color:#475569;font-weight:600;margin-bottom:8px">메모 <span style="font-size:10px;color:#94a3b8;font-weight:400">(선택 항목 전체에 동일 적용)</span></div>';
  h+='<input id="_modMarkSelMemo" placeholder="짧은 메모 (비우고 저장하면 메모 지움)" maxlength="20" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box">';
  h+='<div style="display:flex;gap:8px;margin-top:16px">';
  h+='<button class="btn" style="flex:0 0 auto;background:#475569;color:#fff" onclick="closePopup()">닫기</button>';
  h+='<button class="btn btn-b" style="flex:1;background:#2563eb;color:#fff;font-weight:700" onclick="_modSaveMarkSelMemo(\''+key+'\')">💾 메모 저장</button>';
  h+='</div></div>';
  openPopup(h,420);
}
function _modSetMarkSel(key,color){
  var ids=_modSelIds(key); if(!ids.length) return;
  var path=_modFbPath(key); if(!path) return;
  var data=(_modData[key]||[]).slice(), now=new Date().toISOString(), n=0;
  data.forEach(function(r){ if(ids.indexOf(r._id)>=0){ r._mark=color; r._updatedAt=now; n++; } });
  fbDb.ref(path).set(data).then(function(){ var c=_MOD_MARK_COLORS.find(function(x){return x.k===color;}); toast('🎨 '+n+'개 '+(color?(c?c.name:''):'색 지움')); })
    .catch(function(e){ toast('실패: '+(e.message||e),true); });
}
function _modSaveMarkSelMemo(key){
  var ids=_modSelIds(key); if(!ids.length) return;
  var path=_modFbPath(key); if(!path) return;
  var el=document.getElementById('_modMarkSelMemo'); var memo=el?el.value.trim():'';
  var data=(_modData[key]||[]).slice(), now=new Date().toISOString(), n=0;
  data.forEach(function(r){ if(ids.indexOf(r._id)>=0){ r._markMemo=memo; r._updatedAt=now; n++; } });
  fbDb.ref(path).set(data).then(function(){ toast(memo?('📝 '+n+'개 메모: '+memo):(n+'개 메모 지움')); closePopup(); })
    .catch(function(e){ toast('실패: '+(e.message||e),true); });
}
// 선택 항목 → 일괄 삭제
function modDelSel(key){
  var ids=_modSelIds(key);
  if(!ids.length) return toast('선택된 항목이 없습니다',true);
  var path=_modFbPath(key); if(!path) return;
  var def=_modDefs[key];
  if(!confirm(ids.length+'개 항목을 삭제할까요? (되돌릴 수 없습니다)'+(def&&def.smsCancel?'\n(주문자/받는분에게 취소 문자가 발송됩니다)':''))) return;
  var delRows=(_modData[key]||[]).filter(function(r){ return ids.indexOf(r._id)>=0; });
  var data=(_modData[key]||[]).filter(function(r){ return ids.indexOf(r._id)<0; });
  showLoading('삭제 중...');
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('🗑 '+ids.length+'개 삭제됨'); _modLogAdd(key,'삭제','','('+ids.length+'개 일괄)','행 삭제'); _modSel[key]={}; _modSendCancelSms(def,delRows); })
    .catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
}

// ─── 셀 포맷 ───
// 배지 칼럼 기본값 (defVal 없으면 첫 배지 = 보통 '대기') — 빈값을 이걸로 취급
function _modBadgeDefault(col){ return (col&&col.defVal) || (col&&col.badgeMap?Object.keys(col.badgeMap)[0]:'') || ''; }
function _modFmtCell(col,val){
  // 빈 상태배지는 기본값(대기 등)으로 표시
  if((val==null||val==="") && col.type==='badge'){ var _bd=_modBadgeDefault(col); if(_bd) val=_bd; }
  if(val==null||val==="") return '<span style="color:#cbd5e1">—</span>';
  if(col.multiQty){ var _ms=_modMultiStr(val,col.multiSep,col.multiNoQty,col.multiQtyKae); return _ms?'<b>'+esc(_ms)+'</b>':'<span style="color:#cbd5e1">—</span>'; }
  switch(col.type){
    case 'number':
      return col.comma?'<b>'+Number(val).toLocaleString()+'</b>':String(val);
    case 'tel':
      var _tparts=String(val).split(/[,\/;\n·|]+/).map(function(s){return s.trim();}).filter(Boolean);
      return _tparts.map(function(p){ var cl=p.replace(/[^0-9+]/g,''); return '<a href="tel:'+cl+'" style="color:#2563eb;text-decoration:none;white-space:nowrap">'+esc(p)+'</a>'; }).join('<br>');
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
        var vw=esc(_modDriveViewUrl(u));
        if(_modIsImg(nm)||_modIsImg(u)){   // 🖼 이미지 썸네일 (느리면 lazy 로드, 실패 시 📎로)
          var th=_modDriveThumb(u,120);
          if(th) return '<a href="'+vw+'" target="_blank" title="'+esc(nm)+'"><img src="'+esc(th)+'" loading="lazy" onerror="this.replaceWith(document.createTextNode(\'📎\'))" style="height:44px;max-width:90px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0;vertical-align:middle;margin:1px"></a>';
        }
        return '<a href="'+vw+'" target="_blank" style="color:#2563eb;text-decoration:none;white-space:nowrap">📎'+(nm?' <span style="color:#94a3b8;font-weight:400;font-size:11px">'+esc(nm)+'</span>':'')+'</a>';
      }).join(' ');
    case 'consent':
      return val==='동의'?'<span style="color:#16a34a;font-weight:700">✅ 동의</span>':'<span style="color:#cbd5e1">미동의</span>';
    case 'account':
      var av=String(val), avs=av.replace(/"/g,'');
      return '<span style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap"><b>'+esc(av)+'</b><button type="button" data-copy="'+esc(avs)+'" onclick="_modCopyText(this)" style="border:none;border-radius:5px;background:#16a34a;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;cursor:pointer">📋복사</button></span>';
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

// 관리자 추가/수정 폼 필드 렌더 — 조건토글(주문자와 동일)/조건부칸 로직 포함
function _modAdminFields(def, row){
  row = row || {};
  var h='';
  // 1) 조건토글 현재 상태 계산 → 조건부칸 초기 표시여부(condShow) + __modCondOn
  var condShow=true, hasCond=false;
  (def.columns||[]).forEach(function(c){
    if(!c.condToggle) return;
    hasCond=true;
    var inv=!!c.condInvert, val=row[c.key];
    var checked = (val==null||val==='') ? inv : (inv?(val==='주문자와 동일'):(val==='선물'));
    condShow = inv ? !checked : !!checked;
  });
  window.__modCondOn = hasCond ? condShow : true;
  // 2) 컬럼 렌더
  (def.columns||[]).forEach(function(c){
    if(c.auto) return;
    if(c.condToggle){
      var inv=!!c.condInvert, val=row[c.key];
      var checked = (val==null||val==='') ? inv : (inv?(val==='주문자와 동일'):(val==='선물'));
      var _bg=inv?'#eff6ff':'#fffbeb', _bd=inv?'#bfdbfe':'#fde68a', _col=inv?'#1d4ed8':'#92400e', _ic=inv?'✅':'🎁';
      h+='<div style="margin:0 0 14px;background:'+_bg+';border:1.5px solid '+_bd+';border-radius:10px;padding:12px"><label style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:800;color:'+_col+';cursor:pointer"><input type="checkbox" id="mod_f_'+c.key+'"'+(checked?' checked':'')+' onchange="_modCondToggle(this.checked,'+inv+')" style="width:18px;height:18px;flex-shrink:0">'+_ic+' '+esc(c.label)+'</label></div>';
      return;
    }
    var _cf=c.condOnly?' data-condfield="1"':'';
    var _cs=(c.condOnly && !condShow)?';display:none':'';
    h+='<div class="fr"'+_cf+' style="'+_cs.replace(/^;/,'')+'"><label>'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</label>';
    h+=_modFormField(c, row[c.key]==null?'':row[c.key]);
    h+='</div>';
  });
  return h;
}
function popModAdd(key){
  var def=_modDefs[key]; if(!def) return;
  var h='<div class="pop-head"><h3>➕ '+esc(def.label)+' 추가</h3></div>';
  h+='<div style="padding:14px;max-height:65vh;overflow-y:auto">';
  if(def.multiRecipient){
    // 👥 다중 받는분 모듈 — 신청폼과 동일하게 주문자 칸 + 받는분 블록 반복 (한 번에 여러 박스 등록)
    window.__modApplyDef=def;
    (def.columns||[]).forEach(function(c){
      if(c.auto||c.perRecipient||c.condToggle) return;
      h+='<div class="fr"><label>'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</label>'+_modFormField(c,'')+'</div>';
    });
    h+='<div style="margin:14px 0 8px;font-weight:800;color:#7c3aed;font-size:14px">📦 받는 분</div>';
    h+='<div id="modRcpList"></div>';
    h+='<button type="button" onclick="_modAddRecipient()" style="width:100%;padding:12px;border:none;border-radius:10px;background:#7c3aed;color:#fff;font-weight:800;font-size:14px;cursor:pointer;margin-top:2px;box-shadow:0 3px 10px rgba(124,58,237,.3)">➕ 받는 분 추가 (다른 주소로 더 보내기)</button>';
  } else {
    h+=_modAdminFields(def,'');
  }
  h+='</div>';
  h+='<div style="padding:10px 14px;border-top:1px solid #e2e8f0;text-align:right;background:#f8fafc;border-radius:0 0 12px 12px">';
  h+='<button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" onclick="modSave(\''+key+'\')">저장</button>';
  h+='</div>';
  openPopup(h,460);
  if(def.multiRecipient){ window.__modRcpN=0; var _rl=document.getElementById('modRcpList'); if(_rl) _rl.innerHTML=''; _modAddRecipient(); }
}

function popModEdit(key,id){
  var def=_modDefs[key]; if(!def) return;
  var row=(_modData[key]||[]).find(function(r){return r._id===id});
  if(!row) return toast("데이터를 찾을 수 없습니다",true);

  var h='<div class="pop-head"><h3>✏️ '+esc(def.label)+' 수정</h3></div>';
  h+='<div style="padding:14px;max-height:65vh;overflow-y:auto">';
  h+='<input type="hidden" id="mod_edit_id" value="'+esc(id)+'">';
  h+=_modAdminFields(def,row);
  // 🎨 색칠 + 메모 (저장 버튼으로 같이 저장)
  h+=_modMarkEditSection(row);
  h+='</div>';
  h+='<div style="padding:10px 14px;border-top:1px solid #e2e8f0;text-align:right;background:#f8fafc;border-radius:0 0 12px 12px">';
  h+='<button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" onclick="modSave(\''+key+'\',\''+esc(id)+'\')">저장</button>';
  h+='</div>';
  openPopup(h,460);
}

// 📑 행 복제 — 같은 주문자로 새 박스(받는분만 수정). 배송 진행정보(송장·상태·출력)는 비움
function modDupRow(key,id){
  var def=_modDefs[key]; if(!def) return;
  var row=(_modData[key]||[]).find(function(r){return r._id===id;});
  if(!row) return toast('원본을 찾을 수 없습니다',true);
  var src=JSON.parse(JSON.stringify(row));
  delete src._id; delete src._createdAt; delete src._updatedAt; delete src._printCount; delete src._mark; delete src._markMemo; delete src.labelPrinted;
  // 새 박스: 배송/상태 정보는 초기화 (송장번호·배지·상태)
  (def.columns||[]).forEach(function(c){ if(c.type==='badge'||/송장/.test(c.label||'')||c.key==='status') src[c.key]=''; });
  var h='<div class="pop-head"><h3>📑 '+esc(def.label)+' 복제 — 같은 주문자, 받는분·품명만 수정</h3></div>';
  h+='<div style="padding:14px;max-height:65vh;overflow-y:auto">';
  h+='<div style="font-size:12px;color:#4338ca;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;margin-bottom:10px">주문자 정보는 그대로예요. <b>받는분·주소·품명</b>만 새 분으로 고쳐서 저장하면 새 행(새 박스)으로 추가됩니다.</div>';
  h+=_modAdminFields(def, src);
  h+='</div>';
  h+='<div style="padding:10px 14px;border-top:1px solid #e2e8f0;text-align:right;background:#f8fafc;border-radius:0 0 12px 12px">';
  h+='<button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" onclick="modSave(\''+key+'\')">새 박스로 추가</button>';
  h+='</div>';
  openPopup(h,460);
}

// 수정 팝업용 색칠+메모 섹션 (저장 버튼으로 같이 저장됨)
function _modMarkEditSection(row){
  var cur=(row&&row._mark)||'', memo=(row&&row._markMemo)||'';
  var h='<div style="margin-top:16px;padding-top:14px;border-top:1px dashed #e2e8f0">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:8px">🎨 색칠 · 메모</label>';
  h+='<input type="hidden" id="_modEditMark" value="'+esc(cur)+'">';
  h+='<div id="_modEditSwatches" style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px">';
  _MOD_MARK_COLORS.forEach(function(c){
    var on=(cur===c.k);
    var inner = c.k==='' ? '<span style="font-size:14px;color:#94a3b8">✕</span>' : (on?'<span style="color:#1e3a8a;font-weight:900;font-size:14px">✓</span>':'');
    h+='<button type="button" data-mk="'+c.k+'" onclick="_modPickMark(this)" title="'+c.name+'" style="width:34px;height:34px;border-radius:9px;cursor:pointer;background:'+(c.bg||'#fff')+';border:'+(on?'3px solid #2563eb':'2px solid #e2e8f0')+';display:flex;align-items:center;justify-content:center;box-shadow:'+(on?'0 0 0 2px #bfdbfe':'none')+'">'+inner+'</button>';
  });
  h+='</div>';
  h+='<input id="_modEditMemo" value="'+esc(memo)+'" placeholder="짧은 메모 (예: 미납, VIP, 확인필요)" maxlength="20" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">';
  h+='</div>';
  return h;
}
function _modPickMark(btn){
  var hex=btn.getAttribute('data-mk')||'';
  var hid=document.getElementById('_modEditMark'); if(hid) hid.value=hex;
  var wrap=document.getElementById('_modEditSwatches'); if(!wrap) return;
  Array.prototype.forEach.call(wrap.querySelectorAll('button'),function(b){
    var on=(b.getAttribute('data-mk')===hex);
    b.style.border=on?'3px solid #2563eb':'2px solid #e2e8f0';
    b.style.boxShadow=on?'0 0 0 2px #bfdbfe':'none';
    var mk=b.getAttribute('data-mk');
    b.innerHTML = mk==='' ? '<span style="font-size:14px;color:#94a3b8">✕</span>' : (on?'<span style="color:#1e3a8a;font-weight:900;font-size:14px">✓</span>':'');
  });
}
function _modFormField(col,val,idOverride){
  var id=idOverride||('mod_f_'+col.key);
  // 기본값: 빈 값이면 정의된 기본값으로 자동 채움
  if((val==null||val==='') && col.defVal!=null && col.defVal!=='') val=col.defVal;
  // 고정값: 수정 불가 — 값 표시 + hidden input(저장용)
  if(col.fixed){
    var fv=(val!=null&&val!=='')?String(val):(col.defVal||'');
    var disp=fv;
    if(col.type==='badge'&&col.badgeMap&&col.badgeMap[fv]) disp=col.badgeMap[fv].label||fv;
    return '<input type="hidden" id="'+id+'" value="'+esc(fv)+'"><div style="padding:8px 10px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;color:#4338ca;font-size:13px;font-weight:600">🔒 '+esc(disp||'(값 없음)')+' <span style="font-size:10px;color:#818cf8;font-weight:400">고정</span></div>';
  }
  var ev=esc(String(val==null?'':val));
  var ph=col.placeholder?' placeholder="'+esc(col.placeholder)+'"':'';
  var _w='width:100%;box-sizing:border-box;';  // 입력칸 너비 통일
  switch(col.type){
    case 'textarea':
      return '<textarea id="'+id+'" rows="3" style="'+_w+'resize:vertical"'+ph+'>'+ev+'</textarea>';
    case 'select':
      // 🛒 다중선택 + 수량: 옵션마다 수량칸 (티셔츠 사이즈별 주문 등)
      if(col.multiQty){
        var _cur={}; _modParseMulti(val).forEach(function(it){ if(it&&it.o) _cur[it.o]=it.q; });
        var _mp=col.maxPer||0;
        var mh='<div id="'+id+'" data-multiqty="1"'+(_mp?' data-maxtotal="'+_mp+'"':'')+' style="border:1px solid #cbd5e1;border-radius:10px;overflow:hidden">';
        // ✏️ 직접 입력 행 — 맨 위 고정. 자유 텍스트 한 칸 (수량까지 직접 작성, 별도 수량칸 없음)
        if(col.allowEtc){
          var _optset={}; (col.options||[]).forEach(function(o){ _optset[String(typeof o==='object'?o.value:o)]=1; });
          var _custom=null; _modParseMulti(val).forEach(function(it){ if(it&&it.o&&(it.raw||!_optset[it.o])) _custom=it; });
          mh+='<div data-optrow="__etc__" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #fde68a;background:#fffbeb">'
            +'<span style="font-size:12px;font-weight:700;color:#92400e;flex-shrink:0">✏️ 직접입력</span>'
            +'<input type="text" class="mqetcname" placeholder="'+esc(col.etcPlaceholder||'예: 특수굴비30미 2개')+'" value="'+(_custom?esc(_custom.o):'')+'" style="flex:1;min-width:0;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-weight:700">'
            +'</div>';
        }
        // 품목 목록 — 길어도 박스 안에서 스크롤 (화면 전체를 차지하지 않게)
        mh+='<div style="max-height:270px;overflow-y:auto">';
        (col.options||[]).forEach(function(o,oi){
          var ov=String(typeof o==='object'?o.value:o), ovs=ov.replace(/"/g,'');
          var on=_cur[ov]>0;
          mh+='<div data-optrow="'+esc(ovs)+'" style="display:flex;align-items:center;gap:8px;padding:10px 12px;'+(oi>0?'border-top:1px solid #f1f5f9;':'')+'">'
            +'<label style="flex:1;display:flex;align-items:center;gap:8px;font-weight:700;color:#334155;cursor:pointer;min-width:0">'
              +'<input type="checkbox" class="mqchk" data-opt="'+esc(ovs)+'"'+(on?' checked':'')+' onchange="_modMqToggle(this)" style="width:18px;height:18px;flex-shrink:0">'
              +'<span style="min-width:0">'+esc(ov)+'<span class="mqleft" style="font-size:11px;font-weight:600;margin-left:7px"></span></span></label>'
            +'<input type="number" class="mqnum" min="1" value="'+(on?_cur[ov]:1)+'" data-opt="'+esc(ovs)+'"'+(on?'':' disabled')+' style="width:60px;text-align:center;padding:7px;border:1px solid #cbd5e1;border-radius:6px;font-weight:700;'+(on?'':'opacity:.4;background:#f1f5f9')+'" onfocus="this.select()" oninput="_modMqClampTotal(this)">'
            +'<span style="font-size:12px;color:#94a3b8">개</span></div>';
        });
        mh+='</div>';
        mh+='</div><div id="'+id+'_tot" style="font-size:11px;color:#94a3b8;margin-top:4px">원하는 품목을 체크하면 수량이 켜집니다'+((col.options||[]).length>6?' · 목록은 위아래로 스크롤':'')+(_mp?' · <b style="color:#0f766e">총 '+_mp+'개까지</b>':'')+'</div>';
        return mh;
      }
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
      var _etcAllow=(col.allowEtc!==false) || _etcOn;   // 직접입력 허용(기본 켜짐) — 끄면 옵션만
      if(_etcAllow){
        h+='<option value="__etc__"'+(_etcOn?' selected':'')+'>+ 직접 입력</option>';
      }
      h+='</select>';
      if(_etcAllow){
        var _etcMax=(col.maxLen?' maxlength="'+col.maxLen+'"':'');
        var _etcPh=col.etcPlaceholder||(col.maxLen?('직접 입력 (최대 '+col.maxLen+'자)'):'직접 입력');
        h+='<input id="'+_etcId+'"'+_etcMax+' placeholder="'+_etcPh+'" value="'+(_etcOn?ev:'')+'" style="'+_w+'margin-top:6px;padding:11px;font-size:15px;border:1px solid #cbd5e1;border-radius:8px;display:'+(_etcOn?'block':'none')+'">';
      }
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
    case 'address':
      // 주소 검색(다음 우편번호) + 상세주소. 저장값: "(우편번호) 기본주소 상세주소" — 화면에선 우편번호를 별도 칸으로 분리 표시
      var _av=String(val||''); var _bar=_av.indexOf('|'); // 구버전 "|" 구분자 호환
      var _abase=(_bar>=0?_av.slice(0,_bar):_av).trim(), _adet=(_bar>=0?_av.slice(_bar+1):'').trim();
      var _azip=''; var _zm=_abase.match(/^\((\d{5})\)\s*/); if(_zm){ _azip=_zm[1]; _abase=_abase.slice(_zm[0].length); }
      var _ais='box-sizing:border-box;padding:11px;font-size:15px;border:1px solid #cbd5e1;border-radius:8px';
      var ah='<div style="display:flex;gap:6px"><input id="'+id+'_zip" readonly value="'+esc(_azip)+'" placeholder="우편번호" style="width:105px;flex-shrink:0;text-align:center;'+_ais+';background:#f8fafc;cursor:pointer" onclick="_modAddrSearch(\''+id+'\')">';
      ah+='<button type="button" onclick="_modAddrSearch(\''+id+'\')" style="flex-shrink:0;padding:11px 15px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap">🔍 주소검색</button></div>';
      ah+='<input id="'+id+'" readonly value="'+esc(_abase)+'" placeholder="주소 검색을 눌러주세요" style="width:100%;'+_ais+';background:#f8fafc;cursor:pointer;margin-top:6px" onclick="_modAddrSearch(\''+id+'\')">';
      ah+='<input id="'+id+'_detail" value="'+esc(_adet)+'" placeholder="상세주소 (동·호수 등)" style="width:100%;'+_ais+';margin-top:6px">';
      return ah;
    default:
      return '<input id="'+id+'" type="text" value="'+ev+'"'+(col.placeholder?' placeholder="'+esc(col.placeholder)+'"':'')+' style="'+_w+'">';
  }
}
// 📱 전역 문자발송 — main/Config(객체)의 네이버 SENS + GAS프록시로 발송 (행사 없는 글로벌 모듈용)
function _modSmsGlobal(tels, msg){
  if(typeof fbDb==='undefined') return Promise.resolve({ok:false,err:'no db'});
  tels=(tels||[]).map(function(t){return String(t||'').replace(/[^0-9]/g,'');}).filter(function(t){return t.length>=10;});
  if(!tels.length) return Promise.resolve({ok:false,err:'수신번호 없음'});
  return fbDb.ref('/main/Config').once('value').then(function(s){
    var cfg=s.val()||{};
    var proxy=cfg.SMS_PROXY_URL, sender=cfg.NAVER_SENS_SENDER;
    if(!proxy||!sender||!cfg.NAVER_SENS_SECRET_KEY) return {ok:false,err:'문자 설정 미완료(main Config)'};
    var body={ action:'send', serviceId:cfg.NAVER_SENS_SERVICE_ID, accessKey:cfg.NAVER_SENS_ACCESS_KEY, secretKey:cfg.NAVER_SENS_SECRET_KEY, sender:sender, tels:tels, msg:String(msg||'') };
    return fetch(proxy,{method:'POST',redirect:'follow',body:JSON.stringify(body)}).then(function(r){return r.json();}).catch(function(e){return {ok:false,err:'프록시 통신오류: '+(e.message||e)};});
  });
}
// 템플릿의 {라벨} → 해당 컬럼 값으로 치환
function _modSmsFill(tpl, def, row){
  var s=String(tpl||'');
  (def.columns||[]).forEach(function(c){
    var re=new RegExp('\\{'+(c.label||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\}','g');
    s=s.replace(re, String(row[c.key]==null?'':row[c.key]));
  });
  return s;
}
// 한 칸에 여러 번호(콤마/슬러시/줄바꿈/세미콜론 구분) → 정규화된 번호 배열
function _modSplitTels(val){
  return String(val||'').split(/[,\/;\n·|]+/).map(function(s){return s.replace(/[^0-9]/g,'');}).filter(function(t){return t.length>=9;});
}
// 모듈의 발신대상(주문자) 연락처 컬럼 값
function _modOrdererTel(def, row){
  var tc=(def.columns||[]).find(function(c){return c.type==='tel';});
  return tc?(_modSplitTels(row[tc.key])[0]||''):'';
}
// 모듈의 모든 연락처(tel) 컬럼 값 — 주문자+받는분 등 전부(한 칸 다중번호 분리), 중복 제거
function _modAllTels(def, row){
  var out=[];
  (def.columns||[]).forEach(function(c){
    if(c.type!=='tel') return;
    _modSplitTels(row[c.key]).forEach(function(t){ if(out.indexOf(t)<0) out.push(t); });
  });
  return out;
}
// 발송 대상별 연락처 — target: 'orderer'(주문자) | 'recipient'(받는분) | 'both'(둘다, 기본)
// 받는분 = 라벨에 받는/수령/수신 포함된 tel 컬럼, 나머지 tel = 주문자. 한 칸 다중번호 분리.
function _modTelsFor(def, row, target){
  target = target || 'both';
  var ord=[], rcp=[];
  (def.columns||[]).forEach(function(c){
    if(c.type!=='tel') return;
    var ts=_modSplitTels(row[c.key]); if(!ts.length) return;
    if(/받는|수령|수신/.test(c.label||'')) rcp=rcp.concat(ts); else ord=ord.concat(ts);
  });
  var pick = target==='orderer' ? ord : (target==='recipient' ? rcp : ord.concat(rcp));
  var out=[]; pick.forEach(function(t){ if(out.indexOf(t)<0) out.push(t); });
  return out;
}
// 편집기용 "보낼 대상" 드롭다운
function _modToSelHtml(id, cur){
  cur = cur || 'both';
  function o(v,l){ return '<option value="'+v+'"'+(cur===v?' selected':'')+'>'+l+'</option>'; }
  return '<select id="'+id+'" style="font-size:12px;margin:0 0 10px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;background:#fff">'
    + o('both','↳ 보낼 대상: 주문자+받는분') + o('orderer','↳ 주문자만') + o('recipient','↳ 받는분만') + '</select>';
}
// 송장번호 컬럼 자동감지 (라벨에 '송장' 포함, 배지 아님)
function _modTrackingCol(def){
  return (def.columns||[]).find(function(c){return /송장/.test(c.label||'') && c.type!=='badge';});
}
// 조건 토글 — 일반:체크 시 표시 / 반대(invert):체크 시 숨김(주문자와 동일)
function _modCondToggle(checked, invert){
  var show = invert ? !checked : !!checked;
  window.__modCondOn=show;
  var els=document.querySelectorAll('[data-condfield]');
  for(var i=0;i<els.length;i++) els[i].style.display=show?'':'none';
}
// 주소 검색 — 다음 우편번호 서비스(무료, 키 불필요) 동적 로드 후 팝업
function _modAddrSearch(inputId){
  function open(){
    try{
      new daum.Postcode({ oncomplete:function(data){
        var addr=data.roadAddress||data.jibunAddress||data.address||'';
        var z=document.getElementById(inputId+'_zip');
        if(z){ z.value=data.zonecode||''; }                       // 우편번호 별도 칸
        else if(data.zonecode){ addr='('+data.zonecode+') '+addr; } // 구형 위젯 호환 (칸 없으면 합쳐서)
        var el=document.getElementById(inputId); if(el) el.value=addr;
        var d=document.getElementById(inputId+'_detail'); if(d){ try{d.focus();}catch(e){} }
      }}).open();
    }catch(e){ if(typeof toast==='function') toast('주소검색 오류: '+(e.message||e),true); }
  }
  if(typeof daum!=='undefined' && daum.Postcode){ open(); return; }
  var s=document.createElement('script');
  s.src='https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  s.onload=open;
  s.onerror=function(){ if(typeof toast==='function') toast('주소검색 로딩 실패 — 인터넷 연결 확인',true); };
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════

function modSave(key,editId){
  var def=_modDefs[key]; if(!def) return;
  // 👥 관리자 다중 받는분 추가 모드 — popModAdd가 받는분 블록(#modRcpList)으로 열렸을 때
  var _multiAdd = !editId && !!def.multiRecipient && !!document.getElementById('modRcpList');
  var obj={}, valid=true, fileTasks=[];
  (def.columns||[]).forEach(function(c){
    if(c.auto) return;
    if(_multiAdd && (c.perRecipient||c.condToggle)) return;   // 받는분별/동일토글 칸은 아래 블록에서
    if(c.condToggle){ var _ce=document.getElementById('mod_f_'+c.key); var _ck=_ce?_ce.checked:false; obj[c.key]= c.condInvert?(_ck?'주문자와 동일':'받는분 별도'):(_ck?'선물':'본인구매'); return; }   // 조건 토글 값
    if(c.condOnly && !window.__modCondOn){ obj[c.key]= c.copyFrom?(obj[c.copyFrom]||''):''; return; }   // 숨김(주문자와 동일)이면 복사출처 값 복사 → 필수검증 건너뜀
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
    if(c.type==='select'&&c.multiQty){
      var mv=_modCollectMultiQty('mod_f_'+c.key);
      if(c.required&&!mv){ toast(c.label+' 수량을 1개 이상 입력하세요',true); valid=false; }
      obj[c.key]=mv; return;
    }
    if(c.type==='address'){
      var _ab=(el.value||'').trim(); var _ad=document.getElementById('mod_f_'+c.key+'_detail'); var _adv=_ad?(_ad.value||'').trim():'';
      var _az=document.getElementById('mod_f_'+c.key+'_zip'); var _azv=_az?(_az.value||'').trim():'';
      if(c.required&&!_ab){ toast(c.label+'을(를) 검색하세요',true); valid=false; }
      obj[c.key]=(_azv?'('+_azv+') ':'')+_ab+(_adv?' '+_adv:''); return;
    }
    var v=(el.value||"").trim();
    if(c.type==='select'&&v==='__etc__'){ var _et=document.getElementById('mod_f_'+c.key+'_etc'); v=_et?(_et.value||'').trim():''; }
    if(c.type==='number'&&c.comma) v=v.replace(/,/g,'');
    if(c.type==='number'&&v) v=Number(v);
    if(c.required&&!v&&v!==0){ toast(c.label+'을(를) 입력하세요',true); valid=false; }
    else { var verr=_modValidateField(c,v); if(verr){ toast(verr,true); valid=false; } }
    obj[c.key]=v;
  });
  if(!_multiAdd) _modApplyCopyFrom(def, obj);   // 주문자와 동일 → 받는분 등 copyFrom 복사 (컬럼 순서 무관)
  if(!valid) return;
  // 👥 다중 받는분 블록 수집 — 블록마다 행 1개 (신청폼과 동일 로직)
  var _blockObjs=null, _mCtx=null;
  if(_multiAdd){
    _mCtx={valid:true, firstBad:null, fileTasks:[]};
    _blockObjs=[];
    var _blocks=document.querySelectorAll('#modRcpList .modRcpBlock');
    if(!_blocks.length) return toast('받는 분을 한 명 이상 추가하세요',true);
    var _tcCol=(def.columns||[]).find(function(c){return c.condToggle;});
    [].slice.call(_blocks).forEach(function(blk){
      var rn=blk.getAttribute('data-rcp'); var bo={};
      var _sameEl=document.getElementById('mod_f_same__r'+rn); var _same=!!(_sameEl&&_sameEl.checked);
      (def.columns||[]).forEach(function(c){
        if(!c.perRecipient||c.auto) return;
        if(_same&&c.condOnly){ bo[c.key]= c.copyFrom?(obj[c.copyFrom]||''):''; return; }   // ✅ 주문자와 동일 → 주문자 값 복사
        var val=_modReadField(c,'mod_f_'+c.key+'__r'+rn,_mCtx,bo);
        if(val!==undefined) bo[c.key]=val;
      });
      if(_tcCol) bo[_tcCol.key]=_same?'주문자와 동일':'받는분 별도';
      _blockObjs.push(bo);
    });
    if(!_mCtx.valid) return toast(_mCtx.firstBad||'입력을 확인하세요',true);
  }
  // 🎨 색칠+메모 (수정 팝업에 있을 때만)
  var _mkEl=document.getElementById('_modEditMark');
  if(_mkEl){ obj._mark=_mkEl.value||''; }
  var _memoEl=document.getElementById('_modEditMemo');
  if(_memoEl){ obj._markMemo=(_memoEl.value||'').trim(); }

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
  // 👥 받는분 블록의 파일첨부 (target=블록 객체)
  if(_mCtx&&_mCtx.fileTasks.length){
    _mCtx.fileTasks.forEach(function(t){
      upChain=upChain.then(function(){
        var urls=[]; var sub=Promise.resolve();
        t.files.forEach(function(f){
          sub=sub.then(function(){ return _uploadToDrive(f,'mod_'+key,t.col.label).then(function(url){ urls.push(f.name.replace(/[|\n]/g,' ')+'|'+url); }); });
        });
        return sub.then(function(){ t.target[t.col.key]=urls.join('\n'); });
      });
    });
  }

  upChain.then(function(){
    if(editId){
      var data=(_modData[key]||[]).slice();
      var idx=-1;
      for(var i=0;i<data.length;i++){if(data[i]._id===editId){idx=i;break}}
      if(idx<0){hideLoading();toast('데이터를 찾을 수 없습니다',true);return}
      obj._id=editId;
      obj._updatedAt=new Date().toISOString();
      // 📱 송장번호 신규입력 감지 (저장 전 비교)
      var _trk=def.smsTracking?_modTrackingCol(def):null;
      var _trkOld=_trk?String(data[idx][_trk.key]||'').trim():'';
      var merged={}; for(var k in data[idx])merged[k]=data[idx][k]; for(var k in obj)merged[k]=obj[k];
      data[idx]=merged;
      return fbDb.ref(path).set(data).then(function(){
        hideLoading();toast('✅ 수정됨');closePopup();
        // 📱 송장번호가 새로 채워졌으면 문자 발송
        if(_trk){
          var _trkNew=String(merged[_trk.key]||'').trim();
          if(_trkNew && _trkNew!==_trkOld){
            var _tels=_modTelsFor(def,merged,def.smsTrackingTo||'both');
            if(_tels.length){ _modSmsGlobal(_tels,_modSmsFill(def.smsTrackingTpl||'상품이 발송되었습니다. 송장번호: {'+_trk.label+'}',def,merged)).then(function(r){ if(r&&r.ok) toast('📱 송장 문자 발송 ('+_tels.length+'건)'); }); }
          }
        }
      });
    } else if(_multiAdd){
      // 👥 블록마다 행 1개 — 2건 이상이면 같은 묶음번호(_grpId)
      var _now=new Date().toISOString();
      var _grp=(_blockObjs.length>1)?('g'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)):'';
      var data=(_modData[key]||[]).slice();
      var _rows=[];
      _blockObjs.forEach(function(bo,i){
        var r={}; for(var k in obj) r[k]=obj[k]; for(var k2 in bo) r[k2]=bo[k2];
        r._id=_modId()+i; r._createdAt=_now;
        if(_grp) r._grpId=_grp;
        _rows.push(r); data.push(r);
      });
      return fbDb.ref(path).set(data).then(function(){
        hideLoading();toast('✅ '+_rows.length+'건 추가됨');closePopup();
        // 📱 접수 문자 — 모든 행의 대상 연락처 모아 번호당 1번만
        if(def.smsApply){
          var seen={};
          _rows.forEach(function(r){
            _modTelsFor(def,r,def.smsApplyTo||'both').forEach(function(t){
              if(seen[t]) return; seen[t]=1;
              _modSmsGlobal([t],_modSmsFill(def.smsApplyTpl||'주문이 정상 접수되었습니다.',def,r));
            });
          });
        }
      });
    } else {
      obj._id=_modId();
      obj._createdAt=new Date().toISOString();
      var data=(_modData[key]||[]).slice();
      data.push(obj);
      return fbDb.ref(path).set(data).then(function(){
        hideLoading();toast('✅ 추가됨');closePopup();
        // 📱 관리자 직접 추가도 접수 문자 발송 (신청폼과 동일)
        if(def.smsApply){
          var _tels=_modTelsFor(def,obj,def.smsApplyTo||'both');
          if(_tels.length) _modSmsGlobal(_tels,_modSmsFill(def.smsApplyTpl||'주문이 정상 접수되었습니다.',def,obj)).then(function(r){ if(r&&r.ok) toast('📱 접수 문자 발송 ('+_tels.length+'건)'); });
        }
      });
    }
  }).catch(function(e){hideLoading();toast('실패: '+(e.message||e),true)});
}

function modResetPrintCount(key){
  var path=_modFbPath(key); if(!path) return;
  var data=(_modData[key]||[]).slice();
  var cnt=data.filter(function(r){return pn(r._printCount)>0}).length;
  if(!cnt) return toast('출력된 항목이 없습니다');
  if(!confirm('⚠ '+cnt+'개 항목의 출력 횟수를 0으로 초기화할까요?\n(되돌릴 수 없습니다)')) return;
  data.forEach(function(r){ r._printCount=0; });
  showLoading('초기화 중...');
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('🖨 '+cnt+'개 출력횟수 초기화 완료'); draw(); })
    .catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
}
function modDel(key,id){
  var def=_modDefs[key]; if(!def) return;
  var row=(_modData[key]||[]).find(function(r){return r._id===id;});
  if(!confirm(def.label+' 항목을 삭제할까요?'+(def.smsCancel?'\n(주문자/받는분에게 취소 문자가 발송됩니다)':''))) return;
  var path=_modFbPath(key); if(!path) return;
  var data=(_modData[key]||[]).filter(function(r){return r._id!==id});
  showLoading('삭제 중...');
  fbDb.ref(path).set(data).then(function(){hideLoading();toast('삭제됨'); _modSendCancelSms(def,row?[row]:[]);})
    .catch(function(e){hideLoading();toast('실패: '+e.message,true)});
}
// 🗑 삭제(취소) 문자 — smsCancel 켜진 모듈에서 삭제된 행들의 주문자/받는분에게
function _modSendCancelSms(def, rows){
  if(!def || !def.smsCancel || !rows || !rows.length) return;
  var sent=0, chain=Promise.resolve();
  rows.forEach(function(row){
    if(!row) return;
    chain=chain.then(function(){
      var tels=_modTelsFor(def,row,def.smsCancelTo||'both'); if(!tels.length) return;
      return _modSmsGlobal(tels,_modSmsFill(def.smsCancelTpl||'주문이 취소되었습니다.',def,row)).then(function(r){ if(r&&r.ok) sent++; });
    });
  });
  chain.then(function(){ if(sent) toast('📱 취소 문자 '+sent+'건 발송'); });
}

// ═══════════════════════════════════════════
// 엑셀 내보내기
// ═══════════════════════════════════════════

function modExportExcel(key){
  var def=_modDefs[key]; if(!def) return;
  var data=_modFilteredData(key);  // 현재 검색·필터·정렬 적용된 것만 내보내기
  var cols=(def.columns||[]).filter(function(c){return !c.hideTable});
  // 첫 열은 고유번호(QR id) — 다시 가져올 때 기존 행을 식별/업데이트하기 위함
  var rows=[['고유번호'].concat(cols.map(function(c){return c.label}))];
  data.forEach(function(row){
    rows.push([row._id||''].concat(cols.map(function(c){
      var v=row[c.key]; if(v==null) return '';
      if(c.multiQty) return _modMultiStr(v,c.multiSep,c.multiNoQty,c.multiQtyKae);
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

// 시트에서 편집 가능한 컬럼 (파일 제외)
function _mshCols(def){
  return (def.columns||[]).filter(function(c){return !c.hideTable&&c.type!=='file';});
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
  h+='<div><button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> <button class="btn btn-b" style="background:#16a34a" onclick="_mshSave()">💾 저장</button></div>';
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
// 📦 송장 일괄등록 (붙여넣기/엑셀) — 매칭 후 송장 입력 + 문자 자동발송
// ═══════════════════════════════════════════
// 식별값으로 주문 행 찾기
function _modTrackMatch(def, data, idv, basis, used, trkKey){
  idv=String(idv||'').trim(); if(!idv) return -1;
  var cand=[];
  if(basis==='id'){ for(var i=0;i<data.length;i++){ if(String(data[i]._id||'')===idv) cand.push(i); } }
  else if(basis==='tel'){
    var d=idv.replace(/[^0-9]/g,''); if(d.length<8) return -1; var tail=d.slice(-8);
    for(var i2=0;i2<data.length;i2++){ var tels=_modAllTels(def,data[i2]); for(var t=0;t<tels.length;t++){ if(tels[t]===d || tels[t].slice(-8)===tail){ cand.push(i2); break; } } }
  }
  else{
    // rname=받는분(수취인) 이름 / name=주문자(구매자) 이름 — 라벨의 받는/수령/수취로 구분
    var nameCol;
    if(basis==='rname') nameCol=(def.columns||[]).find(function(c){return c.type==='text' && /받는|수령|수취/.test(c.label||'');});
    else nameCol=(def.columns||[]).find(function(c){return c.type==='text' && !/받는|수령|수취/.test(c.label||'');}) || (def.columns||[]).find(function(c){return c.type==='text';});
    if(!nameCol) return -1;
    for(var j=0;j<data.length;j++){ if(String(data[j][nameCol.key]||'').trim()===idv) cand.push(j); }
    // 정확 일치가 없으면 정규화 비교 — 택배사 파일의 "홍길동 님", "홍길동 목사님" 같은 호칭/공백 제거
    if(!cand.length){
      var _nrm=function(s){ s=String(s||'').trim().split(/\s+/)[0]; return s.replace(/(님|씨|귀하)$/,''); };
      var nidv=_nrm(idv);
      if(nidv){ for(var j2=0;j2<data.length;j2++){ if(_nrm(data[j2][nameCol.key])===nidv) cand.push(j2); } }
    }
  }
  if(!cand.length) return -1;
  // 같은 식별값이 여러 행(한 주문자→여러 받는분 묶음)일 때: 이번 배치에서 아직 안 쓴 행 중 송장 빈 행 우선
  var free=used?cand.filter(function(ci){ return !used[ci]; }):cand;
  if(!free.length) return -1;
  if(trkKey){ var empty=free.filter(function(ci){ return !String(data[ci][trkKey]||'').trim(); }); if(empty.length) return empty[0]; }
  return free[0];
}
// 자동 다단계 매칭 — 식별값 후보들(idvs)로 ①고유/주문번호 ②연락처(숫자8+) ③받는분 이름 ④주문자 이름 순서로 시도
function _modTrackMatchAuto(def, data, idvs, used, trkKey){
  idvs=(idvs||[]).map(function(s){return String(s||'').trim();}).filter(function(s){return s!=='';});
  if(!idvs.length) return -1;
  var a,r;
  for(a=0;a<idvs.length;a++){ r=_modTrackMatch(def,data,idvs[a],'id',used,trkKey); if(r>=0) return r; }
  for(a=0;a<idvs.length;a++){
    var dg=idvs[a].replace(/[^0-9]/g,'');
    if(dg.length>=8){ r=_modTrackMatch(def,data,idvs[a],'tel',used,trkKey); if(r>=0) return r; }
  }
  for(a=0;a<idvs.length;a++){
    if(/^[0-9\-\s().]+$/.test(idvs[a])) continue;   // 숫자뿐인 값은 이름 비교 제외
    r=_modTrackMatch(def,data,idvs[a],'rname',used,trkKey); if(r>=0) return r;
    r=_modTrackMatch(def,data,idvs[a],'name',used,trkKey); if(r>=0) return r;
  }
  return -1;
}
// ─── 🚚 택배사 인식 프로파일 — 파일명 포함 문자열 → 열 이름 매핑 (/main/CourierProfiles, ⚙ 설정에서 편집) ───
var _COURIER_DEFAULTS=[
  {name:'롯데택배', file:'PIDPIC', trk:'운송장번호', ord:'주문번호', rname:'수하인명', tel:''}
];
function popCourierProfiles(key){
  window.__cpEdit=JSON.parse(JSON.stringify((window.__courierProfiles&&window.__courierProfiles.length)?window.__courierProfiles:_COURIER_DEFAULTS));
  var h='<div style="max-width:640px">';
  h+='<h3 style="margin:0 0 4px">🚚 택배사 인식 설정</h3>';
  h+='<div style="font-size:12px;color:#64748b;margin-bottom:10px">송장 파일명에 <b>포함 문자열</b>이 들어 있으면 그 택배사로 인식하고, 아래 <b>열 이름</b>으로 송장·주문번호·받는분 열을 바로 잡습니다. 열 이름은 택배사 파일 첫 행(제목) 그대로 적으세요. 비워둔 항목은 자동 추정합니다.</div>';
  h+='<div id="_cpList"></div>';
  h+='<button class="btn" style="background:#0d9488;color:#fff;margin-top:6px" onclick="_cpAdd()">➕ 택배사 추가</button>';
  h+='<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" style="flex:1;background:#2563eb;color:#fff;font-weight:800" onclick="_cpSave(\''+key+'\')">💾 저장</button><button class="btn" style="background:#64748b;color:#fff" onclick="popModTrackImport(\''+key+'\')">← 돌아가기</button></div>';
  h+='</div>';
  openPopup(h,640);
  _cpRender();
}
function _cpRender(){
  var box=document.getElementById('_cpList'); if(!box) return;
  var is='box-sizing:border-box;width:100%;padding:7px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px';
  var lb='font-size:10px;color:#64748b;font-weight:700';
  var h='';
  (window.__cpEdit||[]).forEach(function(p,i){
    h+='<div style="border:1px solid #e2e8f0;border-radius:9px;padding:10px;margin-bottom:8px;background:#f8fafc">';
    h+='<div style="display:flex;gap:6px;align-items:flex-end;margin-bottom:6px"><div style="flex:1"><div style="'+lb+'">택배사 이름</div><input value="'+esc(p.name||'')+'" placeholder="롯데택배" style="'+is+'" onchange="__cpEdit['+i+'].name=this.value"></div>';
    h+='<div style="flex:1"><div style="'+lb+'">파일명에 포함되는 문자열</div><input value="'+esc(p.file||'')+'" placeholder="PIDPIC" style="'+is+'" onchange="__cpEdit['+i+'].file=this.value"></div>';
    h+='<button onclick="_cpDel('+i+')" style="border:none;background:#fee2e2;color:#dc2626;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0">🗑</button></div>';
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
    h+='<div style="flex:1;min-width:110px"><div style="'+lb+'">송장 열 이름</div><input value="'+esc(p.trk||'')+'" placeholder="운송장번호" style="'+is+'" onchange="__cpEdit['+i+'].trk=this.value"></div>';
    h+='<div style="flex:1;min-width:110px"><div style="'+lb+'">주문번호 열 이름</div><input value="'+esc(p.ord||'')+'" placeholder="주문번호" style="'+is+'" onchange="__cpEdit['+i+'].ord=this.value"></div>';
    h+='<div style="flex:1;min-width:110px"><div style="'+lb+'">받는분 열 이름</div><input value="'+esc(p.rname||'')+'" placeholder="수하인명" style="'+is+'" onchange="__cpEdit['+i+'].rname=this.value"></div>';
    h+='<div style="flex:1;min-width:110px"><div style="'+lb+'">연락처 열 이름</div><input value="'+esc(p.tel||'')+'" placeholder="(있으면)" style="'+is+'" onchange="__cpEdit['+i+'].tel=this.value"></div>';
    h+='</div></div>';
  });
  if(!(window.__cpEdit||[]).length) h='<div style="color:#94a3b8;font-size:12px;padding:14px;text-align:center">등록된 택배사가 없습니다 — ➕로 추가하세요</div>';
  box.innerHTML=h;
}
function _cpAdd(){ (window.__cpEdit=window.__cpEdit||[]).push({name:'',file:'',trk:'',ord:'',rname:'',tel:''}); _cpRender(); }
function _cpDel(i){ window.__cpEdit.splice(i,1); _cpRender(); }
function _cpSave(key){
  var list=(window.__cpEdit||[]).filter(function(p){return (p.name||'').trim()||(p.file||'').trim();});
  list=JSON.parse(JSON.stringify(list));
  showLoading('저장 중...');
  fbDb.ref('/main/CourierProfiles').set(list).then(function(){
    hideLoading(); window.__courierProfiles=list; toast('✅ 택배사 인식 설정 저장됨');
    popModTrackImport(key);
  }).catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
}
function popModTrackImport(key){
  var def=_modDefs[key]; if(!def) return;
  var trk=_modTrackingCol(def); if(!trk) return toast('이 모듈엔 「송장」 컬럼이 없습니다',true);
  if(!_modFbPath(key)) return toast('행사를 선택하세요',true);
  // 택배사 인식 프로파일 로드 (최초 1회, 없으면 기본값=롯데)
  if(!window.__courierProfiles && typeof fbDb!=='undefined'){
    fbDb.ref('/main/CourierProfiles').once('value').then(function(s){
      var v=s.val();
      if(v){ if(!Array.isArray(v)) v=Object.values(v); window.__courierProfiles=v; }
      else window.__courierProfiles=_COURIER_DEFAULTS.slice();
    }).catch(function(){ window.__courierProfiles=_COURIER_DEFAULTS.slice(); });
  }
  var smsOn=!!def.smsTracking;
  var h='<div style="max-width:560px">';
  h+='<h3 style="margin:0 0 4px">📦 송장 일괄등록</h3>';
  h+='<div style="font-size:12px;color:#64748b;margin-bottom:12px">택배사 엑셀을 불러오거나, 두 칸(식별값 · 송장번호)을 복사해 붙여넣으세요. 매칭된 주문의 「'+esc(trk.label)+'」에 입력됩니다.'+(smsOn?' 새로 입력된 건은 <b style="color:#7c3aed">주문자/받는분에게 문자 발송</b>(건당 요금)됩니다.':' (이 모듈은 송장 문자발송 OFF)')+'</div>';
  h+='<label style="font-size:12px;font-weight:700">매칭 기준</label>';
  h+='<select id="_mtiBasis" style="width:100%;padding:9px;margin:4px 0 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px"><option value="auto" selected>자동 (추천) — 주문번호 → 연락처 → 받는분 이름 순서로 시도</option><option value="tel">연락처 (주문자/받는분 번호 모두 비교)</option><option value="rname">받는분(수취인) 이름</option><option value="name">주문자(구매자) 이름</option><option value="id">고유번호 (_id)</option></select>';
  h+='<div style="font-size:11px;color:#94a3b8;margin:-6px 0 10px">매칭 안 되는 줄은 건너뛰고 나머지만 등록됩니다 · 한 주문자의 여러 박스도 순서대로 분배 (송장 빈 행 우선)</div>';
  h+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><button class="btn" style="background:#0d9488;color:#fff" onclick="_modTrackImportFile(\''+key+'\')">📤 택배사 엑셀 파일 불러오기</button><button class="btn" style="background:#475569;color:#fff;font-size:12px" onclick="popCourierProfiles(\''+key+'\')" title="파일명으로 택배사 자동 인식 규칙 등록">🚚 택배사 인식 설정</button></div>';
  h+='<div id="_mtiColPick" style="margin-bottom:10px"></div>';
  h+='<label style="font-size:12px;font-weight:700">붙여넣기 / 미리보기 — 한 줄에 「식별값 [Tab] 송장번호」</label>';
  h+='<textarea id="_mtiText" rows="8" placeholder="010-1234-5678\t1234567890&#10;홍길동\t9876543210" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin-top:4px"></textarea>';
  h+='<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" style="flex:1;background:#7c3aed;color:#fff;font-weight:800" onclick="_modTrackImportRun(\''+key+'\')">✅ 송장 등록'+(smsOn?' + 문자발송':'')+'</button><button class="btn" onclick="closePopup()">취소</button></div>';
  h+='</div>';
  openPopup(h,600);
}
// 택배사 엑셀 → 열(식별/송장)을 사용자가 직접 고르는 선택기 표시 후 미리보기 생성
function _modTrackImportFile(key){
  if(typeof XLSX==='undefined') return toast('엑셀 라이브러리 로딩 중입니다. 잠시 후 다시',true);
  var inp=document.createElement('input'); inp.type='file'; inp.accept='.xlsx,.xls,.csv';
  inp.onchange=function(){
    var f=inp.files&&inp.files[0]; if(!f) return;
    // 🚚 택배사 인식 — 파일명에 등록된 문자열이 포함되면 그 택배사의 열 매핑 사용 (⚙ 설정에서 추가)
    var _prof=null;
    (window.__courierProfiles||_COURIER_DEFAULTS).some(function(p){
      if(p&&p.file&&String(f.name||'').toUpperCase().indexOf(String(p.file).toUpperCase())>=0){ _prof=p; return true; }
      return false;
    });
    var rd=new FileReader();
    rd.onload=function(ev){
      try{
        var wb=XLSX.read(ev.target.result,{type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        var aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}).filter(function(r){return r&&r.some(function(v){return String(v).trim()!=='';});});
        if(!aoa.length) return toast('빈 파일입니다',true);
        var trkRe=/송장|운송장|등기|invoice/i;   // "번호" 단독 제외 (운송장번호만 잡히게)
        // 택배사 파일 위쪽에 제목/안내 줄이 있는 경우 — 처음 10행에서 송장/수취인 헤더가 있는 행을 찾아 거기부터 사용
        var hdrRow=-1;
        for(var hr=0;hr<Math.min(aoa.length,10);hr++){
          var _cells=aoa[hr].map(function(s){return String(s).trim();});
          if(_cells.some(function(s){return trkRe.test(s);}) || _cells.some(function(s){return /수취인|받는\s*분|받는사람/.test(s);})){ hdrRow=hr; break; }
        }
        if(hdrRow>0) aoa=aoa.slice(hdrRow);
        window.__mtiAoa=aoa;
        var basis=(document.getElementById('_mtiBasis')||{}).value||'tel';
        var header=aoa[0].map(function(s){return String(s).trim();});
        // 자동 추정 (기본 선택값) — 사용자가 바꿀 수 있음
        var trkGuess=-1;
        header.forEach(function(hl,i){ if(trkGuess<0&&trkRe.test(hl)) trkGuess=i; });   // 송장 열 먼저
        // 🚚 인식된 택배사 프로파일 — 열 이름을 헤더에서 정확히 찾아 고정 (추정보다 우선)
        var _pFind=function(nm){ if(!nm) return -1; return header.indexOf(String(nm).trim()); };
        if(_prof){
          var _pt=_pFind(_prof.trk); if(_pt>=0) trkGuess=_pt;
          toast('🚚 '+(_prof.name||'택배사')+' 파일로 인식했어요');
        }
        // 식별값 열 추정 — 1순위(수취인/수하인 쪽) 먼저, 없으면 2순위(일반)
        var _guessId=function(bs){
          var r1,r2;
          if(bs==='tel'){ r1=/(수취|수하|받는).{0,4}(전화|휴대|연락)/i; r2=/휴대|핸드폰|전화|연락/i; }
          else if(bs==='rname'){ r1=/(수취인|수하인|수령인|받는\s*분|받는\s*사람)\s*(명|성함|이름)?$/i; r2=/성명|성함|이름/i; }   // '고정수하인코드' 같은 코드/주소 열 제외 ($ 앵커)
          else if(bs==='name'){ r1=/(구매자|주문자|보내는\s*분|송하인)\s*(명|성함|이름)?$/i; r2=/성명|성함|고객|이름/i; }
          else { r1=/고유|주문\s*번호|주문번호|_id|qr|order/i; r2=null; }
          var g=-1;
          header.forEach(function(hl,i){ if(g<0 && i!==trkGuess && r1 && r1.test(hl)) g=i; });   // 식별은 송장 열 제외
          if(g<0&&r2) header.forEach(function(hl,i){ if(g<0 && i!==trkGuess && r2.test(hl)) g=i; });
          return g;
        };
        var idGuess=_guessId(basis);
        // 롯데 등 전화번호 열이 아예 없는 파일 → 받는분(수하인) 이름 기준으로 자동 전환
        if(idGuess<0 && basis==='tel'){
          var g2=_guessId('rname');
          if(g2>=0){ basis='rname'; idGuess=g2; var _bs=document.getElementById('_mtiBasis'); if(_bs)_bs.value='rname'; toast('이 파일엔 연락처 열이 없어 「받는분 이름」 기준으로 전환했어요'); }
        }
        if(trkGuess<0) trkGuess=Math.max(0,header.length-1);
        var sample=aoa[1]||[];
        var opts=function(sel){ return header.map(function(hl,i){ var s=String(sample[i]==null?'':sample[i]).trim(); return '<option value="'+i+'"'+(i===sel?' selected':'')+'>'+esc((hl||('열'+(i+1))))+(s?' (예: '+esc(s.slice(0,14))+')':'')+'</option>'; }).join(''); };
        var optsN=function(sel){ return '<option value="-1"'+(sel<0?' selected':'')+'>— 없음 —</option>'+opts(sel); };
        var _selS='width:100%;padding:7px;margin-top:3px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px';
        var ph='<div style="padding:10px;border:1px solid #99f6e4;border-radius:8px;background:#f0fdfa">';
        ph+='<div style="font-size:11px;color:#0f766e;font-weight:800;margin-bottom:7px">📋 어느 열을 쓸지 골라주세요 (총 '+aoa.length+'행)</div>';
        ph+='<div style="display:flex;gap:8px;flex-wrap:wrap">';
        if(basis==='auto'){
          // 자동 — 주문번호/연락처/이름 열을 각각 잡고, 있는 것부터 순서대로 시도 (없는 열은 '없음')
          var ordG=_guessId('id'), telG=_guessId('tel'), nameG=_guessId('rname');
          if(_prof){ var _pv; _pv=_pFind(_prof.ord); if(_pv>=0) ordG=_pv; _pv=_pFind(_prof.tel); if(_pv>=0) telG=_pv; _pv=_pFind(_prof.rname); if(_pv>=0) nameG=_pv; }
          ph+='<label style="font-size:11px;font-weight:700;flex:1;min-width:140px">주문번호 열<select id="_mtiOrdCol" onchange="_modTrackBuildPairs()" style="'+_selS+'">'+optsN(ordG)+'</select></label>';
          ph+='<label style="font-size:11px;font-weight:700;flex:1;min-width:140px">연락처 열<select id="_mtiTelCol" onchange="_modTrackBuildPairs()" style="'+_selS+'">'+optsN(telG)+'</select></label>';
          ph+='<label style="font-size:11px;font-weight:700;flex:1;min-width:140px">받는분 이름 열<select id="_mtiNameCol" onchange="_modTrackBuildPairs()" style="'+_selS+'">'+optsN(nameG)+'</select></label>';
        } else {
          if(idGuess<0) idGuess=(trkGuess===0?1:0);
          ph+='<label style="font-size:11px;font-weight:700;flex:1;min-width:150px">식별값 열 <span style="color:#94a3b8;font-weight:400">('+(basis==='tel'?'연락처':basis==='rname'?'받는분(수취인) 이름':basis==='name'?'주문자(구매자) 이름':'고유번호')+')</span><select id="_mtiIdCol" onchange="_modTrackBuildPairs()" style="'+_selS+'">'+opts(idGuess)+'</select></label>';
        }
        ph+='<label style="font-size:11px;font-weight:700;flex:1;min-width:150px">송장번호 열<select id="_mtiTrkCol" onchange="_modTrackBuildPairs()" style="'+_selS+'">'+opts(trkGuess)+'</select></label>';
        ph+='</div>';
        ph+='<label style="display:flex;align-items:center;gap:5px;font-size:11px;margin-top:7px;cursor:pointer"><input type="checkbox" id="_mtiHdr" checked onchange="_modTrackBuildPairs()"> 첫 행은 제목(건너뜀)</label>';
        ph+='<div id="_mtiInfo" style="font-size:11px;color:#0d9488;font-weight:800;margin-top:5px"></div>';
        ph+='</div>';
        var box=document.getElementById('_mtiColPick'); if(box) box.innerHTML=ph;
        _modTrackBuildPairs();
        toast('📤 파일 불러옴 — 식별/송장 열 확인 후 [등록]');
      }catch(e){ toast('파일 읽기 실패: '+(e.message||e),true); }
    };
    rd.readAsArrayBuffer(f);
  };
  inp.click();
}
// 선택된 열로 미리보기(식별값들[Tab]송장) 생성 → 텍스트영역에 채움
function _modTrackBuildPairs(){
  var aoa=window.__mtiAoa; if(!aoa) return;
  var trkSel=document.getElementById('_mtiTrkCol'); if(!trkSel) return;
  var trkCol=parseInt(trkSel.value,10);
  var hdr=document.getElementById('_mtiHdr'); var start=(hdr&&hdr.checked)?1:0;
  // 자동 모드: 주문번호/연락처/이름 열 중 선택된 것들 전부 식별값으로
  var ordSel=document.getElementById('_mtiOrdCol'), telSel=document.getElementById('_mtiTelCol'), nameSel=document.getElementById('_mtiNameCol');
  var idCols=[];
  if(ordSel||telSel||nameSel){
    [ordSel,telSel,nameSel].forEach(function(s){ if(s){ var v=parseInt(s.value,10); if(v>=0&&idCols.indexOf(v)<0) idCols.push(v); } });
  } else {
    var idSel=document.getElementById('_mtiIdCol'); if(!idSel) return;
    idCols=[parseInt(idSel.value,10)];
  }
  var lines=[];
  for(var r=start;r<aoa.length;r++){
    var ids=[];
    idCols.forEach(function(ci){ var v=String(aoa[r][ci]==null?'':aoa[r][ci]).trim(); if(v) ids.push(v); });
    var tk=String(aoa[r][trkCol]==null?'':aoa[r][trkCol]).trim();
    if(ids.length&&tk) lines.push(ids.join('\t')+'\t'+tk);
  }
  var ta=document.getElementById('_mtiText'); if(ta) ta.value=lines.join('\n');
  var info=document.getElementById('_mtiInfo'); if(info) info.textContent=(idCols.length?'✅ '+lines.length+'행 준비됨 — 아래 미리보기 확인 후 [등록]':'⚠ 식별값 열을 하나 이상 선택하세요');
}
function _modTrackImportRun(key){
  var def=_modDefs[key]; if(!def) return;
  var trk=_modTrackingCol(def); if(!trk) return toast('송장 컬럼이 없습니다',true);
  var basis=(document.getElementById('_mtiBasis')||{}).value||'auto';
  var raw=(document.getElementById('_mtiText')||{}).value||'';
  var pairs=[];
  raw.split(/\r?\n/).forEach(function(line){
    line=line.replace(/\s+$/,''); if(!line.trim()) return;
    var parts=line.split(/\t|,|\s{2,}/).map(function(s){return s.trim();}).filter(function(s){return s!=='';});
    if(parts.length<2) return;
    pairs.push({idv:parts[0], idvs:parts.slice(0,parts.length-1), track:parts[parts.length-1]});
  });
  if(!pairs.length) return toast('붙여넣은 데이터가 없습니다 (식별값[Tab]송장번호)',true);
  var data=(_modData[key]||[]).slice();
  var now=new Date().toISOString();
  var matched=0, misses=[], sendList=[], used={};
  pairs.forEach(function(p){
    var idx= basis==='auto' ? _modTrackMatchAuto(def,data,p.idvs,used,trk.key) : _modTrackMatch(def,data,p.idv,basis,used,trk.key);
    if(idx<0){ misses.push(p.idvs[p.idvs.length-1]||p.idv); return; }
    used[idx]=1;   // 같은 식별값 여러 박스 → 다음 줄은 다음 행에 매칭
    var old=String(data[idx][trk.key]||'').trim();
    var merged={}; for(var k in data[idx]) merged[k]=data[idx][k];
    merged[trk.key]=p.track; merged._updatedAt=now;
    data[idx]=merged; matched++;
    if(def.smsTracking && p.track && p.track!==old) sendList.push(merged);
  });
  if(!matched) return toast('매칭된 주문이 없습니다. 매칭 기준을 확인하세요',true);
  var conf='송장 일괄등록\n\n• 매칭: '+matched+'건\n• 미매칭: '+misses.length+'건'+(misses.length?'\n   ('+misses.slice(0,8).join(', ')+(misses.length>8?' 외 '+(misses.length-8)+'개':'')+')':'')+'\n'+(def.smsTracking?('• 문자발송 예정: '+sendList.length+'건 (건당 요금 발생)\n'):'• 문자발송: OFF\n')+'\n적용할까요?';
  if(!confirm(conf)) return;
  var path=_modFbPath(key); if(!path) return toast('행사를 선택하세요',true);
  showLoading('송장 등록 중...');
  fbDb.ref(path).set(data).then(function(){
    hideLoading(); closePopup(); toast('✅ 송장 '+matched+'건 등록'+(misses.length?' ('+misses.length+'건 미매칭)':''));
    if(sendList.length){
      var sent=0, chain=Promise.resolve();
      sendList.forEach(function(row){
        chain=chain.then(function(){
          var tels=_modTelsFor(def,row,def.smsTrackingTo||'both'); if(!tels.length) return;
          return _modSmsGlobal(tels,_modSmsFill(def.smsTrackingTpl||'상품이 발송되었습니다. 송장번호: {'+trk.label+'}',def,row)).then(function(r){ if(r&&r.ok) sent++; });
        });
      });
      chain.then(function(){ toast('📱 송장 문자 '+sent+'/'+sendList.length+'건 발송'); });
    }
  }).catch(function(e){ hideLoading(); toast('실패: '+(e.message||e),true); });
}

// ═══════════════════════════════════════════
// 모듈 관리 UI (시스템 설정에서 모듈 정의 CRUD)
// ═══════════════════════════════════════════

var MOD_COL_TYPES=[
  {v:"text",l:"텍스트"},{v:"number",l:"숫자/금액"},{v:"date",l:"날짜"},{v:"tel",l:"연락처(하이픈)"},
  {v:"select",l:"선택(드롭다운)"},{v:"textarea",l:"긴 텍스트"},{v:"badge",l:"상태배지"},
  {v:"file",l:"파일첨부"},{v:"consent",l:"개인정보 동의"},{v:"account",l:"계좌(복사버튼)"},{v:"address",l:"주소(검색)"}
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
      h+='<div style="display:flex;gap:6px;align-items:center">';
      h+='<button onclick="_modMoveOrder(\''+esc(d.key)+'\',-1)" title="위로" '+(di===0?'disabled ':'')+'style="font-size:14px;padding:4px 9px;border:none;border-radius:5px;background:#475569;color:#fff;font-weight:800;cursor:pointer'+(di===0?';opacity:.3':'')+'">▲</button>';
      h+='<button onclick="_modMoveOrder(\''+esc(d.key)+'\',1)" title="아래로" '+(di===defs.length-1?'disabled ':'')+'style="font-size:14px;padding:4px 9px;border:none;border-radius:5px;background:#475569;color:#fff;font-weight:800;cursor:pointer'+(di===defs.length-1?';opacity:.3':'')+'">▼</button>';
      h+='<button class="btn btn-s" onclick="popModDef(\''+esc(d.key)+'\')" style="font-size:11px">✏️ 수정</button>';
      h+='<button class="btn btn-s" onclick="cloneModDef(\''+esc(d.key)+'\')" style="font-size:11px;color:#2563eb">📋 복제</button>';
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
  window.__modFormImgData=def.formImage||''; // 폼 상단 이미지(base64) 편집 상태

  var h='<div class="pop-head"><h3>'+(isNew?'➕ 새 모듈 만들기':'✏️ 모듈 수정: '+esc(def.label))+'</h3></div>';
  h+='<div style="padding:14px;max-height:70vh;overflow-y:auto">';

  // ── 레이아웃 헬퍼 (섹션 제목 / 라벨 / 힌트 / 입력칸 스타일) ──
  var _secH=function(t){ return '<div style="font-size:13px;font-weight:800;color:#0f172a;margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid #e2e8f0">'+t+'</div>'; };
  var _lab=function(t){ return '<div style="font-size:12px;font-weight:700;color:#64748b;margin:10px 0 4px">'+t+'</div>'; };
  var _hint=function(t){ return '<div style="font-size:10px;color:#94a3b8;margin-top:3px">'+t+'</div>'; };
  var _fs='width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px';
  var _tog=function(id,on,inner){ return '<label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#334155;cursor:pointer;padding:7px 0"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+' style="margin-top:2px;flex-shrink:0;width:16px;height:16px"><span style="line-height:1.45">'+inner+'</span></label>'; };

  // ── 섹션: 기본 정보 ──
  h+='<div style="font-size:14px;font-weight:800;color:#0f172a;margin:0 0 6px">📋 기본 정보</div>';
  // 아이콘은 이모지 그리드가 커서 그리드 밖에 단독으로 (라벨 위)
  h+=_lab('아이콘')+'<div>'+_emojiSelect("mdf_icon",def.icon||"📦")+'</div>';
  h+='<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;margin-top:10px">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">이름 <span style="color:#ef4444">*</span></label>';
  h+='<input id="mdf_label" value="'+esc(def.label||"")+'" placeholder="예: 행사차량" style="'+_fs+'">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">카테고리</label>';
  h+='<input id="mdf_catLabel" value="'+esc(def.catLabel||"")+'" placeholder="비우면 기본 커스텀" style="'+_fs+'">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b">데이터 범위</label>';
  h+='<select id="mdf_global" style="'+_fs+'"><option value="false"'+(def.global?'':' selected')+'>행사별 (각 행사 데이터 분리)</option><option value="true"'+(def.global?' selected':'')+'>공통 (전체 행사 공유)</option></select>';
  h+='</div>';
  h+=_tog('mdf_adminTab',def.adminTab,'🔒 <b>관리자만 이 탭 보기</b> <span style="color:#94a3b8">(SUBADMIN 이상 / 체크 안 하면 모두에게 표시)</span>');

  // ── 섹션: 공개 신청폼 ──
  h+=_secH('📝 공개 신청폼');
  var afOn=def.features&&def.features.applyForm;
  var geOn=def.features&&def.features.googleEmail;
  h+='<div style="padding:4px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc">';
  h+=_tog('mdf_applyForm',afOn,'<b>공개 신청폼 켜기</b> — 신청폼 링크 생성, 외부 신청 → 선정/탈락 처리');
  h+=_tog('mdf_multiRecipient',def.multiRecipient,'👥 <b>여러 받는분 받기</b> — 한 주문자가 여러 명에게(➕추가 → 받는분 수만큼 행+같은 묶음번호). 컬럼에서 「👥받는분별」 표시 칸이 반복됩니다');
  h+=_tog('mdf_googleEmail',geOn,'📧 <b>구글 이메일 공유</b> — 구글 로그인으로 이메일 자동 입력 <span style="color:#94a3b8">(「이메일」 컬럼 필요)</span>');
  h+='</div>';
  h+=_lab('신청폼 제목')+'<input id="mdf_formTitle" value="'+esc(def.formTitle||"")+'" placeholder="비우면 「'+esc(def.label||"모듈명")+' 신청」" style="'+_fs+'">';
  h+=_lab('신청폼 안내문')+'<textarea id="mdf_formDesc" rows="4" placeholder="여러 줄 가능 — 안내 문구" style="'+_fs+';resize:vertical;line-height:1.5">'+esc(def.formDesc||"")+'</textarea>';
  h+=_lab('신청폼 하단 문의 (작게)')+'<input id="mdf_formFooter" value="'+esc(def.formFooter||"")+'" placeholder="예: 문의 정해원 010-0000-0000" style="'+_fs+'">'+_hint('맨 아래 회색 작은 글씨, 전화번호는 누르면 통화');
  h+=_lab('신청폼 상단 이미지 (선택)')+'<div><input type="file" id="mdf_formImgFile" accept="image/*" onchange="_modPickFormImg(this)" style="font-size:12px"><button type="button" onclick="_modClearFormImg()" style="margin-left:6px;padding:4px 10px;border:none;border-radius:5px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;cursor:pointer">제거</button><div id="mdf_formImgPrev" style="margin-top:8px">'+(def.formImage?'<img src="'+esc(def.formImage)+'" style="max-width:200px;max-height:140px;border-radius:8px;border:1px solid #e2e8f0">':'')+'</div></div>';
  h+=_lab('완료 후 다운로드 링크')+'<input id="mdf_downloadUrl" value="'+esc(def.downloadUrl||"")+'" placeholder="예: 플레이스토어 링크" style="'+_fs+';font-family:monospace;font-size:11px">'+_hint('완료 화면에 「앱 다운로드」 버튼 표시');

  // ── 섹션: 편의기능 · 연동 ──
  h+=_secH('🧰 편의기능 · 연동');
  h+=_lab('입금 계좌 (선택)')+'<input id="mdf_payInfo" value="'+esc(def.payInfo||"")+'" placeholder="예: 농협 352-1234-5678-90 (예금주)" style="'+_fs+'">'+_hint('신청폼+완료화면에 계좌+「복사」 버튼 표시');
  var _curDrive=def.driveUploadUrl||(typeof DRIVE_UPLOAD_URL!=='undefined'?DRIVE_UPLOAD_URL:'')||'';
  h+=_lab('파일 업로드 URL')+'<input id="mdf_driveUrl" value="'+esc(_curDrive)+'" placeholder="파일첨부 컬럼 쓸 때만 — Drive URL" style="'+_fs+';font-family:monospace;font-size:11px">'+_hint('신청폼에서 파일첨부 받으려면 필요');

  // ── 섹션: 문자 자동발송 ──
  h+=_secH('📱 문자 자동발송 (주문자·받는분 연락처)');
  h+='<div style="padding:10px;border:1px solid #e9d5ff;border-radius:8px;background:#faf5ff">';
  h+='<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600"><input type="checkbox" id="mdf_smsApply" '+(def.smsApply?'checked':'')+'> 신청 접수 시 문자 보내기</label>';
  h+='<input id="mdf_smsApplyTpl" value="'+esc(def.smsApplyTpl||'[가문굴비] 주문이 정상 접수되었습니다. 감사합니다.')+'" style="width:100%;box-sizing:border-box;font-size:12px;margin:4px 0;padding:8px;border:1px solid #cbd5e1;border-radius:6px">';
  h+=_modToSelHtml('mdf_smsApplyTo', def.smsApplyTo);
  h+='<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600"><input type="checkbox" id="mdf_smsTracking" '+(def.smsTracking?'checked':'')+'> 송장번호 입력 시 문자 보내기</label>';
  h+='<input id="mdf_smsTrackingTpl" value="'+esc(def.smsTrackingTpl||'[가문굴비] 상품이 발송되었습니다. 송장번호: {송장번호}')+'" style="width:100%;box-sizing:border-box;font-size:12px;margin:4px 0;padding:8px;border:1px solid #cbd5e1;border-radius:6px">';
  h+=_modToSelHtml('mdf_smsTrackingTo', def.smsTrackingTo);
  h+='<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600"><input type="checkbox" id="mdf_smsCancel" '+(def.smsCancel?'checked':'')+'> 삭제(취소) 시 문자 보내기</label>';
  h+='<input id="mdf_smsCancelTpl" value="'+esc(def.smsCancelTpl||'[가문굴비] 주문이 취소되었습니다. 문의: 매장으로 연락주세요.')+'" style="width:100%;box-sizing:border-box;font-size:12px;margin:4px 0;padding:8px;border:1px solid #cbd5e1;border-radius:6px">';
  h+=_modToSelHtml('mdf_smsCancelTo', def.smsCancelTo);
  h+='<div style="font-size:10px;color:#94a3b8;margin-top:2px">각 문자 아래 <b>보낼 대상</b>을 고르세요(주문자만/받는분만/둘다). 받는분이 주문자와 같으면 한 번만 발송돼요. 본문에 <b>{컬럼명}</b>을 쓰면 그 값이 들어갑니다 (예: {송장번호}). 송장 칸은 라벨에 \'송장\'이 들어간 칸을 자동 인식합니다. <b style="color:#dc2626">건당 문자요금이 나갑니다.</b></div>';
  h+='</div>';

  // ── 섹션: 컬럼 정의 ──
  h+='<div style="border-top:2px solid #e2e8f0;padding-top:14px;margin-top:20px;margin-bottom:8px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  h+='<span style="font-size:14px;font-weight:700">📋 컬럼 정의</span>';
  h+='<button class="btn btn-s" onclick="_modDefAddCol()" style="font-size:11px;color:#2563eb">➕ 컬럼 추가</button>';
  h+='</div>';
  h+='<div id="mdf_cols_area">';
  h+=_renderModDefCols();
  h+='</div></div></div>';

  // 하단 고정 저장 바 (스크롤 영역 밖 → 항상 보임)
  h+='<div style="position:sticky;bottom:0;text-align:right;background:#fff;border-top:1px solid #e5e7eb;padding:12px 14px;border-radius:0 0 12px 12px;box-shadow:0 -2px 8px rgba(0,0,0,.06);z-index:5">';
  h+='<button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" onclick="saveModDef('+(isNew?'-1':('\''+esc(def.key)+'\''))+')">💾 저장</button>';
  h+='</div>';
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
    if(['select','badge','text','tel','number','date','file','consent'].indexOf(c.type)>=0) h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px" title="체크하면 이 컬럼으로 거르는 필터 버튼이 생깁니다 (파일/동의는 첨부됨·미첨부)"><input type="checkbox"'+(c.filter?' checked':'')+' onchange="_modDefEditCols['+i+'].filter=this.checked">필터</label>';
    // 검색 (텍스트류만)
    if(['text','tel','textarea','number','select'].indexOf(c.type)>=0) h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px"><input type="checkbox"'+(c.search?' checked':'')+' onchange="_modDefEditCols['+i+'].search=this.checked">검색</label>';
    // 👥 중복 표시 (텍스트/연락처/선택) — 같은 값 여러 건이면 표에 "총 N건" 배지 (칼럼별 독립)
    if(['text','tel','select','number'].indexOf(c.type)>=0) h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px" title="이 칼럼 값이 같으면 「총 N건」 배지 (칼럼별 독립)"><input type="checkbox"'+(c.dupCheck?' checked':'')+' onchange="_modDefEditCols['+i+'].dupCheck=this.checked">👥중복</label>';
    // 🔗 묶음(조합) — 체크한 칼럼들이 모두 같아야 동일인. 예: 이름+연락처 둘 다 체크
    if(['text','tel','select','number'].indexOf(c.type)>=0) h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px;color:#1d4ed8" title="🔗묶음 켠 칼럼들이 모두 같을 때만 동일인으로 묶어 「👤 N건」 표시 (예: 이름+연락처 둘 다 켜기)"><input type="checkbox"'+(c.dupGroup?' checked':'')+' onchange="_modDefEditCols['+i+'].dupGroup=this.checked">🔗묶음</label>';
    // 🎁 조건 토글 (이 체크칸이 켜지면 '조건부' 칸들 표시) — consent 타입에 권장
    h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px;color:#b45309" title="신청폼에서 이 칸을 켜면 「🎁조건부」 표시한 칸들이 나타남 (예: 선물로 보내기)"><input type="checkbox"'+(c.condToggle?' checked':'')+' onchange="_modDefEditCols['+i+'].condToggle=this.checked">🎁토글</label>';
    h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px;color:#b45309" title="반대 방식: 체크 시 조건부 칸이 숨겨짐. 기본 체크됨 (예: 「받는분=주문자와 동일」 — 체크하면 받는분 칸 숨김)"><input type="checkbox"'+(c.condInvert?' checked':'')+' onchange="_modDefEditCols['+i+'].condInvert=this.checked">↔반대(동일)</label>';
    // 🎁 조건부 표시 (토글 켤 때만 신청폼에 나타남) — 받는사람 성함/주소/연락처 등
    h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px;color:#b45309" title="위 🎁토글이 켜졌을 때만 신청폼에 나타나는 칸 (예: 받는분 성함/주소/연락처)"><input type="checkbox"'+(c.condOnly?' checked':'')+' onchange="_modDefEditCols['+i+'].condOnly=this.checked;_modDefRefreshCols()">🎁조건부</label>';
    if(c.condOnly){
      var _ocs=_modDefEditCols.filter(function(cc){return cc.key&&cc.key!==c.key&&cc.label&&cc.type!=='badge'&&cc.type!=='consent';});
      h+='<select title="「반대(동일)」 토글 체크 시 이 칸에 자동 복사할 출처 (예: 받는분 성함 ← 주문자)" style="font-size:11px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:4px;color:#b45309" onchange="_modDefEditCols['+i+'].copyFrom=this.value"><option value="">동일 시 빈칸</option>'+_ocs.map(function(cc){return '<option value="'+cc.key+'"'+(c.copyFrom===cc.key?' selected':'')+'>동일시←'+esc(cc.label)+'</option>';}).join('')+'</select>';
    }
    if(c.type!=='badge' && c.key!=='status') h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px;color:#7c3aed" title="「여러 받는분 받기」 켰을 때, 이 칸을 받는분마다 반복 입력 (예: 받는분 성함/주소/연락처/품명). 체크 안 하면 주문 공통(주문자 등)"><input type="checkbox"'+(c.perRecipient?' checked':'')+' onchange="_modDefEditCols['+i+'].perRecipient=this.checked">👥받는분별</label>';
    // 관리자전용
    var _vis=c.sysOnly?'sys':c.adminOnly?'admin':c.qrPublic?'qrpub':c.qrAdmin?'qrAdmin':'';
    h+='<select style="font-size:11px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:4px" onchange="_modDefColVis('+i+',this.value)">'
      +'<option value=""'+(!_vis?' selected':'')+'>공개</option>'
      +'<option value="qrpub"'+(_vis==='qrpub'?' selected':'')+'>📱 QR만 공개(신청 숨김)</option>'
      +'<option value="qrAdmin"'+(_vis==='qrAdmin'?' selected':'')+'>🔑 QR관리자만</option>'
      +'<option value="admin"'+(_vis==='admin'?' selected':'')+'>관리자전용</option>'
      +'<option value="sys"'+(_vis==='sys'?' selected':'')+'>🖥 시스템전용</option>'
      +'</select>';
    // 순서 / 삭제
    if(i>0) h+='<button onclick="_modDefMoveCol('+i+',-1)" title="위로" style="border:none;border-radius:4px;background:#64748b;color:#fff;cursor:pointer;font-size:12px;padding:3px 7px;font-weight:800">▲</button>';
    if(i<_modDefEditCols.length-1) h+='<button onclick="_modDefMoveCol('+i+',1)" title="아래로" style="border:none;border-radius:4px;background:#64748b;color:#fff;cursor:pointer;font-size:12px;padding:3px 7px;font-weight:800">▼</button>';
    h+='<button onclick="_modDefRemoveCol('+i+')" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:14px">✕</button>';
    h+='</div>';
    // 타입별 추가 옵션
    if(c.type==='select'){
      var _optPh=c.stockOn?'선택 항목 — 한 줄에 하나씩 · &quot;옵션 = 수량&quot;도 가능&#10;예:&#10;블랙 90 = 95&#10;화이트 100 = 50':'선택 항목 — 한 줄에 하나씩 (문장 안에 쉼표 써도 안 잘림)&#10;예:&#10;올 한 해 건강하길&#10;소원 성취';
      h+='<div style="margin-top:6px"><textarea rows="4" placeholder="'+_optPh+'" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;line-height:1.5" onchange="_modDefSetOptions('+i+',this.value)">'+esc((c.options||[]).join('\n'))+'</textarea></div>';
      var _etcChk=(c.multiQty? !!c.allowEtc : (c.allowEtc!==false));
      h+='<label style="font-size:11px;display:flex;align-items:center;gap:5px;margin-top:5px;color:#475569;cursor:pointer"><input type="checkbox"'+(_etcChk?' checked':'')+' onchange="_modDefEditCols['+i+'].allowEtc=this.checked;_modDefRefreshCols()">✏️ <b>직접 입력 허용</b> <span style="color:#94a3b8">— 목록에 없는 항목을 직접 타이핑('+(c.multiQty?'품명+수량':'기타')+')</span></label>';
      if(_etcChk){
        h+='<div style="margin-top:4px;display:flex;align-items:center;gap:6px;font-size:11px;color:#475569"><span>직접입력 예시</span><input value="'+esc(c.etcPlaceholder||'')+'" placeholder="'+(c.multiQty?'예: 특수굴비30미 2개':'직접 입력')+'" style="flex:1;min-width:0;font-size:11px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px" onchange="_modDefEditCols['+i+'].etcPlaceholder=this.value"></div>';
      }
      // 📦 재고(수량) 관리 — 옵션별 수량, 신청 시 자동 차감(건수 기반)
      h+='<div style="margin-top:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:7px 9px">';
      h+='<label style="font-size:11px;display:flex;align-items:center;gap:5px;font-weight:700;color:#0f766e;cursor:pointer"><input type="checkbox"'+(c.stockOn?' checked':'')+' onchange="_modDefEditCols['+i+'].stockOn=this.checked;_modDefRefreshCols()">📦 재고(수량) 관리 — 신청 들어오면 자동 차감</label>';
      if(c.stockOn){
        h+='<div style="margin-top:6px;font-size:11px;color:#94a3b8">옵션별 총 수량 (비우면 무제한)</div>';
        h+='<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">';
        (c.options||[]).forEach(function(o){
          var q=(c.stock&&c.stock[o]!=null)?c.stock[o]:'';
          h+='<div style="display:flex;align-items:center;gap:6px"><span style="flex:1;font-size:12px;color:#334155;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(o)+'</span><input type="number" min="0" value="'+q+'" placeholder="무제한" style="width:80px;font-size:12px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px" onchange="_modDefSetStock('+i+',\''+esc(String(o)).replace(/'/g,"\\'")+'\',this.value)"><span style="font-size:11px;color:#94a3b8">개</span></div>';
        });
        if(!(c.options||[]).length) h+='<div style="font-size:11px;color:#cbd5e1">먼저 선택 항목을 입력하세요</div>';
        h+='</div>';
        // 탈락만 제외 (대기·선정은 차감)
        h+='<label style="font-size:11px;display:flex;align-items:center;gap:5px;margin-top:8px;color:#475569;cursor:pointer"><input type="checkbox"'+(c.stockExclRejected!==false?' checked':'')+' onchange="_modDefEditCols['+i+'].stockExclRejected=this.checked"><b>🚫 탈락은 재고에서 제외</b> <span style="color:#94a3b8">— 대기·선정은 차감, 탈락만 복구</span></label>';
        // 🛒 다중선택 + 수량 (여러 항목 각각 수량 → 재고도 각각 차감)
        h+='<label style="font-size:11px;display:flex;align-items:center;gap:5px;margin-top:6px;color:#475569;cursor:pointer"><input type="checkbox"'+(c.multiQty?' checked':'')+' onchange="_modDefEditCols['+i+'].multiQty=this.checked;_modDefRefreshCols()"><b>🛒 다중선택 + 수량</b> <span style="color:#94a3b8">— 여러 사이즈 각각 수량 입력 (예: 블랙2 화이트1)</span></label>';
        if(!c.multiQty){
          // 차감 수량 = 숫자칼럼 연동 (없으면 건당 1개)
          var _numCols=_modDefEditCols.filter(function(cc){return cc.type==='number'&&cc.key&&cc.key!==c.key;});
          h+='<div style="margin-top:6px;display:flex;align-items:center;gap:6px;font-size:11px;color:#475569"><span>차감 수량</span><select style="font-size:11px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px" onchange="_modDefEditCols['+i+'].stockQtyKey=this.value">';
          h+='<option value=""'+(!c.stockQtyKey?' selected':'')+'>건당 1개 (기본)</option>';
          _numCols.forEach(function(cc){ h+='<option value="'+cc.key+'"'+(c.stockQtyKey===cc.key?' selected':'')+'>'+esc(cc.label||'숫자칸')+' 값만큼</option>'; });
          h+='</select></div>';
          h+='<div style="font-size:10px;color:#94a3b8;margin-top:3px">※ 수량칸(숫자 타입)을 따로 만들어 연결하면 관리자가 그 값을 고쳐 차감량을 조정할 수 있어요</div>';
        } else {
          h+='<div style="margin-top:6px;display:flex;align-items:center;gap:6px;font-size:11px;color:#475569"><span>1인당 총 최대</span><input type="number" min="0" value="'+(c.maxPer||'')+'" placeholder="제한없음" style="width:70px;font-size:11px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px" onchange="_modDefEditCols['+i+'].maxPer=this.value?parseInt(this.value,10):0"><span>개</span></div>';
          h+='<div style="font-size:10px;color:#0f766e;margin-top:3px">※ 다중선택 모드: 항목마다 수량칸. 1인당 총 최대를 정하면 모든 품목 <b>합계</b>가 그 수량을 넘을 수 없습니다 (예: 총 2개면 블랙1+화이트1 까지)</div>';
          h+='<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:#475569"><span>품명 합치기 구분자</span><input value="'+esc(c.multiSep==null?', ':c.multiSep)+'" placeholder=", " style="width:70px;font-size:11px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;text-align:center" onchange="_modDefEditCols['+i+'].multiSep=this.value"></div>';
          h+='<div style="margin-top:6px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11px;color:#475569"><label style="display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox"'+(c.multiNoQty?' checked':'')+' onchange="_modDefEditCols['+i+'].multiNoQty=this.checked;_modDefRefreshCols()"> 수량 빼고 품명만</label><label style="display:flex;align-items:center;gap:3px;cursor:pointer'+(c.multiNoQty?';opacity:.4':'')+'"><input type="checkbox"'+(c.multiQtyKae?' checked':'')+(c.multiNoQty?' disabled':'')+' onchange="_modDefEditCols['+i+'].multiQtyKae=this.checked"> 수량을 「N개」로 표기</label></div>';
          h+='<div style="font-size:10px;color:#94a3b8;margin-top:3px">합치기 구분자: 롯데 일괄등록은 「<b>_</b>」(밑줄). 「N개」 체크 시 <b>보리굴비10미 1개_참굴비20미 1개</b>, 해제 시 <b>보리굴비10미×1_…</b></div>';
        }
      }
      h+='</div>';
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
    // 날짜 컬럼: QR 조회 기간 판정 역할 지정
    if(c.type==='date'){
      var _pr=c.periodRole||'';
      h+='<div style="margin-top:6px;display:flex;gap:6px;align-items:center"><span style="font-size:11px;color:#94a3b8">📅 QR 기간판정</span>';
      h+='<select style="font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px" onchange="_modDefEditCols['+i+'].periodRole=this.value"><option value=""'+(_pr===''?' selected':'')+'>사용 안 함</option><option value="start"'+(_pr==='start'?' selected':'')+'>사용 시작일</option><option value="end"'+(_pr==='end'?' selected':'')+'>사용 종료일</option></select>';
      h+='<span style="font-size:10px;color:#94a3b8">(시작·종료 지정 시 QR에 정상/만료 표시)</span></div>';
    }
    // 예시 문구(placeholder) — 텍스트 입력류만
    if(['text','tel','number','textarea'].indexOf(c.type)>=0){
      h+='<div style="margin-top:6px"><input placeholder="입력칸 예시 문구 (회색 글씨, 예: 12가 3456)" value="'+esc(c.placeholder||'')+'" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;color:#64748b" onchange="_modDefEditCols['+i+'].placeholder=this.value"></div>';
    }
    // 기본값 / 고정값 — file·consent 제외
    if(['text','tel','number','textarea','select','badge','date'].indexOf(c.type)>=0){
      var _dvSt='flex:1;min-width:150px;font-size:12px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px';
      var defInput;
      if(c.type==='date'){
        defInput='<input type="date" value="'+esc(c.defVal||'')+'" style="'+_dvSt+'" onchange="_modDefEditCols['+i+'].defVal=this.value">';
      } else if(c.type==='select'){
        defInput='<select style="'+_dvSt+'" onchange="_modDefEditCols['+i+'].defVal=this.value"><option value="">기본값 없음</option>'+(c.options||[]).map(function(o){var ov=typeof o==='object'?o.value:o,ol=typeof o==='object'?o.label:o;return '<option value="'+esc(ov)+'"'+(String(c.defVal)===String(ov)?' selected':'')+'>'+esc(ol)+'</option>';}).join('')+'</select>';
      } else if(c.type==='badge'){
        defInput='<select style="'+_dvSt+'" onchange="_modDefEditCols['+i+'].defVal=this.value"><option value="">기본값 없음</option>'+Object.keys(c.badgeMap||{}).map(function(k){return '<option value="'+esc(k)+'"'+(String(c.defVal)===String(k)?' selected':'')+'>'+esc(c.badgeMap[k].label||k)+'</option>';}).join('')+'</select>';
      } else {
        defInput='<input placeholder="기본값 (미입력 시 자동 채움, 예: 2026 단오제)" value="'+esc(c.defVal||'')+'" style="'+_dvSt+'" onchange="_modDefEditCols['+i+'].defVal=this.value">';
      }
      h+='<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="font-size:11px;color:#94a3b8">기본값</span>';
      h+=defInput;
      h+='<label style="font-size:11px;display:flex;align-items:center;gap:3px;background:#eef2ff;padding:4px 7px;border-radius:5px;white-space:nowrap" title="체크 시 기본값으로 고정되고 입력칸에서 수정할 수 없습니다"><input type="checkbox"'+(c.fixed?' checked':'')+' onchange="_modDefEditCols['+i+'].fixed=this.checked"><b style="color:#4338ca">🔒 고정</b></label>';
      h+='</div>';
    }
    // 글자수 제한 — 텍스트류 + select(직접 입력 칸에 적용)
    if(['text','tel','textarea','select'].indexOf(c.type)>=0){
      var _llHint=(c.type==='select')?'(↑ 직접 입력 칸에 적용)':'(예: 차량번호 최소 7)';
      h+='<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="font-size:11px;color:#94a3b8">글자수'+(c.type==='select'?'<span style="color:#cbd5e1"> ·직접입력</span>':'')+'</span>';
      h+='<label style="font-size:11px;color:#475569">최소<input type="number" min="0" value="'+(c.minLen||'')+'" placeholder="0" style="width:58px;font-size:12px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;margin-left:3px" onchange="_modDefEditCols['+i+'].minLen=this.value?parseInt(this.value,10):0"></label>';
      h+='<label style="font-size:11px;color:#475569">최대<input type="number" min="0" value="'+(c.maxLen||'')+'" placeholder="제한없음" style="width:70px;font-size:12px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;margin-left:3px" onchange="_modDefEditCols['+i+'].maxLen=this.value?parseInt(this.value,10):0"></label>';
      h+='<span style="font-size:10px;color:#94a3b8">'+_llHint+'</span>';
      h+='</div>';
    }
    // 숫자 값 범위 (number)
    if(c.type==='number'){
      h+='<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="font-size:11px;color:#94a3b8">값 범위</span>';
      h+='<label style="font-size:11px;color:#475569">최소<input type="number" value="'+(c.minVal!=null&&c.minVal!==''?c.minVal:'')+'" placeholder="없음" style="width:70px;font-size:12px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;margin-left:3px" onchange="_modDefEditCols['+i+'].minVal=this.value!==\'\'?parseFloat(this.value):\'\'"></label>';
      h+='<label style="font-size:11px;color:#475569">최대<input type="number" value="'+(c.maxVal!=null&&c.maxVal!==''?c.maxVal:'')+'" placeholder="없음" style="width:70px;font-size:12px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;margin-left:3px" onchange="_modDefEditCols['+i+'].maxVal=this.value!==\'\'?parseFloat(this.value):\'\'"></label>';
      h+='</div>';
    }
    // 형식 검사 (text/tel)
    if(['text','tel'].indexOf(c.type)>=0){
      var _fmt=c.format||'';
      var fo=function(v,l){return '<option value="'+v+'"'+(_fmt===v?' selected':'')+'>'+l+'</option>';};
      h+='<div style="margin-top:6px;display:flex;gap:6px;align-items:center"><span style="font-size:11px;color:#94a3b8">형식 검사</span>';
      h+='<select style="font-size:12px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px" onchange="_modDefEditCols['+i+'].format=this.value">'+fo('','자유 입력')+fo('email','이메일')+fo('num','숫자만')+fo('alnum','영문+숫자')+'</select>';
      h+='</div>';
    }
    h+='</div>';
  });
  return h;
}
// 컬럼 값 검증 — 통과 시 null, 실패 시 에러 메시지
function _modValidateField(c, v){
  var s=String(v==null?'':v);
  if(s==='') return null; // 빈 값은 required에서 별도 처리
  if(c.type==='number'){
    var n=Number(String(s).replace(/,/g,''));
    if(!isNaN(n)){
      if(c.minVal!=null&&c.minVal!==''&&n<c.minVal) return c.label+'은(는) '+c.minVal+' 이상이어야 합니다';
      if(c.maxVal!=null&&c.maxVal!==''&&n>c.maxVal) return c.label+'은(는) '+c.maxVal+' 이하여야 합니다';
    }
  } else {
    // select에서 목록 옵션을 고른 경우엔 글자수 제한 미적용 (제한은 "직접 입력"에만)
    var _isSelOpt=(c.type==='select' && (c.options||[]).some(function(o){var ov=typeof o==='object'?o.value:o; return String(ov)===s;}));
    if(!_isSelOpt){
      if(c.minLen&&s.length<c.minLen) return c.label+'은(는) 최소 '+c.minLen+'자 이상 입력하세요 (현재 '+s.length+'자)';
      if(c.maxLen&&s.length>c.maxLen) return c.label+'은(는) 최대 '+c.maxLen+'자까지 가능합니다';
    }
    if(c.format==='email'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return c.label+' 이메일 형식이 아닙니다';
    if(c.format==='num'&&!/^[0-9]+$/.test(s)) return c.label+'은(는) 숫자만 입력하세요';
    if(c.format==='alnum'&&!/^[A-Za-z0-9]+$/.test(s)) return c.label+'은(는) 영문/숫자만 입력하세요';
  }
  return null;
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
  var c=_modDefEditCols[i];
  var name=c?c.label||'이 컬럼':'이 컬럼';
  if(!confirm('⚠ "'+name+'" 컬럼을 삭제하시겠습니까?\n\n삭제하면 이 컬럼의 기존 데이터도 더 이상 표시되지 않습니다.')) return;
  _modDefEditCols.splice(i,1);
  _modDefRefreshCols();
}
function _modDefColVis(i,v){
  var c=_modDefEditCols[i]; c.adminOnly=false; c.qrAdmin=false; c.sysOnly=false; c.qrPublic=false;
  if(v==='admin') c.adminOnly=true;
  else if(v==='qrAdmin') c.qrAdmin=true;
  else if(v==='qrpub') c.qrPublic=true;
  else if(v==='sys') c.sysOnly=true;
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
// 신청폼 상단 이미지: 파일 → 캔버스 리사이즈(최대 900px) → JPEG base64
function _modPickFormImg(inp){
  var f=inp&&inp.files&&inp.files[0]; if(!f) return;
  if(!/^image\//.test(f.type)){ toast('이미지 파일만 가능합니다',true); return; }
  var rd=new FileReader();
  rd.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var MAX=900, w=img.width, h=img.height;
      if(w>MAX){ h=Math.round(h*MAX/w); w=MAX; }
      var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      var data=cv.toDataURL('image/jpeg',0.78);
      window.__modFormImgData=data;
      var pv=document.getElementById('mdf_formImgPrev');
      if(pv) pv.innerHTML='<img src="'+data+'" style="max-width:200px;max-height:140px;border-radius:8px;border:1px solid #e2e8f0"><div style="font-size:10px;color:#16a34a;margin-top:3px">✅ 이미지 준비됨 ('+Math.round(data.length/1024)+'KB) — 저장을 눌러야 반영</div>';
    };
    img.src=e.target.result;
  };
  rd.readAsDataURL(f);
}
function _modClearFormImg(){
  window.__modFormImgData='';
  var pv=document.getElementById('mdf_formImgPrev'); if(pv) pv.innerHTML='<div style="font-size:11px;color:#94a3b8">이미지 없음</div>';
  var fi=document.getElementById('mdf_formImgFile'); if(fi) fi.value='';
}
// 선택 옵션 입력 — 재고 켜진 경우 "옵션 = 수량" 자동 분리
function _modDefSetOptions(i,val){
  var c=_modDefEditCols[i]; if(!c) return;
  var lines=String(val||'').split(String.fromCharCode(10)).map(function(s){return s.trim();}).filter(Boolean);
  var opts=[];
  if(c.stockOn && !c.stock) c.stock={};
  lines.forEach(function(ln){
    var m=c.stockOn?ln.match(/^(.*\S)\s*=\s*(\d+)\s*$/):null;
    if(m){ var name=m[1].trim(); opts.push(name); c.stock[name]=parseInt(m[2],10); }
    else opts.push(ln);
  });
  c.options=opts;
  // 옵션에서 없어진 재고 키 정리
  if(c.stockOn && c.stock){ Object.keys(c.stock).forEach(function(k){ if(opts.indexOf(k)<0) delete c.stock[k]; }); }
  if(c.stockOn) _modDefRefreshCols();
}
// 옵션별 재고 수량 설정 (비우면 해당 옵션 무제한)
function _modDefSetStock(i,opt,val){
  var c=_modDefEditCols[i]; if(!c) return;
  if(!c.stock) c.stock={};
  if(val===''||val==null) delete c.stock[opt];
  else c.stock[opt]=Math.max(0,parseInt(val,10)||0);
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
  var multiRecipient=((document.getElementById('mdf_multiRecipient')||{}).checked)||false;
  var googleEmail=((document.getElementById('mdf_googleEmail')||{}).checked)||false;
  var adminTab=((document.getElementById('mdf_adminTab')||{}).checked)||false;
  var formTitle=((document.getElementById('mdf_formTitle')||{}).value||'').trim();
  var formDesc=((document.getElementById('mdf_formDesc')||{}).value||'').trim();
  var formFooter=((document.getElementById('mdf_formFooter')||{}).value||'').trim();
  var downloadUrl=((document.getElementById('mdf_downloadUrl')||{}).value||'').trim();
  var payInfo=((document.getElementById('mdf_payInfo')||{}).value||'').trim();
  var smsApply=((document.getElementById('mdf_smsApply')||{}).checked)||false;
  var smsApplyTpl=((document.getElementById('mdf_smsApplyTpl')||{}).value||'').trim();
  var smsTracking=((document.getElementById('mdf_smsTracking')||{}).checked)||false;
  var smsTrackingTpl=((document.getElementById('mdf_smsTrackingTpl')||{}).value||'').trim();
  var smsCancel=((document.getElementById('mdf_smsCancel')||{}).checked)||false;
  var smsCancelTpl=((document.getElementById('mdf_smsCancelTpl')||{}).value||'').trim();
  var smsApplyTo=((document.getElementById('mdf_smsApplyTo')||{}).value)||'both';
  var smsTrackingTo=((document.getElementById('mdf_smsTrackingTo')||{}).value)||'both';
  var smsCancelTo=((document.getElementById('mdf_smsCancelTo')||{}).value)||'both';
  var formImage=window.__modFormImgData||'';

  // 구글 이메일 켜면 "이메일" 컬럼이 없을 때 자동 추가 (맨 앞)
  if(googleEmail && !cols.some(function(c){return /이메일|메일|e-?mail|gmail|지메일/i.test(String(c.label));})){
    cols.unshift({key:_modColKey(),label:'이메일',type:'text'});
    toast('이메일 컬럼 자동 추가됨',false);
  }
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
    formTitle:formTitle, formDesc:formDesc, formFooter:formFooter, downloadUrl:downloadUrl, payInfo:payInfo, formImage:formImage,
    smsApply:smsApply, smsApplyTpl:smsApplyTpl, smsTracking:smsTracking, smsTrackingTpl:smsTrackingTpl, smsCancel:smsCancel, smsCancelTpl:smsCancelTpl, smsApplyTo:smsApplyTo, smsTrackingTo:smsTrackingTo, smsCancelTo:smsCancelTo, multiRecipient:multiRecipient,
    driveUploadUrl:driveUrl,
    features:{search:true,excel:true,applyForm:applyForm,googleEmail:googleEmail}
  };
  // 기존 모듈 수정 시 라벨 프리셋 등 부가 데이터 보존 (덮어쓰기 방지)
  if(!isNew && _modDefs[key] && _modDefs[key].labelPresets) def.labelPresets=_modDefs[key].labelPresets;

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

// 모듈 순서 변경 (위/아래) — _modDefs 키 순서 재배열 후 저장
function _modMoveOrder(key, dir){
  var keys=Object.keys(_modDefs);
  var i=keys.indexOf(key); if(i<0) return;
  var j=i+dir; if(j<0||j>=keys.length) return;
  var t=keys[i]; keys[i]=keys[j]; keys[j]=t;
  // 같은 객체 유지하며 키 순서만 재배열
  var saved={}; keys.forEach(function(k){ saved[k]=_modDefs[k]; });
  Object.keys(_modDefs).forEach(function(k){ delete _modDefs[k]; });
  keys.forEach(function(k){ _modDefs[k]=saved[k]; });
  _saveModDefs().then(function(){
    toast('순서 변경됨');
    if(typeof mkTabs==='function') mkTabs();
    if(typeof draw==='function') draw();
  }).catch(function(e){ toast('저장 실패: '+(e.message||e),true); });
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

// 모듈 복제 — 정의(컬럼·신청폼·문자설정 전부)를 그대로 복사, 이름만 새로 입력. 데이터는 복사 안 함
function cloneModDef(key){
  var src=_modDefs[key]; if(!src) return;
  var name=prompt('새 모듈 이름을 입력하세요\n(구조·설정이 그대로 복사되고, 입력된 데이터는 복사되지 않습니다)', src.label+'2');
  if(name===null) return;
  name=name.trim();
  if(!name) return toast('이름을 입력하세요',true);
  var dup=Object.keys(_modDefs).some(function(k){ return _modDefs[k].label===name; });
  if(dup && !confirm('이미 "'+name+'" 이름의 모듈이 있습니다. 그래도 만들까요?')) return;
  var newKey='m'+Date.now().toString(36);
  var def=JSON.parse(JSON.stringify(src));
  def.key=newKey;
  def.label=name;
  def.fbPath='Mod_'+newKey;   // 데이터 저장 경로 분리 (원본 데이터와 안 섞임)
  // 신청폼 제목이 원본 이름 그대로면 새 이름 기준 기본값을 쓰도록 비움
  if(def.formTitle===src.label+' 신청') def.formTitle='';
  showLoading('복제 중...');
  defMod(def);
  _saveModDefs().then(function(){
    hideLoading(); toast('✅ "'+src.label+'" → "'+name+'" 복제됨');
    mkTabs(); draw();
    modLoadData(newKey);
  }).catch(function(e){
    delete _modDefs[newKey]; delete _modData[newKey];
    hideLoading(); toast('실패: '+(e.message||e),true);
  });
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
  fbDb.ref(path).set(data).then(function(){ hideLoading(); toast('✅ "'+lbl+'" 처리됨'+(actor?' · '+actor:'')); _modLogAdd(key,lbl,id,_modRowDesc(def,data[idx]),'상태변경'); })
    .catch(function(e){ hideLoading(); toast('실패: '+e.message,true); });
}

// ===== 행 색칠 + 메모 마킹 =====
var _MOD_MARK_COLORS=[
  {k:'',     bg:'',        dot:'#e2e8f0', name:'없음'},
  {k:'#fee2e2', bg:'#fee2e2', dot:'#ef4444', name:'빨강'},
  {k:'#ffedd5', bg:'#ffedd5', dot:'#f97316', name:'주황'},
  {k:'#fef9c3', bg:'#fef9c3', dot:'#eab308', name:'노랑'},
  {k:'#dcfce7', bg:'#dcfce7', dot:'#22c55e', name:'초록'},
  {k:'#cffafe', bg:'#cffafe', dot:'#06b6d4', name:'청록'},
  {k:'#dbeafe', bg:'#dbeafe', dot:'#3b82f6', name:'파랑'},
  {k:'#ede9fe', bg:'#ede9fe', dot:'#8b5cf6', name:'보라'},
  {k:'#fce7f3', bg:'#fce7f3', dot:'#ec4899', name:'분홍'},
  {k:'#e2e8f0', bg:'#e2e8f0', dot:'#64748b', name:'회색'}
];
function _modMarkDot(hex){ var c=_MOD_MARK_COLORS.find(function(x){return x.k===hex;}); return c?c.dot:hex; }
function popModMark(key,id){
  var def=_modDefs[key]; if(!def) return;
  var row=(_modData[key]||[]).find(function(r){return r._id===id;}); if(!row) return;
  var cur=row._mark||'', memo=row._markMemo||'';
  var nm=_modRowTitle(def,row)||'';
  var h='<div class="pop-head"><h3>🎨 색칠 · 메모'+(nm?' <span style="font-size:12px;color:#94a3b8;font-weight:400">'+esc(nm)+'</span>':'')+'</h3></div>';
  h+='<div style="padding:16px">';
  h+='<div style="font-size:12px;color:#475569;font-weight:600;margin-bottom:8px">색상</div>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">';
  _MOD_MARK_COLORS.forEach(function(c){
    var on=(cur===c.k);
    var inner = c.k==='' ? '<span style="font-size:16px;color:#94a3b8">✕</span>' : '';
    h+='<button onclick="_modSetMark(\''+key+'\',\''+esc(id)+'\',\''+c.k+'\')" title="'+c.name+'" style="width:40px;height:40px;border-radius:10px;cursor:pointer;background:'+(c.bg||'#fff')+';border:'+(on?'3px solid #2563eb':'2px solid #e2e8f0')+';display:flex;align-items:center;justify-content:center;position:relative;box-shadow:'+(on?'0 0 0 2px #bfdbfe':'none')+'">'+inner+(on&&c.k!==''?'<span style="position:absolute;color:#1e3a8a;font-weight:900;font-size:15px">✓</span>':'')+'</button>';
  });
  h+='</div>';
  h+='<div style="font-size:12px;color:#475569;font-weight:600;margin-bottom:8px">메모 <span style="font-size:10px;color:#94a3b8;font-weight:400">(예: 미납, VIP, 확인필요)</span></div>';
  h+='<input id="_modMarkMemo" value="'+esc(memo)+'" placeholder="짧은 메모" maxlength="20" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box" onkeydown="if(event.key===\'Enter\')_modSaveMarkMemo(\''+key+'\',\''+esc(id)+'\')">';
  h+='<div style="display:flex;gap:8px;margin-top:16px">';
  h+='<button class="btn" style="flex:0 0 auto;background:#475569;color:#fff" onclick="closePopup()">닫기</button>';
  h+='<button class="btn btn-b" style="flex:1;background:#2563eb;color:#fff;font-weight:700" onclick="_modSaveMarkMemo(\''+key+'\',\''+esc(id)+'\')">💾 메모 저장</button>';
  h+='</div></div>';
  openPopup(h,420);
}
function _modSetMark(key,id,color){
  var path=_modFbPath(key); if(!path) return;
  var data=(_modData[key]||[]).slice();
  var idx=-1; for(var i=0;i<data.length;i++){if(data[i]._id===id){idx=i;break}}
  if(idx<0) return;
  var merged={}; for(var k in data[idx])merged[k]=data[idx][k];
  merged._mark=color; merged._updatedAt=new Date().toISOString();
  data[idx]=merged;
  fbDb.ref(path).set(data).then(function(){ var c=_MOD_MARK_COLORS.find(function(x){return x.k===color;}); toast(color?('🎨 '+(c?c.name:'')+' 표시'):'색 지움'); })
    .catch(function(e){ toast('실패: '+(e.message||e),true); });
}
function _modSaveMarkMemo(key,id){
  var path=_modFbPath(key); if(!path) return;
  var el=document.getElementById('_modMarkMemo'); var memo=el?el.value.trim():'';
  var data=(_modData[key]||[]).slice();
  var idx=-1; for(var i=0;i<data.length;i++){if(data[i]._id===id){idx=i;break}}
  if(idx<0) return;
  var merged={}; for(var k in data[idx])merged[k]=data[idx][k];
  merged._markMemo=memo; merged._updatedAt=new Date().toISOString();
  data[idx]=merged;
  fbDb.ref(path).set(data).then(function(){ toast(memo?('📝 메모: '+memo):'메모 지움'); closePopup(); })
    .catch(function(e){ toast('실패: '+(e.message||e),true); });
}
// 모듈 바로가기 링크 복사 (담당자용 — 로그인하면 이 모듈 화면)
function _modCopyShortcut(key){
  var def=_modDefs[key]; if(!def) return;
  var base=location.href.split(/[?#]/)[0];
  var evtId=def.global?'':((CUR_EVT&&CUR_EVT.evtId)||'');
  var url=base+'?modlist='+encodeURIComponent(key)+(evtId?'&evtId='+encodeURIComponent(evtId):'');
  var done=function(){ toast('🔗 바로가기 링크 복사됨 — 담당자에게 공유하세요'); };
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(function(){ _modCopyFallback(url,done); }); }
  else { _modCopyFallback(url,done); }
}
function _modCopyFallback(text,cb){
  try{ var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); cb&&cb(); }
  catch(e){ prompt('아래 링크를 복사하세요:', text); }
}
// 신청폼 링크 팝업
function popModFormLink(key){
  var def=_modDefs[key]; if(!def) return;
  var base=location.href.split(/[?#]/)[0];
  var dir=base.replace(/\/[^\/]*$/,'/'); // 디렉토리(끝 /)
  var evtId=def.global?'':((CUR_EVT&&CUR_EVT.evtId)||'');
  // ?modform= 직접 사용 — 공통/행사별 모두 정적파일 없이 작동(404 방지)
  var url=base+'?modform='+encodeURIComponent(key)+(evtId?'&evtId='+encodeURIComponent(evtId):'');
  window.__modFormUrl=url; window.__modFormName=def.label||'신청폼';
  var qrPrev='https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data='+encodeURIComponent(url);
  var h='<div class="pop-head"><h3>🔗 '+esc(def.label)+' 신청폼 공유</h3></div>';
  h+='<div style="padding:14px">';
  h+='<p style="color:#64748b;font-size:13px;margin-bottom:14px;line-height:1.6">아래 링크를 카톡·문자로 공유하면 누구나 신청할 수 있습니다.<br>신청 내용은 이 목록에 쌓이고, <b>✓ 선정</b> / <b>✕ 탈락</b> 버튼으로 처리할 수 있습니다.</p>';
  h+='<div style="display:flex;gap:6px"><input id="modFormLinkInput" type="text" readonly value="'+esc(url)+'" onclick="this.select()" style="flex:1;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-family:monospace">';
  h+='<button class="btn btn-b" onclick="_copyModFormLink()" style="white-space:nowrap">📋 복사</button></div>';
  // QR 미리보기 + JPG 저장
  h+='<div style="text-align:center;margin-top:16px;padding-top:14px;border-top:1px dashed #e2e8f0">';
  h+='<img src="'+qrPrev+'" style="width:160px;height:160px;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:11px;color:#94a3b8;margin-top:4px">스캔하면 신청폼으로 연결</div>';
  h+='<div style="margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap"><button class="btn btn-b" style="background:#16a34a;color:#fff" onclick="_saveQrJpg(window.__modFormUrl, window.__modFormName+\'_신청폼QR\')">🖼 QR 이미지 저장 (JPG)</button>';
  h+='<button class="btn btn-b" style="background:#2563eb;color:#fff" onclick="_modFormPoster(\''+key+'\')">🖨 A4 신청 안내문 출력</button>';
  h+='<button class="btn btn-b" style="background:#475569;color:#fff" onclick="_modFormReceipt(\''+key+'\')">🧾 영수증 QR 인쇄</button></div>';
  h+='</div>';
  h+='<div style="margin-top:14px;text-align:right"><button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">닫기</button></div>';
  h+='</div>';
  openPopup(h,520);
}
// 🧾 영수증(소형 프린터 80mm)용 신청폼 QR 인쇄
function _modFormReceipt(key){
  var def=_modDefs[key]; if(!def) return;
  var url=window.__modFormUrl||''; if(!url) return toast('신청폼 링크를 먼저 여세요',true);
  var qr='https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=8&data='+encodeURIComponent(url);
  var win=window.open('','_modrcpt','width=380,height=640');
  if(!win){ toast('팝업 차단을 해제해 주세요',true); return; }
  var e2=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var org=(typeof SYS_NAME!=='undefined'?SYS_NAME:'');
  var css='@page{size:80mm auto;margin:0}html,body{margin:0;padding:0;font-family:"Malgun Gothic","맑은 고딕",sans-serif;background:#e5e7eb;color:#000}'
    +'.bar{padding:12px;text-align:center;background:#1e40af;position:sticky;top:0}.bar button{padding:9px 18px;font-weight:700;border:none;border-radius:6px;cursor:pointer;margin:0 4px;font-size:13px}'
    +'.r{width:80mm;box-sizing:border-box;padding:7mm 4mm;text-align:center;background:#fff;margin:10px auto;color:#000}'
    +'.r h2{font-size:16pt;margin:0 0 2mm;font-weight:900;color:#000}.r .sub{font-size:11pt;color:#000;font-weight:700;margin-bottom:4mm;line-height:1.5}'
    +'.r img{width:58mm;height:58mm;display:block;margin:0 auto;image-rendering:pixelated}.r .u{font-size:8pt;color:#000;font-weight:700;word-break:break-all;margin-top:3mm}'
    +'@media print{.bar{display:none}.r{margin:0}body{background:#fff} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  var body='<div class="bar"><button onclick="window.print()" style="background:#10b981;color:#fff">🖨 인쇄</button><button onclick="window.close()" style="background:#fff">닫기</button></div>'
    +'<div class="r"><h2>'+e2(def.label)+'</h2><div class="sub">'+e2(org)+'<br>📱 휴대폰으로 아래 QR을 스캔하면<br><b>신청/주문 페이지</b>로 연결됩니다</div>'
    +'<img src="'+qr+'"><div class="u">'+e2(url)+'</div></div>';
  win.document.open();
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+e2(def.label)+' QR</title><style>'+css+'</style></head><body>'+body+'</body></html>');
  win.document.close();
}
// QR 코드를 JPG 파일로 저장 (URL → QR 이미지 → canvas → jpeg 다운로드)
function _saveQrJpg(url, filename){
  if(!url) return toast('링크가 없습니다',true);
  var qurl='https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data='+encodeURIComponent(url);
  var img=new Image(); img.crossOrigin='anonymous';
  img.onload=function(){
    try{
      var c=document.createElement('canvas'); c.width=img.width||600; c.height=img.height||600;
      var ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(img,0,0);
      c.toBlob(function(blob){
        if(!blob){ toast('QR 변환 실패',true); return; }
        var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(filename||'QR').replace(/[\\/:*?"<>|]/g,'_')+'.jpg'; a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); },1500);
        toast('📥 QR 이미지 저장됨');
      },'image/jpeg',0.92);
    }catch(e){ toast('QR 저장 실패: '+(e.message||e),true); }
  };
  img.onerror=function(){ toast('QR 이미지 로드 실패 — 네트워크 확인',true); };
  img.src=qurl;
}
// 신청 QR을 A4 안내문(포스터)으로 — 제목/안내/메모 편집 후 인쇄
function _modFormPoster(key){
  var def=_modDefs[key]; if(!def) return;
  var url=window.__modFormUrl; if(!url) return toast('신청폼 링크를 먼저 여세요',true);
  window.__mfpUrl=url;
  var dt=esc(def.label||'행사');
  var h='<div class="pop-head"><h3>🖨 신청 안내문 (A4) 만들기</h3></div>';
  h+='<div style="padding:14px">';
  h+='<label style="font-size:12px;color:#475569;display:block;margin-bottom:8px">큰 제목<input id="mfp_title" value="'+dt+' 신청" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;font-weight:700"></label>';
  h+='<label style="font-size:12px;color:#475569;display:block;margin-bottom:8px">안내 문구<textarea id="mfp_guide" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical;box-sizing:border-box">휴대폰 카메라로 아래 QR코드를 비추면\n신청 페이지로 이동합니다</textarea></label>';
  h+='<label style="font-size:12px;color:#475569;display:block;margin-bottom:12px">하단 메모 <span style="font-size:10px;color:#94a3b8">(마감일·문의처 등, 선택)</span><input id="mfp_foot" value="'+esc(def.formDesc||'')+'" placeholder="예: 신청 마감 6/15 · 문의 010-0000-0000" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"></label>';
  h+='<div style="text-align:center;margin-bottom:12px"><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=6&data='+encodeURIComponent(url)+'" style="width:120px;height:120px;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:11px;color:#94a3b8;margin-top:3px">A4 출력 시 크게 인쇄됩니다</div></div>';
  h+='<div style="text-align:right"><button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> <button class="btn btn-b" style="background:#2563eb;color:#fff;font-weight:700" onclick="_modFormPosterPrint()">🖨 A4 인쇄</button></div>';
  h+='</div>';
  openPopup(h,460);
}
function _modFormPosterPrint(){
  var title=(document.getElementById('mfp_title')||{}).value||'';
  var guide=(document.getElementById('mfp_guide')||{}).value||'';
  var foot=(document.getElementById('mfp_foot')||{}).value||'';
  var url=window.__mfpUrl||'';
  var qr='https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=10&data='+encodeURIComponent(url);
  var win=window.open('','_mfpprint','width=620,height=820');
  if(!win){ toast('팝업 차단을 해제해 주세요',true); return; }
  var esc2=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var css='@page{size:A4;margin:0}html,body{margin:0;padding:0;font-family:\'Malgun Gothic\',\'맑은 고딕\',sans-serif}'
    +'.page{width:210mm;height:297mm;box-sizing:border-box;padding:28mm 20mm;display:flex;flex-direction:column;align-items:center;text-align:center}'
    +'.t{font-size:42pt;font-weight:800;color:#2563eb;line-height:1.2;margin-bottom:12mm}'
    +'.g{font-size:19pt;color:#475569;line-height:1.5;white-space:pre-line;margin-bottom:16mm}'
    +'.qr{width:115mm;height:115mm;border:1px solid #e5e7eb}'
    +'.s{font-size:17pt;font-weight:700;color:#16a34a;margin-top:14mm}'
    +'.f{font-size:14pt;color:#64748b;margin-top:auto;white-space:pre-line;line-height:1.6}'
    +'@media screen{body{background:#e2e8f0;padding:10px}.page{background:#fff;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.2)}}';
  var body='<div class="page">';
  body+='<div class="t">'+esc2(title)+'</div>';
  body+='<div class="g">'+esc2(guide)+'</div>';
  body+='<img class="qr" src="'+qr+'">';
  body+='<div class="s">📱 QR 스캔 → 바로 신청</div>';
  if(foot) body+='<div class="f">'+esc2(foot)+'</div>';
  body+='</div>';
  win.document.write('<html><head><meta charset="utf-8"><title>신청 안내문</title><style>'+css+'</style></head><body>'+body+'<scr'+'ipt>setTimeout(function(){window.print();},900);</scr'+'ipt></body></html>');
  win.document.close(); win.focus();
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

// 👥 다중 받는분 — 한 블록(받는분 1명) HTML. 받는분별 컬럼을 id 접미사 __r{n}로 렌더
function _modRecipientBlockHtml(def,n){
  var h='<div class="modRcpBlock" data-rcp="'+n+'" style="border:1.5px solid #e9d5ff;border-radius:12px;padding:14px;margin-bottom:10px;background:#fcfaff">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-weight:800;color:#7c3aed;font-size:14px">받는 분 <span class="modRcpNo"></span></span><button type="button" onclick="_modRemoveRecipient('+n+')" class="modRcpDel" style="border:none;background:#fee2e2;color:#dc2626;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;cursor:pointer;display:none">✕ 삭제</button></div>';
  // ✅ 주문자와 동일 — 체크하면 이 블록의 copyFrom 칸(성함·연락처 등)을 숨기고 제출 시 주문자 값 복사
  var _tc=(def.columns||[]).find(function(c){return c.condToggle;});
  var _hasCond=(def.columns||[]).some(function(c){return c.perRecipient&&c.condOnly;});
  if(_tc&&_hasCond){
    h+='<div style="margin-bottom:12px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:9px;padding:10px 12px"><label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:#1d4ed8;cursor:pointer"><input type="checkbox" id="mod_f_same__r'+n+'" onchange="_modRcpSame('+n+',this.checked)" style="width:18px;height:18px;flex-shrink:0">✅ '+esc(_tc.label||'받는 분이 주문자와 동일')+'</label></div>';
  }
  (def.columns||[]).forEach(function(c){
    if(!c.perRecipient) return;
    if(c.auto||c.adminOnly||c.sysOnly||c.qrPublic||c.key==='status') return;
    var fid='mod_f_'+c.key+'__r'+n;
    h+='<div'+((_tc&&c.condOnly)?' data-condrcp="1"':'')+' style="margin-bottom:12px"><label style="display:block;font-size:14px;color:#334155;font-weight:700;margin-bottom:6px">'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</label>';
    h+=_modFormField(c,'',fid);
    h+='</div>';
  });
  h+='</div>';
  return h;
}
// ✅ 받는분 블록 '주문자와 동일' 토글 — 체크 시 그 블록의 copyFrom 칸 숨김 (제출 때 주문자 값이 복사됨)
function _modRcpSame(n, same){
  var blk=document.querySelector('#modRcpList .modRcpBlock[data-rcp="'+n+'"]'); if(!blk) return;
  [].slice.call(blk.querySelectorAll('[data-condrcp]')).forEach(function(el){ el.style.display=same?'none':''; });
}
function _modAddRecipient(){
  var list=document.getElementById('modRcpList'); var def=window.__modApplyDef; if(!list||!def) return;
  var n=(window.__modRcpN==null?0:window.__modRcpN);
  var tmp=document.createElement('div'); tmp.innerHTML=_modRecipientBlockHtml(def,n);
  list.appendChild(tmp.firstChild);
  window.__modRcpN=n+1;
  _modRenumberRecipients();
}
function _modRemoveRecipient(n){
  var b=document.querySelector('.modRcpBlock[data-rcp="'+n+'"]'); if(b&&b.parentNode) b.parentNode.removeChild(b);
  _modRenumberRecipients();
}
function _modRenumberRecipients(){
  var blocks=document.querySelectorAll('#modRcpList .modRcpBlock');
  for(var i=0;i<blocks.length;i++){
    var no=blocks[i].querySelector('.modRcpNo'); if(no) no.textContent=(i+1);
    var del=blocks[i].querySelector('.modRcpDel'); if(del) del.style.display=(blocks.length>1?'':'none');   // 1명일 땐 삭제 숨김
  }
}
function _renderModApplyUI(def,evtId){
  window.__modApplyDef=def; window.__modApplyEvt=evtId; window.__modCondOn=false;
  // 탭/공유 제목을 이 신청폼 이름으로 (시스템명 대신)
  try{ document.title=(def.formTitle||(def.label+' 신청하기')); }catch(e){}
  var title=def.formTitle?esc(def.formTitle):((def.icon||'📝')+' '+esc(def.label)+' 신청하기');
  var hasDesc=!!def.formDesc;
  var desc=hasDesc?_modAcctify(esc(def.formDesc).replace(/\n/g,'<br>')):'아래 내용을 작성하고 신청 버튼을 눌러주세요';
  // 상단 제목 영역 (크고 직관적으로)
  var h='<div style="text-align:center;margin-bottom:14px">';
  h+='<h2 style="color:#2563eb;margin:0 0 6px;font-size:26px;font-weight:800;line-height:1.25">'+title+'</h2>';
  h+='</div>';
  // 🖼 상단 이미지 (포스터 등)
  if(def.formImage) h+='<div style="text-align:center;margin-bottom:16px"><img src="'+esc(def.formImage)+'" style="max-width:100%;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.1)"></div>';
  // 안내문 — 길면 왼쪽 정렬 박스로
  if(hasDesc) h+='<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#334155;line-height:1.7;white-space:normal">'+desc+'</div>';
  else h+='<p style="text-align:center;color:#94a3b8;font-size:13px;margin:0 0 18px">'+desc+'</p>';
  // 📧 구글 이메일 공유 (모듈 설정에서 켰을 때)
  window.__modGoogleEmail=''; window.__modEmColKey='';
  if(def.features&&def.features.googleEmail){
    var _emCol=(def.columns||[]).find(function(c){return /이메일|메일|e-?mail|gmail|지메일/i.test(String(c.label));});
    window.__modEmColKey=_emCol?_emCol.key:'';
    h+='<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:18px">';
    h+='<div style="font-size:14px;color:#1e40af;font-weight:800;margin-bottom:8px">📧 구글 계정 이메일</div>';
    h+='<div style="font-size:12px;color:#64748b;margin-bottom:10px">플레이스토어 테스터 등록을 위해 구글 계정 이메일이 필요합니다.</div>';
    h+='<button type="button" id="_modGBtn" onclick="_modGoogleAuth()" style="width:100%;padding:12px;border:none;border-radius:8px;background:#fff;border:1.5px solid #2563eb;color:#2563eb;font-size:14px;font-weight:800;cursor:pointer">🔵 구글 계정으로 이메일 가져오기</button>';
    h+='<div id="_modGBox" style="display:none;margin-top:12px"></div>';
    h+='</div>';
  }
  var _multiRcp=!!def.multiRecipient;
  (def.columns||[]).forEach(function(c){
    if(c.auto||c.adminOnly||c.sysOnly||c.qrPublic||c.key==='status') return;
    if(_multiRcp && c.perRecipient) return;   // 받는분별 칸은 아래 반복 섹션에서
    if(_multiRcp && c.condToggle) return;       // 다중 받는분 모드에선 '주문자와 동일' 토글 미사용
    if(c.condToggle){ // 조건 토글 — 일반:체크 시 표시 / 반대(condInvert):체크 시 숨김(주문자와 동일)
      var _inv=!!c.condInvert;
      var _chk=_inv?' checked':'';            // 동일방식은 기본 체크(=받는분 숨김)
      if(_inv) window.__modCondOn=false;
      var _bg=_inv?'#eff6ff':'#fffbeb', _bd=_inv?'#bfdbfe':'#fde68a', _col=_inv?'#1d4ed8':'#92400e', _ic=_inv?'✅':'🎁';
      h+='<div style="margin-bottom:16px;background:'+_bg+';border:1.5px solid '+_bd+';border-radius:10px;padding:13px"><label style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;color:'+_col+';cursor:pointer"><input type="checkbox" id="mod_f_'+c.key+'"'+_chk+' onchange="_modCondToggle(this.checked,'+_inv+')" style="width:19px;height:19px;flex-shrink:0">'+_ic+' '+esc(c.label)+'</label></div>';
      return;
    }
    var _cf=c.condOnly?' data-condfield="1"':'';
    var _cs=c.condOnly?';display:none':'';
    h+='<div'+_cf+' style="margin-bottom:16px'+_cs+'"><label style="display:block;font-size:14px;color:#334155;font-weight:700;margin-bottom:6px">'+esc(c.label)+(c.required?' <span style="color:#ef4444">*</span>':'')+'</label>';
    h+=_modFormField(c,'');
    h+='</div>';
  });
  // 👥 다중 받는분 — 반복 입력 섹션
  if(_multiRcp){
    window.__modRcpN=0;
    h+='<div style="margin:20px 0 8px;font-weight:800;color:#7c3aed;font-size:16px">📦 받는 분</div>';
    h+='<div id="modRcpList"></div>';
    h+='<button type="button" onclick="_modAddRecipient()" style="width:100%;padding:14px;border:none;border-radius:10px;background:#7c3aed;color:#fff;font-weight:800;font-size:15px;cursor:pointer;margin-top:2px;box-shadow:0 3px 10px rgba(124,58,237,.3)">➕ 받는 분 추가 (다른 주소로 더 보내기)</button>';
  }
  // 💳 입금 계좌 — 신청 전에 보이게 (버튼 위) + 복사 버튼
  var _pi=(def.payInfo||'').trim();
  if(_pi){
    window.__modPayInfo=_pi;
    h+='<div style="margin-top:18px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:16px">'
      +'<div style="font-size:12px;color:#15803d;font-weight:800;margin-bottom:8px">💳 입금 계좌</div>'
      +'<div style="font-size:16px;font-weight:800;color:#0f172a;word-break:break-all;line-height:1.5">'+esc(_pi)+'</div>'
      +'<button type="button" onclick="_modCopyPay(this)" style="margin-top:10px;padding:10px 22px;border:none;border-radius:9px;background:#16a34a;color:#fff;font-size:14px;font-weight:800;cursor:pointer">📋 계좌번호 복사</button>'
      +'</div>';
  }
  h+='<button id="modApplyBtn" onclick="submitModApply()" style="width:100%;padding:16px;border:none;border-radius:12px;background:#2563eb;color:#fff;font-size:17px;font-weight:800;cursor:pointer;margin-top:14px;box-shadow:0 4px 12px rgba(37,99,235,.3)">✓ '+esc(def.label)+' 신청하기</button>';
  h+='<div id="modApplyMsg" style="text-align:center;margin-top:12px;font-size:13px"></div>';
  if(def.formFooter){ var _ff=esc(def.formFooter).replace(/(01[0-9][-\s]?\d{3,4}[-\s]?\d{4})/g,function(m){return '<a href="tel:'+m.replace(/[^0-9]/g,'')+'" style="color:#64748b;font-weight:700">'+m+'</a>';}); h+='<div style="text-align:center;margin-top:18px;padding-top:12px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8">'+_ff+'</div>'; }
  document.getElementById('modApplyCard').innerHTML=h;
  if(_multiRcp){ _modAddRecipient(); }   // 받는분 1명 기본 표시
  // 📦 재고 관리 select 있으면 현재 신청수 세서 남은수량 표시 + 품절 비활성화
  _modApplyLoadStock(def,evtId);
}

// 상태값이 "탈락(빨강)"인지 — 이름(탈락/거부/반려) 또는 빨간 배지색으로 판정
function _modIsRejected(statusCol, val){
  var s=String(val==null?'':val);
  if(/탈락|거부|취소|반려|불가|미선정/.test(s)) return true;
  var bm=statusCol&&statusCol.badgeMap&&statusCol.badgeMap[val];
  if(bm){
    var c=String(bm.color||'').toLowerCase(), bg=String(bm.bg||'').toLowerCase();
    if(/dc2626|ef4444|b91c1c|f87171|e11d48|#f00\b|(^|[^a-z])red/.test(c) || /fee2e2|fecaca|fca5a5|ffe4e6/.test(bg)) return true;
  }
  return false;
}
// 다중선택+수량 값: JSON 배열 [{o:옵션,q:수량}] 파싱/표시/수집
function _modParseMulti(v){
  if(!v) return [];
  if(typeof v==='object') return Array.isArray(v)?v:[];
  try{ var a=JSON.parse(v); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function _modMultiStr(v, sep, noQty, kae){
  sep = (sep==null) ? ', ' : sep;
  return _modParseMulti(v).filter(function(it){return it&&(it.raw?String(it.o||'').trim():it.q>0);}).map(function(it){
    if(it.raw) return it.o;          // 직접입력: 사용자가 쓴 그대로 (수량 포함해서 직접 작성)
    if(noQty) return it.o;
    return kae ? (it.o+' '+it.q+'개') : (it.o+'×'+it.q);
  }).join(sep);
}
function _modCollectMultiQty(id){
  var cont=document.getElementById(id); if(!cont) return '';
  var items=[];
  [].slice.call(cont.querySelectorAll('[data-optrow]')).forEach(function(row){
    var oname=row.getAttribute('data-optrow');
    if(oname==='__etc__'){ // 직접입력: 자유 텍스트 그대로 저장(수량도 본문에 포함)
      var nm=row.querySelector('.mqetcname'); var t=nm?(nm.value||'').trim():'';
      if(t) items.push({o:t, q:1, raw:true});
      return;
    }
    var chk=row.querySelector('.mqchk');
    if(chk && !chk.checked) return; // 체크 안 한 품목 제외
    var num=row.querySelector('.mqnum');
    var q=num?(parseInt(num.value,10)||0):0;
    if(q<=0) return;
    items.push({o:oname, q:q});
  });
  return items.length?JSON.stringify(items):'';
}
// 품목 체크 → 그 줄 수량칸 활성/비활성
function _modMqToggle(chk){
  var row=chk.closest?chk.closest('[data-optrow]'):null; if(!row) return;
  var num=row.querySelector('.mqnum'); if(!num) return;
  if(chk.checked){ num.disabled=false; num.style.opacity='1'; num.style.background=''; if(!(parseInt(num.value,10)>0)) num.value=1; _modMqClampTotal(num); try{num.focus();num.select();}catch(e){} }
  else { num.disabled=true; num.style.opacity='.4'; num.style.background='#f1f5f9'; _modMqUpdateTotal(num); }
}
// 입력 시: 품목별 재고상한 + 전체 총합 제한 적용
function _modMqClampTotal(inp){
  var cont=inp.closest?inp.closest('[data-multiqty]'):null; if(!cont) return;
  // 1) 품목별 재고 상한 (max 속성)
  if(inp.max!==''&&inp.max!=null){ var im=parseInt(inp.max,10); if(im>=0&&(parseInt(inp.value,10)||0)>im) inp.value=im; }
  // 2) 총합 제한 — "남은 자리"(max - 다른 품목 합계) 기준
  var max=parseInt(cont.getAttribute('data-maxtotal'),10)||0;
  if(max){
    var others=0;
    [].slice.call(cont.querySelectorAll('[data-optrow]')).forEach(function(row){
      var c=row.querySelector('.mqchk'), n=row.querySelector('.mqnum');
      if(c&&c.checked&&n&&!n.disabled&&n!==inp) others+=parseInt(n.value,10)||0;
    });
    var avail=max-others;
    if(avail<=0){ // 자리 없음 → 이 품목 해제
      var r=inp.closest('[data-optrow]'); var chk=r&&r.querySelector('.mqchk');
      if(chk) chk.checked=false;
      inp.disabled=true; inp.value=1; inp.style.opacity='.4'; inp.style.background='#f1f5f9';
      toast('총 '+max+'개까지만 선택할 수 있어요',true);
    } else if((parseInt(inp.value,10)||0)>avail){ inp.value=avail; }
    else if((parseInt(inp.value,10)||0)<1) inp.value=1;
  } else if((parseInt(inp.value,10)||0)<1) inp.value=1;
  _modMqUpdateTotal(inp);
}
// 총합 안내 갱신
function _modMqUpdateTotal(inp){
  var cont=inp.closest?inp.closest('[data-multiqty]'):null; if(!cont) return;
  var max=parseInt(cont.getAttribute('data-maxtotal'),10)||0; if(!max) return;
  var sum=0;
  [].slice.call(cont.querySelectorAll('[data-optrow]')).forEach(function(row){
    var c=row.querySelector('.mqchk'), n=row.querySelector('.mqnum');
    if(c&&c.checked&&n&&!n.disabled) sum+=parseInt(n.value,10)||0;
  });
  var note=document.getElementById(cont.id+'_tot');
  if(note) note.innerHTML='선택 합계 <b style="color:'+(sum>=max?'#ef4444':'#0f766e')+'">'+sum+'</b> / 총 '+max+'개까지';
}
// 옵션별 사용량 집계 — 탈락(빨강)만 제외(대기·선정은 차감) + 수량칼럼/다중수량. 재고 계산 단일 소스.
function _modStockUsed(def,col,arr){
  var statusCol=(def.columns||[]).find(function(c){return c.key==='status';});
  var exclRejected=(col.stockExclRejected!==false); // 기본: 탈락 제외
  var qtyKey=col.stockQtyKey||'';
  var used={};
  (arr||[]).forEach(function(r){
    if(!r) return;
    if(exclRejected && statusCol && _modIsRejected(statusCol, r[statusCol.key])) return; // 탈락(빨강)만 제외
    if(col.multiQty){ // 다중선택+수량: 항목별 수량 합산
      _modParseMulti(r[col.key]).forEach(function(it){ if(it&&it.o&&it.q>0) used[it.o]=(used[it.o]||0)+it.q; });
      return;
    }
    var v=r[col.key]; if(v==null||v==='') return;
    var q=qtyKey?(parseInt(r[qtyKey],10)||1):1;
    used[v]=(used[v]||0)+q;
  });
  return used;
}

// 재고 관리 select들: 현재 데이터 읽어 옵션별 남은수량 계산 → 드롭다운에 반영
function _modApplyLoadStock(def,evtId){
  if(typeof fbDb==='undefined') return;
  var stockCols=(def.columns||[]).filter(function(c){return c.type==='select'&&c.stockOn&&c.stock;});
  if(!stockCols.length) return;
  var path=def.global?'/main/'+def.fbPath:'/evtData/'+evtId+'/'+def.fbPath;
  fbDb.ref(path).once('value').then(function(snap){
    var arr=snap.val()||[]; if(!Array.isArray(arr))arr=Object.values(arr);
    window.__modStockData={path:path, arr:arr};
    stockCols.forEach(function(c){
      var used=_modStockUsed(def,c,arr);
      var sel=document.getElementById('mod_f_'+c.key); if(!sel) return;
      // 🛒 다중선택+수량: 각 항목 행에 남은수량 표시 + 입력 상한
      if(c.multiQty){
        [].slice.call(sel.querySelectorAll('[data-optrow]')).forEach(function(row){
          var opt=row.getAttribute('data-optrow');
          var cap=c.stock[opt];
          var span=row.querySelector('.mqleft');
          var num=row.querySelector('.mqnum');
          var chk=row.querySelector('.mqchk');
          if(cap==null){ if(span){span.textContent='';} return; } // 무제한
          var left=Math.max(0,cap-(used[opt]||0)); // 품목별 상한 = 재고 남은 수
          if(span){ span.textContent=left<=0?'(품절)':('(남은 '+left+')'); span.style.color=left<=0?'#ef4444':'#16a34a'; }
          if(left<=0){ if(chk){chk.checked=false;chk.disabled=true;} if(num){num.disabled=true;num.value=1;num.style.opacity='.4';num.style.background='#f1f5f9';} }
          else if(num){ num.max=left; if((parseInt(num.value,10)||0)>left) num.value=left; }
        });
        return;
      }
      var allSold=true;
      [].slice.call(sel.options).forEach(function(op){
        if(!op.value||op.value==='__etc__') return;
        var cap=c.stock[op.value];
        if(cap==null){ allSold=false; return; } // 무제한
        var left=Math.max(0, cap-(used[op.value]||0));
        var base=op.getAttribute('data-base')||op.textContent.replace(/\s*\((품절|남은[^)]*|\d+개[^)]*)\)\s*$/,'');
        op.setAttribute('data-base',base);
        if(left<=0){ op.textContent=base+' (품절)'; op.disabled=true; }
        else { op.textContent=base+' ('+left+'개 남음)'; op.disabled=false; allSold=false; }
      });
      // 안내 문구
      var note=document.getElementById('_modStockNote_'+c.key);
      if(!note){ note=document.createElement('div'); note.id='_modStockNote_'+c.key; note.style.cssText='font-size:11px;color:#0f766e;margin-top:4px;font-weight:700'; sel.parentNode.appendChild(note); }
      note.textContent=allSold?'⚠ 모든 항목이 품절되었습니다':'📦 남은 수량이 표시됩니다 (실시간)';
      note.style.color=allSold?'#ef4444':'#0f766e';
    });
  }).catch(function(){});
}

// 안내문 속 계좌/긴 번호 자동 감지 → 옆에 「복사」 버튼 (숫자 10자리 이상만, 날짜 제외)
function _modAcctify(html){
  return String(html||'').replace(/(\d[\d-]{7,}\d)/g, function(m){
    var digits=(m.match(/\d/g)||[]).length;
    if(digits<10) return m; // 날짜(8자리) 등 제외
    var safe=m.replace(/"/g,'');
    return '<span style="display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:2px 5px 2px 9px;margin:1px 2px;font-weight:800;color:#0f172a;white-space:nowrap">'+m
      +'<button type="button" data-copy="'+safe+'" onclick="_modCopyText(this)" style="border:none;border-radius:6px;background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;cursor:pointer">📋복사</button></span>';
  });
}
// data-copy 값을 클립보드로 복사
function _modCopyText(btn){
  var txt=btn.getAttribute('data-copy')||'';
  if(!txt) return;
  function done(){ var o=btn.textContent; btn.textContent='✅복사됨'; setTimeout(function(){ btn.textContent=o; },1300); }
  function fb(){ try{ var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }catch(e){} }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done).catch(fb); } else fb();
}
// 신청 링크 공유 — 모바일은 공유시트(카톡 등), PC는 링크 복사
function _modShareForm(btn){
  var url=(window.location.href||'').split('#')[0];
  var title=document.title||'신청하기';
  if(navigator.share){
    navigator.share({title:title, text:title+' — 함께 신청해요!', url:url}).catch(function(){});
    return;
  }
  function done(){ if(btn){ var o=btn.innerHTML; btn.innerHTML='✅ 링크 복사됨!'; setTimeout(function(){ btn.innerHTML=o; },1600); } }
  function fb(){ try{ var ta=document.createElement('textarea'); ta.value=url; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }catch(e){} }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(fb); } else fb();
}
// 신청 완료 화면: 계좌번호 클립보드 복사
function _modCopyPay(btn){
  var txt=window.__modPayInfo||'';
  if(!txt) return;
  function done(){ if(btn){ var o=btn.textContent; btn.textContent='✅ 복사됨!'; btn.style.background='#15803d'; setTimeout(function(){ btn.textContent=o; btn.style.background='#16a34a'; },1500); } }
  function fallback(){
    try{ var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }
    catch(e){ if(btn) btn.textContent='길게 눌러 복사하세요'; }
  }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done).catch(fallback); }
  else fallback();
}

// 구글 계정 인증 → 이메일 표시 → 동의 체크 (구글 폼 방식)
function _modGoogleAuth(){
  var btn=document.getElementById('_modGBtn');
  var box=document.getElementById('_modGBox');
  if(typeof firebase==='undefined'||typeof fbAuth==='undefined'){ if(box){box.style.display='block';box.innerHTML='<span style="color:#ef4444">구글 로그인을 쓸 수 없습니다</span>';} return; }
  if(btn){ btn.disabled=true; btn.textContent='구글 로그인 중…'; btn.style.opacity='.6'; }
  try{
    var provider=new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    fbAuth.signInWithPopup(provider).then(function(res){
      var email=(res && res.user && res.user.email)||'';
      if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.textContent='🔵 다른 계정으로 변경'; }
      if(!email){ if(box){box.style.display='block';box.innerHTML='<span style="color:#ef4444">이메일을 가져오지 못했습니다</span>';} return; }
      _modSetGoogleEmail(email);
    }).catch(function(e){
      if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.textContent='🔵 구글 계정으로 이메일 가져오기'; }
      var m=(e&&e.message)||e;
      if(/operation-not-allowed|configuration/i.test(String(m))) m='Firebase 콘솔에서 Google 로그인을 켜야 합니다';
      if(/popup-closed|cancelled-popup|popup_closed/i.test(String(m))) m='로그인 창이 닫혔습니다. 다시 시도하세요';
      if(box){box.style.display='block';box.innerHTML='<span style="color:#ef4444">구글 로그인 실패: '+esc(m)+'</span>';}
    });
  }catch(e){ if(btn){btn.disabled=false;btn.style.opacity='1';} if(box){box.style.display='block';box.innerHTML='<span style="color:#ef4444">구글 로그인 불가</span>';} }
}
// 가져온 이메일 표시 + 동의 체크박스
function _modSetGoogleEmail(email){
  window.__modGoogleEmail=email;
  var box=document.getElementById('_modGBox'); if(!box) return;
  box.style.display='block';
  box.innerHTML='<div style="background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:11px 13px;font-size:15px;color:#0f172a;font-weight:700;word-break:break-all">📩 '+esc(email)+'</div>'
    +'<label style="display:flex;align-items:flex-start;gap:9px;margin-top:11px;font-size:13px;color:#1e40af;font-weight:700;cursor:pointer">'
    +'<input type="checkbox" id="_modEmConsent" checked onchange="_modConsentChg()" style="width:18px;height:18px;margin-top:1px;flex-shrink:0">'
    +'<span>이 이메일을 신청에 사용하는 데 동의합니다<br><span style="font-size:11px;color:#64748b;font-weight:400">'+esc(email)+'을(를) 내 응답에 포함할 이메일로 기록합니다</span></span></label>';
  _modConsentChg();
}
// 동의 체크 변경 → 이메일 컬럼 입력란에 채우기/비우기
function _modConsentChg(){
  var cb=document.getElementById('_modEmConsent');
  var ok=cb?cb.checked:false;
  var email=ok?(window.__modGoogleEmail||''):'';
  window.__modEmailConsented=ok;
  var k=window.__modEmColKey;
  if(k){ var inp=document.getElementById('mod_f_'+k); if(inp){ inp.value=email; inp.readOnly=!!email; inp.style.background=email?'#f1f5f9':''; } }
}
// 조건부칸 copyFrom 2차 해결 — '주문자와 동일'(숨김)이면 컬럼 순서와 무관하게 출처 값 복사
function _modApplyCopyFrom(def, obj){
  if(window.__modCondOn) return;   // 표시(별도) 상태면 실제 입력값 유지
  (def.columns||[]).forEach(function(c){ if(c.condOnly){ obj[c.key]= c.copyFrom?(obj[c.copyFrom]||''):''; } });
}
// 신청폼 컬럼 1개 읽기 — fid=필드 id, ctx={valid,firstBad,fileTasks}, target=값 채울 객체
function _modReadField(c, fid, ctx, target){
  var el=document.getElementById(fid);
  if(c.type==='consent'){
    if(c.required&&(!el||!el.checked)){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad=c.label+'에 동의해 주세요'; }
    return el&&el.checked?'동의':'';
  }
  if(c.type==='file'){
    if(el&&el.files&&el.files.length){ ctx.fileTasks.push({col:c,files:Array.prototype.slice.call(el.files),target:target}); }
    else if(c.required){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad=c.label+' 파일을 첨부해 주세요'; }
    return undefined;
  }
  if(c.type==='select'&&c.multiQty){
    var mv=_modCollectMultiQty(fid);
    if(c.required&&!mv){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad=c.label+'에서 수량을 1개 이상 입력하세요'; }
    if(c.maxPer){ var _tot=_modParseMulti(mv).reduce(function(s,it){return s+(it&&it.q>0?it.q:0);},0); if(_tot>c.maxPer){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad=c.label+'은(는) 총 '+c.maxPer+'개까지 신청 가능합니다 (현재 '+_tot+'개)'; } }
    return mv;
  }
  if(c.type==='address'){
    var _ab=(el?el.value:'').trim(); var _ad=document.getElementById(fid+'_detail'); var _adv=_ad?(_ad.value||'').trim():'';
    var _az=document.getElementById(fid+'_zip'); var _azv=_az?(_az.value||'').trim():'';
    if(c.required&&!_ab){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad=c.label+'을(를) 검색해 주세요'; }
    return (_azv?'('+_azv+') ':'')+_ab+(_adv?' '+_adv:'');
  }
  if(!el) return undefined;
  var v=(el.value||'').trim();
  if(c.type==='select'&&v==='__etc__'){ var _et=document.getElementById(fid+'_etc'); v=_et?(_et.value||'').trim():''; }
  if(c.type==='number'&&c.comma) v=v.replace(/,/g,'');
  if(c.type==='number'&&v) v=Number(v);
  if(c.required&&!v&&v!==0){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad=c.label+'을(를) 입력하세요'; }
  else { var verr=_modValidateField(c,v); if(verr){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad=verr; } }
  return v;
}
function submitModApply(){
  var def=window.__modApplyDef, evtId=window.__modApplyEvt;
  if(!def) return;
  var _multi=!!def.multiRecipient;
  var ctx={valid:true, firstBad:null, fileTasks:[]};
  var base={};
  // 공통(주문자) 칸 수집 — 다중모드에선 받는분별/조건토글 제외
  (def.columns||[]).forEach(function(c){
    if(c.auto||c.adminOnly||c.sysOnly||c.qrPublic||c.key==='status') return;
    if(_multi && c.perRecipient) return;
    if(_multi && c.condToggle) return;
    if(c.condToggle){ var ce=document.getElementById('mod_f_'+c.key); base[c.key]= c.condInvert ? (ce&&ce.checked?'주문자와 동일':'받는분 별도') : (ce&&ce.checked?'선물':'본인구매'); return; }
    if(c.condOnly && !window.__modCondOn){ base[c.key]= c.copyFrom?(base[c.copyFrom]||''):''; return; }
    var val=_modReadField(c,'mod_f_'+c.key,ctx,base);
    if(val!==undefined) base[c.key]=val;
  });
  if(!_multi) _modApplyCopyFrom(def, base);   // 단일모드: 주문자와 동일 → 받는분 copyFrom 복사 (순서 무관)
  // 📧 구글 이메일 (공통)
  if(def.features&&def.features.googleEmail){
    var _gem=window.__modGoogleEmail||'';
    if(!_gem){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad='구글 계정으로 이메일을 가져와 주세요'; }
    else if(!window.__modEmailConsented){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad='이메일 사용 동의에 체크해 주세요'; }
    else { if(window.__modEmColKey) base[window.__modEmColKey]=_gem; base._email=_gem; }
  }
  // 받는분별 칸 → 블록 객체들 (단일모드는 base 하나)
  var blockObjs=[];
  if(_multi){
    var blocks=document.querySelectorAll('#modRcpList .modRcpBlock');
    if(!blocks.length){ ctx.valid=false; if(!ctx.firstBad)ctx.firstBad='받는 분을 한 명 이상 추가하세요'; }
    var _tcCol=(def.columns||[]).find(function(c){return c.condToggle;});
    [].slice.call(blocks).forEach(function(blk){
      var rn=blk.getAttribute('data-rcp'); var bo={};
      var _sameEl=document.getElementById('mod_f_same__r'+rn); var _same=!!(_sameEl&&_sameEl.checked);
      (def.columns||[]).forEach(function(c){
        if(!c.perRecipient) return;
        if(c.auto||c.adminOnly||c.sysOnly||c.qrPublic||c.key==='status') return;
        if(_same&&c.condOnly){ bo[c.key]= c.copyFrom?(base[c.copyFrom]||''):''; return; }   // ✅ 주문자와 동일 → 주문자 값 복사 (필수검증 건너뜀)
        var val=_modReadField(c,'mod_f_'+c.key+'__r'+rn,ctx,bo);
        if(val!==undefined) bo[c.key]=val;
      });
      if(_tcCol) bo[_tcCol.key]=_same?'주문자와 동일':'받는분 별도';
      blockObjs.push(bo);
    });
  } else {
    blockObjs.push({});
  }
  var msg=document.getElementById('modApplyMsg');
  if(!ctx.valid){ if(msg)msg.innerHTML='<span style="color:#ef4444">'+esc(ctx.firstBad)+'</span>'; return; }
  var fileTasks=ctx.fileTasks;
  var btn=document.getElementById('modApplyBtn'); if(btn){btn.disabled=true;btn.textContent=fileTasks.length?'파일 업로드 중...':'신청 중...';}

  // 파일 업로드 — 각 task의 target 객체에 채움 (공통=base, 받는분별=blockObj)
  var upChain=Promise.resolve();
  fileTasks.forEach(function(t){
    upChain=upChain.then(function(){
      var urls=[]; var sub=Promise.resolve();
      t.files.forEach(function(f){
        sub=sub.then(function(){ return _uploadToDrive(f,'mod_'+def.key,t.col.label).then(function(url){ urls.push(f.name.replace(/[|\n]/g,' ')+'|'+url); }); });
      });
      return sub.then(function(){ t.target[t.col.key]=urls.join('\n'); });
    });
  });

  var path=def.global?'/main/'+def.fbPath:'/evtData/'+evtId+'/'+def.fbPath;
  var rows=[];
  var grp = _multi ? ('g'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)) : '';
  upChain.then(function(){
    if(btn)btn.textContent='신청 중...';
    // 행 구성: base + 각 블록
    blockObjs.forEach(function(bo,i){
      var r={}; for(var k in base) r[k]=base[k]; for(var k2 in bo) r[k2]=bo[k2];
      r._id='m'+Date.now().toString(36)+i+Math.random().toString(36).slice(2,5);
      r._createdAt=new Date().toISOString(); r.status='대기';
      if(_multi) r._grpId=grp;
      rows.push(r);
    });
    return fbDb.ref(path).once('value');
  }).then(function(snap){
    var arr=snap.val()||[]; if(!Array.isArray(arr))arr=Object.values(arr);
    // 📦 재고 재확인 — 이번 배치(여러 행) 누적까지 반영
    var stockCols=(def.columns||[]).filter(function(c){return c.type==='select'&&c.stockOn&&c.stock;});
    for(var si=0;si<stockCols.length;si++){
      var sc=stockCols[si];
      var usedMap=_modStockUsed(def,sc,arr);
      var batch={};  // 이번 제출 누적
      for(var ri=0;ri<rows.length;ri++){
        var obj=rows[ri];
        if(sc.multiQty){
          var items=_modParseMulti(obj[sc.key]);
          for(var mi=0;mi<items.length;mi++){
            var it=items[mi]; if(!it||!(it.q>0)||it.raw) continue;
            var capM=sc.stock[it.o]; if(capM==null) continue;
            var uM=(usedMap[it.o]||0)+(batch[it.o]||0);
            if(uM+it.q>capM) throw new Error('"'+it.o+'" 재고가 부족합니다 (남은 '+Math.max(0,capM-uM)+'개)');
            batch[it.o]=(batch[it.o]||0)+it.q;
          }
          continue;
        }
        var chosen=obj[sc.key];
        if(chosen==null||chosen==='') continue;
        var cap=sc.stock[chosen]; if(cap==null) continue;
        var u=(usedMap[chosen]||0)+(batch[chosen]||0);
        var newQty=sc.stockQtyKey?(parseInt(obj[sc.stockQtyKey],10)||1):1;
        if(u+newQty>cap) throw new Error('"'+chosen+'" 재고가 부족합니다 (남은 '+Math.max(0,cap-u)+'개)');
        batch[chosen]=(batch[chosen]||0)+newQty;
      }
    }
    rows.forEach(function(r){ arr.push(r); });
    return fbDb.ref(path).set(arr);
  }).then(function(){
    // 📱 신청 접수 문자 — 모든 행의 대상 연락처 모아 번호당 1번만
    if(def.smsApply){
      var seen={};
      rows.forEach(function(r){
        var tl=_modTelsFor(def,r,def.smsApplyTo||'both');
        tl.forEach(function(t){
          if(seen[t]) return; seen[t]=1;
          _modSmsGlobal([t], _modSmsFill(def.smsApplyTpl||'주문이 정상 접수되었습니다.',def,r));
        });
      });
    }
    var _dlUrl=(def.downloadUrl||'').trim();
    var _um=_dlUrl.match(/https?:\/\/\S+/i);          // 앞에 글자 섞여 있어도 URL만 추출
    if(_um) _dlUrl=_um[0];
    else if(_dlUrl) _dlUrl='https://'+_dlUrl.replace(/^[^\w]*/,'').replace(/\s+/g,'');
    var dl=_dlUrl?('<a href="'+esc(_dlUrl)+'" target="_blank" rel="noopener" style="display:inline-block;margin-top:18px;padding:15px 28px;background:#16a34a;color:#fff;border-radius:12px;text-decoration:none;font-size:16px;font-weight:800;box-shadow:0 4px 12px rgba(22,163,74,.3)">⬇ 앱 다운로드 / 설치하기</a><div style="font-size:12px;color:#94a3b8;margin-top:8px">버튼을 눌러 설치 페이지로 이동하세요</div>'):'';
    // 🧰 편의기능 — 입금 계좌 복사 + 링크 공유 (버튼 작게)
    var _pi=(def.payInfo||'').trim(); if(_pi) window.__modPayInfo=_pi;
    var conv='<div style="margin-top:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:left">'
      +'<div style="font-size:12px;color:#0f766e;font-weight:800;margin-bottom:10px">🧰 편의기능</div>';
    if(_pi){
      conv+='<div style="font-size:11px;color:#64748b;margin-bottom:3px">💳 입금 계좌</div>'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:14px;font-weight:800;color:#0f172a;word-break:break-all">'+esc(_pi)+'</span>'
        +'<button type="button" onclick="_modCopyPay(this)" style="padding:5px 11px;border:none;border-radius:7px;background:#16a34a;color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">📋 복사</button></div>';
    }
    conv+='<div style="margin-top:'+(_pi?'12':'0')+'px"><button type="button" onclick="_modShareForm(this)" style="padding:7px 14px;border:none;border-radius:8px;background:#fbbf24;color:#78350f;font-size:13px;font-weight:800;cursor:pointer">📤 신청 링크 공유</button> <span style="font-size:11px;color:#94a3b8">친구·이웃에게 함께 신청 권유</span></div>';
    conv+='</div>';
    // 📝 새로 작성하기 — 새로고침으로 빈 신청서 다시 열기 (추가 주문용)
    var again='<div style="margin-top:18px"><button type="button" onclick="location.reload()" style="padding:14px 28px;border:none;background:#2563eb;color:#fff;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(37,99,235,.3)">📝 새로 작성하기</button><div style="font-size:11px;color:#94a3b8;margin-top:6px">추가 주문이 있으면 눌러서 새 신청서를 작성하세요</div></div>';
    document.getElementById('modApplyCard').innerHTML='<div style="text-align:center;padding:30px"><div style="font-size:48px">✅</div><h2 style="color:#16a34a;margin:12px 0;font-size:20px">신청 완료</h2><p style="color:#64748b;font-size:14px;line-height:1.6">신청이 정상 접수되었습니다.'+(def.downloadUrl?'':'<br>검토 후 개별 안내드리겠습니다.')+'</p>'+dl+again+conv+'</div>';
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
var _modSmsSelIds={};
function popModSms(key, preSelIds){
  var def=_modDefs[key]; if(!def) return;
  var telCol=(def.columns||[]).find(function(c){return c.type==='tel'});
  if(!telCol) return toast('연락처 컬럼이 없습니다',true);
  var statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge'});
  var titleCol=_modTitleCol(def);
  window.__modSmsKey=key; window.__modSmsTelKey=telCol.key;
  window.__modSmsPreSel=(preSelIds&&preSelIds.length)?preSelIds.slice():null;
  window.__modSmsFilter={};
  _modSmsSelIds={};
  if(preSelIds) preSelIds.forEach(function(id){_modSmsSelIds[id]=true;});

  // 변수 목록 (컬럼 기반)
  var sample=(_modData[key]||[])[0]||{};
  var vars=(def.columns||[]).filter(function(c){return c.key!=='status'&&c.type!=='consent'&&c.type!=='file'})
    .map(function(c){return {key:c.label, srcKey:c.key, sample:sample[c.key]||''};});
  if(typeof _smsDateVars==='function') vars=vars.concat(_smsDateVars());
  // 📱 디지털 패스 링크 변수 (열면 QR 표시 → 입구 스캔)
  vars.push({key:'패스링크', srcKey:'_passLink', sample:'https://…(QR 패스)'});
  window._SMS_POPUP_VARS=vars;

  var h='<div class="pop-head"><h3>💬 '+esc(def.label)+' 문자 발송</h3></div>';
  h+='<div style="padding:14px;max-height:75vh;overflow-y:auto">';

  // 수신자 목록
  h+='<div style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;padding:10px;max-height:300px;overflow:auto;background:#f8fafc">';
  h+='<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">';
  h+='<b style="font-size:13px">수신자</b>';
  h+='<button class="btn btn-s" style="background:#64748b;color:#fff;font-size:11px" onclick="_modSmsCheckBy(\'all\')">전체선택</button>';
  h+='<button class="btn btn-s" style="background:#fff;color:#64748b;border:1px solid #64748b;font-size:11px" onclick="_modSmsCheckBy(\'none\')">해제</button>';
  // 상태별 체크 버튼
  if(statusCol){
    Object.keys(statusCol.badgeMap||{}).forEach(function(sk){
      var bm=statusCol.badgeMap[sk];
      h+='<button class="btn btn-s" style="font-size:11px;background:'+(bm.bg||'#f1f5f9')+';color:'+(bm.color||'#475569')+';border:1px solid '+(bm.bg||'#cbd5e1')+'" onclick="_modSmsCheckBy(\'status\',\''+esc(sk)+'\')">'+esc(bm.label||sk)+'</button>';
    });
  }
  // 필터 컬럼별 체크 드롭다운
  (def.columns||[]).filter(function(c){return c.filter && c.key!=='status';}).forEach(function(fc){
    var fopts=_modFilterOpts(key,fc); if(!fopts.length) return;
    h+='<select onchange="_modSmsCheckBy(\'col\',this.value,\''+esc(fc.key)+'\');this.selectedIndex=0" style="font-size:11px;padding:4px;border:1px solid #cbd5e1;border-radius:6px">';
    h+='<option value="">'+esc(fc.label)+'▾</option>';
    fopts.forEach(function(o){ h+='<option value="'+esc(String(o.v))+'">'+esc(o.l)+'만 선택</option>'; });
    h+='</select>';
  });
  h+='<span id="modSmsSelCnt" style="font-size:12px;color:#2563eb;font-weight:700;margin-left:auto"></span>';
  h+='</div>';
  h+='<input type="search" id="modSmsSearch" oninput="_modSmsRenderList()" placeholder="🔍 이름/연락처 검색" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;margin-bottom:8px;box-sizing:border-box">';
  h+='<div id="modSmsListBody"></div>';
  h+='</div>';

  // 메시지 본문
  h+='<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">';
  h+='<label style="font-size:12px;font-weight:700;color:#64748b;margin:0">메시지 <span id="modSmsByte" style="font-size:11px;color:#64748b"></span></label>';
  h+='<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">';
  if(typeof smsVarSelectHtml==='function') h+=smsVarSelectHtml('modSmsBody', vars);
  if(typeof smsTplPicker==='function') h+='<button type="button" class="btn btn-s" style="font-size:11px;padding:3px 8px;background:#fbbf24;color:#78350f" onclick="smsTplPicker(\'modSmsBody\',true)">📋 템플릿</button>';
  if(typeof smsTplSaveCurrent==='function') h+='<button type="button" class="btn btn-s" style="font-size:11px;padding:3px 8px" onclick="smsTplSaveCurrent(\'modSmsBody\',window._SMS_POPUP_VARS)">💾 저장</button>';
  h+='</div></div>';
  h+='<textarea id="modSmsBody" rows="5" oninput="_modSmsByteCount()" placeholder="예: [법성포단오제] '+esc(def.label)+' 안내드립니다. {이름}님 ..." style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box"></textarea>';
  h+='<div style="font-size:11px;color:#94a3b8;margin-top:3px">💡 {이름} 등 변수는 발송 시 자동 치환 · 90byte 초과 시 LMS</div>';

  // 하단 버튼
  h+='<div style="display:flex;margin-top:14px;gap:6px;align-items:center;flex-wrap:wrap">';
  h+='<span style="flex:1"></span>';
  h+='<button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> ';
  h+='<button class="btn btn-b" style="background:#8b5cf6" onclick="modSmsSend()">💬 발송</button>';
  h+='</div></div>';
  openPopup(h,520);
  setTimeout(function(){
    if(!preSelIds) _modSmsSelAll(true); // 처음 열면 전체선택
    _modSmsRenderList();
    _modSmsPrev();
  },50);
}
function _modTitleCol(def){
  var c=(def.columns||[]).filter(function(x){return !x.adminOnly&&x.key!=='status'&&!x.hideTable&&x.type!=='file'&&x.type!=='consent'})[0];
  return c?c.key:'';
}
// 전체 데이터 (연락처 있는 것만)
function _modSmsAllRows(){
  var key=window.__modSmsKey; var telKey=window.__modSmsTelKey;
  return (_modData[key]||[]).filter(function(r){return (r[telKey]||'').replace(/[^0-9]/g,'').match(/\d{10,11}/)});
}
// 체크 도구: all/none/status/col
function _modSmsCheckBy(type,val,colKey){
  var rows=_modSmsAllRows();
  if(type==='all'){ rows.forEach(function(r){_modSmsSelIds[r._id]=true}); }
  else if(type==='none'){ _modSmsSelIds={}; }
  else if(type==='status'){ _modSmsSelIds={}; rows.forEach(function(r){if(r.status===val)_modSmsSelIds[r._id]=true}); }
  else if(type==='col'&&colKey){ _modSmsSelIds={}; rows.forEach(function(r){if(String(r[colKey]||'')===String(val))_modSmsSelIds[r._id]=true}); }
  _modSmsRenderList(); _modSmsSelCount(); _modSmsPrev();
}
function _modSmsRenderList(){
  var key=window.__modSmsKey; var def=_modDefs[key]; if(!def) return;
  var telKey=window.__modSmsTelKey;
  var showCols=(def.columns||[]).filter(function(c){
    return c.key!=='status'&&c.type!=='tel'&&c.type!=='file'&&c.type!=='consent'&&!c.hideTable&&!c.adminOnly;
  }).slice(0,3);
  var q=((document.getElementById('modSmsSearch')||{}).value||'').trim().toLowerCase();
  var rows=_modSmsAllRows();
  if(q){
    rows=rows.filter(function(r){
      var hay=Object.keys(r).map(function(k){return String(r[k]||'')}).join('|').toLowerCase();
      return hay.indexOf(q)>=0;
    });
  }
  var html='';
  rows.forEach(function(r){
    var checked=_modSmsSelIds[r._id]?'checked':'';
    var tel=(r[telKey]||'');
    var main=showCols[0]?esc(String(r[showCols[0].key]||'-')):'';
    var sub=showCols.slice(1).map(function(c){return esc(String(r[c.key]||''))}).filter(Boolean).join(' · ');
    html+='<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid #e5e7eb;cursor:pointer;font-size:13px">';
    html+='<input type="checkbox" '+checked+' onchange="_modSmsSelToggle(\''+esc(r._id)+'\',this.checked)" style="width:16px;height:16px">';
    html+='<span style="flex:1"><b>'+main+'</b>'+(sub?' <span style="color:#94a3b8;font-size:11px">'+sub+'</span>':'')+' <span style="color:#64748b;font-size:11px">'+esc(tel)+'</span></span>';
    html+='</label>';
  });
  if(!rows.length) html='<div style="text-align:center;padding:20px;font-size:12px;color:#94a3b8">검색 결과 없음</div>';
  var box=document.getElementById('modSmsListBody');
  if(box) box.innerHTML=html;
  _modSmsSelCount();
}
function _modSmsSelToggle(id,on){
  if(on) _modSmsSelIds[id]=true; else delete _modSmsSelIds[id];
  _modSmsSelCount(); _modSmsPrev();
}
function _modSmsSelAll(on){
  _modSmsAllRows().forEach(function(r){
    if(on) _modSmsSelIds[r._id]=true; else delete _modSmsSelIds[r._id];
  });
  _modSmsRenderList(); _modSmsSelCount(); _modSmsPrev();
}
function _modSmsSelCount(){
  var n=Object.keys(_modSmsSelIds).length;
  var el=document.getElementById('modSmsSelCnt');
  if(el) el.textContent=n?'✓ '+n+'명 선택됨':'선택 없음';
}
function _modSmsTargetRows(){
  var key=window.__modSmsKey; var telKey=window.__modSmsTelKey;
  return (_modData[key]||[]).filter(function(r){
    return _modSmsSelIds[r._id] && (r[telKey]||'').replace(/[^0-9]/g,'').match(/\d{10,11}/);
  });
}
function _modSmsPrev(){
  var selected=_modSmsTargetRows().length;
  var el=document.getElementById('modSmsPrev');
  if(el) el.innerHTML='📨 <b>'+selected+'명</b>에게 발송';
}
function _modSmsByteCount(){
  var msg=(document.getElementById('modSmsBody')||{}).value||'';
  var b; try{b=unescape(encodeURIComponent(msg)).length}catch(e){b=msg.length}
  var type=b>90?'LMS':'SMS';
  var el=document.getElementById('modSmsByte');
  if(el) el.textContent='('+b+' 바이트 · '+type+')';
}
function modSmsSend(){
  var key=window.__modSmsKey; var def=_modDefs[key];
  var telKey=window.__modSmsTelKey;
  var body=(document.getElementById('modSmsBody').value||'').trim();
  if(!body) return toast('메시지 내용을 입력하세요',true);
  var rows=_modSmsTargetRows();
  var telsAndRows=rows.map(function(r){return {tel:(r[telKey]||'').replace(/[^0-9]/g,''),row:r}}).filter(function(t){return t.tel.length>=10});
  if(!telsAndRows.length) return toast('발송할 연락처가 없습니다',true);
  // 변수 치환 여부 확인
  var hasVar=/\{[^}]+\}/.test(body);
  if(hasVar){
    // 개별 발송 (변수 치환)
    if(!confirm(telsAndRows.length+'명에게 문자를 발송할까요?\n(변수 치환 → 1건씩 발송)')) return;
    showLoading('발송 중...');
    var cols=(def.columns||[]);
    var promises=telsAndRows.map(function(tr){
      var msg=body;
      cols.forEach(function(c){ msg=msg.split('{'+c.label+'}').join(String(tr.row[c.key]||'')); });
      // 날짜 변수
      if(typeof _smsDateVars==='function'){
        _smsDateVars().forEach(function(v){ msg=msg.split('{'+v.key+'}').join(v.sample||''); });
      }
      // 📱 디지털 패스 링크 (열면 QR 표시)
      msg=msg.split('{패스링크}').join(_modViewUrl(def,tr.row));
      return api('sendSmsAligo',{tels:[tr.tel], msg:msg});
    });
    Promise.all(promises).then(function(results){
      hideLoading();
      var ok=results.filter(function(r){return r&&r.ok}).length;
      var fail=results.length-ok;
      toast('✅ '+ok+'건 발송'+(fail?' / ❌ '+fail+'건 실패':''));
      if(ok) closePopup();
    });
  } else {
    // 일괄 발송
    var tels=telsAndRows.map(function(t){return t.tel});
    if(!confirm(tels.length+'명에게 문자를 발송할까요?')) return;
    showLoading('발송 중...');
    api('sendSmsAligo',{tels:tels, msg:body}).then(function(r){
      hideLoading();
      if(r&&r.ok){ toast('✅ '+tels.length+'건 발송 완료'); closePopup(); }
      else toast('발송 실패: '+((r&&r.err)||'알 수 없는 오류'),true);
    }).catch(function(e){hideLoading();toast('발송 오류: '+(e.message||e),true)});
  }
}

// ═══════════════════════════════════════════
// 라벨 출력 (QR 포함) + 출력 카운팅
// ═══════════════════════════════════════════

// 모드별 기본 크기 — 낱장은 크게, A4 모아찍기는 작게
var _MODLBL_DEFAULTS={
  label:{w:90,h:50,pt:4,pr:4,pb:4,pl:4,gap:0,sheetMargin:0,border:false,qr:0,orientation:'portrait',sheetW:210,sheetH:297},
  a4:{w:50,h:30,pt:2,pr:2,pb:2,pl:2,gap:2,sheetMargin:10,border:true,qr:0,orientation:'portrait',sheetW:210,sheetH:297}
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
// Firebase(모듈정의 def.labelPresets)에 저장 → 모든 PC/계정 공유. localStorage는 백업.
function _mlPresets(key){
  var def=_modDefs[key];
  if(def && def.labelPresets && def.labelPresets.length) return def.labelPresets;
  try{ var s=localStorage.getItem('modLabelPresets_'+key); if(s){ var a=JSON.parse(s)||[]; if(def&&a.length) def.labelPresets=a; return a; } }catch(e){}
  return (def&&def.labelPresets)||[];
}
function _mlSavePresets(key,arr){
  var def=_modDefs[key];
  if(!def){ toast('⚠ 모듈 정보를 찾을 수 없어 저장 실패',true); return; }
  def.labelPresets=arr;
  try{ localStorage.setItem('modLabelPresets_'+key, JSON.stringify(arr)); }catch(e){} // 로컬 백업
  if(typeof _saveModDefs==='function'){
    _saveModDefs().then(function(){ toast('☁ 프리셋 클라우드 저장 완료 (다른 PC 공유)'); })
      .catch(function(e){ toast('⚠ 프리셋 클라우드 저장 실패(이 PC에만 저장): '+(e.message||e),true); });
  }
}
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
  window.__mlActivePreset=arr.length-1;        // 새 프리셋을 활성으로
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
  window.__mlActivePreset=i;
  toast('프리셋 "'+name+'" 수정됨');
}
function _mlPresetDelete(){
  var key=window.__modLabelKey; if(!key) return;
  var sel=document.getElementById('ml_preset'); if(!sel||sel.value==='') return toast('삭제할 프리셋을 선택하세요',true);
  var arr=_mlPresets(key); var i=pn(sel.value); if(!arr[i]) return;
  if(!confirm('"'+arr[i].name+'" 프리셋을 삭제할까요?')) return;
  arr.splice(i,1);
  _mlSavePresets(key,arr);
  window.__mlActivePreset=null;
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
  window.__mlActivePreset=pn(sel.value);        // 활성 프리셋 기억
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
// free 배치 요소의 처리방식별 CSS + 폰트크기 계산
// mode: 'line'(한줄) / 'wrap'(박스폭 넘으면 줄바꿈) / 'fit'(박스폭에 맞게 글자 축소)
// 반환 {css, fs}. labelWmm=라벨 전체 가로(mm)
function _mlElemFit(p, plain, baseFs, labelWmm, labelHmm){
  p=p||{};
  var vert=!!p.vert;
  // 사용 가능한 길이(%) — 가로는 X기준 폭, 세로는 Y기준 높이
  var w=(p.w>0?p.w:(100-((vert?p.y:p.x)||0)));
  var mode=p.mode||(p.wrap?'wrap':'line'); // 구버전 wrap 불린 호환
  var fs=baseFs, css;
  var alignCss=p.align?'text-align:'+p.align+';':'';
  var dim=vert?'height':'width'; // 세로면 높이 박스
  if(mode==='fit'){
    var lenMm=w/100*((vert?labelHmm:labelWmm)||(vert?30:50));
    var n=(plain&&String(plain).length)||1;
    fs=Math.min(baseFs, Math.max(4, lenMm*2.83/n*1.7)); // 글자수·박스길이 기반 근사 축소
    css=dim+':'+w+'%;white-space:nowrap;overflow:hidden;'+alignCss;
  } else if(mode==='wrap'){
    css=dim+':'+w+'%;white-space:normal;word-break:keep-all;overflow-wrap:break-word;'+alignCss;
  } else {
    css=p.align?(dim+':'+w+'%;white-space:nowrap;overflow:hidden;'+alignCss):'white-space:nowrap;';
  }
  if(vert) css='writing-mode:vertical-rl;text-orientation:upright;letter-spacing:0;'+css;
  return {css:css, fs:fs};
}

function _modLabelHtml(def,row,opt){
  var allc=(def.columns||[]).filter(function(c){return c.key!=='status'&&!c.hideTable&&c.type!=='file'&&c.type!=='consent'});
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
      var _tv=_modMaskVal(String(titleV),tp);
      var tef=_mlElemFit(tp, _tv, tp.fs||14, opt.w, opt.h);
      h+='<div style="position:absolute;left:'+tp.x+'%;top:'+tp.y+'%;font-size:'+tef.fs+'pt;font-weight:800;line-height:1.1;'+tef.css+'">'+esc(_tv)+'</div>';
    }
    cols.forEach(function(c){
      if(c.key===opt.titleKey) return;
      var v=row[c.key]; if(v==null||v==='') return;
      var fp=pos[c.key]||null;
      if(!fp) return;
      var pv=_modPlain(c,v);
      pv=_modMaskVal(pv,fp);
      var plain=c.label+(fp.colon?': ':' ')+pv;
      var ef=_mlElemFit(fp, plain, fp.fs||7.5, opt.w, opt.h);
      var sep=fp.brk?((fp.colon?':':'')+'<br>'):(fp.colon?': ':' ');
      var lbl=fp.bold?esc(c.label):'<b>'+esc(c.label)+'</b>';
      h+='<div style="position:absolute;left:'+fp.x+'%;top:'+fp.y+'%;font-size:'+ef.fs+'pt;line-height:1.3;color:#222;'+(fp.bold?'font-weight:800;':'')+ef.css+'">'+lbl+sep+esc(pv)+'</div>';
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
  if(window.__modLabelKey!==key) window.__mlActivePreset=null; // 다른 모듈이면 활성 프리셋 초기화
  window.__modLabelKey = key;
  window.__modLabelAll = rows;            // 후보 행 객체(순서 유지)
  window.__modLabelRows = rows.map(function(r){return r._id;});  // 미리보기용(첫 행)
  window.__mlPickLast = -1;
  window.__mlMode = opt.mode||'label';    // 현재 출력 모드
  window.__mlSizes = JSON.parse(JSON.stringify(opt.sizes||{})); // 모드별 크기 작업 사본
  var allCols=(def.columns||[]).filter(function(c){return c.key!=='status'&&!c.hideTable&&c.type!=='file'&&c.type!=='consent'});
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

  // ── QZ Tray (라벨 프린터 직접 출력) ──
  h+='<div style="margin-bottom:12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:8px 10px">';
  h+='<div style="font-size:11px;color:#6d28d9;font-weight:700;margin-bottom:6px">🖨 라벨 프린터 직접 출력 (QZ Tray) <span style="font-weight:400;color:#94a3b8">— 브라우저 인쇄로 규격이 안 맞을 때</span></div>';
  h+='<div id="ml_qz_box" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"></div>';
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
  h+='<label style="font-size:12px;color:#475569">용지 가로(mm) <span style="font-size:10px;color:#94a3b8">(A4=210)</span><input id="ml_sheetW" type="number" value="'+(opt.sheetW||210)+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
  h+='<label style="font-size:12px;color:#475569">용지 세로(mm) <span style="font-size:10px;color:#94a3b8">(A4=297)</span><input id="ml_sheetH" type="number" value="'+(opt.sheetH||297)+'" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px" oninput="_modLabelPreview()"></label>';
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
    h+='<button class="btn btn-s" style="font-size:11px;padding:2px 8px;background:#2563eb;color:#fff" onclick="_mlPickAll(true)">전체 선택</button>';
    h+='<button class="btn btn-s" style="font-size:11px;padding:2px 8px;background:#64748b;color:#fff" onclick="_mlPickAll(false)">전체 해제</button>';
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
  h+='<div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px">';
  // 1줄: 보조 도구 (줄바꿈 허용)
  h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">';
  h+='<button class="btn btn-s" style="background:#6366f1;color:#fff;font-weight:600" onclick="popModLabelLayout(\''+key+'\')">📐 배치 편집</button>';
  h+='<button class="btn btn-s" style="background:#16a34a;color:#fff;font-weight:600" onclick="_mlExportMailMerge(\''+key+'\')" title="선택 항목을 엑셀로 내보내 메일머지(차량명찰 xlsm)로 완벽하게 출력">📊 메일머지 엑셀</button>';
  // 세로 PDF / ↻방향 버튼 — 숨김(함수는 유지). 필요 시 아래 주석 해제
  // h+='<button onclick="_mlExportPdfRotated(\''+key+'\')">📄 세로 PDF</button><button onclick="_mlTogglePdfDir()">↻ 방향</button>';
  h+='</div>';
  // 2줄: 취소 / 출력 (주 동작)
  h+='<div style="display:flex;gap:8px"><button class="btn" style="flex:0 0 auto;background:#475569;color:#fff;font-weight:600" onclick="closePopup()">취소</button>';
  h+='<button id="ml_printbtn" class="btn btn-b" style="flex:1;background:#2563eb;color:#fff;font-weight:700" onclick="modDoPrint()">🖨 <span id="ml_printcnt">'+rows.length+'</span>장 출력</button></div>';
  h+='</div>';
  h+='</div>';
  openPopup(h,560);
  setTimeout(function(){
    // 활성 프리셋 드롭다운 선택 복원 (배치편집 갔다 와도 풀리지 않게)
    if(window.__mlActivePreset!=null){ var ps=document.getElementById('ml_preset'); if(ps){ var ov=String(window.__mlActivePreset); var ok=false; for(var i=0;i<ps.options.length;i++){ if(ps.options[i].value===ov){ok=true;break;} } if(ok) ps.value=ov; else window.__mlActivePreset=null; } }
    _modLabelPreview(); _mlUpdatePickCount(); _qzUpdateUI();
  },60);
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
    s.sheetW=g('ml_sheetW')||210; s.sheetH=g('ml_sheetH')||297;
  }
  window.__mlSizes[window.__mlMode]=Object.assign(prev,s);
}
// 모드 크기 슬롯 → 입력칸 반영
function _mlSetSizeInputs(sz){
  sz=sz||{};
  var set=function(id,v){ var e=document.getElementById(id); if(e) e.value=(v==null?'':v); };
  set('ml_w',sz.w); set('ml_h',sz.h); set('ml_pt',sz.pt); set('ml_pr',sz.pr); set('ml_pb',sz.pb); set('ml_pl',sz.pl); set('ml_qr',sz.qr||0);
  set('ml_gap',sz.gap); set('ml_smargin',sz.sheetMargin);
  set('ml_sheetW',sz.sheetW||210); set('ml_sheetH',sz.sheetH||297);
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
function _mlSetOri(ori){
  // 용지 가로/세로 치수를 방향에 맞게 정렬 (세로=짧은쪽 가로, 가로=긴쪽 가로)
  var wEl=document.getElementById('ml_sheetW'), hEl=document.getElementById('ml_sheetH');
  if(wEl&&hEl){
    var a=pn(wEl.value)||210, b=pn(hEl.value)||297;
    var mn=Math.min(a,b), mx=Math.max(a,b);
    if(ori==='landscape'){ wEl.value=mx; hEl.value=mn; } else { wEl.value=mn; hEl.value=mx; }
  }
  _mlSetOriUI(ori); _modLabelPreview();
}
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
  var pw=opt.sheetW||210, ph=opt.sheetH||297;
  var availW=pw-opt.sheetMargin*2, availH=ph-opt.sheetMargin*2;
  var cols=Math.max(1,Math.floor((availW+opt.gap)/(opt.w+opt.gap)));
  var rowsN=Math.max(1,Math.floor((availH+opt.gap)/(opt.h+opt.gap)));
  return {cols:cols, rows:rowsN, perPage:cols*rowsN};
}
function _modLabelPreview(){
  var key=window.__modLabelKey, def=_modDefs[key]; if(!def) return;
  var opt=_modLabelReadOpt();
  _saveModLabelOpt(key,opt);   // 설정 변경 시마다 자동 저장 (크기·여백·표시항목·모드 유지)
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
    info.innerHTML='용지 <b>'+(opt.sheetW||210)+'×'+(opt.sheetH||297)+'mm</b> · 한 장에 <b>'+g.cols+'×'+g.rows+' = '+g.perPage+'칸</b> · 선택 '+sel+'개 → 약 <b>'+pages+'장</b>';
  }
}
// 세로 용지(HxW)용 PDF — 라벨 내용을 90도 회전해 넣어, 세로 피드 프린터로 깔끔 출력
async function _mlExportPdfRotated(key){
  var def=_modDefs[key]; if(!def){ toast('정의를 찾을 수 없습니다',true); return; }
  var jspdfNS=(window.jspdf||window.jsPDF); var JsPDF=jspdfNS&&(jspdfNS.jsPDF||jspdfNS);
  if(!JsPDF){ toast('PDF 라이브러리 로딩 중… 잠시 후 다시',true); return; }
  if(typeof html2canvas==='undefined'){ toast('이미지 라이브러리 로딩 중',true); return; }
  var opt=_modLabelReadOpt();
  var ids=_mlSelectedIds();
  var all=window.__modLabelAll||(_modData[key]||[]);
  var rows=all.filter(function(r){return ids.indexOf(r._id)>=0;});
  if(!rows.length){ toast('출력할 항목을 선택하세요',true); return; }
  var _statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge';});
  if(_statusCol){ var _ok=function(r){ return /승인|선정|허가|통과|확정|완료|발급|합격|당첨|입점/.test(String(r.status||'')); }; rows=rows.filter(_ok); if(!rows.length){ toast('승인된 항목이 없습니다',true); return; } }
  var wmm=opt.w, hmm=opt.h;
  var cw=(localStorage.getItem('_mlPdfCW')!=='0'); // 회전 방향(기본 시계방향)
  showLoading('PDF 만드는 중… (0/'+rows.length+')');
  try{
    // 세로 페이지: 가로=hmm, 세로=wmm
    var pdf=new JsPDF({orientation:'portrait',unit:'mm',format:[hmm,wmm]});
    for(var i=0;i<rows.length;i++){
      var canvas=await _labelToCanvas(_modLabelHtml(def,rows[i],opt),wmm,hmm,203);
      // 90도 회전한 캔버스 생성
      var rc=document.createElement('canvas'); rc.width=canvas.height; rc.height=canvas.width;
      var rx=rc.getContext('2d'); rx.fillStyle='#fff'; rx.fillRect(0,0,rc.width,rc.height);
      if(cw){ rx.translate(rc.width,0); rx.rotate(Math.PI/2); }
      else { rx.translate(0,rc.height); rx.rotate(-Math.PI/2); }
      rx.drawImage(canvas,0,0);
      if(i>0) pdf.addPage([hmm,wmm],'portrait');
      pdf.addImage(rc.toDataURL('image/png'),'PNG',0,0,hmm,wmm);
      showLoading('PDF 만드는 중… ('+(i+1)+'/'+rows.length+')');
    }
    hideLoading();
    pdf.save(def.label+'_세로라벨_'+(new Date().toISOString().slice(0,10))+'.pdf');
    toast('📄 '+rows.length+'장 세로 PDF 저장 — 거꾸로면 회전방향 버튼으로 바꾸세요');
  }catch(e){ hideLoading(); toast('PDF 실패: '+(e.message||e),true); console.error(e); }
}
function _mlTogglePdfDir(){ var cur=(localStorage.getItem('_mlPdfCW')!=='0'); try{ localStorage.setItem('_mlPdfCW', cur?'0':'1'); }catch(e){} toast('PDF 회전방향: '+(cur?'반시계':'시계')+'방향',false); _qzUpdateUI(); }
// 메일머지용 엑셀 내보내기 — 라벨 항목 + QR링크 열. 차량명찰 xlsm에 붙여 완벽 출력
function _mlExportMailMerge(key){
  var def=_modDefs[key]; if(!def){ toast('정의를 찾을 수 없습니다',true); return; }
  if(typeof XLSX==='undefined'){ toast('엑셀 라이브러리 로딩 중… 잠시 후 다시',true); return; }
  var opt=_modLabelReadOpt();
  var ids=_mlSelectedIds();
  var all=window.__modLabelAll||(_modData[key]||[]);
  var rows=all.filter(function(r){return ids.indexOf(r._id)>=0;});
  if(!rows.length){ toast('내보낼 항목을 선택하세요',true); return; }
  // 승인된 항목만
  var _statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge';});
  if(_statusCol){
    var _ok=function(r){ return /승인|선정|허가|통과|확정|완료|발급|합격|당첨|입점/.test(String(r.status||'')); };
    rows=rows.filter(_ok);
    if(!rows.length){ toast('승인된 항목이 없습니다',true); return; }
  }
  // 라벨에 표시되는 컬럼 (파일/동의/상태 제외)
  var cols=(def.columns||[]).filter(function(c){return c.key!=='status'&&!c.hideTable&&c.type!=='file'&&c.type!=='consent';});
  var headers=cols.map(function(c){return c.label;});
  headers.push('QR링크');
  var aoa=[headers];
  rows.forEach(function(r){
    var line=cols.map(function(c){ var v=r[c.key]; return (v==null||v==='')?'':_modPlain(c,v); });
    line.push(_modViewUrl(def,r));
    aoa.push(line);
  });
  var wb=XLSX.utils.book_new();
  var ws=XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb,ws,'라벨');
  var fn=def.label+'_메일머지_'+(new Date().toISOString().slice(0,10))+'.xlsx';
  XLSX.writeFile(wb,fn);
  toast('📊 '+rows.length+'건 엑셀 내보냄 — 차량명찰 메일머지에 붙여넣으세요');
  _modLogAdd(key,'발급','', '('+rows.length+'건 메일머지 엑셀)','메일머지 엑셀 내보내기');
}
function modDoPrint(){
  if(window.__mlPrinting){ toast('출력 처리 중입니다… 잠시만 기다려주세요',true); return; } // 연타 방지
  var key=window.__modLabelKey, def=_modDefs[key]; if(!def) return;
  var opt=_modLabelReadOpt();
  _saveModLabelOpt(key,opt);
  var ids=_mlSelectedIds();
  if(!ids.length) return toast('출력할 항목을 선택하세요',true);
  // 선택 순서 유지
  var all=window.__modLabelAll||(_modData[key]||[]);
  var rows=all.filter(function(r){return ids.indexOf(r._id)>=0});
  if(!rows.length) return toast('출력할 항목이 없습니다',true);
  // 라벨은 승인된 항목만 발급 — 대기/거부 등 미승인 포함 시 경고 모달
  var _statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge';});
  if(_statusCol){
    var _isApproved=function(r){ return /승인|선정|허가|통과|확정|완료|발급|합격|당첨|입점/.test(String(r.status||'')); };
    var bad=rows.filter(function(r){return !_isApproved(r);});
    if(bad.length){
      var rest=rows.length-bad.length;
      if(rest<=0){ alert('⛔ 승인된 항목이 없습니다.\n라벨은 승인된 항목만 발급할 수 있습니다.'); return; }
      if(!confirm('⛔ 승인되지 않은 항목 '+bad.length+'개(대기·거부 등)가 포함되어 있습니다.\n라벨은 승인된 항목만 발급됩니다.\n\n[확인] 승인된 '+rest+'개만 출력\n[취소] 중단')) return;
      rows=rows.filter(_isApproved);
      ids=rows.map(function(r){return r._id;});
    }
  }
  // 출력 건수 최종 확인 (전체가 잘못 출력되는 것 방지)
  var _cntMsg;
  if(opt.mode==='a4'){ var _g=_mlA4Grid(opt); var _pg=Math.ceil(rows.length/(_g.perPage||1)); _cntMsg='총 '+rows.length+'건을 A4 약 '+_pg+'장에 출력합니다.\n진행할까요?'; }
  else _cntMsg='총 '+rows.length+'장(낱장)을 출력합니다.\n진행할까요?';
  if(!confirm(_cntMsg)) return;
  // 브라우저 인쇄 모드(메일머지식): QZ 연결돼 있어도 브라우저 @page 인쇄로 → Excel처럼 드라이버가 gap 처리
  var _browserPrint=false; try{ _browserPrint=(localStorage.getItem('_mlBrowserPrint')==='1'); }catch(e){}
  // QZ Tray 연결+프린터선택 시 → 라벨 프린터로 직접 출력 (낱장 모드)
  if(opt.mode==='label' && qzIsReady() && !_browserPrint){
    window.__mlPrinting=true; window.__mlCancel=false; window.__mlPrintTotal=rows.length;
    var _pb=document.getElementById('ml_printbtn');
    if(_pb){ _pb.disabled=false; _pb.style.opacity='1'; _pb.style.background='#dc2626'; _pb.innerHTML='✕ 취소 <span id="ml_prog" style="font-weight:800">생성중 0/'+rows.length+'</span>'; _pb.onclick=_mlCancelPrint; }
    var _restoreBtn=function(){ if(_pb){ _pb.disabled=false; _pb.style.opacity='1'; _pb.style.background='#2563eb'; _pb.innerHTML='🖨 <span id="ml_printcnt">'+rows.length+'</span>장 출력'; _pb.onclick=function(){modDoPrint();}; } };
    var _useBmp=false, _useRaw=false; try{ _useBmp=(localStorage.getItem('_mlBitmap')==='1'); _useRaw=(localStorage.getItem('_mlRawShare')==='1'); }catch(e){}
    var _printFn = _useRaw ? _qzPrintLabelsRaw : (_useBmp ? _qzPrintLabelsBitmap : _qzPrintLabels);
    _printFn(def, rows, opt).then(function(ok){
      window.__mlPrinting=false; window.__mlCancel=false;
      if(ok==='cancel'){ toast('🛑 출력 취소됨'); _restoreBtn(); }
      else if(ok){ modBumpPrint(key, ids); closePopup(); }
      else { _restoreBtn(); }
    });
    return;
  }
  var labels=rows.map(function(r){return _modLabelHtml(def,r,opt);}).join('');
  var win=window.open('','_modprint','width=600,height=720');
  if(!win){ toast('팝업 차단을 해제해 주세요',true); return; }
  var css, bodyHtml;
  if(opt.mode==='a4'){
    var bd=opt.border?'.mlabel{border:1px dashed #bbb}':'';
    var pw=opt.sheetW||210, ph=opt.sheetH||297;
    css='@page{size:'+pw+'mm '+ph+'mm;margin:'+opt.sheetMargin+'mm}html,body{margin:0;padding:0}'
      +'.sheet{display:flex;flex-wrap:wrap;align-content:flex-start;gap:'+opt.gap+'mm}'
      +'.mlabel{box-sizing:border-box;break-inside:avoid;page-break-inside:avoid}'+bd
      +'@media screen{body{background:#e2e8f0;padding:10px}.sheet{background:#fff;width:'+pw+'mm;margin:0 auto;padding:'+opt.sheetMargin+'mm;box-sizing:border-box;box-shadow:0 1px 6px rgba(0,0,0,.2)}}';
    bodyHtml='<div class="sheet">'+labels+'</div>';
  } else {
    var _rot=false; try{ _rot=(localStorage.getItem('_mlRotate')==='1'); }catch(e){}
    if(_rot){
      // 프린터가 용지를 세로(높이=w)로 인식 → 페이지는 30x100, 내용은 90도 회전해 가로로 보이게
      css='@page{size:'+opt.h+'mm '+opt.w+'mm;margin:0}html,body{margin:0;padding:0}'
        +'.mlabel{page-break-after:always;width:'+opt.w+'mm;height:'+opt.h+'mm;overflow:hidden;transform:rotate(-90deg);transform-origin:top left;position:relative;top:'+opt.w+'mm}'
        +'@media screen{body{background:#e2e8f0;padding:10px}}';
    } else {
      css='@page{size:'+opt.w+'mm '+opt.h+'mm;margin:0}html,body{margin:0;padding:0;width:'+opt.w+'mm}'
        +'.mlabel{page-break-after:always;width:'+opt.w+'mm;height:'+opt.h+'mm;overflow:hidden}'
        +'@media screen{body{background:#e2e8f0;padding:10px}.mlabel{background:#fff;margin:0 auto 8px;box-shadow:0 1px 4px rgba(0,0,0,.2)}}';
    }
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
  fbDb.ref(path).set(data).then(function(){ toast('🖨 '+ids.length+'장 발급'+(actor?' · '+actor:'')); _modLogAdd(key,'발급',(ids.length===1?ids[0]:''),(ids.length>1?'('+ids.length+'장)':_modRowDesc(_modDefs[key]||{},data.filter(function(r){return r._id===ids[0]})[0]||{})),'라벨 발급'); }).catch(function(e){toast('발급 기록 저장 실패: '+(e.message||e),true)});
}

// 📋 처리 로그 조회 (super 전용)
function popModLog(key, rowId){
  if(typeof isSuper==='function' && !isSuper()) return toast('super 관리자만 볼 수 있습니다',true);
  var def=_modDefs[key]; if(!def) return;
  var base=_modLogBase(key);
  if(!base) return toast('로그 위치를 찾을 수 없습니다 (행사를 선택하세요)',true);
  var oneName='';
  if(rowId){ var rr=(_modData[key]||[]).filter(function(r){return r._id===rowId;})[0]; if(rr) oneName=_modRowTitle(def,rr); }
  showLoading('로그 불러오는 중...');
  fbDb.ref(base).once('value').then(function(s){
    hideLoading();
    var obj=s.val()||{};
    var arr=Object.keys(obj).map(function(k){return obj[k];}).filter(function(l){return l&&l.modKey===key&&(!rowId||l.rowId===rowId);});
    arr.sort(function(a,b){return String(b.t||'').localeCompare(String(a.t||''));});
    var h='<div class="pop-head"><h3>📋 '+esc(def.label)+(rowId?(' — '+esc(oneName)):'')+' 처리 로그 <span style="font-size:11px;color:#94a3b8;font-weight:400">('+arr.length+'건'+(rowId?'':' · super 전용')+')</span></h3></div>';
    h+='<div style="padding:14px;max-height:75vh;overflow:auto">';
    if(!arr.length){
      h+='<div style="text-align:center;color:#94a3b8;padding:30px">기록된 로그가 없습니다</div>';
    } else {
      h+='<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr style="background:#f1f5f9;position:sticky;top:0">';
      h+='<th style="padding:6px 8px;text-align:left">일시</th><th style="padding:6px 8px;text-align:left">처리자</th><th style="padding:6px 8px;text-align:left">동작</th><th style="padding:6px 8px;text-align:left">대상</th></tr></thead><tbody>';
      arr.forEach(function(l){
        var dt=_modFmtDateTime(l.t);
        var actColor = (l.act==='거부'||l.act==='탈락'||l.act==='삭제')?'#dc2626':(l.act==='발급'?'#475569':'#16a34a');
        h+='<tr style="border-bottom:1px solid #f1f5f9">';
        h+='<td style="padding:5px 8px;white-space:nowrap;color:#64748b">'+esc(dt)+'</td>';
        h+='<td style="padding:5px 8px;font-weight:600;color:#0f172a">'+esc(l.byName||l.by||'-')+'</td>';
        h+='<td style="padding:5px 8px"><b style="color:'+actColor+'">'+esc(l.act||'')+'</b>'+(l.detail?' <span style="color:#94a3b8;font-size:11px">'+esc(l.detail)+'</span>':'')+'</td>';
        h+='<td style="padding:5px 8px;white-space:nowrap">'+esc(l.rowTitle||'')+'</td></tr>';
      });
      h+='</tbody></table></div>';
    }
    h+='<div style="text-align:right;margin-top:12px"><button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">닫기</button></div></div>';
    openPopup(h,820);
  }).catch(function(e){ hideLoading(); toast('로그 조회 실패: '+(e.message||e),true); });
}

// ═══════════════════════════════════════════
// QZ Tray — 라벨 프린터 직접 출력 (브라우저 인쇄로 규격 인식 안 될 때)
// 인증서/키는 푸드트럭 POS와 동일 (BulpanPOS 자체서명) → 같은 PC면 그대로 동작
// ═══════════════════════════════════════════
var _qzConnected=false;
function _qzCert(){
  var cert='-----BEGIN CERTIFICATE-----\n'+
'MIIDjTCCAnWgAwIBAgIUIDgYFxPIVJuODn57VyiuyyCuNXEwDQYJKoZIhvcNAQEN\n'+
'BQAwVTESMBAGA1UEAwwJQnVscGFuUE9TMRIwEAYDVQQKDAlCdWxwYW5QT1MxDjAM\n'+
'BgNVBAcMBVNlb3VsMQ4wDAYDVQQIDAVTZW91bDELMAkGA1UEBhMCS1IwIBcNMjYw\n'+
'NDAzMDQ1NzE1WhgPMjA1NzA5MjYwNDU3MTVaMFUxEjAQBgNVBAMMCUJ1bHBhblBP\n'+
'UzESMBAGA1UECgwJQnVscGFuUE9TMQ4wDAYDVQQHDAVTZW91bDEOMAwGA1UECAwF\n'+
'U2VvdWwxCzAJBgNVBAYTAktSMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC\n'+
'AQEAsh36NLKUNwTfmd72E0H1ZeqLoEU7DGs7W/Gi/PzuwZkQ444Alr/PAQUwB/Zb\n'+
'NeLiaZJBQ5ZD815HewmogHq6aej610UlsjOOnVFcW918kQ43bNTdD7krOT7FCj9M\n'+
'9DU1aPjs+fSb6Sj3Xeb7h18mwGtmSNPjYCavREpsoQmmRG2UxeXJyk48CtgdqUOA\n'+
'MlpFTkug71AWi+gOOiJyqeu5HNLbAp/oI4g46W4o9Rf8PI4ZL6d0VN0c6vClKltI\n'+
'shO0QSHJ2F0ebLKzIpXdR8G2+vrSl5ZmS2cjTZV+lZDWJVAM+ryUEWUS0nx40kCV\n'+
'G7N3sQoqnxv8c/nKtnFGfMFR+wIDAQABo1MwUTAdBgNVHQ4EFgQUiT9IwnM9yFXp\n'+
'H6sLN82+XzxEGiAwHwYDVR0jBBgwFoAUiT9IwnM9yFXpH6sLN82+XzxEGiAwDwYD\n'+
'VR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQ0FAAOCAQEACTTCO0ymBOwYMDVQYs+Z\n'+
'd1ltfNWoY6boN7uyk0g3nyaISHmcDrnTkXKvuwWOX3Dxw2zJm2IzqqqEXIOayElG\n'+
'mFSMD3a/jqsJB0cligBv+NrsLqy2HEpL6Eh8nRIMeIpWktV/KbuC/9qzsv9Gcc36\n'+
'42adQlr7rptyr4mC6CIStXZI7GoP6l58m23oc7GoFBUF3XOWH5kOCD2hcl50ACyo\n'+
'MPzVD8v3vWBJ/Yfwg0u9rEZZmEBuxkgdoTGuXuJ88cjo/W6z9wFCsoveli3v8zPv\n'+
'uH5HWvG8tILLUTfaKXVwOCJ8icXEBdcoCMjLN41/6zSMXCwM5nZs94nABJ55zyGH\n'+
'iw==\n'+
'-----END CERTIFICATE-----';
  var key='-----BEGIN PRIVATE KEY-----\n'+
'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCyHfo0spQ3BN+Z\n'+
'3vYTQfVl6ougRTsMaztb8aL8/O7BmRDjjgCWv88BBTAH9ls14uJpkkFDlkPzXkd7\n'+
'CaiAerpp6PrXRSWyM46dUVxb3XyRDjds1N0PuSs5PsUKP0z0NTVo+Oz59JvpKPdd\n'+
'5vuHXybAa2ZI0+NgJq9ESmyhCaZEbZTF5cnKTjwK2B2pQ4AyWkVOS6DvUBaL6A46\n'+
'InKp67kc0tsCn+gjiDjpbij1F/w8jhkvp3RU3Rzq8KUqW0iyE7RBIcnYXR5ssrMi\n'+
'ld1Hwbb6+tKXlmZLZyNNlX6VkNYlUAz6vJQRZRLSfHjSQJUbs3exCiqfG/xz+cq2\n'+
'cUZ8wVH7AgMBAAECggEACCLfFgnTmWZ17FUcpSk4fiJQ+c46cfPIBLLXViUbpujz\n'+
'YOGmBzzVxjR9dYT8X6FwjuVTvomeVanzK/H3VNRxBXt9/IK3w8R1JEczfS1zOOZk\n'+
'WRVUJRlj7xEooQeJNV06MQRbQYO58imhOxSHstmsLyf4xno0rboL/DDwy15hzkhQ\n'+
'3SFU9SsiE4wj1hngCGsG2uHET5Rm2nfqrelU9V7Jge40bnKAmQ2WaHJEWbI+K+JC\n'+
'ilN5bqdMmOZgw8wV/CUcit++btw+u0GDaVfQJr3vUWI/c/m7gfS0GJwssHr63dnQ\n'+
'5329jrP1WDaYdfOrHYd8Vvw94Ii/FIUUCJmG1L3OOQKBgQDuvFqzNyxiIM7+v3/C\n'+
'RmUfR3LmsHotv5U7dfL1iG2cEgW3byDw45GAvbR5eBZWY4JSKZDaM3SBgArim+QT\n'+
'eC8a14XoyrqtZC7nqDBXfSIB/B1xEw0MJ7lO4I0pzwcds8EOasZBudRzZxmM0/Y0\n'+
'xn/JHsMrE8HGlZ8cnsTzsPiCLQKBgQC+/2hOFmNkEy2ET91FQ9xay+5ueqJkmtSm\n'+
'MyctM2pQLNT5rPTM0OTWCm5kx+T0ezNOOmScg5Kv3epvVic+GY97kcajZzHwsO19\n'+
'ao6rZg1b8smVjE1sLlJaoJpOZDmtp6Fmm0B8jEhqnT8BYcoDpbupAE/9K0umJ20w\n'+
'cXF7RzZFxwKBgQCkHR9Mq9T68Arb3ND6wGGrivZV12NmJ5ly8rY+S7bt3wXG/8Hp\n'+
'VscjdUWnawIQCQABc0l8dnrUuyzAcuHq8GeRUC9hxFtn7sK/xULWIdNLAgFLRglm\n'+
'HbipnHvuDb+aj4NbYdNAQ3rkii9qPBu4U+xsWZVY+4/t79UdW5eQ3ks3UQKBgE/1\n'+
'RIlMPherH6cAeDWDD0DDlvGRTWKontVlHMWDfMJLwm0zxtfnq6UfgM+YD3V6DiR1\n'+
'taEAQ+x0DqzFeHA66yJkCLBnhzSoHQQgE9IVSwpvPYzpy4+6ZKekDHU86BiW0K7P\n'+
'19NMNxTK95Fwis20GDfL9bCa63SHlOJu238sdMAJAoGAP0Pc/lVsEqWAB5eMrTnO\n'+
'RL10MwSfQYsAyK7EohO3aPcAwXLW/cJWm1r6Fy0tOkbjv792HlkdB2LL0LD+v1G/\n'+
'rdhA1fLYjz6NIe0gxMNdiiiSRTHhwiz3BXAFmACAy0oF/g2DQLIEaJY4OSjUFzUc\n'+
'3CL6B/oxq483iesPrr51bKI=\n'+
'-----END PRIVATE KEY-----';
  return {cert:cert,key:key};
}
function _qzPrinterName(){ try{ return localStorage.getItem('modQzPrinter')||''; }catch(e){ return ''; } }
function _qzSetPrinter(n){ try{ localStorage.setItem('modQzPrinter',n||''); }catch(e){} _qzUpdateUI(); }
function qzIsReady(){ return _qzConnected && typeof qz!=='undefined' && qz.websocket && qz.websocket.isActive() && !!_qzPrinterName(); }

function qzConnect(){
  if(typeof qz==='undefined'){ toast('QZ 라이브러리 로딩 안됨 — 새로고침 후 재시도',true); return; }
  if(qz.websocket.isActive()){ _qzConnected=true; _qzUpdateUI(); _qzScan(); return; }
  var ck=_qzCert();
  qz.security.setCertificatePromise(function(resolve){ resolve(ck.cert); });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise(function(toSign){
    return function(resolve,reject){
      try{
        var pk=KEYUTIL.getKey(ck.key);
        var sig=new KJUR.crypto.Signature({alg:'SHA512withRSA'});
        sig.init(pk); sig.updateString(toSign);
        resolve(stob64(hextorstr(sig.sign())));
      }catch(err){ reject(err); }
    };
  });
  toast('QZ Tray 연결 중...');
  qz.websocket.connect({retries:3,delay:1}).then(function(){
    _qzConnected=true; toast('✅ QZ Tray 연결됨'); _qzUpdateUI(); _qzScan();
  }).catch(function(e){
    _qzConnected=false; _qzUpdateUI();
    var m=e.message||String(e);
    if(/establish|refused/i.test(m)) m='QZ Tray 프로그램이 실행 중인지 확인하세요';
    else if(/cert|sign|trust/i.test(m)) m='인증서 설치 필요 (아래 「인증서 다운로드」 → QZ Tray에 설치)';
    toast('QZ 연결 실패: '+m,true);
  });
}
function qzDisconnect(){
  try{ if(typeof qz!=='undefined'&&qz.websocket.isActive()) qz.websocket.disconnect(); }catch(e){}
  _qzConnected=false; _qzUpdateUI();
}
function _qzScan(){
  if(typeof qz==='undefined'||!qz.websocket.isActive()) return;
  qz.printers.find().then(function(ps){ window.__qzPrinters=ps||[]; _qzUpdateUI(); })
    .catch(function(e){ toast('프린터 목록 오류: '+(e.message||e),true); });
}
function _qzDownloadCert(){
  var c=_qzCert().cert;
  var blob=new Blob([c],{type:'application/x-pem-file'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='override.crt'; a.click();
  toast('📥 override.crt 다운로드됨 — QZ Tray 설정 폴더(%APPDATA%\\qz)에 복사 후 재시작');
}
// 인증서 자동 설치 .bat — 더블클릭하면 %APPDATA%\qz\override.crt 에 자동 설치
function _qzInstallCert(){
  var cert=_qzCert().cert;
  var certB64=btoa(cert);  // cert는 ASCII(PEM)이라 인코딩 안전
  // PowerShell 메시지는 전부 영어 → 콘솔 한글 인코딩 깨짐 원천 차단
  var ps1='$cert=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("'+certB64+'"));'
    +'$paths=@("$env:APPDATA\\qz\\override.crt","$env:PROGRAMDATA\\QZ Tray\\override.crt","$env:PROGRAMDATA\\qz\\override.crt","$env:USERPROFILE\\.qz\\override.crt","$env:ProgramFiles\\QZ Tray\\auth\\override.crt","$env:ProgramFiles\\QZ Tray\\override.crt","${env:ProgramFiles(x86)}\\QZ Tray\\auth\\override.crt","${env:ProgramFiles(x86)}\\QZ Tray\\override.crt");'
    +'$ok=0;foreach($p in $paths){try{$dir=Split-Path $p;if(!(Test-Path $dir)){New-Item -ItemType Directory -Force -Path $dir|Out-Null};[IO.File]::WriteAllText($p,$cert);$ok++;Write-Host ("[OK] "+$p) -F Green}catch{Write-Host ("[skip] "+$p) -F DarkGray}};'
    +'Write-Host "";Write-Host ("Installed at "+$ok+" location(s). Now RESTART QZ Tray.") -F Yellow;'
    +'Read-Host "Press Enter to close"';
  var u16='';
  for(var i=0;i<ps1.length;i++){ var ch=ps1.charCodeAt(i); u16+=String.fromCharCode(ch&0xff)+String.fromCharCode((ch>>8)&0xff); }
  var encoded=btoa(u16);  // UTF-16LE base64 = PowerShell -EncodedCommand 형식 (한글 없음)
  // 관리자 권한 자동 상승(Program Files 쓰기) + 8곳 설치
  var bat='@echo off\r\n'
    +'net session >nul 2>&1\r\n'
    +'if %errorlevel% neq 0 ( powershell -Command "Start-Process -FilePath \'%~f0\' -Verb RunAs" & exit /b )\r\n'
    +'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand '+encoded+'\r\n';
  var blob=new Blob([bat],{type:'application/bat'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='install_qz_cert.bat'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },1500);
  toast('📥 install_qz_cert.bat 다운로드 → 더블클릭 → "관리자 권한 예" → 8곳 설치 후 QZ Tray 재시작',true);
}
function _qzRawTest(mode){
  var pn=_qzPrinterName();
  if(!qzIsReady()){toast('QZ 프린터를 먼저 연결·선택하세요',true);return;}
  var data;
  if(mode==='epl'){
    data=[
      'N',
      'q812',
      'Q240,24',
      'A50,30,0,4,1,1,N,"EPL TEST OK"',
      'A50,90,0,3,1,1,N,"EPL WORKING"',
      'P1',
      ''
    ].join('\n');
  } else if(mode==='zpl'){
    data=[
      '^XA',
      '^PW812',
      '^LL240',
      '^FO50,30^A0N,40,40^FDZPL TEST OK^FS',
      '^FO50,90^A0N,30,30^FDZPL WORKING^FS',
      '^XZ'
    ].join('\n');
  } else {
    data=[
      'SIZE 100 mm, 30 mm',
      'GAP 2 mm, 0 mm',
      'DIRECTION 1',
      'CLS',
      'TEXT 50,30,"4",0,1,1,"TSPL TEST OK"',
      'TEXT 50,90,"3",0,1,1,"TSPL WORKING"',
      'PRINT 1'
    ].join('\r\n')+'\r\n';
  }
  console.log('[RAW TEST] mode='+(mode||'tspl')+', printer='+pn);
  var cfg=qz.configs.create(pn);
  qz.print(cfg,[{type:'raw',format:'plain',data:data}])
    .then(function(){toast('RAW('+(mode||'tspl')+') 전송 완료');console.log('전송OK');})
    .catch(function(e){toast('RAW 실패: '+e,true);console.error('RAW err',e);});
}
function _qzKorTest(enc){
  var pn=_qzPrinterName();
  if(!qzIsReady()){toast('QZ 프린터를 먼저 연결·선택하세요',true);return;}
  var tspl=[
    'SIZE 100 mm, 30 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CODEPAGE 949',
    'CLS',
    'TEXT 50,30,"TSS24.BF2",0,1,1,"한글테스트 차량번호"',
    'TEXT 50,90,"4",0,1,1,"123가4567"',
    'PRINT 1'
  ].join('\r\n')+'\r\n';
  console.log('[KOR TEST] enc='+(enc||'euc-kr'));
  var cfg=qz.configs.create(pn);
  qz.print(cfg,[{type:'raw',format:'plain',data:tspl,options:{encoding:enc||'EUC-KR'}}])
    .then(function(){toast('한글 테스트 전송 완료');})
    .catch(function(e){toast('한글 실패: '+e,true);console.error(e);});
}
// ===== RAW 비트맵 라벨 출력 (드라이버 무관, 프린터 GAP 직접 감지) =====
function _bytesToBase64(bytes){
  var bin='',chunk=0x8000;
  for(var i=0;i<bytes.length;i+=chunk){ bin+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length))); }
  return btoa(bin);
}
// 캔버스를 순흑/순백 1비트로 변환(선명·진하게) → 새 캔버스 반환
function _canvasToMonoCanvas(canvas, threshold){
  threshold=threshold||160;
  var w=canvas.width,h=canvas.height;
  var ctx=canvas.getContext('2d');
  var im=ctx.getImageData(0,0,w,h), d=im.data;
  for(var p=0;p<d.length;p+=4){
    var a=d[p+3];
    var lum = a<128 ? 255 : (0.299*d[p]+0.587*d[p+1]+0.114*d[p+2]);
    var v = lum<threshold ? 0 : 255;
    d[p]=d[p+1]=d[p+2]=v; d[p+3]=255;
  }
  var c2=document.createElement('canvas'); c2.width=w; c2.height=h;
  c2.getContext('2d').putImageData(im,0,0);
  return c2;
}
function _canvasToTSPL(canvas, threshold){
  threshold=threshold||150;
  var w=canvas.width,h=canvas.height,wbytes=Math.ceil(w/8);
  var img=canvas.getContext('2d').getImageData(0,0,w,h).data;
  var bytes=new Uint8Array(wbytes*h);
  for(var i=0;i<bytes.length;i++) bytes[i]=0xFF; // 0xFF=흰색(bit1)
  for(var y=0;y<h;y++){
    for(var x=0;x<w;x++){
      var idx=(y*w+x)*4, a=img[idx+3];
      var lum = a<128 ? 255 : (0.299*img[idx]+0.587*img[idx+1]+0.114*img[idx+2]);
      if(lum<threshold){ bytes[y*wbytes+(x>>3)] &= ~(0x80>>(x&7)); } // 검정=bit0
    }
  }
  return {bytes:bytes,wbytes:wbytes,h:h};
}
async function _labelToCanvas(innerHtml, wmm, hmm, dpi){
  dpi=dpi||203;
  var targetW=Math.round(wmm*dpi/25.4), targetH=Math.round(hmm*dpi/25.4);
  var host=document.createElement('div');
  host.style.cssText='position:fixed;left:-99999px;top:0;background:#fff;z-index:-1';
  host.innerHTML='<div id="_bmpwrap" style="width:'+wmm+'mm;height:'+hmm+'mm;background:#fff;overflow:hidden">'+innerHtml+'</div>';
  document.body.appendChild(host);
  // QR 원격이미지 → 로컬 데이터URL 교체 (CORS taint 방지)
  var imgs=host.querySelectorAll('img');
  for(var i=0;i<imgs.length;i++){
    var src=imgs[i].getAttribute('src')||'';
    if(/qrserver|api\.qr/.test(src) && typeof qrcode!=='undefined'){
      var m=src.match(/[?&]data=([^&]+)/);
      if(m){ try{ var d=decodeURIComponent(m[1]); var qr=qrcode(0,'M'); qr.addData(d); qr.make(); imgs[i].src=qr.createDataURL(6,0); }catch(e){} }
    }
  }
  await Promise.all(Array.prototype.map.call(host.querySelectorAll('img'),function(im){
    return new Promise(function(res){ if(im.complete&&im.naturalWidth) res(); else { im.onload=res; im.onerror=res; setTimeout(res,2000); } });
  }));
  var cssW=wmm*96/25.4, cssH=hmm*96/25.4;
  var canvas=await html2canvas(host.querySelector('#_bmpwrap'),{backgroundColor:'#fff',scale:targetW/cssW,width:cssW,height:cssH,useCORS:true,logging:false});
  document.body.removeChild(host);
  var c2=document.createElement('canvas'); c2.width=targetW; c2.height=targetH;
  var ctx=c2.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,targetW,targetH);
  ctx.drawImage(canvas,0,0,targetW,targetH);
  return c2;
}
async function _qzBmpTest(){
  var pn=_qzPrinterName();
  if(!qzIsReady()){toast('QZ 프린터를 먼저 연결·선택하세요',true);return;}
  var html='<div style="width:100mm;height:30mm;padding:2mm 3mm;box-sizing:border-box;display:flex;gap:2mm;overflow:hidden">'
    +'<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data='+encodeURIComponent('https://test.example/abc')+'" style="width:24mm;height:24mm;flex-shrink:0">'
    +'<div style="flex:1"><div style="font-size:15pt;font-weight:800">차량번호: 154무2359</div>'
    +'<div style="font-size:13pt;font-weight:700">연락처: 010-6678-7983</div>'
    +'<div style="font-size:9pt;margin-top:1mm">단오제보존회　　성명: 강*삼</div></div></div>';
  try{
    var canvas=await _labelToCanvas(html,100,30,203);
    var bmp=_canvasToTSPL(canvas,160);
    var header='SIZE 100 mm,30 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nCLS\r\nBITMAP 0,0,'+bmp.wbytes+','+bmp.h+',0,';
    var cfg=qz.configs.create(pn);
    await qz.print(cfg,[
      {type:'raw',format:'plain',data:header},
      {type:'raw',format:'base64',data:_bytesToBase64(bmp.bytes)},
      {type:'raw',format:'plain',data:'\r\nPRINT 1\r\n'}
    ]);
    toast('🖨 비트맵 테스트 출력 완료');
  }catch(e){ toast('비트맵 테스트 실패: '+(e.message||e),true); console.error(e); }
}
async function _qzPrintLabelsBitmap(def, rows, opt){
  var pn=_qzPrinterName();
  if(!qzIsReady()){ toast('QZ 프린터를 먼저 연결·선택하세요',true); return false; }
  if(typeof html2canvas==='undefined'){ toast('이미지 라이브러리 로딩중',true); return false; }
  var wmm=opt.w, hmm=opt.h;
  // 선명한 1비트 비트맵을 드라이버 경로(pixel image)로 묶어 전송
  // → 비트맵 선명함 + 드라이버 gap처리(밀림 없음) + 한 작업 묶음(빠름, 백피드 최소)
  var cfg=qz.configs.create(pn,{colorType:'blackwhite',margins:0,units:'mm',jobName:'LABEL-'+def.key,size:{width:wmm,height:hmm}});
  try{
    var data=[];
    for(var i=0;i<rows.length;i++){
      if(window.__mlCancel) return 'cancel';
      _mlPrintProg(i,rows.length);
      var canvas=await _labelToCanvas(_modLabelHtml(def,rows[i],opt),wmm,hmm,203);
      // 순백/순흑 1비트화 → 선명하고 진하게
      var bw=_canvasToMonoCanvas(canvas,160);
      data.push({type:'pixel',format:'image',flavor:'base64',data:bw.toDataURL('image/png').split(',')[1],options:{pageWidth:wmm,pageHeight:hmm}});
    }
    if(window.__mlCancel) return 'cancel';
    _mlPrintProg(rows.length,rows.length,true);
    return qz.print(cfg,data).then(function(){ toast('🖨 비트맵 '+rows.length+'장 출력'); return true; })
      .catch(function(e){ toast('비트맵 출력 실패: '+(e.message||e),true); return false; });
  }catch(e){ toast('비트맵 실패: '+(e.message||e),true); console.error(e); return false; }
}
// 공유 프린터용 RAW: 드라이버/스풀러 우회 → TSPL 직접 전송(passthrough, 갭신호 안 뭉개짐)
// 전제: 프린터 갭센서 캘리브레이션 됨(전원ON+FEED). SIZE/GAP 1회 + 라벨마다 CLS/BITMAP/PRINT
async function _qzPrintLabelsRaw(def, rows, opt){
  var pn=_qzPrinterName();
  if(!qzIsReady()){ toast('QZ 프린터를 먼저 연결·선택하세요',true); return false; }
  if(typeof html2canvas==='undefined'){ toast('이미지 라이브러리 로딩중',true); return false; }
  var wmm=opt.w, hmm=opt.h, gap=(opt.gap!=null?opt.gap:2);
  var adj=0; try{ adj=parseFloat(localStorage.getItem('_mlSizeAdj')||'0')||0; }catch(e){}
  var sizeH=hmm+adj;
  var cfg=qz.configs.create(pn);
  try{
    // 전체 TSPL(텍스트+바이너리 비트맵)을 하나의 통짜 바이트로 묶음 → 공유 스풀러에서 안 쪼개짐
    function strBytes(s){ var a=new Uint8Array(s.length); for(var j=0;j<s.length;j++) a[j]=s.charCodeAt(j)&0xff; return a; }
    var parts=[];
    parts.push(strBytes('SIZE '+wmm+' mm,'+sizeH+' mm\r\nGAP '+gap+' mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nSET TEAR OFF\r\n'));
    for(var i=0;i<rows.length;i++){
      if(window.__mlCancel) return 'cancel';
      _mlPrintProg(i,rows.length);
      var canvas=await _labelToCanvas(_modLabelHtml(def,rows[i],opt),wmm,hmm,203);
      var bmp=_canvasToTSPL(canvas,160);
      parts.push(strBytes('CLS\r\nBITMAP 0,0,'+bmp.wbytes+','+bmp.h+',0,'));
      parts.push(bmp.bytes);
      parts.push(strBytes('\r\nPRINT 1\r\n'));
    }
    if(window.__mlCancel) return 'cancel';
    _mlPrintProg(rows.length,rows.length,true);
    var total=0; parts.forEach(function(p){ total+=p.length; });
    var all=new Uint8Array(total), off=0;
    parts.forEach(function(p){ all.set(p,off); off+=p.length; });
    return qz.print(cfg,[{type:'raw',format:'base64',data:_bytesToBase64(all)}]).then(function(){ toast('🖨 공유RAW '+rows.length+'장 출력'); return true; })
      .catch(function(e){ toast('공유RAW 실패: '+(e.message||e),true); return false; });
  }catch(e){ toast('공유RAW 실패: '+(e.message||e),true); console.error(e); return false; }
}
function _qzPrintLabels(def, rows, opt){
  var pn=_qzPrinterName();
  if(!qzIsReady()){ toast('QZ 프린터를 먼저 연결·선택하세요',true); return Promise.resolve(false); }
  var w=opt.w, h=opt.h;
  var cfg=qz.configs.create(pn,{colorType:'blackwhite',margins:0,units:'mm',jobName:'LABEL-'+def.key,size:{width:w,height:h||null}});
  if(window.__mlCancel) return Promise.resolve('cancel');
  // 모든 라벨을 한 작업으로 묶어 전송 → 장마다 백피드 없이 연속 출력(빠름)
  var data=rows.map(function(r){
    var html='<div style="margin:0;padding:0">'+_modLabelHtml(def,r,opt)+'</div>';
    return {type:'pixel',format:'html',flavor:'plain',data:html,options:{pageWidth:w,pageHeight:h||null}};
  });
  _mlPrintProg(rows.length,rows.length,true);
  return qz.print(cfg,data).then(function(){ toast('🖨 QZ로 '+rows.length+'장 출력'); return true; })
    .catch(function(e){ toast('QZ 출력 실패: '+(e.message||e),true); return false; });
}
// 출력 진행률 표시 / 취소
function _mlPrintProg(done,total,sending){
  var e=document.getElementById('ml_prog'); if(!e) return;
  e.textContent = sending ? (total+'/'+total+' 전송…') : ('생성중 '+done+'/'+total);
}
function _mlCancelPrint(){
  window.__mlCancel=true;
  var pb=document.getElementById('ml_printbtn');
  if(pb){ pb.disabled=true; pb.style.opacity='0.6'; pb.innerHTML='취소 중…'; }
  toast('출력 취소 중…');
}
function _qzToggleBitmap(on){ try{ localStorage.setItem('_mlBitmap', on?'1':'0'); if(on) localStorage.setItem('_mlRawShare','0'); }catch(e){} _qzUpdateUI(); toast(on?'비트맵(선명) 모드 ON':'일반 모드',false); }
// 프린터 인쇄 기본 설정 창 여는 .bat 다운로드 (용지 100x30 설정용)
function _qzOpenPrinterSettings(){
  var pn=_qzPrinterName();
  if(!pn){ toast('먼저 프린터를 선택하세요',true); return; }
  var bat='@echo off\r\nrundll32 printui.dll,PrintUIEntry /e /n "'+pn.replace(/"/g,'')+'"\r\n';
  var blob=new Blob([bat],{type:'application/bat'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='프린터설정_'+pn.replace(/[\\\/:*?"<>|]/g,'_')+'.bat'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },1500);
  toast('📥 .bat 다운로드 → 더블클릭하면 프린터 설정 창이 열려요 (용지 100x30으로 변경)',true);
}
function _qzToggleRawShare(on){ try{ localStorage.setItem('_mlRawShare', on?'1':'0'); if(on) localStorage.setItem('_mlBitmap','0'); }catch(e){} _qzUpdateUI(); toast(on?'공유RAW 모드 ON (드라이버 우회 · 프린터 캘리브레이션 필요)':'일반 모드',false); }
function _qzAdjSize(d){ var v=0; try{ v=parseFloat(localStorage.getItem('_mlSizeAdj')||'0')||0; }catch(e){} v=Math.round((v+d)*100)/100; try{ localStorage.setItem('_mlSizeAdj', String(v)); }catch(e){} _qzUpdateUI(); toast('라벨길이 보정: '+(v>0?'+':'')+v.toFixed(2)+'mm',false); }
function _qzAdjBmpDelay(d){ var v=1500; try{ var s=localStorage.getItem('_mlBmpDelay'); if(s!=null&&s!=='') v=parseInt(s,10)||0; }catch(e){} v=Math.max(0,Math.min(5000,v+d)); try{ localStorage.setItem('_mlBmpDelay', String(v)); }catch(e){} _qzUpdateUI(); toast('장 간격: '+(v/1000).toFixed(1)+'초',false); }
function _qzToggleBrowserPrint(on){ try{ localStorage.setItem('_mlBrowserPrint', on?'1':'0'); }catch(e){} _qzUpdateUI(); toast(on?'브라우저 인쇄 모드 ON (Excel 메일머지식)':'QZ 직접 출력 모드',false); }
function _qzToggleRotate(on){ try{ localStorage.setItem('_mlRotate', on?'1':'0'); }catch(e){} _qzUpdateUI(); toast(on?'90도 회전 ON':'회전 OFF',false); }
// 라벨 팝업 내 QZ 영역 갱신
function _qzUpdateUI(){
  var box=document.getElementById('ml_qz_box'); if(!box) return;
  var ready=(typeof qz!=='undefined'&&qz.websocket&&qz.websocket.isActive());
  _qzConnected=ready;
  var printers=window.__qzPrinters||[];
  var curP=_qzPrinterName();
  var h='';
  if(!ready){
    var hasLib=(typeof qz!=='undefined');
    h+='<span style="font-size:12px;color:#dc2626;font-weight:700">● QZ 미연결</span>';
    h+='<button class="btn btn-s" style="background:#6366f1;color:#fff;font-size:11px" onclick="qzConnect()">QZ Tray 연결</button>';
    h+='<a href="https://qz.io/download/" target="_blank" class="btn btn-s" style="background:#0ea5e9;color:#fff;font-size:11px;text-decoration:none" title="처음이면 QZ Tray 프로그램을 설치하세요">⬇ QZ Tray 설치</a>';
    h+='<button class="btn btn-s" style="background:#16a34a;color:#fff;font-size:11px" onclick="_qzInstallCert()" title="더블클릭하면 %APPDATA%\\qz에 인증서 자동 설치">⚙ 인증서 자동설치(.bat)</button>';
    h+='<button class="btn btn-s" style="font-size:11px;background:#64748b;color:#fff" onclick="_qzDownloadCert()" title="수동 설치용">인증서 수동(.crt)</button>';
    h+='<div style="flex-basis:100%;font-size:10px;color:#94a3b8;margin-top:4px">① QZ Tray 설치·실행 → ② <b>인증서 자동설치(.bat) 더블클릭</b> → ③ QZ Tray 재시작 → ④ 「QZ Tray 연결」'+(hasLib?'':' <b style="color:#dc2626">(QZ 라이브러리 로딩 안 됨 — 새로고침 필요)</b>')+'</div>';
  } else {
    h+='<span style="font-size:12px;color:#16a34a;font-weight:700">● QZ 연결됨</span>';
    h+='<select onchange="_qzSetPrinter(this.value)" style="padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;max-width:200px"><option value="">프린터 선택…</option>';
    printers.forEach(function(p){ h+='<option value="'+esc(p)+'"'+(p===curP?' selected':'')+'>'+esc(p)+'</option>'; });
    h+='</select>';
    h+='<button class="btn btn-s" style="font-size:11px;background:#0ea5e9;color:#fff" onclick="_qzScan()">🔄 새로고침</button>';
    h+='<button class="btn btn-s" style="font-size:11px;background:#0f766e;color:#fff" onclick="_qzOpenPrinterSettings()" title="프린터 인쇄 기본 설정 창을 여는 .bat 다운로드 → 더블클릭 (용지 100x30 설정용)">⚙ 프린터 설정 열기</button>';
    h+='<button class="btn btn-s" style="font-size:11px;background:#64748b;color:#fff" onclick="qzDisconnect()">해제</button>';
    // 공유 프린터(\\로 시작) 감지 → 용지 100x30 안내
    var _isShared=/^\\\\/.test(curP);
    if(curP){
      if(_isShared){
        h+='<div style="flex-basis:100%;font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:6px 10px;margin-top:4px;line-height:1.5">⚠️ <b>공유 프린터</b>입니다. 갭(라벨 끊김)이 안 되면 <b>⚙ 프린터 설정 열기 → 용지 100×30</b>으로 맞추세요.</div>';
      } else {
        h+='<div style="flex-basis:100%;font-size:11px;color:#15803d;margin-top:2px">✅ 직접 연결 프린터 (갭 정상 작동)</div>';
      }
    }
    var _bp=(localStorage.getItem('_mlBrowserPrint')==='1');
    h+='<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;background:'+(_bp?'#0891b2':'#e2e8f0')+';color:'+(_bp?'#fff':'#475569')+';padding:5px 9px;border-radius:6px;cursor:pointer;font-weight:700" title="Excel 메일머지처럼 브라우저 인쇄로 100x30 페이지를 라벨마다 잘라 출력(드라이버가 gap 처리)">'
      +'<input type="checkbox" '+(_bp?'checked':'')+' onchange="_qzToggleBrowserPrint(this.checked)" style="margin:0"> 🖨 브라우저 인쇄(메일머지식)</label>';
    if(_bp){
      var _rt=(localStorage.getItem('_mlRotate')==='1');
      h+='<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;background:'+(_rt?'#f59e0b':'#e2e8f0')+';color:'+(_rt?'#fff':'#475569')+';padding:5px 9px;border-radius:6px;cursor:pointer;font-weight:700" title="세로로 나오면 체크 → 내용을 90도 돌려 가로로 출력">'
        +'<input type="checkbox" '+(_rt?'checked':'')+' onchange="_qzToggleRotate(this.checked)" style="margin:0"> ↻ 90도 회전</label>';
    }
    var _bm=(localStorage.getItem('_mlBitmap')==='1');
    h+='<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;background:'+(_bm?'#7c3aed':'#e2e8f0')+';color:'+(_bm?'#fff':'#475569')+';padding:5px 9px;border-radius:6px;cursor:pointer;font-weight:700" title="선명한 1비트 비트맵을 드라이버로 출력(USB직결 컴에서 선명+빠름)">'
      +'<input type="checkbox" '+(_bm?'checked':'')+' onchange="_qzToggleBitmap(this.checked)" style="margin:0"> 비트맵(선명)</label>';
    // 공유RAW 토글 — 숨김(함수는 유지). 필요 시 아래 주석 해제
    // var _rs=(localStorage.getItem('_mlRawShare')==='1');
    // h+='<label ...><input type="checkbox" '+(_rs?'checked':'')+' onchange="_qzToggleRawShare(this.checked)"> 공유RAW</label>';
    if(_bm){
      var _adj=0; try{ _adj=parseFloat(localStorage.getItem('_mlSizeAdj')||'0')||0; }catch(e){}
      h+='<label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;background:#f1f5f9;color:#475569;padding:4px 8px;border-radius:6px" title="장마다 아래로 밀리면 + , 위로 밀리면 − 로 0.05mm씩 조절해 딱 맞추세요">'
        +'라벨길이보정 <button onclick="_qzAdjSize(-0.5)" style="border:none;background:#94a3b8;color:#fff;border-radius:4px;width:30px;height:22px;cursor:pointer;font-weight:800" title="크게 줄임">−−</button>'
        +'<button onclick="_qzAdjSize(-0.05)" style="border:none;background:#cbd5e1;border-radius:4px;width:22px;height:22px;cursor:pointer;font-weight:800">−</button>'
        +'<b style="min-width:54px;text-align:center">'+(_adj>0?'+':'')+_adj.toFixed(2)+'mm</b>'
        +'<button onclick="_qzAdjSize(0.05)" style="border:none;background:#cbd5e1;border-radius:4px;width:22px;height:22px;cursor:pointer;font-weight:800">+</button>'
        +'<button onclick="_qzAdjSize(0.5)" style="border:none;background:#94a3b8;color:#fff;border-radius:4px;width:30px;height:22px;cursor:pointer;font-weight:800" title="크게 늘림">++</button></label>';
    }
  }
  box.innerHTML=h;
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
  var allCols=(def.columns||[]).filter(function(c){return c.key!=='status'&&!c.hideTable&&c.type!=='file'&&c.type!=='consent'});
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
  h+='<div><button class="btn" style="background:#64748b;color:#fff" onclick="closePopup()">취소</button> <button class="btn btn-b" style="background:#6366f1;color:#fff;font-weight:700" onclick="_mllSave()">💾 저장</button></div>';
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
  var _titleText=_modMaskVal(String(titleV),tp);
  items.push({id:'_title',label:'제목',text:_titleText,x:tp.x,y:tp.y,fs:tp.fs||14,bold:true,mode:(tp.mode||(tp.wrap?'wrap':'line')),w:tp.w,align:tp.align,vert:tp.vert,color:'#6366f1'});
  L.cols.forEach(function(c){
    if(c.key===L.opt.titleKey) return;
    var fp=pos[c.key]||{x:4,y:20,fs:7.5};
    ci=(ci+1)%colors.length;
    var v=_modMaskVal(row[c.key]||'샘플',fp);
    var sepC=fp.brk?((fp.colon?':':'')+'\n'):(fp.colon?': ':' ');
    items.push({id:c.key,label:c.label,text:c.label+sepC+v,x:fp.x,y:fp.y,fs:fp.fs||7.5,bold:fp.bold,mode:(fp.mode||(fp.wrap?'wrap':'line')),w:fp.w,align:fp.align,vert:fp.vert,color:colors[ci]});
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
      var _vt=!!it.vert;
      var bw=(it.w>0?it.w:(100-((_vt?it.y:it.x)||0)));
      var bwpx=bw/100*cW, bhpx=bw/100*cH;
      var _dimPx=_vt?('height:'+bhpx+'px'):('width:'+bwpx+'px');
      var box;
      if(it.mode==='fit'){
        var lenmm=bw/100*(_vt?L.opt.h:L.opt.w); var n=(String(it.text).length)||1;
        fsPx=Math.min(it.fs, Math.max(4, lenmm*2.83/n*1.7))*SCALE*0.35;
        box=_dimPx+';white-space:nowrap;overflow:hidden;'+(it.align?'text-align:'+it.align+';':'');
      } else if(it.mode==='wrap'){
        box=_dimPx+';white-space:pre-line;word-break:keep-all;'+(it.align?'text-align:'+it.align+';':'');
      } else {
        box=(it.align?_dimPx+';white-space:pre;overflow:hidden;text-align:'+it.align+';':'white-space:pre;');
      }
      if(it.vert) box='writing-mode:vertical-rl;text-orientation:upright;'+box;
      html+='<div class="mll_el" data-id="'+it.id+'" style="position:absolute;left:'+left+'px;top:'+top+'px;border:1.5px dashed '+it.color+';border-radius:3px;padding:2px 4px;font-size:'+fsPx+'px;'+(it.bold?'font-weight:800;':'')+'color:'+it.color+';cursor:move;background:rgba(255,255,255,.85);box-sizing:border-box;'+box+'">'+esc(it.text)+'</div>';
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
    // 텍스트 처리 방식 (한 줄 / 줄바꿈 / 박스맞춤)
    var bs=function(on){return 'padding:5px 7px;border:1px solid '+(on?'#4338ca':'#94a3b8')+';border-radius:5px;background:'+(on?'#6366f1':'#e2e8f0')+';color:'+(on?'#fff':'#334155')+';font-size:12px;cursor:pointer;font-weight:700';};
    var mode=p.mode||(p.wrap?'wrap':'line');
    var mb=function(m,lbl){return '<button onclick="_mllSetMode(\''+id+'\',\''+m+'\')" style="flex:1;'+bs(mode===m)+'">'+lbl+'</button>';};
    h+='<div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:11px;color:#94a3b8;margin-bottom:5px">텍스트 처리</div>';
    h+='<div style="display:flex;gap:4px">'+mb('line','한 줄')+mb('wrap','줄바꿈')+mb('fit','박스맞춤')+'</div>';
    if(mode==='wrap'||mode==='fit'){
      var bw=(p.w>0?p.w:(100-(p.x||0)));
      h+='<label style="display:block;margin-top:6px;font-size:12px">박스 폭 <b>'+Math.round(bw)+'%</b> '+(mode==='fit'?'<span style="color:#94a3b8;font-size:10px">(좁히면 글자 작아짐)</span>':'<span style="color:#94a3b8;font-size:10px">(좁히면 줄바꿈)</span>')+'</label>';
      h+='<input type="range" min="10" max="100" step="1" value="'+bw+'" style="width:100%" oninput="_mllSetPos(\''+id+'\',\'w\',this.value)">';
    }
    h+='<div style="margin-top:8px;font-size:11px;color:#94a3b8;margin-bottom:5px">서식</div>';
    h+='<div style="display:flex;flex-wrap:wrap;gap:4px">';
    h+='<button onclick="_mllToggle(\''+id+'\',\'bold\')" style="'+bs(p.bold)+'">B 굵게</button>';
    h+='<button onclick="_mllToggle(\''+id+'\',\'vert\')" style="'+bs(p.vert)+'">⬍ 세로쓰기</button>';
    if(id!=='_title'){ h+='<button onclick="_mllToggle(\''+id+'\',\'brk\')" style="'+bs(p.brk)+'">↵ 라벨/값</button>'; h+='<button onclick="_mllToggle(\''+id+'\',\'colon\')" style="'+bs(p.colon)+'">: 표시</button>'; }
    h+='</div>';
    h+='<div style="margin-top:6px;font-size:11px;color:#94a3b8;margin-bottom:4px">가리기 · 장식</div>';
    h+='<div style="display:flex;flex-wrap:wrap;gap:4px">';
    h+='<button onclick="_mllToggle(\''+id+'\',\'star\')" style="'+bs(p.star)+'">★ 별표</button>';
    h+='<button onclick="_mllToggle(\''+id+'\',\'maskMid\')" style="'+bs(p.maskMid)+'">정*원</button>';
    h+='<button onclick="_mllToggle(\''+id+'\',\'maskEdge\')" style="'+bs(p.maskEdge)+'">*해*</button>';
    h+='<button onclick="_mllToggle(\''+id+'\',\'maskEnd\')" style="'+bs(p.maskEnd)+'">홍길*</button>';
    h+='</div>';
    h+='<div style="display:flex;gap:4px;margin-top:5px">';
    h+='<button onclick="_mllSetAlign(\''+id+'\',\'left\')" style="flex:1;'+bs(!p.align||p.align==='left')+'">⬅ 왼쪽</button>';
    h+='<button onclick="_mllSetAlign(\''+id+'\',\'center\')" style="flex:1;'+bs(p.align==='center')+'">↔ 가운데</button>';
    h+='</div>';
  }
  el.innerHTML=h;
}
function _mllSetMode(id,m){
  var L=window.__mlLayout; if(!L) return;
  if(!L.pos[id]) L.pos[id]={};
  L.pos[id].mode=m; L.pos[id].wrap=(m==='wrap'); // 구버전 호환 필드도 갱신
  // 줄바꿈/박스맞춤은 박스 폭이 있어야 함 — 없으면 기본값(우측까지, 최대 90%)
  if((m==='wrap'||m==='fit') && !(L.pos[id].w>0)){
    L.pos[id].w=Math.max(20, Math.min(90, 100-(L.pos[id].x||0)));
  }
  _mllRender(); _mllBindEvents(); _mllShowCtrl(id);
}
function _mllToggle(id,prop){
  var L=window.__mlLayout; if(!L) return;
  if(!L.pos[id]) L.pos[id]={};
  L.pos[id][prop]=!L.pos[id][prop];
  _mllRender(); _mllBindEvents(); _mllShowCtrl(id);
}
// 가리기: 가운데(홍*동, 010-****-5678) / 끝(홍길*, 010-1234-****)
function _modMaskVal(v,fp){
  if(!v||!fp) return v;
  var s=String(v);
  if(fp.maskMid){
    // 가운데 가리기: 정*원, 010-****-9999
    if(/^\d{2,4}-\d{3,4}-\d{4}$/.test(s)){
      var ps=s.split('-'); ps[1]=ps[1].replace(/./g,'*'); s=ps.join('-');
    } else if(s.length<=2){ s=s[0]+'*';
    } else { var st=Math.ceil(s.length/3); var en=s.length-Math.ceil(s.length/3); s=s.substring(0,st)+s.substring(st,en).replace(/./g,'*')+s.substring(en); }
  }
  if(fp.maskEdge){
    // 양쪽끝 가리기: *해*, ***-1234-****
    if(/^\d{2,4}-\d{3,4}-\d{4}$/.test(s)){
      var ps=s.split('-'); ps[0]=ps[0].replace(/./g,'*'); ps[2]=ps[2].replace(/./g,'*'); s=ps.join('-');
    } else if(s.length<=2){ s='*'.repeat(s.length);
    } else { s='*'+s.substring(1,s.length-1)+'*'; }
  }
  if(fp.maskEnd){
    // 끝 가리기: 홍길*, 010-1111-****
    if(/^\d{2,4}-\d{3,4}-\d{4}$/.test(s)){
      var ps=s.split('-'); ps[2]=ps[2].replace(/./g,'*'); s=ps.join('-');
    } else if(s.length<=2){ s=s[0]+'*';
    } else { var keep=Math.ceil(s.length*0.6); s=s.substring(0,keep)+s.substring(keep).replace(/./g,'*'); }
  }
  if(fp.star) s='★ '+s+' ★';
  return s;
}
function _mllSetAlign(id,al){
  var L=window.__mlLayout; if(!L) return;
  if(!L.pos[id]) L.pos[id]={};
  L.pos[id].align=(al==='left')?'':al;  // 왼쪽=기본(없음)
  _mllRender(); _mllBindEvents(); _mllShowCtrl(id);
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
  // 📦 자산 라벨 배치 — 모듈이 아니라 자산 라벨 프리셋에 저장 (어댑터)
  if(L.opt&&L.opt.__asset){
    if(typeof _assetLayoutSave==='function') _assetLayoutSave(L.pos);
    if(window.__mllCleanup) window.__mllCleanup();
    closePopup();
    toast('자산 라벨 배치 저장됨');
    return;
  }
  var layout={mode:'free',pos:L.pos};
  _saveModLabelLayout(L.key,L.mode,layout);
  // 재오픈 시 같은 모드로 열려 이 배치가 보이도록 opt의 mode도 못박음
  try{ var o=JSON.parse(localStorage.getItem('modLabelOpt_'+L.key)||'{}'); o.mode=L.mode; localStorage.setItem('modLabelOpt_'+L.key, JSON.stringify(o)); }catch(e){}
  // 활성 프리셋이 있으면 그 프리셋의 배치도 자동 갱신 (프리셋 다시 골라도 이 배치 유지)
  var ap=window.__mlActivePreset;
  if(ap!=null){ var pr=_mlPresets(L.key); if(pr[ap]){ pr[ap].layout=layout; pr[ap].mode=L.mode; _mlSavePresets(L.key,pr); } }
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
  // 로그인 토큰 있는 우리 기기면 관리자 모드(관리자전용 컬럼·처리자 정보까지 표시)
  var _au=(typeof loadAuth==='function')?loadAuth():null;
  var _isAdminView=!!(_au && _au.id);
  var h='<div style="text-align:center;margin-bottom:14px"><div style="font-size:40px">'+(def.icon||'📋')+'</div><h2 style="color:#0f172a;margin:6px 0;font-size:19px">'+esc(def.label)+'</h2>'
    +(_isAdminView?'<div style="font-size:11px;color:#2563eb;font-weight:700;margin-top:2px">🔑 관리자 조회</div>':'<div style="margin-top:4px"><a href="javascript:void(0)" onclick="document.getElementById(\'mvLoginBox\').style.display=\'block\';this.parentElement.style.display=\'none\'" style="display:inline-block;padding:8px 16px;font-size:13px;color:#cbd5e1;text-decoration:none">🔑</a></div>')
    +'</div>';

  // 기간 정상 판정 (날짜 컬럼 2개 = 시작/종료) → 오늘이 기간 안이면 정상
  var dateCols=(def.columns||[]).filter(function(c){return c.type==='date'});
  // 컬럼에 지정된 기간 역할(periodRole) 우선, 없으면 날짜 앞 2개
  var _sc=(def.columns||[]).filter(function(c){return c.periodRole==='start';})[0];
  var _ec=(def.columns||[]).filter(function(c){return c.periodRole==='end';})[0];
  var _fromCol=_sc||dateCols[0], _toCol=_ec||dateCols[1];
  if(_fromCol&&_toCol){
    var from=row[_fromCol.key], to=row[_toCol.key];
    if(from&&to){
      var _d=new Date(), _m=_d.getMonth()+1, _dd=_d.getDate();
      var today=_d.getFullYear()+'-'+(_m<10?'0'+_m:_m)+'-'+(_dd<10?'0'+_dd:_dd); // 로컬(KST) 기준
      var bg,txt,ic,msg;
      if(today>=from && today<=to){ bg='#dcfce7';txt='#15803d';ic='✅';msg='정상 — 사용 가능'; }
      else if(today<from){ bg='#ffedd5';txt='#c2410e';ic='⛔';msg='사용불가 — 사용기간 전'; }
      else { bg='#fee2e2';txt='#b91c1c';ic='⛔';msg='사용불가 — 기간 만료'; }
      h+='<div style="background:'+bg+';color:'+txt+';border-radius:12px;padding:14px;text-align:center;font-weight:800;font-size:17px;margin-bottom:14px">'+ic+' '+msg+'<div style="font-size:12px;font-weight:600;margin-top:4px;opacity:.85">'+esc(from)+' ~ '+esc(to)+'</div></div>';
    }
  }

  // 상태 배지 + 처리자
  var statusCol=(def.columns||[]).find(function(c){return c.key==='status'&&c.type==='badge'});
  if(statusCol && row.status && statusCol.badgeMap && statusCol.badgeMap[row.status]){
    var bm=statusCol.badgeMap[row.status];
    h+='<div style="text-align:center;margin-bottom:8px"><span style="padding:6px 18px;border-radius:20px;font-size:15px;font-weight:800;background:'+(bm.bg||'#e2e8f0')+';color:'+(bm.color||'#475569')+'">'+esc(bm.label||row.status)+'</span></div>';
  }
  // 처리자 / 발행자 (회색) — 관리자(우리 기기)만 표시
  if(_isAdminView){
    var meta='';
    if(row._statusByName) meta+='<div>승인처리자: <b style="color:#475569">'+esc(row._statusByName)+'</b>'+(row._statusAt?' · '+esc(_modFmtDateTime(row._statusAt)):'')+'</div>';
    if(row._printByName) meta+='<div>라벨발행자: <b style="color:#475569">'+esc(row._printByName)+'</b>'+(row._printedAt?' · '+esc(_modFmtDateTime(row._printedAt)):'')+'</div>';
    if(meta) h+='<div style="text-align:center;font-size:11px;color:#94a3b8;margin-bottom:14px;line-height:1.7">'+meta+'</div>';
  }

  // 📱 디지털 패스 QR — 핸드폰으로 보여주면 입구에서 스캔해 통과 (라벨과 동일)
  if(!_isAdminView){
    var _passUrl=(typeof location!=='undefined')?location.href:_modViewUrl(def,row);
    var _qrImg='';
    try{ if(typeof qrcode!=='undefined'){ var _q=qrcode(0,'M'); _q.addData(_passUrl); _q.make(); _qrImg=_q.createDataURL(6,8); } }catch(e){}
    if(!_qrImg) _qrImg='https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data='+encodeURIComponent(_passUrl);
    h+='<div style="text-align:center;margin:6px 0 16px"><div style="display:inline-block;background:#fff;border:2px solid #e2e8f0;border-radius:14px;padding:12px"><img src="'+_qrImg+'" style="width:200px;height:200px;display:block"></div>'
      +'<div style="font-size:12px;color:#64748b;margin-top:8px;font-weight:600">📱 입구에서 이 QR을 보여주세요</div></div>';
  }

  h+='<table style="width:100%;border-collapse:collapse;font-size:14px">';
  (def.columns||[]).forEach(function(c){
    if(c.key==='status'||c.type==='consent'||c.hideTable) return;
    if(c.sysOnly) return; // 시스템전용 — QR 조회에 아예 안 보임
    if((c.adminOnly||c.qrAdmin) && !_isAdminView) return; // 관리자전용 또는 'QR 관리자만' 컬럼은 우리 기기에서만
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

  if(!_isAdminView){
    h+='<div id="mvLoginBox" style="display:none;margin-top:16px;background:#f8fafc;border-radius:12px;padding:16px">'
      +'<div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:8px">관리자 로그인</div>'
      +'<input id="mvId" placeholder="아이디" value="'+esc((function(){try{return localStorage.getItem("lastLoginId")||"";}catch(e){return "";}})())+'" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:6px">'
      +'<input id="mvPw" type="password" placeholder="비밀번호" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:8px">'
      +'<div id="mvErr" style="color:#ef4444;font-size:12px;margin-bottom:6px;display:none"></div>'
      +'<button onclick="_mvDoLogin()" style="width:100%;background:#1e40af;color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;font-weight:700;cursor:pointer">로그인</button>'
      +'</div>';
  }

  document.getElementById('modViewCard').innerHTML=h;
  if(!_isAdminView){
    var pwEl=document.getElementById('mvPw');
    if(pwEl) pwEl.addEventListener('keydown',function(e){if(e.key==='Enter')_mvDoLogin();});
  }
}

// ═══════════════════════════════════════════
// 모듈 전체 명단 바로가기 (?modlist={key}) — 로그인 게이트 후 명단 표시 (비상연락망 등)
// ═══════════════════════════════════════════
function renderModList(key,evtId){
  document.body.innerHTML='<div style="min-height:100vh;background:#f1f5f9"><div id="modListWrap" style="max-width:680px;margin:0 auto;padding:16px"><div style="text-align:center;color:#94a3b8;padding:50px">불러오는 중...</div></div></div>';
  if(typeof fbDb==='undefined'){ document.getElementById('modListWrap').innerHTML='<div style="text-align:center;color:#ef4444;padding:40px">시스템 오류</div>'; return; }
  window.__modListKey=key; window.__modListEvt=evtId||'';
  var _au=(typeof loadAuth==='function')?loadAuth():null;
  if(_au&&_au.id) _mlistLoad(key,evtId); else _mlistShowLogin();
}
function _mlistShowLogin(){
  var w=document.getElementById('modListWrap'); if(!w) return;
  w.innerHTML='<div style="background:#fff;border-radius:16px;padding:28px 24px;margin-top:8vh;box-shadow:0 10px 40px rgba(0,0,0,.12);max-width:380px;margin-left:auto;margin-right:auto">'
    +'<div style="text-align:center;font-size:36px;margin-bottom:6px">🔒</div>'
    +'<h2 style="text-align:center;color:#0f172a;font-size:18px;margin:0 0 4px">명단 조회</h2>'
    +'<p style="text-align:center;color:#94a3b8;font-size:12px;margin:0 0 18px">아이디·비밀번호로 로그인하세요</p>'
    +'<input id="mlistId" placeholder="아이디" value="'+esc((function(){try{return localStorage.getItem("lastLoginId")||"";}catch(e){return "";}})())+'" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:8px">'
    +'<input id="mlistPw" type="password" placeholder="비밀번호" onkeydown="if(event.key===\'Enter\')_mlistDoLogin()" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:10px">'
    +'<div id="mlistErr" style="color:#ef4444;font-size:12px;margin-bottom:8px;display:none"></div>'
    +'<button onclick="_mlistDoLogin()" style="width:100%;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer">로그인</button>'
    +'</div>';
  setTimeout(function(){ var idE=document.getElementById('mlistId'); var pwE=document.getElementById('mlistPw'); if(idE&&idE.value&&pwE){ pwE.focus(); } else if(idE){ idE.focus(); } },60);
}
function _mlistDoLogin(){
  var id=(document.getElementById('mlistId').value||'').trim();
  var pw=(document.getElementById('mlistPw').value||'').trim();
  var errEl=document.getElementById('mlistErr');
  if(!id||!pw){ if(errEl){errEl.textContent='아이디와 비밀번호를 입력하세요';errEl.style.display='block';} return; }
  fbDb.ref('/main/Users').once('value').then(function(s){
    var users=s.val()||[]; if(!Array.isArray(users)) users=Object.values(users);
    var user=null; for(var i=0;i<users.length;i++){if(users[i]&&users[i].id===id){user=users[i];break;}}
    if(!user||user.pw!==pw){ if(errEl){errEl.textContent='아이디 또는 비밀번호가 올바르지 않습니다';errEl.style.display='block';} return; }
    if(typeof saveAuth==='function') saveAuth(id,pw);
    _mlistLoad(window.__modListKey, window.__modListEvt);
  }).catch(function(e){ if(errEl){errEl.textContent='연결 오류: '+e.message;errEl.style.display='block';} });
}
function _mlistLoad(key,evtId){
  var w=document.getElementById('modListWrap'); if(w) w.innerHTML='<div style="text-align:center;color:#94a3b8;padding:50px">명단 불러오는 중...</div>';
  fbDb.ref('/main/ModDefs').once('value').then(function(s){
    var defs=s.val()||[]; if(!Array.isArray(defs))defs=Object.values(defs);
    var def=null; for(var i=0;i<defs.length;i++){if(defs[i]&&defs[i].key===key){def=defs[i];break}}
    if(!def){ if(w) w.innerHTML='<div style="text-align:center;color:#64748b;padding:40px">모듈을 찾을 수 없습니다</div>'; return; }
    var path=def.global?'/main/'+def.fbPath:'/evtData/'+(evtId||'')+'/'+def.fbPath;
    fbDb.ref(path).once('value').then(function(s2){
      var arr=s2.val()||[]; if(!Array.isArray(arr))arr=Object.values(arr);
      arr=arr.filter(Boolean);
      window.__modListDef=def; window.__modListRows=arr;
      _renderModListUI(def,arr);
    }).catch(function(e){ if(w) w.innerHTML='<div style="text-align:center;color:#ef4444;padding:40px">오류: '+esc(e.message)+'</div>'; });
  }).catch(function(e){ if(w) w.innerHTML='<div style="text-align:center;color:#ef4444;padding:40px">오류: '+esc(e.message)+'</div>'; });
}
function _renderModListUI(def,rows,q){
  var w=document.getElementById('modListWrap'); if(!w) return;
  var telCols=(def.columns||[]).filter(function(c){return c.type==='tel';});
  var infoCols=(def.columns||[]).filter(function(c){return c.key!=='status'&&c.type!=='consent'&&c.type!=='file'&&c.type!=='tel'&&!c.hideTable&&!c.sysOnly;});
  q=(q||'').trim();
  var filtered=rows;
  if(q){ var ql=q.toLowerCase(); filtered=rows.filter(function(r){ return (def.columns||[]).some(function(c){ return String(r[c.key]||'').toLowerCase().indexOf(ql)>=0; }); }); }
  var h='<div style="position:sticky;top:0;background:#f1f5f9;padding:12px 2px 10px;z-index:5">';
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="font-size:28px">'+(def.icon||'📋')+'</div>'
    +'<div><div style="font-size:18px;font-weight:800;color:#0f172a">'+esc(def.label)+'</div><div style="font-size:12px;color:#94a3b8">총 '+rows.length+'명'+(q?(' · 검색 '+filtered.length):'')+'</div></div></div>';
  h+='<input type="search" oninput="_renderModListUI(window.__modListDef,window.__modListRows,this.value)" value="'+esc(q)+'" placeholder="🔍 이름·전화·소속 검색" style="width:100%;box-sizing:border-box;padding:11px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px">';
  h+='</div>';
  h+='<div style="display:flex;flex-direction:column;gap:8px;padding-bottom:30px">';
  if(!filtered.length){ h+='<div style="text-align:center;color:#94a3b8;padding:40px">결과 없음</div>'; }
  filtered.forEach(function(r){
    var name=_modRowTitle(def,r)||'(이름 없음)';
    h+='<div style="background:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.06)">';
    h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">';
    h+='<div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:3px">'+esc(name)+'</div>';
    // 부가 정보 (이름 컬럼 제외)
    var infoBits=[];
    infoCols.forEach(function(c){ var v=r[c.key]; if(v==null||v==='') return; if(_modRowTitle(def,r)===String(v)) return; infoBits.push('<span style="color:#64748b">'+esc(c.label)+':</span> '+esc(_modPlain(c,v))); });
    if(infoBits.length) h+='<div style="font-size:12px;color:#334155;line-height:1.6">'+infoBits.join(' · ')+'</div>';
    h+='</div>';
    // 전화 버튼
    if(telCols.length){
      h+='<div style="display:flex;flex-direction:column;gap:4px">';
      telCols.forEach(function(c){ var v=r[c.key]; if(!v) return; var cl=String(v).replace(/[^0-9+]/g,''); h+='<a href="tel:'+cl+'" style="display:inline-flex;align-items:center;gap:5px;background:#16a34a;color:#fff;padding:7px 13px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;white-space:nowrap">📞 '+esc(String(v))+'</a>'; });
      h+='</div>';
    }
    h+='</div></div>';
  });
  h+='</div>';
  w.innerHTML=h;
}
function _mvDoLogin(){
  var id=(document.getElementById('mvId').value||'').trim();
  var pw=(document.getElementById('mvPw').value||'').trim();
  var errEl=document.getElementById('mvErr');
  var btn=document.querySelector('#mvLoginBox button');
  if(!id||!pw){ if(errEl){errEl.textContent='아이디와 비밀번호를 입력하세요';errEl.style.display='block';} return; }
  if(typeof fbDb==='undefined'){ if(errEl){errEl.textContent='시스템 연결 오류';errEl.style.display='block';} return; }
  if(btn){btn.disabled=true;btn.textContent='로그인 중...';}
  if(errEl) errEl.style.display='none';
  fbDb.ref('/main/Users').once('value').then(function(s){
    var users=s.val()||[];
    if(!Array.isArray(users)) users=Object.values(users);
    var user=null;
    for(var i=0;i<users.length;i++){if(users[i]&&users[i].id===id){user=users[i];break;}}
    if(!user){ if(btn){btn.disabled=false;btn.textContent='로그인';} if(errEl){errEl.textContent='아이디가 존재하지 않습니다';errEl.style.display='block';} return; }
    if(user.pw!==pw){ if(btn){btn.disabled=false;btn.textContent='로그인';} if(errEl){errEl.textContent='비밀번호가 일치하지 않습니다';errEl.style.display='block';} return; }
    if(typeof saveAuth==='function') saveAuth(id,pw);
    var p=new URLSearchParams(location.search);
    renderModView(p.get('modview'),p.get('id'),p.get('evtId'));
  }).catch(function(e){
    if(btn){btn.disabled=false;btn.textContent='로그인';}
    if(errEl){errEl.textContent='연결 오류: '+e.message;errEl.style.display='block';}
  });
}

// ═══════════════════════════════════════════
// 📊 범용 통계
// ═══════════════════════════════════════════

// 📦 재고 현황 — 옵션별 총수량/신청수/남은수량
function popModStock(key){
  var def=_modDefs[key]; if(!def) return;
  var data=(_modData[key]||[]).slice();
  var stockCols=(def.columns||[]).filter(function(c){return c.type==='select'&&c.stockOn&&c.stock;});
  if(!stockCols.length) return toast('재고 관리 중인 항목이 없습니다',true);
  var h='<div class="pop-head"><h3>📦 '+esc(def.label)+' 재고 현황</h3></div>';
  h+='<div style="padding:14px;max-height:78vh;overflow:auto">';
  stockCols.forEach(function(c){
    var used=_modStockUsed(def,c,data);
    h+='<div style="font-weight:800;color:#0f766e;margin:6px 0 8px;font-size:15px">'+esc(c.label)+(c.stockQtyKey?' <span style="font-size:11px;color:#94a3b8">(수량칸 연동)</span>':'')+'</div>';
    h+='<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">';
    h+='<tr style="background:#f1f5f9;color:#475569"><th style="padding:7px 9px;text-align:left;border:1px solid #e2e8f0">항목</th><th style="padding:7px 9px;border:1px solid #e2e8f0">총 수량</th><th style="padding:7px 9px;border:1px solid #e2e8f0">신청</th><th style="padding:7px 9px;border:1px solid #e2e8f0">남음</th></tr>';
    (c.options||[]).forEach(function(o){
      var cap=c.stock[o], u=used[o]||0;
      var leftTxt, leftColor;
      if(cap==null){ leftTxt='무제한'; leftColor='#64748b'; }
      else { var left=Math.max(0,cap-u); leftTxt=left+'개'; leftColor=left<=0?'#ef4444':(left<=Math.max(1,cap*0.1)?'#d97706':'#16a34a'); }
      h+='<tr><td style="padding:7px 9px;border:1px solid #e2e8f0;font-weight:700">'+esc(o)+'</td>'
        +'<td style="padding:7px 9px;border:1px solid #e2e8f0;text-align:center">'+(cap==null?'∞':cap)+'</td>'
        +'<td style="padding:7px 9px;border:1px solid #e2e8f0;text-align:center">'+u+'</td>'
        +'<td style="padding:7px 9px;border:1px solid #e2e8f0;text-align:center;font-weight:800;color:'+leftColor+'">'+(cap!=null&&Math.max(0,cap-u)<=0?'품절':leftTxt)+'</td></tr>';
    });
    // 옵션 외 값(직접입력 등)도 표시
    Object.keys(used).forEach(function(v){ if((c.options||[]).indexOf(v)<0){ h+='<tr style="color:#94a3b8"><td style="padding:7px 9px;border:1px solid #e2e8f0">'+esc(v)+' <span style="font-size:10px">(목록 외)</span></td><td style="border:1px solid #e2e8f0;text-align:center">-</td><td style="border:1px solid #e2e8f0;text-align:center">'+used[v]+'</td><td style="border:1px solid #e2e8f0;text-align:center">-</td></tr>'; } });
    h+='</table>';
  });
  h+='<div style="font-size:11px;color:#94a3b8">※ 남은 수량 = 총 수량 − 신청 건수. 수량 변경은 모듈관리 → 해당 항목에서.</div>';
  h+='<div style="text-align:right;margin-top:12px"><button class="btn" onclick="closePopup()">닫기</button></div>';
  h+='</div>';
  openPopup(h,560);
}

function popModStat(key){
  var def=_modDefs[key]; if(!def) return;
  _modStatKey=key;
  var data=(_modData[key]||[]).slice();
  var cols=(def.columns||[]);
  var total=data.length;

  var h='<div class="pop-head"><h3>📊 '+esc(def.label)+' 통계 <span style="color:#94a3b8;font-weight:400">('+total+'건)</span></h3></div>';
  h+='<div style="padding:14px;max-height:75vh;overflow:auto">';

  if(!total){ h+='<div style="text-align:center;color:#94a3b8;padding:40px">데이터가 없습니다.</div></div>'; openPopup(h,700); return; }

  cols.forEach(function(c){
    if(c.sysOnly) return;
    var st=_modStatCol(c, data, key);
    if(!st) return;
    h+=st;
  });

  h+='</div>';
  openPopup(h,700);
}

var _modStatKey='';
function _modStatCol(c, data, key){
  var tp=c.type||'text';

  if(tp==='file') return _modStatFile(c, data, key);
  if(tp==='consent') return _modStatConsent(c, data, key);
  if(tp==='number') return _modStatNumber(c, data);
  if(tp==='date') return _modStatDate(c, data);

  // text, select, badge, tel, textarea — 값 분포
  return _modStatDist(c, data);
}
function _modStatNameCol(key){
  var def=_modDefs[key]; if(!def) return null;
  var cols=(def.columns||[]).filter(function(c){return c.type!=='badge'&&c.type!=='consent'&&c.type!=='file'&&!c.auto&&!c.sysOnly;});
  // 이름/업체/성명/대표자 같은 컬럼 우선
  var nameHints=/이름|성명|업체|대표|name/i;
  var hit=cols.find(function(c){return nameHints.test(c.label);});
  if(hit) return hit;
  // select/filter 아닌 text 컬럼 우선 (구분 같은 카테고리 회피)
  var text=cols.find(function(c){return c.type!=='select'&&!c.filter;});
  if(text) return text;
  return cols[0]||null;
}
function _modStatNameOf(row,key){
  var nc=_modStatNameCol(key);
  return nc?String(row[nc.key]||'(이름없음)'):'';
}
function _modStatSearch(name){
  closePopup();
  var key=_modStatKey; if(!key) return;
  _modSearch[key]=name;
  if(typeof draw==='function') draw();
}
function _modStatNames(rows,key){
  if(!rows.length) return '';
  var h='<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">';
  rows.forEach(function(r){
    var n=_modStatNameOf(r,key);
    h+='<span onclick="_modStatSearch(\''+esc(n.replace(/'/g,"\\'"))+'\')" style="cursor:pointer;padding:3px 10px;background:#fef2f2;color:#dc2626;border-radius:12px;font-size:12px;font-weight:600;border:1px solid #fecaca;transition:background .2s" onmouseover="this.style.background=\'#fee2e2\'" onmouseout="this.style.background=\'#fef2f2\'">'+esc(n)+'</span>';
  });
  h+='</div>';
  return h;
}

function _modStatCard(label, body){
  return '<div style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">'
    +'<div style="background:#f8fafc;padding:10px 14px;font-weight:700;font-size:14px;border-bottom:1px solid #e2e8f0">'+esc(label)+'</div>'
    +'<div style="padding:12px 14px">'+body+'</div></div>';
}

function _modStatBar(label, count, total, color){
  var pct=total?Math.round(count/total*100):0;
  var w=total?Math.max(2, count/total*100):0;
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
    +'<div style="min-width:90px;font-size:13px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(label)+'">'+esc(label)+'</div>'
    +'<div style="flex:1;background:#f1f5f9;border-radius:4px;height:20px;overflow:hidden">'
    +'<div style="width:'+w.toFixed(1)+'%;height:100%;background:'+(color||'#3b82f6')+';border-radius:4px;transition:width .3s"></div></div>'
    +'<div style="min-width:70px;text-align:right;font-size:12px;color:#64748b;font-weight:600">'+count+' <span style="color:#94a3b8">('+pct+'%)</span></div></div>';
}

// 값 분포 (text/select/badge/tel/textarea)
function _modStatDist(c, data){
  var counts={}, filled=0, empty=0;
  data.forEach(function(r){
    var v=String(r[c.key]||'').trim();
    if(!v){ empty++; return; }
    filled++;
    counts[v]=(counts[v]||0)+1;
  });
  var keys=Object.keys(counts);
  if(!keys.length) return '';
  // 너무 많은 고유값(20개 초과)이면 상위 15개만 + 기타
  keys.sort(function(a,b){ return counts[b]-counts[a]; });
  var palette=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'];
  var body='';
  var showKeys=keys.length>20?keys.slice(0,15):keys;
  var otherCount=0;
  if(keys.length>20){
    for(var i=15;i<keys.length;i++) otherCount+=counts[keys[i]];
  }
  showKeys.forEach(function(k,i){
    body+=_modStatBar(k, counts[k], data.length, palette[i%palette.length]);
  });
  if(otherCount>0) body+=_modStatBar('기타 ('+(keys.length-15)+'종)', otherCount, data.length, '#94a3b8');
  if(empty>0) body+=_modStatBar('(미입력)', empty, data.length, '#cbd5e1');
  body+='<div style="font-size:11px;color:#94a3b8;margin-top:4px">고유값 '+keys.length+'종 · 입력 '+filled+' · 미입력 '+empty+'</div>';
  return _modStatCard(c.label, body);
}

// 파일 제출 현황
function _modStatFile(c, data, key){
  var yes=0, no=0, noRows=[];
  data.forEach(function(r){
    var v=r[c.key];
    if(v && ((typeof v==='string' && v.trim()) || (typeof v==='object'))) yes++;
    else { no++; noRows.push(r); }
  });
  var body=_modStatBar('✅ 제출', yes, data.length, '#10b981');
  body+=_modStatBar('❌ 미제출', no, data.length, '#ef4444');
  body+='<div style="font-size:11px;color:#94a3b8;margin-top:4px">제출률 '+(data.length?Math.round(yes/data.length*100):0)+'%</div>';
  if(noRows.length) body+=_modStatNames(noRows, key);
  return _modStatCard(c.label+' (파일)', body);
}

// 개인정보동의 현황
function _modStatConsent(c, data, key){
  var yes=0, no=0, noRows=[];
  data.forEach(function(r){
    var v=r[c.key];
    if(v==='동의'||v==='Y'||v===true||v==='true') yes++; else { no++; noRows.push(r); }
  });
  var body=_modStatBar('✅ 동의', yes, data.length, '#10b981');
  body+=_modStatBar('⬜ 미동의', no, data.length, '#ef4444');
  if(noRows.length) body+=_modStatNames(noRows, key);
  return _modStatCard(c.label, body);
}

// 숫자 통계
function _modStatNumber(c, data){
  var vals=[];
  data.forEach(function(r){
    var v=r[c.key]; if(v==null||v==='') return;
    var n=Number(String(v).replace(/,/g,''));
    if(!isNaN(n)) vals.push(n);
  });
  if(!vals.length) return '';
  var sum=0, min=vals[0], max=vals[0];
  vals.forEach(function(n){ sum+=n; if(n<min)min=n; if(n>max)max=n; });
  var avg=sum/vals.length;
  var fmt=c.comma?function(n){return Number(n.toFixed(1)).toLocaleString();}:function(n){return n.toFixed(1);};
  var body='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">';
  var cards=[
    {l:'합계',v:fmt(sum),bg:'#eff6ff',c:'#1e40af'},
    {l:'평균',v:fmt(avg),bg:'#f0fdf4',c:'#166534'},
    {l:'최솟값',v:fmt(min),bg:'#fefce8',c:'#854d0e'},
    {l:'최댓값',v:fmt(max),bg:'#fef2f2',c:'#991b1b'}
  ];
  cards.forEach(function(cd){
    body+='<div style="flex:1;min-width:70px;background:'+cd.bg+';padding:8px 12px;border-radius:8px;text-align:center">'
      +'<div style="font-size:11px;color:'+cd.c+'">'+cd.l+'</div>'
      +'<div style="font-size:16px;font-weight:700;color:'+cd.c+'">'+cd.v+'</div></div>';
  });
  body+='</div>';
  body+='<div style="font-size:11px;color:#94a3b8">입력 '+vals.length+' / 미입력 '+(data.length-vals.length)+'</div>';
  return _modStatCard(c.label, body);
}

// 날짜 분포
function _modStatDate(c, data){
  var counts={}, filled=0;
  data.forEach(function(r){
    var v=String(r[c.key]||'').trim();
    if(!v) return;
    filled++;
    var d=v.substring(0,10);
    counts[d]=(counts[d]||0)+1;
  });
  var keys=Object.keys(counts).sort();
  if(!keys.length) return '';
  var maxCnt=1;
  keys.forEach(function(k){if(counts[k]>maxCnt) maxCnt=counts[k];});
  var body='';
  if(keys.length<=30){
    keys.forEach(function(k){
      body+=_modStatBar(k, counts[k], data.length, '#6366f1');
    });
  } else {
    // 월별로 묶기
    var monthly={};
    keys.forEach(function(k){
      var m=k.substring(0,7);
      monthly[m]=(monthly[m]||0)+counts[k];
    });
    Object.keys(monthly).sort().forEach(function(m){
      body+=_modStatBar(m, monthly[m], data.length, '#6366f1');
    });
  }
  body+='<div style="font-size:11px;color:#94a3b8;margin-top:4px">입력 '+filled+' · 미입력 '+(data.length-filled)+' · 기간 '+(keys[0]||'')+' ~ '+(keys[keys.length-1]||'')+'</div>';
  return _modStatCard(c.label, body);
}
