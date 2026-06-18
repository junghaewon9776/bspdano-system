// 단오시스템 — Firebase 기반 공통 라이브러리
// 기존 GAS api() 인터페이스를 유지하면서 Firebase RTDB로 전환

// ───────── URL 치환 (인코딩/디코딩) ─────────
// DB에 저장할 때: _encUrl(url) → "ENC::base64문자열"
// 파일 열 때:    _decUrl(val) → 원래 URL
function _encUrl(url) {
  if (!url) return "";
  try { return "ENC::" + btoa(unescape(encodeURIComponent(url))); }
  catch(e) { return url; }
}
function _decUrl(val) {
  if (!val) return "";
  var s = String(val);
  if (s.indexOf("ENC::") !== 0) return s; // 치환 안 된 레거시
  try { return decodeURIComponent(escape(atob(s.slice(5)))); }
  catch(e) { return s; }
}
// 값이 치환된 파일인지 확인
function _isEncUrl(v) { return String(v||"").indexOf("ENC::") === 0; }

// ───────── Firebase 동기화 캐시 ─────────
var _cache = null;
var _cacheReady = false;
var _readyCallbacks = [];
var _syncInitialized = false;
var _evtCaches = {}; // 행사별 캐시: { evtId: { Acts:[], Purs:[], ... } }

// 메인(공용) 데이터 노드
var MAIN_NODES = ["Users","Areas","Events","AcctEvt","Vendors","Assets","Rentals","AssetLog","AssetCategories","AssetLocations"];
// 행사별 데이터 노드 (evtData/{evtId}/ 하위)
var EVT_NODES = ["Acts","Purs","Exps","Inc","ExpBG","Pays","Dpst","Mems","Groups","Notices","SmsLog","Config","Contracts","ContractFields","Quotes","QuoteFields","SmsTemplates","Forms","FormFields","FormSubs","Fees","Apply"];

function initFirebaseSync() {
  if (_syncInitialized) return;
  if (typeof fbDb === 'undefined') {
    console.error('Firebase 초기화 안됨. firebase-config.js 확인');
    return;
  }
  _syncInitialized = true;

  // 메인 데이터 실시간 동기화
  fbDb.ref('/main').on('value', function(snapshot) {
    var data = snapshot.val();
    if (!data) {
      _cache = {};
      fbDb.ref('/main').set({});
    } else {
      _cache = data;
    }
    // 배열 복원 (Firebase가 object로 변환하는 것 대응)
    MAIN_NODES.forEach(function(n) {
      if (_cache[n] && !Array.isArray(_cache[n])) {
        _cache[n] = Object.values(_cache[n]);
      }
    });
    if (!_cacheReady) {
      _cacheReady = true;
      _readyCallbacks.forEach(function(cb) { cb(); });
      _readyCallbacks.length = 0;
    }
    if (window.onDataChanged) window.onDataChanged();
  });
}

function onDataReady(cb) {
  if (_cacheReady) cb();
  else _readyCallbacks.push(cb);
}

// 행사별 데이터 로드
function loadEvtData(evtId) {
  return new Promise(function(resolve) {
    fbDb.ref('/evtData/' + evtId).once('value', function(snapshot) {
      var data = snapshot.val() || {};
      EVT_NODES.forEach(function(n) {
        if (data[n] && !Array.isArray(data[n])) {
          data[n] = Object.values(data[n]);
        }
        if (!data[n]) data[n] = [];
        // Firebase 전각 키 → 원래 키로 복원
        if (Array.isArray(data[n])) {
          data[n] = data[n].map(function(r) {
            if (!r || typeof r !== 'object') return r;
            var out = {};
            Object.keys(r).forEach(function(k) { out[_fbRestoreKey(k)] = r[k]; });
            return out;
          });
        }
      });
      // Config는 key-value 배열
      if (data.Config && Array.isArray(data.Config)) {
        // 그대로
      } else if (data.Config && typeof data.Config === 'object') {
        data.Config = Object.values(data.Config);
      }
      _evtCaches[evtId] = data;
      resolve(data);
    });
  });
}

// 행사별 데이터 저장
function saveEvtNode(evtId, nodeName, data) {
  var d = data;
  if (nodeName === "Apply" && Array.isArray(d)) {
    d = d.map(function(r) { return _fbSafeRow(r); });
  }
  return fbDb.ref('/evtData/' + evtId + '/' + nodeName).set(d);
}

// 메인 데이터 저장
function saveMainNode(nodeName, data) {
  var d = data;
  if (Array.isArray(d)) {
    d = d.map(function(r) { return _fbSafeRow(r); });
  }
  return fbDb.ref('/main/' + nodeName).set(d);
}

// ───────── Firebase Auth ─────────
function adminSignIn(email, password) {
  return fbAuth.signInWithEmailAndPassword(email, password);
}

function adminSignOut() {
  return fbAuth.signOut();
}

// 보조 Firebase 앱 (현재 로그인 유지하며 새 사용자 생성용)
var _secondaryApp = null;
function getSecondaryAuth() {
  if (typeof firebase === 'undefined') return null;
  if (!_secondaryApp) {
    _secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary');
  }
  return _secondaryApp.auth();
}

// ───────── ID 생성 ─────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function now_() {
  var d = new Date();
  var off = d.getTime() + (d.getTimezoneOffset() * 60000) + (9 * 3600000);
  var k = new Date(off);
  var Y = k.getFullYear();
  var M = String(k.getMonth()+1).padStart(2,"0");
  var D = String(k.getDate()).padStart(2,"0");
  var h = String(k.getHours()).padStart(2,"0");
  var m = String(k.getMinutes()).padStart(2,"0");
  var s = String(k.getSeconds()).padStart(2,"0");
  return Y+"-"+M+"-"+D+" "+h+":"+m+":"+s;
}

// ───────── api() 호환 레이어 ─────────
// 기존 GAS api(action, params) 인터페이스 유지
// 내부에서 Firebase RTDB 직접 조작
var _NO_EVT_INJECT={login:1,listEvents:1,addEvent:1,updateEvent:1,deleteEvent:1,listAcctEvt:1,saveAcctEvt:1,deleteAcctEvt:1,listUsers:1,addUser:1,updateUser:1,deleteUser:1};
function api(action, params) {
  var p = Object.assign({action: action}, params || {});
  // evtId 자동 주입 (index.html의 CUR_EVT 참조)
  if (typeof CUR_EVT !== 'undefined' && CUR_EVT && !_NO_EVT_INJECT[action] && p.evtId == null) {
    p.evtId = CUR_EVT.evtId;
  }
  // by 자동 주입 (index.html의 CID 참조)
  if (typeof CID !== 'undefined' && CID && p.by == null) {
    p.by = CID;
  }
  return _dispatch(p);
}

