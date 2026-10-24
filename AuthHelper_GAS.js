/**
 * 🔑 로그인 도우미 (Google Apps Script) — 2026-10 보안작업 2·3단계
 * 청년회(bsp)·단오(dano)·가문굴비(gamun) 3개 시스템이 이 도우미 하나를 같이 씀
 *
 * 하는 일
 *  1. 아이디/비번 확인 → 맞으면 Firebase "입장권"(커스텀 토큰, 안에 역할 r 포함)을 돌려줌
 *  2. 비밀번호는 DB의 아무도 못 읽는 칸(/secure/pw/{아이디})에 암호값(해시)으로만 보관
 *  3. 비번 변경·관리자 초기화·계정 삭제·전체 옮기기(migrateAll)
 *  → 브라우저는 비밀번호 목록을 받지 않음. DB 규칙으로 "로그인한 회원만" 잠글 수 있게 됨.
 *
 * [배포 방법]
 * 1. https://script.google.com → 새 프로젝트 → 이 코드 붙여넣기 (이름 예: 로그인 도우미)
 * 2. 프로젝트 설정(⚙️) → 스크립트 속성 추가 (시스템마다 3개씩):
 *      SA_bsp / SA_dano / SA_gamun   서비스 계정 키 JSON 파일 내용 전체
 *                                    (Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성)
 *      DB_bsp / DB_dano / DB_gamun   DB 주소 (https://….firebasedatabase.app)
 *      API_bsp / API_dano / API_gamun 웹 API 키 (firebase-config.js 의 apiKey)
 *      PEPPER                        아무 긴 문자열 (예: 랜덤 40자) — 한 번 정하면 절대 바꾸지 말 것
 * 3. 배포 → 새 배포 → 웹 앱 (실행 사용자: 나 / 액세스: 모든 사용자) → URL 을 각 저장소 firebase-config.js 의 SEC_AUTH_URL 에
 *
 * 요청 (POST, JSON):
 *  {action:"status", sys}
 *  {action:"login", sys, id, pw}                         → {ok, token, me}
 *  {action:"setPw", sys, idToken, id, newPw, oldPw?, fromId?}
 *        본인: oldPw 필요 / 관리자(super·admin·subAdm): 다른 사람 것도 바꿈
 *        fromId: 아이디가 바뀐 경우 옛 아이디의 비번을 새 아이디로 옮김 (newPw 비우면 기존 비번 유지)
 *  {action:"delPw", sys, idToken, id}                    관리자만
 *  {action:"migrateAll", sys, idToken}                   super/admin — Users 의 평문 pw 를 전부 해시로 옮기고 지움
 */

var ADMIN_ROLES = { super: 1, admin: 1, subAdm: 1 };
var HASH_ROUNDS = 1000;
var FAIL_MAX = 8, FAIL_WINDOW_SEC = 600;

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var sys = String(d.sys || "");
    if (!/^[a-z]+$/.test(sys)) return _json({ok:false, err:"시스템 구분(sys) 오류"});
    switch (d.action) {
      case "status":     return _json(_status(sys));
      case "login":      return _json(_login(sys, d));
      case "setPw":      return _json(_setPw(sys, d));
      case "delPw":      return _json(_delPw(sys, d));
      case "migrateAll": return _json(_migrateAll(sys, d));
      default:           return _json({ok:false, err:"unknown action: " + d.action});
    }
  } catch (err) {
    return _json({ok:false, err: "로그인 도우미 오류: " + (err.message || String(err))});
  }
}

function doGet(e) {
  return _json({ok:true, msg:"Auth helper is running"});
}

// ─────────── 설정 ───────────
function _cfg(sys) {
  var p = PropertiesService.getScriptProperties();
  var sa = p.getProperty("SA_" + sys), db = p.getProperty("DB_" + sys), api = p.getProperty("API_" + sys);
  var pepper = p.getProperty("PEPPER");
  if (!sa || !db || !api || !pepper) throw new Error(sys + " 설정(SA_/DB_/API_/PEPPER)이 비어 있어요");
  return { sa: JSON.parse(sa), db: db.replace(/\/+$/, ""), api: api, pepper: pepper };
}

function _status(sys) {
  var p = PropertiesService.getScriptProperties();
  return { ok:true, configured: !!(p.getProperty("SA_" + sys) && p.getProperty("DB_" + sys) && p.getProperty("API_" + sys) && p.getProperty("PEPPER")) };
}

// ─────────── base64url / JWT ───────────
function _b64u(bytesOrStr) {
  return Utilities.base64EncodeWebSafe(bytesOrStr).replace(/=+$/, "");
}
function _signJwt(sa, payload) {
  var head = _b64u(JSON.stringify({alg:"RS256", typ:"JWT"}));
  var body = _b64u(JSON.stringify(payload));
  var sig = Utilities.computeRsaSha256Signature(head + "." + body, sa.private_key);
  return head + "." + body + "." + _b64u(sig);
}

