// 🔑 보안 로그인 (2026-10 보안작업 2·3단계)
// firebase-config.js 의 SEC_AUTH_URL(로그인 도우미 주소)이 있을 때만 켜짐 — 비어 있으면 예전 방식 그대로
// - 로그인: 도우미가 비번 확인 → Firebase 입장권(커스텀 토큰) → signInWithCustomToken → 그 다음에 DB 동기화 시작
// - 자동로그인: 기기에 비번 대신 "__fb__" 표시만 저장, Firebase 로그인 세션으로 다시 들어옴
// - 비번 변경·계정 추가/수정/삭제: 비번은 도우미로만 (Users 에 평문 저장 안 함)
// common.js 다음, index.html 본문 스크립트 전에 로드
(function(){
  if (typeof SEC_AUTH_URL === 'undefined' || !SEC_AUTH_URL || typeof fbAuth === 'undefined') return;
  window.SEC_AUTH_ON = true;
  var FB_MARK = "__fb__";
  var ADMIN_R = {super:1, admin:1, subAdm:1};

  function call(body){
    body.sys = SEC_SYS;
    return fetch(SEC_AUTH_URL, {method:"POST", redirect:"follow", body:JSON.stringify(body)})
      .then(function(r){ return r.json(); });
  }
  function idTok(){
    var u = fbAuth.currentUser;
    return u ? u.getIdToken() : Promise.reject(new Error("로그인이 필요해요"));
  }
  function helper(body){
    return idTok().then(function(t){ body.idToken = t; return call(body); })
      .catch(function(e){ return {ok:false, err:(e && e.message) || String(e)}; });
  }
  window.secHelper = helper;
  // QR 조회 화면 등: 데이터 동기화 없이 Firebase 로그인만
  window.secQuickLogin = function(id, pw){
    return call({action:"login", id:id, pw:pw}).then(function(r){
      if (!r || !r.ok) return r || {ok:false, err:"로그인 실패"};
      return fbAuth.signInWithCustomToken(r.token).then(function(){ return {ok:true, me:r.me}; });
    }).catch(function(){ return {ok:false, err:"로그인 도우미에 연결하지 못했어요. 인터넷을 확인해 주세요"}; });
  };

  var origInit = initFirebaseSync, origLogin = _apiLogin;
  var origUpd = _apiUpdateAcct, origDel = _apiDeleteAcct, origBulk = _apiBulkReplaceAccounts;
  var authKnown = false, loggingIn = false;

  // DB 동기화는 Firebase 로그인 뒤에 시작 (잠긴 규칙에선 로그인 전엔 못 읽음)
  initFirebaseSync = function(){
    if (window.__secInit) return;
    window.__secInit = true;
    fbAuth.onAuthStateChanged(function(u){
      var first = !authKnown; authKnown = true;
      var a = (typeof loadAuth === 'function') ? loadAuth() : null;
      if (u) {
        // "로그인 유지" 안 하고 새로고침/로그아웃한 경우 남은 세션 정리
        if (first && !a && !loggingIn) { fbAuth.signOut(); return; }
        origInit();
      } else if (first && a && a.pw && a.pw !== FB_MARK) {
        // 예전 방식으로 저장된 자동로그인(비번 포함) → 도우미로 Firebase 로그인만 해 둠
        // → 위 origInit → 데이터 준비 → index.html 의 tryAutoLogin 이 이어서 로그인하고 저장값을 "__fb__" 로 바꿈
        call({action:"login", id:a.id, pw:a.pw}).then(function(r){
          if (r && r.ok) return fbAuth.signInWithCustomToken(r.token);
          if (typeof clearAuth === 'function') clearAuth();
        }).catch(function(){});
      }
    });
  };

  function afterSignIn(id){
    if (!_syncInitialized) origInit();
    return new Promise(function(res){ onDataReady(res); }).then(function(){
      var u = (_cache.Users || []).filter(function(x){ return x && x.id === id; })[0];
      if (!u) return {ok:false, err:"아이디가 존재하지 않습니다"};
      // 비번 확인은 도우미가 끝냄 → 예전 함수로 화면 정보(me·행사 목록 등)만 만듦
      return origLogin({id:id, pw:u.pw});
    });
  }

  _apiLogin = function(p){
    if (p.pw === FB_MARK) {
      var cu = fbAuth.currentUser;
      if (!cu || cu.uid !== p.id) return Promise.resolve({ok:false, err:"다시 로그인해 주세요"});
      return afterSignIn(p.id);
    }
    loggingIn = true;
    return call({action:"login", id:p.id, pw:p.pw}).then(function(r){
      if (!r || !r.ok) return r || {ok:false, err:"로그인 실패"};
      return fbAuth.signInWithCustomToken(r.token).then(function(){ return afterSignIn(p.id); });
    }, function(e){
      // 도우미 연결 실패 → 규칙이 아직 열려 있을 때만 통하는 예전 방식
      if (_cache && _cache.Users) return origLogin(p);
      return {ok:false, err:"로그인 도우미에 연결하지 못했어요. 인터넷을 확인해 주세요"};
    }).then(function(r){ loggingIn = false; return r; }, function(e){ loggingIn = false; return {ok:false, err:(e && e.message) || String(e)}; });
  };

  _apiChgMyPw = function(p){
    return helper({action:"setPw", id:p.id, oldPw:p.oldPw, newPw:p.newPw});
  };

  _apiAddAcct = function(p){
    var users = (_cache.Users || []).slice();
    if (users.some(function(u){ return u.id === p.id; })) return Promise.resolve({ok:false, err:"이미 존재하는 아이디입니다"});
    var user = {id:p.id, r:p.r||"user", ar:p.ar||"", nm:p.nm||"", tel:p.tel||"", tg:p.tg||""};
    if (p._who) user._who = p._who;
    users.push(user);
    return saveMainNode("Users", users).then(function(){
      _cache.Users = users;
      return helper({action:"setPw", id:p.id, newPw:p.pw || "1234"});
    }).then(function(h){
      return h.ok ? {ok:true} : {ok:true, warn:"계정은 만들었지만 비밀번호 저장 실패: " + h.err};
    });
  };

  _apiUpdateAcct = function(p){
    var me = (_cache.Users || []).filter(function(u){ return u.id === (typeof CID !== 'undefined' ? CID : ""); })[0];
    var amAdmin = me && ADMIN_R[me.r];
    var pw = p.pw;
    var q = {}; Object.keys(p).forEach(function(k){ if (k !== "pw") q[k] = p[k]; });
    var renamed = q.oldId && q.oldId !== "-" && q.oldId !== q.id;
    // 일반 회원이 자기 정보(텔레그램 등)만 바꿀 때: 전체 명단 대신 내 칸만 저장 (규칙: 역할·아이디는 못 바꿈)
    if (!amAdmin && q.id === (me && me.id) && !renamed) {
      var users = (_cache.Users || []), idx = -1;
      for (var i = 0; i < users.length; i++) if (users[i] && users[i].id === q.id) { idx = i; break; }
      if (idx < 0) return Promise.resolve({ok:false, err:"항목을 찾을 수 없습니다"});
      var patch = {};
      Object.keys(q).forEach(function(k){ if (k !== "action" && k !== "by" && k !== "r" && k !== "id" && k !== "ar") patch[k] = q[k]; });
      return fbDb.ref("/main/Users/" + idx).update(patch).then(function(){
        Object.keys(patch).forEach(function(k){ users[idx][k] = patch[k]; });
        return pw ? helper({action:"setPw", id:q.id, newPw:pw}) : {ok:true};
      }).catch(function(e){ return {ok:false, err:"저장 실패: " + ((e && e.message) || e)}; });
    }
    return origUpd(q).then(function(r){
      if (!r.ok || (!pw && !renamed)) return r;
      return helper({action:"setPw", id:q.id, newPw:pw || "", fromId:renamed ? q.oldId : ""}).then(function(h){
        return h.ok ? r : {ok:false, err:"정보는 저장됐지만 비밀번호 저장 실패: " + h.err};
      });
    });
  };

  _apiDeleteAcct = function(p){
    return origDel(p).then(function(r){
      if (!r.ok) return r;
      return helper({action:"delPw", id:p.id}).then(function(){ return r; });
    });
  };

  _apiBulkReplaceAccounts = function(p){
    var before = {};
    (_cache.Users || []).forEach(function(u){ before[u.id] = 1; });
    var fresh = (p.users || []).filter(function(u){ return u.id && !before[u.id]; });
    return origBulk(p).then(function(r){
      if (!r.ok) return r;
      // 새 계정 비번을 도우미로 옮김 (도우미가 Users 의 평문 pw 를 지움)
      return fresh.reduce(function(chain, u){
        return chain.then(function(){ return helper({action:"setPw", id:u.id, newPw:u.pw || "1234"}); });
      }, Promise.resolve()).then(function(){
        return _secReloadUsers().then(function(){ return r; });
      });
    });
  };

  function _secReloadUsers(){
    return fbDb.ref("/main/Users").once("value").then(function(s){
      var v = s.val() || [];
      _cache.Users = Array.isArray(v) ? v : Object.values(v);
    });
  }

  // 3단계: 아직 평문 비번이 남아 있으면 super/admin 에게 "옮기기" 버튼을 보여 줌
  window.secMigrateAll = function(){
    if (!confirm("모든 계정의 비밀번호를 안전한 곳(암호값)으로 옮기고 회원명단에서 지울까요?\n\n· 회원들의 로그인 아이디/비번은 그대로예요\n· 되돌리려면 백업에서 회원명단을 다시 넣으면 돼요")) return;
    var b = document.getElementById("secMigBar");
    if (b) b.innerHTML = "⏳ 옮기는 중...";
    helper({action:"migrateAll"}).then(function(r){
      if (!r.ok) { alert("실패: " + r.err); if (b) b.remove(); return; }
      _secReloadUsers().then(function(){
        alert("완료! 옮긴 계정 " + r.moved + "개 (이미 옮겨진 계정 " + r.already + "개)");
        if (b) b.remove();
      });
    });
  };
  function migBanner(){
    try {
      if (!ME || (ME.r !== "super" && ME.r !== "admin")) return;
      if (!(_cache.Users || []).some(function(u){ return u && u.pw != null && u.pw !== ""; })) return;
      if (document.getElementById("secMigBar")) return;
      var d = document.createElement("div");
      d.id = "secMigBar";
      d.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#7c2d12;color:#fff;border-radius:12px;padding:12px 14px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;flex-wrap:wrap";
      d.innerHTML = '<div style="flex:1;min-width:200px">🔒 <b>보안 작업 마무리:</b> 회원명단에 비밀번호가 아직 글자 그대로 남아 있어요. 한 번만 눌러 안전하게 옮겨 주세요.</div>'
        + '<button onclick="secMigrateAll()" style="background:#fff;color:#7c2d12;border:none;border-radius:8px;padding:9px 14px;font-weight:800;cursor:pointer">비밀번호 옮기기</button>';
      document.body.appendChild(d);
    } catch(e){}
  }
  var _w = setInterval(function(){
    if (typeof ME !== 'undefined' && ME && _cacheReady) { clearInterval(_w); setTimeout(migBanner, 1500); }
  }, 1000);
})();