function _dispatch(p) {
  return new Promise(function(resolve) {
    try {
      var action = (p && p.action) || "";
      switch (action) {
        case "ping":    resolve({ok:true, msg:"pong"}); return;
        case "login":   _apiLogin(p).then(resolve); return;
        case "refresh": _apiRefresh(p).then(resolve); return;

        // 인원관리
        case "addMem":    _apiAddMem(p).then(resolve); return;
        case "updateMem": _apiUpdateMem(p).then(resolve); return;
        case "deleteMem": _apiDeleteRow(p, "Mems").then(resolve); return;

        // 활동
        case "addAct":    _apiAddRow(p, "Acts").then(resolve); return;
        case "updateAct": _apiUpdateRow(p, "Acts").then(resolve); return;
        case "deleteAct": _apiDeleteRow(p, "Acts").then(resolve); return;

        // 구매
        case "addPur":    _apiAddRow(p, "Purs").then(resolve); return;
        case "updatePur": _apiUpdateRow(p, "Purs").then(resolve); return;
        case "deletePur": _apiDeleteRow(p, "Purs").then(resolve); return;

        // 공지
        case "addNotice":    _apiAddRow(p, "Notices").then(resolve); return;
        case "updateNotice": _apiUpdateRow(p, "Notices").then(resolve); return;
        case "deleteNotice": _apiDeleteRow(p, "Notices").then(resolve); return;

        // 지출
        case "addExp":    _apiAddRow(p, "Exps").then(resolve); return;
        case "updateExp": _apiUpdateRow(p, "Exps").then(resolve); return;
        case "deleteExp": _apiDeleteRow(p, "Exps").then(resolve); return;

        // 세입
        case "addInc":    _apiAddRow(p, "Inc").then(resolve); return;
        case "updateInc": _apiUpdateRow(p, "Inc").then(resolve); return;
        case "deleteInc": _apiDeleteRow(p, "Inc").then(resolve); return;
        case "listInc":   _apiListEvtNode(p, "Inc").then(resolve); return;

        // 입금
        case "addPay":    _apiAddRow(p, "Pays").then(resolve); return;
        case "updatePay": _apiUpdateRow(p, "Pays").then(resolve); return;
        case "deletePay": _apiDeleteRow(p, "Pays").then(resolve); return;

        // 예치금
        case "addDpst":    _apiAddRow(p, "Dpst").then(resolve); return;
        case "updateDpst": _apiUpdateRow(p, "Dpst").then(resolve); return;
        case "deleteDpst": _apiDeleteRow(p, "Dpst").then(resolve); return;

        // 회비
        case "listFees":   _apiListEvtNode(p, "Fees").then(resolve); return;
        case "addFee":     _apiAddRow(p, "Fees").then(resolve); return;
        case "updateFee":  _apiUpdateRow(p, "Fees").then(resolve); return;
        case "deleteFee":  _apiDeleteRow(p, "Fees").then(resolve); return;
        case "bulkAddFees": _apiBulkAdd(p, "Fees").then(resolve); return;

        // 예산
        case "addExpBG":        _apiAddRow(p, "ExpBG").then(resolve); return;
        case "updateExpBG":    _apiUpdateRow(p, "ExpBG").then(resolve); return;
        case "deleteExpBG":    _apiDeleteRow(p, "ExpBG").then(resolve); return;
        case "bulkAddExpBG":    _apiBulkAdd(p, "ExpBG").then(resolve); return;
        case "bulkUpsertExpBig":_apiBulkUpsert(p, "ExpBG").then(resolve); return;

        // 일괄 가져오기 (엑셀)
        case "bulkAddAct":      _apiBulkAdd(p, "Acts").then(resolve); return;
        case "bulkAddPur":      _apiBulkAdd(p, "Purs").then(resolve); return;
        case "bulkAddExps":     _apiBulkAdd(p, "Exps").then(resolve); return;
        case "bulkAddInc":      _apiBulkAdd(p, "Inc").then(resolve); return;
        case "bulkAddApply":    _apiBulkAddApply(p).then(resolve); return;
        case "bulkAddVendors":  _apiBulkAddMain(p, "Vendors").then(resolve); return;
        case "bulkReplaceMems": _apiBulkReplaceMems(p).then(resolve); return;
        case "bulkReplaceAccounts": _apiBulkReplaceAccounts(p).then(resolve); return;

        // 소속/그룹 (shareMems면 메인 행사에서 읽고/쓰기)
        case "listGroups":   _apiListGroups(p).then(resolve); return;
        case "addGroup":     _apiGroupWrite(p, "add").then(resolve); return;
        case "updateGroup":  _apiGroupWrite(p, "update").then(resolve); return;
        case "deleteGroup":  _apiGroupWrite(p, "delete").then(resolve); return;

        // 거래처
        case "listVendors":  _apiListMainNode(p, "Vendors").then(resolve); return;
        case "addVendor":    _apiAddMainRow(p, "Vendors").then(resolve); return;
        case "updateVendor": _apiUpdateMainRow(p, "Vendors").then(resolve); return;
        case "deleteVendor": _apiDeleteMainRow(p, "Vendors").then(resolve); return;

        // 행사 관리
        case "listEvents":   _apiListEvents(p).then(resolve); return;
        case "addEvent":     _apiAddEvent(p).then(resolve); return;
        case "updateEvent":  _apiUpdateEvent(p).then(resolve); return;
        case "deleteEvent":  _apiDeleteEvent(p).then(resolve); return;

        // 계정/권한
        case "listAcctEvt":  _apiListMainNode(p, "AcctEvt").then(resolve); return;
        case "saveAcctEvt":  _apiSaveAcctEvt(p).then(resolve); return;
        case "deleteAcctEvt":_apiDeleteAcctEvt(p).then(resolve); return;
        case "addAcct":      _apiAddAcct(p).then(resolve); return;
        case "updateAcct":   _apiUpdateAcct(p).then(resolve); return;
        case "deleteAcct":   _apiDeleteAcct(p).then(resolve); return;
        case "chgMyPw":      _apiChgMyPw(p).then(resolve); return;

        // Config
        case "setConfigValue": _apiSetConfig(p).then(resolve); return;
        case "getLabels":      _apiGetLabels(p).then(resolve); return;
        case "setLabels":      _apiSetLabels(p).then(resolve); return;
        case "getDbInfo":      resolve({ok:true, ssId:"firebase", ssUrl:"https://console.firebase.google.com"}); return;
        case "getSheetUrl":    resolve({ok:true, url:"https://console.firebase.google.com"}); return;

        // SMS (알리고 GAS 프록시)
        case "sendSms":
        case "sendSmsAligo":
        case "sendFeeSms":   _apiSendSmsAligo(p).then(resolve); return;
        case "testSms":      _apiSendSmsAligo(Object.assign({},p,{testMode:true})).then(resolve); return;
        case "checkSmsConfig": _apiCheckSmsConfig(p).then(resolve); return;
        case "getSmsCfg":
        case "getAligoCfg":  _apiGetAligoCfg(p).then(resolve); return;
        case "smsLog":       _apiSmsLogAdd(p).then(resolve); return;
        case "smsLogList":   _apiSmsLogList(p).then(resolve); return;
        case "aligoReserveList":   _apiAligoProxy(p,"reserveList").then(resolve); return;
        case "aligoReserveCancel": _apiAligoProxy(p,"reserveCancel").then(resolve); return;

        // 참가자
        case "listApply":      _apiListApply(p).then(resolve); return;
        case "getApplyConfig": _apiGetApplyConfig(p).then(resolve); return;
        case "setApplyConfig":
        case "saveApplyConfig":{var _ac={status:p.status,startDt:p.startDt,endDt:p.endDt,notice:p.notice,webappUrl:p.webappUrl};if(p.cats)_ac.cats=p.cats;if(p.formUrl!==undefined)_ac.formUrl=p.formUrl;if(p.formUrlPdf!==undefined)_ac.formUrlPdf=p.formUrlPdf;if(p.driveUploadUrl!==undefined)_ac.driveUploadUrl=p.driveUploadUrl;_apiSetConfig(Object.assign({},p,{key:"APPLY_CONFIG",value:JSON.stringify(_ac)})).then(function(){resolve({ok:true})});return;}
        case "addApply":      _apiAddApply(p).then(resolve); return;
        case "updateApplyRow": _apiUpdateApplyRow(p).then(resolve); return;
        case "updateApply":  _apiUpdateApplyBySeq(p).then(resolve); return;
        case "deleteApply":  _apiDeleteApplyBySeq(p).then(resolve); return;

        // 사진 업로드 (Firebase Storage)
        case "uploadPhoto":    _apiUploadPhoto(p).then(resolve); return;
        case "deletePhoto":    _apiDeletePhoto(p).then(resolve); return;

        // 대여자산
        case "listAssets":     _apiListMainNode(p, "Assets").then(resolve); return;
        case "addAsset":       _apiAddMainRow(p, "Assets").then(resolve); return;
        case "updateAsset":    _apiUpdateMainRow(p, "Assets").then(resolve); return;
        case "deleteAsset":    _apiDeleteMainRow(p, "Assets").then(resolve); return;
        case "bulkAddAssets":  _apiBulkAddMain(p, "Assets").then(resolve); return;
        case "setAssetLabel":  _apiSetAssetLabel(p).then(resolve); return;
        case "listRentals":    _apiListMainNode(p, "Rentals").then(resolve); return;
        case "addRental":      _apiAddMainRow(p, "Rentals").then(resolve); return;
        case "updateRental":   _apiUpdateMainRow(p, "Rentals").then(resolve); return;
        case "deleteRental":   _apiDeleteMainRow(p, "Rentals").then(resolve); return;
        case "listAssetLog":   _apiListMainNode(p, "AssetLog").then(resolve); return;

        // 계약서 / 견적서 / 폼
        case "listContracts":     _apiListEvtNode(p, "Contracts").then(resolve); return;
        case "addContract":       _apiAddRow(p, "Contracts").then(resolve); return;
        case "updateContract":    _apiUpdateRow(p, "Contracts").then(resolve); return;
        case "deleteContract":    _apiDeleteRow(p, "Contracts").then(resolve); return;
        case "listContractFields":_apiListEvtNode(p, "ContractFields").then(resolve); return;
        case "saveContractFields":_apiBulkReplace(p, "ContractFields").then(resolve); return;

        case "listQuotes":        _apiListEvtNode(p, "Quotes").then(resolve); return;
        case "addQuote":          _apiAddRow(p, "Quotes").then(resolve); return;
        case "updateQuote":       _apiUpdateRow(p, "Quotes").then(resolve); return;
        case "deleteQuote":       _apiDeleteRow(p, "Quotes").then(resolve); return;
        case "listQuoteFields":   _apiListEvtNode(p, "QuoteFields").then(resolve); return;
        case "saveQuoteFields":   _apiBulkReplace(p, "QuoteFields").then(resolve); return;

        case "listForms":         _apiListEvtNode(p, "Forms").then(resolve); return;
        case "addForm":           _apiAddRow(p, "Forms").then(resolve); return;
        case "updateForm":        _apiUpdateRow(p, "Forms").then(resolve); return;
        case "deleteForm":        _apiDeleteRow(p, "Forms").then(resolve); return;
        case "listFormFields":    _apiListEvtNode(p, "FormFields").then(resolve); return;
        case "saveFormFields":    _apiBulkReplace(p, "FormFields").then(resolve); return;
        case "listFormSubs":      _apiListEvtNode(p, "FormSubs").then(resolve); return;
        case "addFormSub":        _apiAddRow(p, "FormSubs").then(resolve); return;
        case "deleteFormSub":     _apiDeleteRow(p, "FormSubs").then(resolve); return;

        // SMS 템플릿
        case "listSmsTpl":        _apiListEvtNode(p, "SmsTemplates").then(resolve); return;
        case "addSmsTpl":         _apiAddRow(p, "SmsTemplates").then(resolve); return;
        case "updateSmsTpl":      _apiUpdateRow(p, "SmsTemplates").then(resolve); return;
        case "deleteSmsTpl":      _apiDeleteRow(p, "SmsTemplates").then(resolve); return;

        // 자료실
        case "listFileFolders": _apiListFileFolders(p).then(resolve); return;
        case "addFileFolder":   _apiAddFileFolder(p).then(resolve); return;
        case "deleteFileFolder":_apiDeleteFileFolder(p).then(resolve); return;
        case "listFiles":       _apiListFiles(p).then(resolve); return;
        case "uploadFile":      _apiUploadFile(p).then(resolve); return;
        case "deleteFile":      _apiDeleteFile(p).then(resolve); return;

        // 텔레그램 알림
        case "notifyLogin": _apiNotifyLogin(p).then(resolve); return;

        // 첨부파일 ZIP 다운로드
        case "buildGalleryZip": _apiBuildGalleryZip(p).then(resolve); return;

        // 카드/계좌 관리
        case "addIncCard":    _apiAddIncCard(p).then(resolve); return;
        case "updateIncCard": _apiUpdateIncCard(p).then(resolve); return;
        case "deleteIncCard": _apiDeleteIncCard(p).then(resolve); return;

        // 세출 대분류 관리
        case "addExpType":    _apiAddExpType(p).then(resolve); return;
        case "renameExpType": _apiRenameExpType(p).then(resolve); return;
        case "deleteExpType": _apiDeleteExpType(p).then(resolve); return;

        // 상(수상 종류) 관리
        case "addAward":    _apiAddAward(p).then(resolve); return;
        case "renameAward": _apiRenameAward(p).then(resolve); return;
        case "deleteAward": _apiDeleteAward(p).then(resolve); return;

        default:
          console.warn("미구현 action:", action);
          resolve({ok:false, err:"미구현: " + action});
          return;
      }
    } catch (err) {
      console.error("api error:", err);
      resolve({ok:false, err: String(err.message || err)});
    }
  });
}

// ───────── 로그인 ─────────
function _apiLogin(p) {
  return new Promise(function(resolve) {
    if (!_cache) {
      resolve({ok:false, err:"데이터 로드 중"}); return;
    }
    var users = _cache.Users || [];
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === p.id) { user = users[i]; break; }
    }
    if (!user) { resolve({ok:false, err:"아이디가 존재하지 않습니다"}); return; }
    if (user.pw !== p.pw) { resolve({ok:false, err:"비밀번호가 일치하지 않습니다"}); return; }

    var me = {id:user.id, r:user.r, ar:user.ar, nm:user.nm, tel:user.tel};
    var evts = _getUserEvts(user.id, user.r);

    resolve({
      ok:true, me:me, evts:evts,
      AR: (_cache.Areas||[]).map(function(a){return a.n}),
      BG: [],
      US: _buildUserMap(),
      LBL: {leader:"단장", member:"단원"}
    });
  });
}

// 사용자별 접근 가능 행사 목록
function _getUserEvts(acctId, globalRole) {
  var events = _cache.Events || [];
  var acctEvt = _cache.AcctEvt || [];
  var myEntries = acctEvt.filter(function(ae) { return ae.acctId === acctId; });

  if (myEntries.length === 0) {
    // AcctEvt 미등록 → admin/super면 전체 접근
    if (globalRole === "admin" || globalRole === "super") {
      return events.map(function(ev) {
        return {evtId:ev.evtId, nm:ev.nm, yr:ev.yr, modules:(ev.modules||"").split(","), role:globalRole, active:ev.active!==false};
      });
    }
    return [];
  }

  var result = [];
  for (var i = 0; i < myEntries.length; i++) {
    var ae = myEntries[i];
    var r = (ae.role || "").toLowerCase();
    if (r === "none" || r === "없음" || r === "x" || r === "-") continue;
    var ev = events.filter(function(e) { return e.evtId === ae.evtId; })[0];
    if (!ev) continue;
    result.push({
      evtId: ev.evtId, nm: ev.nm, yr: ev.yr,
      modules: (ev.modules||"").split(","),
      role: ae.role || globalRole || "user",
      active: ev.active !== false
    });
  }
  return result;
}

function _buildUserMap() {
  var us = {};
  (_cache.Users || []).forEach(function(u) {
    us[u.id] = {nm:u.nm, r:u.r, ar:u.ar, tel:u.tel};
  });
  return us;
}