// Firebase 커스텀 토큰 (입장권) — https://firebase.google.com/docs/auth/admin/create-custom-tokens
function _customToken(c, uid, claims) {
  var now = Math.floor(Date.now() / 1000);
  return _signJwt(c.sa, {
    iss: c.sa.client_email, sub: c.sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now, exp: now + 3600, uid: uid, claims: claims
  });
}

// DB 관리자 접근용 구글 액세스 토큰 (서비스 계정 → 규칙과 무관하게 읽기/쓰기)
function _dbToken(c, sys) {
  var cache = CacheService.getScriptCache();
  var key = "dbtok_" + sys;
  var t = cache.get(key);
  if (t) return t;
  var now = Math.floor(Date.now() / 1000);
  var assertion = _signJwt(c.sa, {
    iss: c.sa.client_email,
    scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600
  });
  var r = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post", muteHttpExceptions: true,
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion }
  });
  var j = JSON.parse(r.getContentText());
  if (!j.access_token) throw new Error("서비스 계정 인증 실패: " + (j.error_description || j.error || r.getResponseCode()));
  cache.put(key, j.access_token, 3000);
  return j.access_token;
}

// ─────────── DB REST ───────────
function _db(c, sys, method, path, value) {
  var opt = { method: method, muteHttpExceptions: true, contentType: "application/json",
              headers: { Authorization: "Bearer " + _dbToken(c, sys) } };
  if (value !== undefined) opt.payload = JSON.stringify(value);
  var r = UrlFetchApp.fetch(c.db + path + ".json", opt);
  var code = r.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("DB " + method + " " + path + " 실패 (" + code + ")");
  var txt = r.getContentText();
  return txt ? JSON.parse(txt) : null;
}
// Users 는 배열(또는 객체)로 저장됨 → [{key, u}] 로 통일
function _users(c, sys) {
  var raw = _db(c, sys, "get", "/main/Users") || [];
  var out = [];
  Object.keys(raw).forEach(function(k){ if (raw[k] && typeof raw[k] === "object") out.push({key:k, u:raw[k]}); });
  return out;
}
function _findUser(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].u.id === id) return list[i];
  return null;
}
// /secure/pw 키: Firebase 키에 못 쓰는 글자(. # $ [ ] /) 치환
function _pwKey(id) {
  return encodeURIComponent(String(id)).replace(/\./g, "%2E");
}

// ─────────── 비밀번호 해시 ───────────
function _hex(bytes) {
  return bytes.map(function(b){ return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
function _hash(c, pw, salt) {
  var h = salt + ":" + c.pepper + ":" + pw;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    h = _hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + ":" + salt, Utilities.Charset.UTF_8));
  }
  return h;
}
function _newSalt() {
  return Utilities.getUuid().replace(/-/g, "");
}
function _pwRecord(c, pw) {
  var s = _newSalt();
  return { h: _hash(c, String(pw), s), s: s, v: 1, t: new Date().toISOString() };
}
function _checkPw(c, sys, entry, pw) {
  var rec = _db(c, sys, "get", "/secure/pw/" + _pwKey(entry.u.id));
  if (rec && rec.h) return { ok: _hash(c, String(pw), rec.s) === rec.h, rec: rec };
  // 아직 옮기기 전 계정: 예전 평문 비번과 비교
  if (entry.u.pw != null && entry.u.pw !== "") return { ok: String(entry.u.pw) === String(pw), rec: null };
  return { ok: false, rec: null };
}

// 틀린 비번 연속 → 잠시 잠금 (마구 넣어보기 방지)
function _failKey(sys, id) { return "fail_" + sys + "_" + Utilities.base64EncodeWebSafe(String(id)).slice(0, 200); }
function _failCount(sys, id) { return Number(CacheService.getScriptCache().get(_failKey(sys, id)) || 0); }
function _failAdd(sys, id) { var n = _failCount(sys, id) + 1; CacheService.getScriptCache().put(_failKey(sys, id), String(n), FAIL_WINDOW_SEC); return n; }
function _failClear(sys, id) { CacheService.getScriptCache().remove(_failKey(sys, id)); }

