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
  return new Date().toISOString().replace("T"," ").slice(0,19);
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
        case "addMem":    _apiAddRow(p, "Mems").then(resolve); return;
        case "updateMem": _apiUpdateRow(p, "Mems").then(resolve); return;
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

        // 소속/그룹
        case "listGroups":   _apiListEvtNode(p, "Groups").then(resolve); return;
        case "addGroup":     _apiAddRow(p, "Groups").then(resolve); return;
        case "updateGroup":  _apiUpdateRow(p, "Groups").then(resolve); return;
        case "deleteGroup":  _apiDeleteRow(p, "Groups").then(resolve); return;

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

        // SMS (GAS 프록시 필요 — 나중에 연동)
        case "sendSms":
        case "testSms":
        case "sendSmsAligo":
        case "sendFeeSms":
        case "checkSmsConfig":
        case "getSmsCfg":
        case "getAligoCfg":
        case "smsLog":
        case "smsLogList":
          resolve({ok:false, err:"SMS는 아직 준비 중입니다"}); return;

        // 참가자
        case "listApply":      _apiListApply(p).then(resolve); return;
        case "getApplyConfig": _apiGetApplyConfig(p).then(resolve); return;
        case "setApplyConfig":
        case "saveApplyConfig":{var _ac={status:p.status,startDt:p.startDt,endDt:p.endDt,notice:p.notice,webappUrl:p.webappUrl};if(p.cats)_ac.cats=p.cats;if(p.formUrl!==undefined)_ac.formUrl=p.formUrl;if(p.formUrlPdf!==undefined)_ac.formUrlPdf=p.formUrlPdf;if(p.driveUploadUrl!==undefined)_ac.driveUploadUrl=p.driveUploadUrl;_apiSetConfig(Object.assign({},p,{key:"APPLY_CONFIG",value:JSON.stringify(_ac)})).then(function(){resolve({ok:true})});return;}
        case "addApply":      _apiAddApply(p).then(resolve); return;
        case "updateApplyRow": _apiUpdateApplyRow(p).then(resolve); return;
        case "updateApply":  _apiUpdateApplyBySeq(p).then(resolve); return;
        case "deleteApply":  _apiDeleteApplyBySeq(p).then(resolve); return;

        // 사진 업로드 (Drive GAS 프록시 — 추후 연동)
        case "uploadPhoto":    resolve({ok:false, err:"사진 업로드는 Drive 설정 후 사용 가능합니다"}); return;
        case "deletePhoto":    resolve({ok:false, err:"사진 삭제는 Drive 설정 후 사용 가능합니다"}); return;

        // 대여자산
        case "listAssets":     _apiListMainNode(p, "Assets").then(resolve); return;
        case "addAsset":       _apiAddMainRow(p, "Assets").then(resolve); return;
        case "updateAsset":    _apiUpdateMainRow(p, "Assets").then(resolve); return;
        case "deleteAsset":    _apiDeleteMainRow(p, "Assets").then(resolve); return;
        case "bulkAddAssets":  _apiBulkAddMain(p, "Assets").then(resolve); return;
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
      resolve({ok:true, acts:[], purs:[], exps:[], mems:[], notices:[], pays:[], dpst:[], inc:[], incTypes:[], expBG:[], expTypes:[], gwanTypes:[], incCards:[], awards:[], memGroups:[], fees:[]});
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
          awards: (cfg.AWARDS || "").split(",").filter(Boolean),
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
          AR: (_cache.Areas || []).map(function(a){return a.n}),
          US: _buildUserMap()
        });
      }

      if (isShare && mainEvtId) {
        loadEvtData(mainEvtId).then(function(mainData) {
          buildResult(mainData.Mems || [], mainData.Groups || []);
        });
      } else {
        buildResult(data.Mems || [], data.Groups || []);
      }
    });
  });
}