// ───────── 데이터 새로고침 ─────────
function _apiRefresh(p) {
  return new Promise(function(resolve) {
    if (!p.evtId && typeof CUR_EVT !== 'undefined' && CUR_EVT) {
      p.evtId = CUR_EVT.evtId;
    }
    if (!p.evtId) {
      // 행사 없는 시스템 → 전역 /main/Config 에서 시스템 토글(현장/연동 등) 읽기
      var _empty = {ok:true, acts:[], purs:[], exps:[], mems:[], notices:[], pays:[], dpst:[], inc:[], incTypes:[], expBG:[], expTypes:[], gwanTypes:[], incCards:[], awards:[], memGroups:[], fees:[]};
      fbDb.ref('/main/Config').once('value').then(function(s){
        var g = s.val() || {};
        _empty.fieldMenu = g.FIELD_MENU || "on";
        _empty.linkTabs  = g.LINK_TABS  || "on";
        resolve(_empty);
      }).catch(function(){ resolve(_empty); });
      return;
    }
    // shareMems 체크: 현재 행사가 shareMems면 메인(첫 번째) 행사의 Mems/Groups 사용
    var evts = _cache.Events || [];
    var curEvt = null;
    for (var i = 0; i < evts.length; i++) { if (evts[i].evtId === p.evtId) { curEvt = evts[i]; break; } }
    var isShare = curEvt && curEvt.shareMems;
    var mainEvtId = evts.length ? evts[0].evtId : null;
    // 메인 행사 자체는 공유 대상이 아님
    if (isShare && mainEvtId === p.evtId) isShare = false;

    loadEvtData(p.evtId).then(function(data) {
      // Config에서 라벨/타입 추출
      var cfg = {};
      (data.Config || []).forEach(function(c) { if(c && c.k) cfg[c.k] = c.v; });

      function buildResult(memData, groupData) {
        resolve({
          ok: true,
          curEvt: curEvt,
          evtId: p.evtId,
          acts: data.Acts || [],
          purs: data.Purs || [],
          exps: data.Exps || [],
          mems: memData,
          notices: data.Notices || [],
          pays: data.Pays || [],
          dpst: data.Dpst || [],
          inc: data.Inc || [],
          incTypes: (cfg.INC_TYPES || "이월금,보조금,지원금,자부담,자체수입").split(","),
          expBG: data.ExpBG || [],
          expTypes: (cfg.EXP_TYPES || "").split(",").filter(Boolean),
          gwanTypes: (cfg.GWAN_TYPES || "행사직접비,행사운영비,행사홍보비,인건비,시설비,임차비,기타").split(","),
          incCards: _parseIncCards(cfg.INC_CARDS || ""),
          awards: _parseAwards(cfg.AWARDS || ""),
          memGroups: groupData,
          fees: data.Fees || [],
          vendors: _cache.Vendors || [],
          assets: _cache.Assets || [],
          rentals: _cache.Rentals || [],
          assetCats: _cache.AssetCategories || [],
          assetLocs: _cache.AssetLocations || [],
          shareMems: !!isShare,
          LBL: {leader: cfg.LABEL_LEADER || "단장", member: cfg.LABEL_MEMBER || "단원"},
          fieldMenu: cfg.FIELD_MENU || "on",
          linkTabs: cfg.LINK_TABS || "on",
          AR: (_cache.Areas || []).map(function(a){return a.n}),
          US: _buildUserMap()
        });
      }

      // 소속 자동 스캔: 인원의 ar 값이 Groups에 없으면 자동 등록
      function _syncGroups(mems, groups, targetEvtId) {
        var existNames = {};
        groups.forEach(function(g) { existNames[g.n] = true; });
        var newGroups = [];
        mems.forEach(function(m) {
          if (m.ar && !existNames[m.ar]) {
            existNames[m.ar] = true;
            newGroups.push({id:uid(), n:m.ar, sort:groups.length + newGroups.length, note:""});
          }
        });
        if (newGroups.length) {
          groups = groups.concat(newGroups);
          saveEvtNode(targetEvtId, "Groups", groups).then(function() {
            _evtCaches[targetEvtId].Groups = groups;
          });
        }
        return groups;
      }

      if (isShare && mainEvtId) {
        loadEvtData(mainEvtId).then(function(mainData) {
          var grps = _syncGroups(mainData.Mems || [], mainData.Groups || [], mainEvtId);
          buildResult(mainData.Mems || [], grps);
        });
      } else {
        var grps = _syncGroups(data.Mems || [], data.Groups || [], p.evtId);
        buildResult(data.Mems || [], grps);
      }
    });
  });
}

function _parseIncCards(s) {
  if (!s) return [];
  return s.split(";").map(function(chunk) {
    var parts = chunk.split("|");
    var name = (parts[0]||"").trim();
    var pays = (parts[1]||"").trim().split(",").map(function(x){return x.trim();}).filter(Boolean);
    return {name: name, pays: pays};
  }).filter(function(c) { return c.name; });
}
function _serializeIncCards(cards) {
  return (cards||[]).map(function(c){
    return c.name+"|"+(c.pays||[]).join(",");
  }).join(";");
}

// ───────── 세출 대분류(EXP_TYPES) CRUD ─────────
function _cfgHelper(evtId) {
  return loadEvtData(evtId).then(function(data) {
    var cfg = {};
    (data.Config || []).forEach(function(c) { if(c && c.k) cfg[c.k] = c.v; });
    return {data:data, cfg:cfg, configArr: data.Config || []};
  });
}
function _saveCfgKey(evtId, configArr, key, val) {
  var found = false;
  for(var i=0;i<configArr.length;i++){
    if(configArr[i] && configArr[i].k === key){ configArr[i].v = val; found=true; break; }
  }
  if(!found) configArr.push({k:key, v:val});
  return saveEvtNode(evtId, "Config", configArr).then(function(){
    _evtCaches[evtId].Config = configArr;
  });
}
function _apiAddExpType(p) {
  var evtId = _getEvtId(p);
  if(!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _cfgHelper(evtId).then(function(h){
    var types = (h.cfg.EXP_TYPES||"").split(",").filter(Boolean);
    if(types.indexOf(p.name)>=0) return {ok:false, err:"이미 존재합니다"};
    types.push(p.name);
    return _saveCfgKey(evtId, h.configArr, "EXP_TYPES", types.join(",")).then(function(){
      return {ok:true, types:types};
    });
  });
}
function _apiRenameExpType(p) {
  var evtId = _getEvtId(p);
  if(!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _cfgHelper(evtId).then(function(h){
    var types = (h.cfg.EXP_TYPES||"").split(",").filter(Boolean);
    var idx = types.indexOf(p.oldName);
    if(idx<0) return {ok:false, err:"대분류를 찾을 수 없습니다"};
    types[idx] = p.newName;
    return _saveCfgKey(evtId, h.configArr, "EXP_TYPES", types.join(",")).then(function(){
      return {ok:true, types:types};
    });
  });
}
function _apiDeleteExpType(p) {
  var evtId = _getEvtId(p);
  if(!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _cfgHelper(evtId).then(function(h){
    var types = (h.cfg.EXP_TYPES||"").split(",").filter(function(t){ return t && t!==p.name; });
    return _saveCfgKey(evtId, h.configArr, "EXP_TYPES", types.join(",")).then(function(){
      return {ok:true, types:types};
    });
  });
}

// ───────── 카드/계좌 CRUD ─────────
function _incCardHelper(evtId) {
  return loadEvtData(evtId).then(function(data) {
    var cfg = {};
    (data.Config || []).forEach(function(c) { if(c && c.k) cfg[c.k] = c.v; });
    return {data:data, cfg:cfg, cards: _parseIncCards(cfg.INC_CARDS || "")};
  });
}
function _saveIncCards(evtId, data, cards) {
  var configArr = data.Config || [];
  var found = false;
  var serialized = _serializeIncCards(cards);
  for(var i=0;i<configArr.length;i++){
    if(configArr[i] && configArr[i].k === "INC_CARDS"){ configArr[i].v = serialized; found=true; break; }
  }
  if(!found) configArr.push({k:"INC_CARDS", v:serialized});
  return saveEvtNode(evtId, "Config", configArr).then(function(){
    _evtCaches[evtId].Config = configArr;
    return {ok:true, cards:cards};
  });
}
function _apiAddIncCard(p) {
  var evtId = _getEvtId(p);
  if(!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _incCardHelper(evtId).then(function(h){
    if(h.cards.some(function(c){return c.name===p.name;}))
      return {ok:false, err:"이미 존재하는 이름입니다"};
    h.cards.push({name:p.name, pays:p.pays||[]});
    return _saveIncCards(evtId, h.data, h.cards);
  });
}
function _apiUpdateIncCard(p) {
  var evtId = _getEvtId(p);
  if(!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _incCardHelper(evtId).then(function(h){
    var idx=-1;
    for(var i=0;i<h.cards.length;i++){ if(h.cards[i].name===p.oldName){idx=i;break;} }
    if(idx<0) return {ok:false, err:"카드/계좌를 찾을 수 없습니다"};
    h.cards[idx].name = p.newName || p.oldName;
    h.cards[idx].pays = p.pays || h.cards[idx].pays;
    return _saveIncCards(evtId, h.data, h.cards);
  });
}
function _apiDeleteIncCard(p) {
  var evtId = _getEvtId(p);
  if(!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _incCardHelper(evtId).then(function(h){
    h.cards = h.cards.filter(function(c){return c.name!==p.name;});
    return _saveIncCards(evtId, h.data, h.cards);
  });
}

// ───────── 파일 업로드 (Google Drive via GAS Proxy) ─────────
var DRIVE_PROXY_URL = "";

function _driveProxy(payload) {
  if (!DRIVE_PROXY_URL) {
    var cfg = (_evtCaches && _evtCaches[_getEvtId({})||""] && _evtCaches[_getEvtId({})||""].Config) || [];
    for (var i = 0; i < cfg.length; i++) {
      if (cfg[i] && cfg[i].k === "DRIVE_PROXY_URL") { DRIVE_PROXY_URL = cfg[i].v || ""; break; }
    }
    if (!DRIVE_PROXY_URL && _cache && _cache.DriveProxyUrl) DRIVE_PROXY_URL = _cache.DriveProxyUrl;
  }
  if (!DRIVE_PROXY_URL) return Promise.resolve({ok:false, err:"드라이브 프록시 URL 미설정. 행사관리에서 설정하세요."});
  return fetch(DRIVE_PROXY_URL, {
    method: "POST",
    headers: {"Content-Type": "text/plain"},
    body: JSON.stringify(payload),
    redirect: "follow"
  }).then(function(r) { return r.json(); })
    .catch(function(err) { return {ok:false, err:"프록시 통신 실패: " + err.message}; });
}

function _apiUploadPhoto(p) {
  var dataUrl = p.dataUrl;
  if (!dataUrl) return Promise.resolve({ok:false, err:"사진 데이터 없음"});
  var parts = dataUrl.split(",");
  var mime = (parts[0].match(/:(.*?);/)||[])[1] || "image/jpeg";
  var base64 = parts[1];
  var evtId = _getEvtId(p) || "general";
  var category = p.type === "purchase" ? "구매사진" : "활동사진";
  return _driveProxy({
    action: "upload",
    base64: base64,
    mime: mime,
    filename: p.name || ("photo_" + Date.now() + ".jpg"),
    category: category,
    evtId: evtId
  });
}

function _apiDeletePhoto(p) {
  var fileId = null;
  if (p.url) {
    var m = String(p.url).match(/id=([^&]+)/);
    if (m) fileId = m[1];
  }
  if (p.id) fileId = p.id;
  if (!fileId) return Promise.resolve({ok:false, err:"삭제할 파일 ID 없음"});
  return _driveProxy({action: "delete", fileId: fileId});
}

// ───────── 범용 CRUD (행사별 데이터) ─────────
function _getEvtId(p) {
  return p.evtId || (typeof CUR_EVT !== 'undefined' && CUR_EVT ? CUR_EVT.evtId : null);
}

function _apiAddRow(p, nodeName) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var arr = data[nodeName] || [];
    var row = Object.assign({}, p);
    delete row.action; delete row.evtId; delete row.by;
    if (!row.id) row.id = uid();
    if (!row.createdAt) row.createdAt = now_();
    row.evtId = evtId;
    arr.push(row);
    return saveEvtNode(evtId, nodeName, arr).then(function() {
      _evtCaches[evtId][nodeName] = arr;
      return {ok:true, id:row.id};
    });
  });
}

function _apiUpdateRow(p, nodeName) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var arr = data[nodeName] || [];
    var idx = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === p.id) { idx = i; break; }
    }
    if (idx < 0) return {ok:false, err:"항목을 찾을 수 없습니다"};
    var row = arr[idx];
    Object.keys(p).forEach(function(k) {
      if (k !== 'action' && k !== 'by') row[k] = p[k];
    });
    arr[idx] = row;
    return saveEvtNode(evtId, nodeName, arr).then(function() {
      _evtCaches[evtId][nodeName] = arr;
      return {ok:true};
    });
  });
}