// ─────────── 로그인 ───────────
function _login(sys, d) {
  var id = String(d.id || ""), pw = String(d.pw == null ? "" : d.pw);
  if (!id || !pw) return { ok:false, err:"아이디와 비밀번호를 넣어 주세요" };
  if (_failCount(sys, id) >= FAIL_MAX) return { ok:false, err:"비밀번호를 여러 번 틀려서 10분 동안 잠겼어요. 잠시 후 다시 해 주세요" };
  var c = _cfg(sys);
  var list = _users(c, sys);
  var entry = _findUser(list, id);
  if (!entry) return { ok:false, err:"아이디가 존재하지 않습니다" };
  var chk = _checkPw(c, sys, entry, pw);
  if (!chk.ok) { _failAdd(sys, id); return { ok:false, err:"비밀번호가 일치하지 않습니다" }; }
  _failClear(sys, id);
  // 처음 도우미로 로그인한 계정은 해시를 만들어 둠 (평문은 migrateAll 때 지움)
  if (!chk.rec) _db(c, sys, "put", "/secure/pw/" + _pwKey(id), _pwRecord(c, pw));
  var u = entry.u;
  return {
    ok: true,
    token: _customToken(c, id, { sys: sys, r: String(u.r || "user") }),
    me: { id: u.id, r: u.r, ar: u.ar, nm: u.nm, tel: u.tel }
  };
}

// 입장권으로 로그인한 사람 확인 (ID 토큰 → 아이디)
function _caller(c, sys, idToken) {
  if (!idToken) throw new Error("로그인이 필요해요");
  var r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(c.api), {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken })
  });
  var j = JSON.parse(r.getContentText() || "{}");
  var uid = j.users && j.users[0] && j.users[0].localId;
  if (!uid) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요");
  var list = _users(c, sys);
  var me = _findUser(list, uid);
  if (!me) throw new Error("계정을 찾을 수 없어요");
  return { id: uid, r: String(me.u.r || ""), list: list };
}

// ─────────── 비번 변경 / 초기화 ───────────
function _setPw(sys, d) {
  var c = _cfg(sys);
  var who = _caller(c, sys, d.idToken);
  var id = String(d.id || ""), newPw = d.newPw == null ? "" : String(d.newPw);
  var fromId = d.fromId ? String(d.fromId) : "";
  if (!id) return { ok:false, err:"아이디가 없어요" };
  var isAdmin = !!ADMIN_ROLES[who.r];
  if (who.id !== id && who.id !== fromId && !isAdmin) return { ok:false, err:"다른 사람의 비밀번호는 관리자만 바꿀 수 있어요" };
  if (who.id === id && !isAdmin) {
    var self = _findUser(who.list, id);
    if (!_checkPw(c, sys, self, d.oldPw == null ? "" : d.oldPw).ok) return { ok:false, err:"현재 비밀번호가 틀립니다" };
  }
  var rec;
  if (newPw) {
    if (newPw.length < 4) return { ok:false, err:"비밀번호는 4자 이상이어야 해요" };
    rec = _pwRecord(c, newPw);
  } else if (fromId && fromId !== id) {
    rec = _db(c, sys, "get", "/secure/pw/" + _pwKey(fromId));
    if (!rec) {
      var old = _findUser(who.list, fromId) || _findUser(who.list, id);
      if (old && old.u.pw) rec = _pwRecord(c, old.u.pw);
    }
    if (!rec) return { ok:false, err:"옮길 비밀번호가 없어요. 새 비밀번호를 넣어 주세요" };
  } else {
    return { ok:true, unchanged:true };
  }
  _db(c, sys, "put", "/secure/pw/" + _pwKey(id), rec);
  if (fromId && fromId !== id) _db(c, sys, "delete", "/secure/pw/" + _pwKey(fromId));
  // Users 에 남은 평문 비번 지우기
  var list = _users(c, sys);
  [id, fromId].forEach(function(x){
    var e = x && _findUser(list, x);
    if (e && e.u.pw != null) _db(c, sys, "delete", "/main/Users/" + e.key + "/pw");
  });
  return { ok:true };
}

function _delPw(sys, d) {
  var c = _cfg(sys);
  var who = _caller(c, sys, d.idToken);
  if (!ADMIN_ROLES[who.r]) return { ok:false, err:"관리자만 할 수 있어요" };
  if (!d.id) return { ok:false, err:"아이디가 없어요" };
  _db(c, sys, "delete", "/secure/pw/" + _pwKey(d.id));
  return { ok:true };
}

// ─────────── 3단계: 평문 비번 전부 옮기기 ───────────
function _migrateAll(sys, d) {
  var c = _cfg(sys);
  var who = _caller(c, sys, d.idToken);
  if (who.r !== "super" && who.r !== "admin") return { ok:false, err:"super/admin 만 할 수 있어요" };
  var moved = 0, already = 0, cleared = 0;
  who.list.forEach(function(e){
    if (!e.u.id) return;
    var key = "/secure/pw/" + _pwKey(e.u.id);
    var rec = _db(c, sys, "get", key);
    if (rec && rec.h) already++;
    else if (e.u.pw != null && e.u.pw !== "") { _db(c, sys, "put", key, _pwRecord(c, e.u.pw)); moved++; }
    if (e.u.pw != null) { _db(c, sys, "delete", "/main/Users/" + e.key + "/pw"); cleared++; }
  });
  return { ok:true, moved: moved, already: already, cleared: cleared };
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