function _parseIncCards(s) {
  if (!s) return [];
  return s.split(";").map(function(chunk) {
    var parts = chunk.split("|");
    return {name: (parts[0]||"").trim(), methods: (parts[1]||"").trim()};
  }).filter(function(c) { return c.name; });
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
  return Promise.resolve({ok:true, events: _cache.Events || [], acctEvt: _cache.AcctEvt || []});
}

function _apiAddEvent(p) {
  var events = (_cache.Events || []).slice();
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
  var events = (_cache.Events || []).slice();
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
      });
    }
  }
  return Promise.resolve({ok:false, err:"계정을 찾을 수 없습니다"});
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
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
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

function _apiNotifyLogin(p) {
  var botToken = TG_BOT_TOKEN;
  var chatIds = TG_CHAT_IDS;
  if (!botToken || !chatIds) return Promise.resolve({ok:true});

  // 역할 라벨
  var roleMap = {super:"🔴 SUPER", admin:"🟠 관리자", subAdm:"🟡 부관리자"};
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
      + "\n• IP: " + (p.ip||"-")
      + (dev ? "\n• 기기: " + dev : "")
      + "\n• 시각: " + now_();
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
    return {ok:true, status:status, effective:effective, today:today, count:(applyArr||[]).length, webappUrl:ac.webappUrl||"", startDt:ac.startDt||"", endDt:ac.endDt||"", notice:ac.notice||"", cats:ac.cats||null, formUrl:ac.formUrl||"", formUrlPdf:ac.formUrlPdf||"", driveUploadUrl:ac.driveUploadUrl||cfg.DRIVE_UPLOAD_URL||""};
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
  newRows.forEach(function(r) {
    if (!r.id) r.id = uid();
    if (!r.createdAt) r.createdAt = now_();
    arr.push(_fbSafeRow(r));
  });
  return saveMainNode(nodeName, arr).then(function() {
    _cache[nodeName] = arr;
    return {ok:true, added:newRows.length, count:newRows.length};
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
  var text = "📋 <b>참가 접수</b>"
    + "\n접수번호: " + seq
    + "\n구분: " + cat + " / " + div
    + "\n성명: " + nm
    + "\n연락처: " + phone
    + "\n시도: " + region
    + "\n시각: " + now_();
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
      var newRows = p.rows || [];
      newRows.forEach(function(r) { arr.push(_fbSafeRow(r)); });
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

// ───────── 자료실 (Firebase RTDB 저장) ─────────
function _filesRef(evtId) {
  return fbDb.ref('/evtData/' + evtId + '/Files');
}

function _apiListFileFolders(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:true, folders:[]});
  return new Promise(function(resolve) {
    _filesRef(evtId).child('folders').once('value', function(snap) {
      var raw = snap.val();
      var arr = [];
      if (raw) {
        if (Array.isArray(raw)) arr = raw.filter(function(r){return r!=null;});
        else Object.keys(raw).forEach(function(k){if(raw[k])arr.push(raw[k]);});
      }
      // 각 폴더에 파일 개수 추가
      _filesRef(evtId).child('items').once('value', function(snap2) {
        var items = snap2.val();
        var allFiles = [];
        if (items) {
          if (Array.isArray(items)) allFiles = items.filter(function(r){return r!=null;});
          else Object.keys(items).forEach(function(k){if(items[k])allFiles.push(items[k]);});
        }
        arr.forEach(function(f) {
          f.fileCnt = allFiles.filter(function(it){return it.folderId===f.id;}).length;
        });
        resolve({ok:true, folders:arr});
      });
    });
  });
}

function _apiAddFileFolder(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return new Promise(function(resolve) {
    _filesRef(evtId).child('folders').once('value', function(snap) {
      var raw = snap.val();
      var arr = [];
      if (raw) {
        if (Array.isArray(raw)) arr = raw.filter(function(r){return r!=null;});
        else Object.keys(raw).forEach(function(k){if(raw[k])arr.push(raw[k]);});
      }
      arr.push({id:uid(), name:p.name, createdAt:now_()});
      _filesRef(evtId).child('folders').set(arr).then(function() {
        resolve({ok:true});
      });
    });
  });
}

function _apiDeleteFileFolder(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return new Promise(function(resolve) {
    var ref = _filesRef(evtId);
    Promise.all([
      ref.child('folders').once('value'),
      ref.child('items').once('value')
    ]).then(function(snaps) {
      var rawF = snaps[0].val();
      var rawI = snaps[1].val();
      var folders = [];
      if (rawF) {
        if (Array.isArray(rawF)) folders = rawF.filter(function(r){return r!=null;});
        else Object.keys(rawF).forEach(function(k){if(rawF[k])folders.push(rawF[k]);});
      }
      var items = [];
      if (rawI) {
        if (Array.isArray(rawI)) items = rawI.filter(function(r){return r!=null;});
        else Object.keys(rawI).forEach(function(k){if(rawI[k])items.push(rawI[k]);});
      }
      folders = folders.filter(function(f){return f.id!==p.fid;});
      items = items.filter(function(f){return f.folderId!==p.fid;});
      Promise.all([
        ref.child('folders').set(folders),
        ref.child('items').set(items)
      ]).then(function() { resolve({ok:true}); });
    });
  });
}

function _apiListFiles(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:true, files:[]});
  return new Promise(function(resolve) {
    _filesRef(evtId).child('items').once('value', function(snap) {
      var raw = snap.val();
      var arr = [];
      if (raw) {
        if (Array.isArray(raw)) arr = raw.filter(function(r){return r!=null;});
        else Object.keys(raw).forEach(function(k){if(raw[k])arr.push(raw[k]);});
      }
      var filtered = arr.filter(function(f){return f.folderId===p.folderId;});
      // base64 데이터는 목록에서 제외 (용량 절약)
      var files = filtered.map(function(f) {
        return {id:f.id, folderId:f.folderId, filename:f.filename, mime:f.mime, size:f.size, uploadedAt:f.uploadedAt, url:f.url||""};
      });
      resolve({ok:true, files:files});
    });
  });
}