function _apiDeleteRow(p, nodeName) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var arr = data[nodeName] || [];
    arr = arr.filter(function(r) { return r.id !== p.id; });
    return saveEvtNode(evtId, nodeName, arr).then(function() {
      _evtCaches[evtId][nodeName] = arr;
      return {ok:true};
    });
  });
}

// ───────── 인원 추가/수정 (소속 자동 등록 포함) ─────────
function _autoRegisterGroup(evtId, arName) {
  if (!arName) return Promise.resolve();
  var data = _evtCaches[evtId];
  if (!data) return Promise.resolve();
  var groups = data.Groups || [];
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].n === arName) return Promise.resolve(); // 이미 존재
  }
  groups.push({id:uid(), n:arName, sort:groups.length, note:""});
  return saveEvtNode(evtId, "Groups", groups).then(function() {
    _evtCaches[evtId].Groups = groups;
  });
}
function _apiAddMem(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var arr = data.Mems || [];
    var row = Object.assign({}, p);
    delete row.action; delete row.evtId; delete row.by;
    if (!row.id) row.id = uid();
    if (!row.createdAt) row.createdAt = now_();
    row.evtId = evtId;
    arr.push(row);
    return saveEvtNode(evtId, "Mems", arr).then(function() {
      _evtCaches[evtId].Mems = arr;
      return _autoRegisterGroup(evtId, row.ar).then(function() {
        return {ok:true, id:row.id};
      });
    });
  });
}
function _apiUpdateMem(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var arr = data.Mems || [];
    var idx = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === p.id) { idx = i; break; }
    }
    if (idx < 0) return {ok:false, err:"항목을 찾을 수 없습니다"};
    var row = arr[idx];
    Object.keys(p).forEach(function(k) {
      if (k !== 'action' && k !== 'by') row[k] = p[k];
    });
    arr[idx] = row;
    return saveEvtNode(evtId, "Mems", arr).then(function() {
      _evtCaches[evtId].Mems = arr;
      return _autoRegisterGroup(evtId, row.ar).then(function() {
        return {ok:true};
      });
    });
  });
}

// ───────── 소속/그룹 — shareMems면 메인 행사에서 읽고/쓰기 ─────────
function _getGroupEvtId(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return null;
  var evts = _cache.Events || [];
  var curEvt = null;
  for (var i = 0; i < evts.length; i++) { if (evts[i].evtId === evtId) { curEvt = evts[i]; break; } }
  var mainEvtId = evts.length ? evts[0].evtId : null;
  if (curEvt && curEvt.shareMems && mainEvtId && mainEvtId !== evtId) return mainEvtId;
  return evtId;
}
function _apiListGroups(p) {
  var evtId = _getGroupEvtId(p);
  if (!evtId) return Promise.resolve({ok:true, rows:[]});
  return loadEvtData(evtId).then(function(data) {
    return {ok:true, rows: data.Groups || []};
  });
}
function _apiGroupWrite(p, mode) {
  var evtId = _getGroupEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  if (mode === "add") return _apiAddRow(Object.assign({}, p, {evtId:evtId}), "Groups");
  if (mode === "update") return _apiUpdateRow(Object.assign({}, p, {evtId:evtId}), "Groups");
  if (mode === "delete") return _apiDeleteRow(Object.assign({}, p, {evtId:evtId}), "Groups");
  return Promise.resolve({ok:false, err:"잘못된 모드"});
}

function _apiListEvtNode(p, nodeName) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:true, rows:[]});
  return loadEvtData(evtId).then(function(data) {
    return {ok:true, rows: data[nodeName] || []};
  });
}

function _apiBulkAdd(p, nodeName) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  var newRows = p.rows || [];
  return loadEvtData(evtId).then(function(data) {
    var arr = data[nodeName] || [];
    newRows.forEach(function(r) {
      if (!r.id) r.id = uid();
      if (!r.createdAt) r.createdAt = now_();
      r.evtId = evtId;
      arr.push(_fbSafeRow(r));
    });
    return saveEvtNode(evtId, nodeName, arr).then(function() {
      _evtCaches[evtId][nodeName] = arr;
      return {ok:true, added:newRows.length, count:newRows.length};
    });
  });
}

function _apiBulkReplace(p, nodeName) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  var newRows = p.rows || [];
  newRows = newRows.map(function(r) {
    if (!r.id) r.id = uid();
    r.evtId = evtId;
    return _fbSafeRow(r);
  });
  return saveEvtNode(evtId, nodeName, newRows).then(function() {
    _evtCaches[evtId][nodeName] = newRows;
    return {ok:true, count:newRows.length};
  });
}

function _apiBulkUpsert(p, nodeName) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var arr = data[nodeName] || [];
    var rows = p.rows || [];
    var added = 0, updated = 0;
    rows.forEach(function(r) {
      r.evtId = evtId;
      var idx = -1;
      // tp+mid 조합으로 매칭 (ExpBG 등)
      if (r.tp && idx < 0) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].tp === r.tp && (arr[i].mid||"") === (r.mid||"")) { idx = i; break; }
        }
      }
      if (r.name && idx < 0) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].name === r.name || arr[i].tp === r.name) { idx = i; break; }
        }
      }
      if (r.id && idx < 0) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === r.id) { idx = i; break; }
        }
      }
      var sr = _fbSafeRow(r);
      if (idx >= 0) { Object.assign(arr[idx], sr); updated++; }
      else { if (!sr.id) sr.id = uid(); arr.push(sr); added++; }
    });
    return saveEvtNode(evtId, nodeName, arr).then(function() {
      _evtCaches[evtId][nodeName] = arr;
      return {ok:true, added:added, updated:updated, count:rows.length};
    });
  });
}

// ───────── 범용 CRUD (메인 데이터) ─────────
function _apiListMainNode(p, nodeName) {
  return Promise.resolve({ok:true, rows: _cache[nodeName] || []});
}

function _apiAddMainRow(p, nodeName) {
  var arr = (_cache[nodeName] || []).slice();
  var row = Object.assign({}, p);
  delete row.action; delete row.by;
  if (!row.id) row.id = uid();
  if (!row.createdAt) row.createdAt = now_();
  arr.push(row);
  return saveMainNode(nodeName, arr).then(function() {
    _cache[nodeName] = arr;
    return {ok:true, id:row.id};
  });
}

function _apiUpdateMainRow(p, nodeName) {
  var arr = (_cache[nodeName] || []).slice();
  var idx = -1;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === p.id) { idx = i; break; }
  }
  if (idx < 0) return Promise.resolve({ok:false, err:"항목을 찾을 수 없습니다"});
  // 📦 자산 바코드 중복 방지 — 다른 자산과 같은 바코드로 바꾸려 하면 거부
  if (nodeName === "Assets" && p.barcode != null && String(p.barcode).trim()) {
    var bc = String(p.barcode).trim();
    for (var j = 0; j < arr.length; j++) {
      if (j !== idx && String(arr[j].barcode||"").trim() === bc) {
        return Promise.resolve({ok:false, err:"이미 같은 바코드("+bc+")의 자산이 있습니다"});
      }
    }
  }
  Object.keys(p).forEach(function(k) {
    if (k !== 'action' && k !== 'by') arr[idx][k] = p[k];
  });
  return saveMainNode(nodeName, arr).then(function() {
    _cache[nodeName] = arr;
    return {ok:true};
  });
}

function _apiDeleteMainRow(p, nodeName) {
  var arr = (_cache[nodeName] || []).filter(function(r) { return r.id !== p.id; });
  return saveMainNode(nodeName, arr).then(function() {
    _cache[nodeName] = arr;
    return {ok:true};
  });
}

// ───────── 행사 관리 ─────────
function _apiListEvents(p) {
  // deep-copy로 반환 — EVTMGR.events가 _cache 참조를 공유하면 모듈 편집 시 꼬임
  var evts = JSON.parse(JSON.stringify(_cache.Events || []));
  var acct = JSON.parse(JSON.stringify(_cache.AcctEvt || []));
  return Promise.resolve({ok:true, events: evts, acctEvt: acct});
}

function _apiAddEvent(p) {
  var events = JSON.parse(JSON.stringify(_cache.Events || []));
  var ev = {
    evtId: p.evtId || uid(),
    nm: p.nm || "",
    yr: p.yr || new Date().getFullYear().toString(),
    active: p.active !== false,
    modules: p.modules || "apply,budget,purchase,act,mem",
    note: p.note || "",
    shareMems: !!p.shareMems,
    createdAt: now_()
  };
  events.push(ev);
  // 행사별 빈 데이터 노드도 생성
  var emptyEvtData = {};
  EVT_NODES.forEach(function(n) { emptyEvtData[n] = []; });
  return Promise.all([
    saveMainNode("Events", events),
    fbDb.ref('/evtData/' + ev.evtId).set(emptyEvtData)
  ]).then(function() {
    _cache.Events = events;
    return {ok:true, evtId:ev.evtId};
  });
}

function _apiUpdateEvent(p) {
  // deep-copy 전체 배열 — shallow .slice()는 객체 공유 참조 버그 유발
  var events = JSON.parse(JSON.stringify(_cache.Events || []));
  var idx = -1;
  for (var i = 0; i < events.length; i++) {
    if (events[i].evtId === p.evtId) { idx = i; break; }
  }
  if (idx < 0) return Promise.resolve({ok:false, err:"행사를 찾을 수 없습니다"});
  Object.keys(p).forEach(function(k) {
    if (k !== 'action' && k !== 'by') events[idx][k] = p[k];
  });
  return saveMainNode("Events", events).then(function() {
    _cache.Events = events;
    return {ok:true};
  });
}

function _apiDeleteEvent(p) {
  var events = (_cache.Events || []).filter(function(e) { return e.evtId !== p.evtId; });
  return Promise.all([
    saveMainNode("Events", events),
    fbDb.ref('/evtData/' + p.evtId).remove()
  ]).then(function() {
    _cache.Events = events;
    delete _evtCaches[p.evtId];
    return {ok:true};
  });
}

// ───────── 계정 관리 ─────────
function _apiAddAcct(p) {
  var users = (_cache.Users || []).slice();
  if (users.some(function(u) { return u.id === p.id; })) {
    return Promise.resolve({ok:false, err:"이미 존재하는 아이디입니다"});
  }
  var user = {id:p.id, pw:p.pw||"1234", r:p.r||"user", ar:p.ar||"", nm:p.nm||"", tel:p.tel||""};
  users.push(user);
  // Firebase Auth에도 계정 생성
  var secAuth = getSecondaryAuth();
  var email = p.id + "@dano.local";
  return secAuth.createUserWithEmailAndPassword(email, p.pw || "123456").then(function(cred) {
    return secAuth.signOut().then(function() {
      return saveMainNode("Users", users);
    });
  }).then(function() {
    _cache.Users = users;
    return {ok:true};
  }).catch(function(err) {
    // Auth 실패해도 Users에는 저장 (호환성)
    return saveMainNode("Users", users).then(function() {
      _cache.Users = users;
      return {ok:true, warn:"Firebase Auth 생성 실패: " + err.message};
    });
  });
}

function _apiUpdateAcct(p) {
  return _apiUpdateMainRow(p, "Users");
}

function _apiDeleteAcct(p) {
  var users = (_cache.Users || []).filter(function(u) { return u.id !== p.id; });
  return saveMainNode("Users", users).then(function() {
    _cache.Users = users;
    return {ok:true};
  });
}

function _apiChgMyPw(p) {
  var users = (_cache.Users || []).slice();
  for (var i = 0; i < users.length; i++) {
    if (users[i].id === p.id) {
      if (users[i].pw !== p.oldPw) return Promise.resolve({ok:false, err:"현재 비밀번호가 틀립니다"});
      users[i].pw = p.newPw;
      return saveMainNode("Users", users).then(function() {
        _cache.Users = users;
        return {ok:true};
      }).catch(function(e){
        return {ok:false, err:"저장 실패: "+((e&&e.message)||e)+" (DB 규칙/권한 확인)"};
      });
    }
  }
  return Promise.resolve({ok:false, err:"계정을 찾을 수 없습니다 (목록 미로딩일 수 있음)"});
}

function _apiSaveAcctEvt(p) {
  var arr = (_cache.AcctEvt || []).slice();
  if (p.id) {
    // 수정
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === p.id) {
        Object.keys(p).forEach(function(k) { if(k!=='action'&&k!=='by') arr[i][k]=p[k]; });
        break;
      }
    }
  } else {
    // 추가 — 같은 acctId+evtId 중복 방지
    var dup = arr.filter(function(a) { return a.acctId === p.acctId && a.evtId === p.evtId; });
    if (dup.length > 0) {
      // 이미 있으면 업데이트
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].acctId === p.acctId && arr[i].evtId === p.evtId) {
          arr[i].role = p.role || arr[i].role;
          arr[i].note = p.note != null ? p.note : arr[i].note;
          break;
        }
      }
    } else {
      arr.push({id:uid(), evtId:p.evtId, acctId:p.acctId, role:p.role||"user", note:p.note||"", createdAt:now_()});
    }
  }
  return saveMainNode("AcctEvt", arr).then(function() {
    _cache.AcctEvt = arr;
    return {ok:true};
  });
}

function _apiDeleteAcctEvt(p) {
  var arr = (_cache.AcctEvt || []).filter(function(r) {
    if (p.id) return r.id !== p.id;
    return !(r.acctId === p.acctId && r.evtId === p.evtId);
  });
  return saveMainNode("AcctEvt", arr).then(function() {
    _cache.AcctEvt = arr;
    return {ok:true};
  });
}

// ───────── Config ─────────
function _apiSetConfig(p) {
  var evtId = _getEvtId(p);
  if (!evtId) {
    // 행사 없는 시스템(가문굴비 등) → 전역 /main/Config(객체)에 저장
    var upd = {}; upd[p.key] = p.value;
    return fbDb.ref('/main/Config').update(upd)
      .then(function(){ return {ok:true, global:true}; })
      .catch(function(e){ return {ok:false, err:(e&&e.message)||String(e)}; });
  }
  return loadEvtData(evtId).then(function(data) {
    var cfg = data.Config || [];
    var found = false;
    for (var i = 0; i < cfg.length; i++) {
      if (cfg[i].k === p.key) {
        cfg[i].v = p.value;
        if (p.note !== undefined) cfg[i].note = p.note;
        found = true;
        break;
      }
    }
    if (!found) {
      cfg.push({k:p.key, v:p.value, note:p.note||""});
    }
    return saveEvtNode(evtId, "Config", cfg).then(function() {
      _evtCaches[evtId].Config = cfg;
      return {ok:true};
    });
  });
}

// ───────── SMS (알리고) ─────────
function _getAligoCfg(evtId) {
  return loadEvtData(evtId).then(function(data) {
    var cfg = {};
    (data.Config || []).forEach(function(c) { if(c && c.k) cfg[c.k] = c.v; });
    return {
      apiKey:    cfg.ALIGO_API_KEY  || "",
      userId:    cfg.ALIGO_USER_ID  || "",
      sender:    cfg.ALIGO_SENDER   || "",
      proxyUrl:  cfg.SMS_PROXY_URL  || "",
      senderKey: cfg.ALIGO_SENDER_KEY || "",
      tplCode:   cfg.ALIGO_TPL_CODE   || "",
      kakaoOn:   cfg.ALIGO_KAKAO_ON === "1",
      smsSignature: cfg.SMS_SIGNATURE || ""
    };
  });
}
function _getSensCfg(evtId) {
  return loadEvtData(evtId).then(function(data) {
    var cfg = {};
    (data.Config || []).forEach(function(c) { if(c && c.k) cfg[c.k] = c.v; });
    return {
      provider:   cfg.SMS_PROVIDER || "",
      serviceId:  cfg.NAVER_SENS_SERVICE_ID || "",
      sender:     cfg.NAVER_SENS_SENDER || "",
      accessKey:  cfg.NAVER_SENS_ACCESS_KEY || "",
      secretKey:  cfg.NAVER_SENS_SECRET_KEY || "",
      smsSignature: cfg.SMS_SIGNATURE || "",
      tplCode:    cfg.ALIGO_TPL_CODE || "",
      kakaoOn:    cfg.ALIGO_KAKAO_ON === "1"
    };
  });
}
function _getSmsCfgAuto(evtId) {
  return loadEvtData(evtId).then(function(data) {
    var cfg = {};
    (data.Config || []).forEach(function(c) { if(c && c.k) cfg[c.k] = c.v; });
    return { provider: cfg.SMS_PROVIDER || "" };
  });
}
function _apiGetAligoCfg(p) {
  // 이름은 유지(호환) — getSmsCfg 액션에서 호출됨
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _getAligoCfg(evtId).then(function(ac) {
    return _getSensCfg(evtId).then(function(nc) {
      return {
        ok: true,
        provider: nc.provider,
        hasKey: !!ac.apiKey,
        aligoKeyMask: ac.apiKey ? ("***" + ac.apiKey.slice(-4)) : "",
        aligoUser: ac.userId,
        aligoSender: ac.sender,
        proxyUrl: ac.proxyUrl ? "설정됨" : "",
        sensServiceId: nc.serviceId, sensSender: nc.sender,
        hasSensAccess: !!nc.accessKey, hasSensSecret: !!nc.secretKey,
        sensAccessMask: nc.accessKey ? ("***" + nc.accessKey.slice(-4)) : "",
        sensSecretMask: nc.secretKey ? ("***" + nc.secretKey.slice(-4)) : "",
        smsSignature: nc.smsSignature || ac.smsSignature,
        tplCode: nc.tplCode || ac.tplCode,
        kakaoOn: nc.kakaoOn || ac.kakaoOn
      };
    });
  });
}
function _apiCheckSmsConfig(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _getSmsCfgAuto(evtId).then(function(info) {
    if (info.provider === "naver") {
      return _getSensCfg(evtId).then(function(c) {
        return _getAligoCfg(evtId).then(function(ac) {
          if (!ac.proxyUrl) return {ok:false, err:"SMS 프록시 URL 미설정 — GAS 웹앱 URL을 등록하세요"};
          if (!c.serviceId) return {ok:false, err:"네이버 SENS 서비스 ID 미설정"};
          if (!c.accessKey || !c.secretKey) return {ok:false, err:"네이버 SENS Access/Secret Key 미설정"};
          if (!c.sender) return {ok:false, err:"네이버 SENS 발신번호 미설정"};
          return {ok:true};
        });
      });
    }
    return _getAligoCfg(evtId).then(function(c) {
      if (!c.proxyUrl) return {ok:false, err:"SMS 프록시 URL 미설정 — 시스템설정 → SMS 설정"};
      if (!c.apiKey || !c.userId || !c.sender) return {ok:false, err:"알리고 API Key / User ID / 발신번호를 설정하세요."};
      return {ok:true};
    });
  });
}
function _apiSendSmsAligo(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _getSmsCfgAuto(evtId).then(function(info) {
    if (info.provider === "naver") return _apiSendSmsNaver(p, evtId);
    return _apiSendSmsAligoReal(p, evtId);
  });
}
// 네이버 SENS 발송 (GAS 프록시 경유)
function _apiSendSmsNaver(p, evtId) {
  return _getSensCfg(evtId).then(function(c) {
    if (!c.serviceId || !c.accessKey || !c.secretKey || !c.sender)
      return {ok:false, err:"네이버 SENS 설정 미완료"};
    // 프록시 URL 확인 (알리고와 동일 키 SMS_PROXY_URL 사용)
    return _getAligoCfg(evtId).then(function(ac) {
      var proxyUrl = ac.proxyUrl;
      if (!proxyUrl) return {ok:false, err:"SMS 프록시 URL 미설정 — 시스템설정에서 GAS 프록시 URL을 등록하세요"};
      var tels = p.tels || [];
      if (!tels.length) return {ok:false, err:"수신번호 없음"};
      var body = {
        action:    "send",
        serviceId: c.serviceId,
        accessKey: c.accessKey,
        secretKey: c.secretKey,
        sender:    c.sender,
        tels:      tels,
        msg:       p.msg || ""
      };
      if (p.rdate) { body.rdate = p.rdate; body.rtime = p.rtime || ""; }
      return fetch(proxyUrl, {
        method: "POST",
        redirect: "follow",
        body: JSON.stringify(body)
      }).then(function(resp) { return resp.json(); }).then(function(r) {
        if (r && r.ok) {
          _apiSmsLogAdd({evtId:evtId, by:(typeof CID!=='undefined'?CID:""), tels:tels, msg:p.msg||"",
            sent:r.sent||tels.length, failed:r.failed||0, type:r.msgType||"SMS", rdate:p.rdate||""});
        }
        return r;
      }).catch(function(e) {
        return {ok:false, err:"SENS 프록시 통신 오류: "+(e.message||e)};
      });
    });
  });
}
// 알리고 프록시 발송 (기존)
function _apiSendSmsAligoReal(p, evtId) {
  return _getAligoCfg(evtId).then(function(c) {
    if (!c.proxyUrl) return {ok:false, err:"SMS 프록시 URL 미설정 — 시스템설정 → SMS 설정"};
    if (!c.apiKey || !c.userId || !c.sender) return {ok:false, err:"알리고 설정 미완료 (API Key/User ID/발신번호)"};
    var tels = p.tels || [];
    if (!tels.length) return {ok:false, err:"수신번호 없음"};
    var body = {
      action:   "send",
      apiKey:   c.apiKey,
      userId:   c.userId,
      sender:   c.sender,
      tels:     tels,
      msg:      p.msg || "",
      title:    p.title || "",
      testMode: !!p.testMode
    };
    if (p.rdate) { body.rdate = p.rdate; body.rtime = p.rtime || ""; }
    return fetch(c.proxyUrl, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify(body)
    }).then(function(resp) { return resp.json(); }).then(function(r) {
      if (r && r.ok) {
        _apiSmsLogAdd({
          evtId: evtId,
          by: (typeof CID !== 'undefined' ? CID : ""),
          tels: tels,
          msg: p.msg || "",
          sent: r.sent || tels.length,
          failed: r.failed || 0,
          type: r.msgType || "SMS",
          rdate: p.rdate || ""
        });
      }
      return r;
    }).catch(function(e) {
      return {ok:false, err:"프록시 통신 실패: " + (e.message||e)};
    });
  });
}
function _apiAligoProxy(p, action) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return _getAligoCfg(evtId).then(function(c) {
    if (!c.proxyUrl) return {ok:false, err:"SMS 프록시 URL 미설정"};
    if (!c.apiKey || !c.userId) return {ok:false, err:"알리고 설정 미완료"};
    var body = {action: action, apiKey: c.apiKey, userId: c.userId};
    if (p.mid) body.mid = p.mid;
    if (p.page) body.page = p.page;
    if (p.pageSize) body.pageSize = p.pageSize;
    return fetch(c.proxyUrl, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body)
    }).then(function(resp) { return resp.json(); }).catch(function(e) {
      return {ok:false, err:"프록시 통신 실패: " + (e.message||e)};
    });
  });
}
function _apiSmsLogAdd(p) {
  var evtId = p.evtId || _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:true});
  return loadEvtData(evtId).then(function(data) {
    var log = data.SmsLog || [];
    log.push({
      ts:      new Date().toISOString(),
      by:      p.by || "",
      cnt:     (p.tels||[]).length || p.sent || 0,
      sent:    p.sent || 0,
      failed:  p.failed || 0,
      type:    p.type || "SMS",
      preview: (p.msg||"").slice(0,80),
      rdate:   p.rdate || ""
    });
    if (log.length > 500) log = log.slice(-500);
    return saveEvtNode(evtId, "SmsLog", log).then(function() {
      _evtCaches[evtId].SmsLog = log;
      return {ok:true};
    });
  }).catch(function() { return {ok:true}; });
}
function _apiSmsLogList(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var log = (data.SmsLog || []).slice().reverse();
    return {ok:true, list: log.slice(0, p.limit || 100)};
  });
}