function _apiUploadFile(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return new Promise(function(resolve) {
    _filesRef(evtId).child('items').once('value', function(snap) {
      var raw = snap.val();
      var arr = [];
      if (raw) {
        if (Array.isArray(raw)) arr = raw.filter(function(r){return r!=null;});
        else Object.keys(raw).forEach(function(k){if(raw[k])arr.push(raw[k]);});
      }
      var fileId = uid();
      var dataUrl = "data:" + (p.mime||"application/octet-stream") + ";base64," + p.base64;
      arr.push({
        id:fileId, folderId:p.folderId, filename:p.filename,
        mime:p.mime||"application/octet-stream", size:p.size||0,
        uploadedAt:now_(), url:dataUrl
      });
      _filesRef(evtId).child('items').set(arr).then(function() {
        resolve({ok:true, id:fileId});
      }).catch(function(err) {
        resolve({ok:false, err:"업로드 실패: " + err.message});
      });
    });
  });
}

function _apiDeleteFile(p) {
  var evtId = _getEvtId(p);
  if (!evtId) return Promise.resolve({ok:false, err:"행사 미선택"});
  return new Promise(function(resolve) {
    _filesRef(evtId).child('items').once('value', function(snap) {
      var raw = snap.val();
      var arr = [];
      if (raw) {
        if (Array.isArray(raw)) arr = raw.filter(function(r){return r!=null;});
        else Object.keys(raw).forEach(function(k){if(raw[k])arr.push(raw[k]);});
      }
      arr = arr.filter(function(f){return f.id!==p.fid;});
      _filesRef(evtId).child('items').set(arr).then(function() {
        resolve({ok:true});
      });
    });
  });
}