// ───────── 상(수상 종류) 관리 ─────────
// AWARDS 저장 형식: JSON 배열 [{n,giver,sort}]  (구형: 쉼표 문자열 호환)
function _parseAwards(raw) {
  if (!raw) return [];
  // JSON 배열 시도
  if (raw.charAt(0) === '[') {
    try { var arr = JSON.parse(raw); return arr.filter(function(a){return !!(a&&a.n)}); } catch(e){}
  }
  // 구형 쉼표 문자열
  return raw.split(",").filter(Boolean).map(function(s,i){return {n:s.trim(),giver:"",sort:i}});
}
function _awardsConfigVal(list) {
  return JSON.stringify(list);
}
function _getAwardsList(evtId) {
  var data = _evtCaches[evtId];
  if (!data) return [];
  var cfg = data.Config || [];
  for (var i = 0; i < cfg.length; i++) {
    if (cfg[i].k === "AWARDS") return _parseAwards(cfg[i].v || "");
  }
  return [];
}
function _saveAwardsList(evtId, list) {
  return _apiSetConfig({evtId:evtId, key:"AWARDS", value:_awardsConfigVal(list)}).then(function() {
    return {ok:true, awards:list};
  });
}
function _apiAddAward(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function() {
    var list = _getAwardsList(evtId);
    var maxSort = 0;
    list.forEach(function(a){ if ((a.sort||0) > maxSort) maxSort = a.sort||0; });
    list.push({n:p.name, giver:p.giver||"", sort:p.sort!=null?Number(p.sort):(maxSort+1)});
    return _saveAwardsList(evtId, list);
  });
}
function _apiRenameAward(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function() {
    var list = _getAwardsList(evtId);
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].n === p.oldName && (list[i].giver||"") === (p.oldGiver||"")) {
        list[i].n = p.newName;
        list[i].giver = p.newGiver || "";
        if (p.sort != null) list[i].sort = Number(p.sort);
        found = true;
        break;
      }
    }
    if (!found) return Promise.resolve({ok:false, err:"해당 상을 찾을 수 없습니다"});
    return _saveAwardsList(evtId, list);
  });
}
function _apiDeleteAward(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function() {
    var list = _getAwardsList(evtId);
    list = list.filter(function(a) {
      return !(a.n === p.name && (a.giver||"") === (p.giver||""));
    });
    return _saveAwardsList(evtId, list);
  });
}

function _apiGetLabels(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:true, leader:"단장", member:"단원"});
  var data = _evtCaches[evtId];
  if (!data) return Promise.resolve({ok:true, leader:"단장", member:"단원"});
  var cfg = {};
  (data.Config || []).forEach(function(c) { if(c&&c.k) cfg[c.k]=c.v; });
  return Promise.resolve({ok:true, leader:cfg.LABEL_LEADER||"단장", member:cfg.LABEL_MEMBER||"단원"});
}

function _apiSetLabels(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var cfg = data.Config || [];
    _upsertCfgArr(cfg, "LABEL_LEADER", p.leader || "단장");
    _upsertCfgArr(cfg, "LABEL_MEMBER", p.member || "단원");
    return saveEvtNode(evtId, "Config", cfg).then(function() {
      _evtCaches[evtId].Config = cfg;
      return {ok:true};
    });
  });
}

function _upsertCfgArr(arr, key, value) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].k === key) { arr[i].v = value; return; }
  }
  arr.push({k:key, v:value, note:""});
}

// ───────── 텔레그램 알림 ─────────
var TG_BOT_TOKEN = "8761665630:AAGv9FjG4fcxee4hpyjoIjd5wkXm0c-_qV0";
var TG_CHAT_IDS  = "8613833560";
var TG_SYS_URL   = "https://junghaewon9776.github.io/bspdano-system/";

function _apiNotifyLogin(p) {
  var botToken = TG_BOT_TOKEN;
  var chatIds = TG_CHAT_IDS;
  if (!botToken || !chatIds) return Promise.resolve({ok:true});

  // 역할 라벨
  var roleMap = {super:"⚡ SUPER", admin:"👑 ADMIN", subAdm:"🛡️ SUBADMIN"};
  var roleLabel = roleMap[p.role] || "🟢 일반";
  // UA → 기기 파싱
  var dev = "";
  var ua = p.ua || "";
  if (ua) {
    var br = /Edg\//.test(ua)?"Edge":/OPR\//.test(ua)?"Opera":/Chrome\//.test(ua)?"Chrome":/Safari\//.test(ua)?"Safari":/Firefox\//.test(ua)?"Firefox":"브라우저";
    var os = /Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"Mac":/Android/.test(ua)?"Android":/iPhone|iPad/.test(ua)?"iOS":/Linux/.test(ua)?"Linux":"";
    dev = br + (os ? " on " + os : "");
  }
  var text;
  if (p.logout) {
    text = "🔒 <b>로그아웃</b>"
      + "\n• 계정: " + (p.id||"") + (p.nm ? " (" + p.nm + ")" : "")
      + "\n• 역할: " + roleLabel
      + (p.evtNm ? "\n• 행사: " + p.evtNm : "")
      + "\n• 사유: " + (p.reason||"수동")
      + "\n• IP: " + (p.ip||"-")
      + (dev ? "\n• 기기: " + dev : "")
      + "\n• 시각: " + now_();
  } else if (p.fail) {
    text = "❌ <b>로그인 실패</b>"
      + "\n• 계정: " + (p.id||"")
      + "\n• 사유: " + (p.err||"")
      + "\n• IP: " + (p.ip||"-")
      + (dev ? "\n• 기기: " + dev : "")
      + "\n• 시각: " + now_();
  } else {
    text = "✅ <b>로그인 성공</b>"
      + "\n• 계정: " + (p.id||"") + (p.nm ? " (" + p.nm + ")" : "")
      + "\n• 역할: " + roleLabel
      + (p.evtNm ? "\n• 행사: " + p.evtNm : "")
      + "\n• IP: " + (p.ip||"-")
      + (dev ? "\n• 기기: " + dev : "")
      + "\n• 시각: " + now_()
      + "\n\n<a href=\"" + TG_SYS_URL + "\">🔗 링크열기</a>";
  }
  var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  var ids = chatIds.split(/[,\s]+/).filter(Boolean);

  return Promise.all(ids.map(function(chatId) {
    return fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:chatId, text:text, parse_mode:'HTML'})
    }).catch(function(e) { console.warn('텔레그램 전송 실패:', e); });
  })).then(function() { return {ok:true}; });
}

// ───────── Drive 사진 (GAS 프록시) ─────────
var _drivePhotoConfig = null;

function getDrivePhotoConfig() {
  if (_drivePhotoConfig) return _drivePhotoConfig;
  // Firebase에서 설정 읽기
  if (_cache && _cache.drivePhoto) return _cache.drivePhoto;
  return {};
}

function setDrivePhotoConfig(cfg) {
  _drivePhotoConfig = cfg;
  return fbDb.ref('/main/drivePhoto').set(cfg);
}

// ───────── 참가자 (Apply) ─────────
function _apiListApply(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:true, headers:[], rows:[]});
  return new Promise(function(resolve) {
    fbDb.ref('/evtData/' + evtId + '/Apply').once('value', function(snap) {
      var raw = snap.val();
      if (!raw) return resolve({ok:true, headers:[], rows:[], note:"참가자 데이터가 없습니다."});
      // Firebase sparse array/object → 실제 배열로 변환 (null 제거)
      var arr = [];
      if (Array.isArray(raw)) {
        arr = raw.filter(function(r) { return r != null; });
      } else if (typeof raw === 'object') {
        Object.keys(raw).forEach(function(k) { if (raw[k] != null) arr.push(raw[k]); });
      }
      if (!arr.length) return resolve({ok:true, headers:[], rows:[], note:"참가자 데이터가 없습니다."});
      // Firebase 전각 키 → 원래 키로 복원
      arr = arr.map(function(r) {
        if (!r || typeof r !== 'object') return r;
        var out = {};
        Object.keys(r).forEach(function(k) { out[_fbRestoreKey(k)] = r[k]; });
        return out;
      });
      // 헤더 추출 (모든 row의 키 합집합)
      var colSet = {};
      var colOrder = [];
      arr.forEach(function(r) {
        if (!r || typeof r !== 'object') return;
        Object.keys(r).forEach(function(k) {
          if (!colSet[k]) { colSet[k] = true; colOrder.push(k); }
        });
      });
      // 기본 헤더 순서 적용 (양식 기준) + 필수 컬럼 보장
      var PREFERRED = ["접수순번","접수일시","구분","참가구분","신청유형(명/팀)","팀명","대표자","성명","주민번호","연락처","주소","시도별","은행명","계좌번호","예금주","신청인","스승","소속","예선곡","본선곡","지정고수사용","USB여부","참가신청서","통장사본","주민등록등본","개인정보동의","예선합격","최종합격","수상","수여자","불참","다회참가자"];
      var REQUIRED = ["예선합격","최종합격","수상","수여자","불참","다회참가자"];
      REQUIRED.forEach(function(h) { if (!colSet[h]) { colSet[h] = true; colOrder.push(h); } });
      var sorted = [];
      var inCol = {};
      PREFERRED.forEach(function(h) { if (colSet[h]) { sorted.push(h); inCol[h] = true; } });
      colOrder.forEach(function(h) { if (!inCol[h]) sorted.push(h); });
      colOrder = sorted;
      // 2차원 배열로 변환
      var rows = arr.map(function(r) {
        if (!r || typeof r !== 'object') return colOrder.map(function() { return ""; });
        return colOrder.map(function(k) { return r[k] != null ? r[k] : ""; });
      });
      resolve({ok:true, headers:colOrder, rows:rows, count:rows.length});
    });
  });
}

function _apiGetApplyConfig(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:true, status:"auto", effective:"closed", today:new Date().toISOString().slice(0,10), count:0, webappUrl:""});
  return loadEvtData(evtId).then(function(data) {
    var cfg = {};
    (data.Config || []).forEach(function(c) { if(c && c.k) cfg[c.k] = c.v; });
    var ac = {};
    try { ac = JSON.parse(cfg.APPLY_CONFIG || "{}"); } catch(e){}
    var applyArr = data.Apply || [];
    if (!Array.isArray(applyArr) && applyArr) applyArr = Object.values(applyArr);
    var today = new Date().toISOString().slice(0,10);
    var status = ac.status || "auto";
    var effective = status;
    if (status === "auto") {
      if (ac.startDt && today < ac.startDt) effective = "notyet";
      else if (ac.endDt && today > ac.endDt) effective = "closed";
      else effective = "open";
    }
    // 행사명 조회 (캐시 있으면 캐시, 없으면 Firebase 직접)
    var evtNm = "";
    try { var evts = (_cache && _cache.Events) || []; for(var i=0;i<evts.length;i++){if(evts[i].evtId===evtId){evtNm=evts[i].nm||"";break;}} } catch(e){}
    if (evtNm) {
      return {ok:true, status:status, effective:effective, today:today, count:(applyArr||[]).length, webappUrl:ac.webappUrl||"", startDt:ac.startDt||"", endDt:ac.endDt||"", notice:ac.notice||"", cats:ac.cats||null, formUrl:ac.formUrl||"", formUrlPdf:ac.formUrlPdf||"", driveUploadUrl:ac.driveUploadUrl||cfg.DRIVE_UPLOAD_URL||"", evtNm:evtNm};
    }
    // apply 모드 등 캐시 없을 때 Firebase에서 직접 조회
    return new Promise(function(res2){
      fbDb.ref('/main/Events').once('value', function(snap){
        var evts2 = snap.val() || [];
        if (!Array.isArray(evts2)) evts2 = Object.values(evts2);
        for(var j=0;j<evts2.length;j++){if(evts2[j]&&evts2[j].evtId===evtId){evtNm=evts2[j].nm||"";break;}}
        res2({ok:true, status:status, effective:effective, today:today, count:(applyArr||[]).length, webappUrl:ac.webappUrl||"", startDt:ac.startDt||"", endDt:ac.endDt||"", notice:ac.notice||"", cats:ac.cats||null, formUrl:ac.formUrl||"", formUrlPdf:ac.formUrlPdf||"", driveUploadUrl:ac.driveUploadUrl||cfg.DRIVE_UPLOAD_URL||"", evtNm:evtNm});
      });
    });
  });
}

function _apiUpdateApplyRow(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return new Promise(function(resolve) {
    var ref = fbDb.ref('/evtData/' + evtId + '/Apply');
    ref.once('value', function(snap) {
      var arr = snap.val();
      if (!arr) return resolve({ok:false, err:"데이터 없음"});
      if (!Array.isArray(arr)) arr = Object.values(arr);
      var ri = p.rowIndex;
      var col = p.col;
      var val = p.value;
      if (ri == null || col == null) return resolve({ok:false, err:"rowIndex/col 필요"});
      if (!arr[ri]) return resolve({ok:false, err:"행 없음"});
      arr[ri][_fbSafeKey(col)] = val;
      ref.set(arr).then(function() {
        resolve({ok:true});
      });
    });
  });
}

function _apiUpdateApplyBySeq(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  var seq = p.seq;
  var fields = p.fields || {};
  if (!seq) return Promise.resolve({ok:false, err:"seq 필요"});
  return new Promise(function(resolve) {
    var ref = fbDb.ref('/evtData/' + evtId + '/Apply');
    ref.once('value', function(snap) {
      var raw = snap.val();
      if (!raw) return resolve({ok:false, err:"데이터 없음"});
      var arr = Array.isArray(raw) ? raw.filter(function(r){return r!=null;}) : Object.values(raw);
      var found = false;
      var seqKey = _fbSafeKey("접수순번");
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i][seqKey] || arr[i]["접수순번"] || "") === String(seq)) {
          Object.keys(fields).forEach(function(f) { arr[i][_fbSafeKey(f)] = fields[f]; });
          found = true;
          break;
        }
      }
      if (!found) return resolve({ok:false, err:"접수순번 "+seq+" 없음"});
      ref.set(arr).then(function() { resolve({ok:true}); });
    });
  });
}

function _apiDeleteApplyBySeq(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  var seq = p.seq;
  if (!seq) return Promise.resolve({ok:false, err:"seq 필요"});
  return new Promise(function(resolve) {
    var ref = fbDb.ref('/evtData/' + evtId + '/Apply');
    ref.once('value', function(snap) {
      var raw = snap.val();
      if (!raw) return resolve({ok:false, err:"데이터 없음"});
      var arr = Array.isArray(raw) ? raw.filter(function(r){return r!=null;}) : Object.values(raw);
      var seqKey = _fbSafeKey("접수순번");
      var newArr = arr.filter(function(r) {
        return String(r[seqKey] || r["접수순번"] || "") !== String(seq);
      });
      if (newArr.length === arr.length) return resolve({ok:false, err:"접수순번 "+seq+" 없음"});
      ref.set(newArr).then(function() { resolve({ok:true}); });
    });
  });
}

// ───────── Bulk 가져오기 (엑셀) ─────────
function _apiBulkAddMain(p, nodeName) {
  var arr = (_cache[nodeName] || []).slice();
  var newRows = p.rows || [];
  var reassigned = 0;
  // 📦 자산: 바코드 자동생성 + 중복 방지 (빈 값/중복이면 고유 13자리 자동 부여)
  if (nodeName === "Assets") {
    var used = {}, maxNum = 0;
    arr.forEach(function(a){ var b=String(a&&a.barcode||"").trim(); if(b){ used[b]=1; var n=parseInt(b,10); if(!isNaN(n)&&n>maxNum) maxNum=n; } });
    if (maxNum < 2600000000000) maxNum = 2600000000000; // 13자리 기준점
    function _nextBarcode(){ do { maxNum++; } while (used[String(maxNum)]); used[String(maxNum)]=1; return String(maxNum); }
    newRows.forEach(function(r){
      var b = String(r.barcode||"").trim();
      if (!b || used[b]) { r.barcode = _nextBarcode(); if(b) reassigned++; } // 빈값→생성 / 중복→새 번호 부여
      else { used[b]=1; var n=parseInt(b,10); if(!isNaN(n)&&n>maxNum) maxNum=n; }
    });
  }
  newRows.forEach(function(r) {
    if (!r.id) r.id = uid();
    if (!r.createdAt) r.createdAt = now_();
    arr.push(_fbSafeRow(r));
  });
  return saveMainNode(nodeName, arr).then(function() {
    _cache[nodeName] = arr;
    return {ok:true, added:newRows.length, count:newRows.length, reassigned:reassigned};
  });
}

// 자산 라벨 출력 표시 + 출력 횟수 누적 (printed=true면 횟수+1, false면 출력상태 리셋)
function _apiSetAssetLabel(p) {
  var arr = (_cache.Assets || []).slice();
  var ids = p.ids || (p.id ? [p.id] : []);
  var idset = {}; ids.forEach(function(x){ idset[x]=1; });
  arr.forEach(function(a){
    if (a && idset[a.id]) {
      if (p.printed === false) { a.labelPrinted = false; }
      else { a.labelPrinted = true; a.labelPrintCount = (parseInt(a.labelPrintCount,10)||0) + 1; a.labelPrintAt = now_(); }
    }
  });
  return saveMainNode("Assets", arr).then(function() {
    _cache.Assets = arr;
    return {ok:true, count:ids.length};
  });
}

function _fbSafeKey(s) {
  return String(s).replace(/[.#$/\[\]]/g, function(c) {
    return {'.':'．','#':'＃','$':'＄','/':'／','[':'［',']':'］'}[c] || c;
  });
}
function _fbRestoreKey(s) {
  return String(s).replace(/[．＃＄／［］]/g, function(c) {
    return {'．':'.','＃':'#','＄':'$','／':'/','［':'[','］':']'}[c] || c;
  });
}
function _fbSafeRow(row) {
  if (!row || typeof row !== 'object') return row;
  var out = {};
  Object.keys(row).forEach(function(k) { out[_fbSafeKey(k)] = row[k]; });
  return out;
}

function _apiAddApply(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return new Promise(function(resolve) {
    fbDb.ref('/evtData/' + evtId + '/Apply').once('value', function(snap) {
      var raw = snap.val();
      var arr = [];
      if (Array.isArray(raw)) arr = raw.filter(function(r){return r!=null;});
      else if (raw && typeof raw === 'object') Object.keys(raw).forEach(function(k){if(raw[k])arr.push(raw[k]);});
      // 접수순번: 2026-0001 형식 (YYYY-NNNN만 카운트)
      var year = new Date().getFullYear().toString();
      var maxNum = 0;
      var re = new RegExp("^" + year + "-(\\d+)$");
      arr.forEach(function(r) {
        var s = String(r["접수순번"] || r[_fbSafeKey("접수순번")] || "");
        var m = s.match(re);
        if (m) { var n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
      });
      var seq = year + "-" + ("0000" + (maxNum + 1)).slice(-4);
      var row = {};
      Object.keys(p).forEach(function(k) {
        if (k === 'action' || k === 'evtId' || k === 'by' || k === 'id') return;
        row[k] = p[k];
      });
      row["접수순번"] = seq;
      row["접수일시"] = now_();
      arr.push(_fbSafeRow(row));
      fbDb.ref('/evtData/' + evtId + '/Apply').set(arr).then(function() {
        // 텔레그램 알림
        _notifyApply(evtId, row, seq);
        resolve({ok:true, seq: seq});
      });
    });
  });
}

// 참가 접수 텔레그램 알림
function _notifyApply(evtId, row, seq) {
  var botToken = TG_BOT_TOKEN;
  var chatIds = TG_CHAT_IDS;
  if (!botToken || !chatIds) return;
  var cat = row["구분"] || "";
  var div = row["참가구분"] || row[_fbSafeKey("참가구분")] || "";
  var nm = row["성명"] || row[_fbSafeKey("성명")] || "";
  var phone = row["연락처"] || row[_fbSafeKey("연락처")] || "";
  var region = row["시도별"] || row[_fbSafeKey("시도별")] || "";
  var applyUrl = TG_SYS_URL + "?apply=1&evtId=" + encodeURIComponent(evtId);
  var text = "📋 <b>참가 접수</b>"
    + "\n접수번호: " + seq
    + "\n구분: " + cat + " / " + div
    + "\n성명: " + nm
    + "\n연락처: <code>" + phone + "</code>"
    + "\n시도: " + region
    + "\n시각: " + now_()
    + "\n\n<a href=\"" + applyUrl + "\">🔗 신청폼 열기</a>";
  var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  var ids = chatIds.split(/[,\s]+/).filter(Boolean);
  ids.forEach(function(chatId) {
    fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:chatId, text:text, parse_mode:'HTML'})
    }).catch(function(e) { console.warn('텔레그램 접수알림 실패:', e); });
  });
}

function _apiBulkAddApply(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return new Promise(function(resolve) {
    fbDb.ref('/evtData/' + evtId + '/Apply').once('value', function(snap) {
      var raw = snap.val();
      var arr = [];
      if (Array.isArray(raw)) arr = raw.filter(function(r){return r!=null;});
      else if (raw && typeof raw === 'object') Object.keys(raw).forEach(function(k){if(raw[k])arr.push(raw[k]);});
      // 접수순번 자동 생성 (기존 최대값 기반)
      var year = new Date().getFullYear().toString();
      var maxNum = 0;
      var re = new RegExp("^" + year + "-(\\d+)$");
      arr.forEach(function(r) {
        var s = String(r["접수순번"] || r[_fbSafeKey("접수순번")] || "");
        var m = s.match(re);
        if (m) { var n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
      });
      var newRows = p.rows || [];
      var ts = now_();
      newRows.forEach(function(r) {
        // 접수순번이 없으면 자동 생성
        if (!r["접수순번"] && !r[_fbSafeKey("접수순번")]) {
          maxNum++;
          r["접수순번"] = year + "-" + ("0000" + maxNum).slice(-4);
        }
        // 접수일시가 없으면 자동 생성
        if (!r["접수일시"] && !r[_fbSafeKey("접수일시")]) {
          r["접수일시"] = ts;
        }
        arr.push(_fbSafeRow(r));
      });
      fbDb.ref('/evtData/' + evtId + '/Apply').set(arr).then(function() {
        resolve({ok:true, count:newRows.length});
      });
    });
  });
}

function _apiBulkReplaceMems(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return loadEvtData(evtId).then(function(data) {
    var arr = data.Mems || [];
    var newRows = p.rows || [];
    if (p.mode === "append") {
      newRows.forEach(function(r) {
        if (!r.id) r.id = uid();
        if (!r.createdAt) r.createdAt = now_();
        r.evtId = evtId;
        arr.push(_fbSafeRow(r));
      });
    } else {
      arr = newRows.map(function(r) {
        if (!r.id) r.id = uid();
        r.evtId = evtId;
        return _fbSafeRow(r);
      });
    }
    return saveEvtNode(evtId, "Mems", arr).then(function() {
      _evtCaches[evtId].Mems = arr;
      // 소속(Groups) 자동 등록
      var groups = data.Groups || [];
      var existNames = {};
      groups.forEach(function(g) { existNames[g.n] = true; });
      var newGroups = [];
      arr.forEach(function(m) {
        if (m.ar && !existNames[m.ar]) {
          existNames[m.ar] = true;
          newGroups.push({id:uid(), n:m.ar, sort:groups.length + newGroups.length, note:""});
        }
      });
      if (newGroups.length) {
        groups = groups.concat(newGroups);
        return saveEvtNode(evtId, "Groups", groups).then(function() {
          _evtCaches[evtId].Groups = groups;
          return {ok:true, cnt:arr.length, count:arr.length, newGroups:newGroups.length};
        });
      }
      return {ok:true, cnt:arr.length, count:arr.length};
    });
  });
}

function _apiBulkReplaceAccounts(p) {
  var users = p.users || [];
  var areas = p.areas || [];
  var existUsers = (_cache.Users || []).slice();
  var existAreas = (_cache.Areas || []).slice();
  var existIds = {};
  existUsers.forEach(function(u) { existIds[u.id] = true; });
  users.forEach(function(u) {
    if (!existIds[u.id]) {
      existUsers.push({id:u.id, pw:u.pw||"1234", r:u.r||"user", ar:u.ar||"", nm:u.nm||"", tel:u.tel||""});
    }
  });
  var existAreaNames = {};
  existAreas.forEach(function(a) { existAreaNames[a.n] = true; });
  areas.forEach(function(a) {
    if (a.n && !existAreaNames[a.n]) {
      existAreas.push({id:uid(), n:a.n, sort:existAreas.length});
      existAreaNames[a.n] = true;
    }
  });
  return Promise.all([
    saveMainNode("Users", existUsers),
    saveMainNode("Areas", existAreas)
  ]).then(function() {
    _cache.Users = existUsers;
    _cache.Areas = existAreas;
    return {ok:true, userCnt:users.length, areaCnt:areas.length, userCount:existUsers.length, areaCount:existAreas.length};
  });
}

// (기존 Firebase RTDB 자료실 제거됨 — Google Drive 프록시로 대체)
function _apiListFileFolders(p) {
  return _driveProxy({action: "listFolders", evtId: _getEvtId(p) || "general"});
}
function _apiAddFileFolder(p) {
  return _driveProxy({action: "addFolder", evtId: _getEvtId(p) || "general", name: p.name || "새 폴더"});
}
function _apiDeleteFileFolder(p) {
  return _driveProxy({action: "deleteFolder", fid: p.fid});
}
function _apiListFiles(p) {
  return _driveProxy({action: "listFiles", folderId: p.folderId});
}
function _apiUploadFile(p) {
  return _driveProxy({
    action: "upload",
    base64: p.base64,
    mime: p.mime || "application/octet-stream",
    filename: p.filename || "file",
    category: "자료실",
    evtId: _getEvtId(p) || "general",
    folderId: p.folderId
  });
}
function _apiDeleteFile(p) {
  return _driveProxy({action: "delete", fileId: p.fid, url: p.url});
}

// ───────── 첨부파일 ZIP 다운로드 (클라이언트 JSZip) ─────────
function _extractDriveFileId(url) {
  if (!url) return null;
  // https://drive.google.com/file/d/FILE_ID/view
  var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // https://drive.google.com/open?id=FILE_ID
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

function _apiBuildGalleryZip(p) {
  var items = p.items || [];
  var zipName = p.zipName || "download";

  if (!items.length) return Promise.resolve({ok:false, err:"다운로드할 파일이 없습니다"});

  // DRIVE_UPLOAD_URL 확인 (index.html 전역변수)
  var proxyUrl = (typeof DRIVE_UPLOAD_URL !== "undefined" && DRIVE_UPLOAD_URL) ? DRIVE_UPLOAD_URL : "";
  if (!proxyUrl) {
    return Promise.resolve({ok:false, err:"Drive 업로드 URL(GAS 프록시)이 설정되지 않았습니다.\n설정 → 참가접수 설정에서 DRIVE_UPLOAD_URL을 등록해주세요.\n\n또한 GAS 스크립트를 최신 버전으로 재배포해주세요.\n(DriveUpload_GAS.js 참고)"});
  }

  if (typeof JSZip === "undefined") {
    return Promise.resolve({ok:false, err:"JSZip 라이브러리가 로딩되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요."});
  }

  var zip = new JSZip();
  var failed = [];
  var done = 0;

  // 타임아웃 fetch 래퍼 (60초)
  function fetchWithTimeout(url, opts, ms) {
    ms = ms || 60000;
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error("타임아웃 ("+Math.round(ms/1000)+"초)")); }, ms);
      fetch(url, opts).then(function(r) { clearTimeout(timer); resolve(r); })
                      .catch(function(e) { clearTimeout(timer); reject(e); });
    });
  }

  // 순차 다운로드 (GAS 프록시 부하 방지)
  return new Promise(function(resolve) {
    function processNext(idx) {
      if (idx >= items.length) {
        // ZIP 생성
        if (done === 0) {
          var errMsg = "모든 파일 다운로드에 실패했습니다.";
          if (failed.length) errMsg += "\n첫 번째 오류: " + (failed[0].err||"") + " (" + (failed[0].label||"") + ")";
          errMsg += "\n\nGAS 스크립트가 최신 버전으로 배포되었는지 확인해주세요.";
          resolve({ok:false, err:errMsg});
          return;
        }
        zip.generateAsync({type:"base64"}).then(function(b64) {
          var dataUrl = "data:application/zip;base64," + b64;
          resolve({ok:true, dataUrl:dataUrl, name:zipName + ".zip", total:items.length, success:done, failed:failed.length});
        }).catch(function(e) {
          resolve({ok:false, err:"ZIP 생성 실패: " + e});
        });
        return;
      }

      var item = items[idx];
      var fileId = _extractDriveFileId(item.u);
      if (!fileId) {
        console.warn("[ZIP] 파일ID 추출 실패:", item.u);
        failed.push({label:item.label||"", err:"파일ID 추출 실패: " + (item.u||"").substring(0,60)});
        processNext(idx + 1);
        return;
      }

      var label = item.label || ("file_" + (idx+1));
      console.log("[ZIP] " + (idx+1) + "/" + items.length + " 다운로드:", label, "fileId=" + fileId);

      // 로딩 메시지 업데이트
      if (typeof showLoading === "function") {
        showLoading("파일 다운로드 중... (" + (idx+1) + "/" + items.length + ") " + label);
      }

      fetchWithTimeout(proxyUrl, {
        method: "POST",
        headers: {"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({action:"download", fileId:fileId})
      }, 60000)
        .then(function(resp) {
          console.log("[ZIP] 응답 status:", resp.status, resp.statusText);
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          return resp.text();
        })
        .then(function(txt) {
          // JSON 파싱 시도
          var r;
          try { r = JSON.parse(txt); }
          catch(pe) {
            console.error("[ZIP] JSON 파싱 실패:", txt.substring(0, 200));
            throw new Error("응답이 JSON이 아닙니다: " + txt.substring(0, 100));
          }
          if (!r || !r.ok || !r.base64) {
            var errDetail = r && r.err ? r.err : "base64 데이터 없음";
            console.warn("[ZIP] 실패:", label, errDetail);
            failed.push({label:label, err:errDetail});
          } else {
            // 파일 확장자 결정
            var ext = "";
            var origName = r.name || "";
            var dotIdx = origName.lastIndexOf(".");
            if (dotIdx > 0) ext = origName.substring(dotIdx);
            else {
              var mime = r.mime || "";
              if (mime.indexOf("pdf") >= 0) ext = ".pdf";
              else if (mime.indexOf("jpeg") >= 0 || mime.indexOf("jpg") >= 0) ext = ".jpg";
              else if (mime.indexOf("png") >= 0) ext = ".png";
              else if (mime.indexOf("gif") >= 0) ext = ".gif";
              else if (mime.indexOf("word") >= 0 || mime.indexOf("docx") >= 0) ext = ".docx";
              else if (mime.indexOf("sheet") >= 0 || mime.indexOf("xlsx") >= 0) ext = ".xlsx";
              else if (mime.indexOf("hwp") >= 0) ext = ".hwp";
              else ext = ".bin";
            }
            var fileName = label + ext;
            var raw = atob(r.base64);
            var uint8 = new Uint8Array(raw.length);
            for (var i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i);
            zip.file(fileName, uint8);
            done++;
            console.log("[ZIP] ✅ 성공:", fileName, "(" + r.size + " bytes)");
          }
          processNext(idx + 1);
        })
        .catch(function(e) {
          console.error("[ZIP] ❌ 오류:", label, String(e));
          failed.push({label:label, err:String(e)});
          processNext(idx + 1);
        });
    }
    processNext(0);
  });
}
