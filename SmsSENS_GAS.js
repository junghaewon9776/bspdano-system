/**
 * 네이버 클라우드 SENS SMS 발송 프록시 (Google Apps Script)
 * 청년회·단오·가문굴비 3개 시스템이 이 프록시 하나를 같이 씀
 *
 * [배포 방법]
 * 1. Google Apps Script (https://script.google.com) 에서 새 프로젝트 생성
 * 2. 이 코드 붙여넣기
 * 3. 배포 → 새 배포 → 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스: 모든 사용자
 * 4. 배포된 URL을 단오시스템 설정 → SMS 설정 → "SMS 프록시 URL" 에 등록
 *    (이미 배포된 프록시를 고칠 땐: 배포 → 배포 관리 → ✏️ → 버전 "새 버전" → 배포 — 주소가 안 바뀜)
 *
 * [🔒 비밀키 보관 — 2026-10 보안작업 1단계]
 * 비밀키는 DB에 두지 않고 이 스크립트의 "스크립트 속성"에만 둠.
 * 프로젝트 설정(⚙️) → 스크립트 속성 → 속성 추가:
 *   SENS_SERVICE_ID   네이버 SENS 서비스 ID (ncp:sms:kr:...)
 *   SENS_ACCESS_KEY   Access Key
 *   SENS_SECRET_KEY   Secret Key
 *   SENS_SENDER       기본 발신번호 (화면에서 발신번호를 고르면 그 번호 사용)
 *   DAILY_LIMIT       (선택) 하루 전체 발송 한도, 기본 1000통
 *   PER_TEL_LIMIT     (선택) 같은 번호 하루 한도, 기본 30통
 * 스크립트 속성에 키가 있으면 화면이 보낸 키는 무시함.
 * 스크립트 속성이 비어 있을 때만 예전처럼 화면이 보낸 키를 씀 (옮기는 동안 문자가 끊기지 않게).
 *
 * [네이버 SENS API 문서] https://api.ncloud-docs.com/docs/ai-application-service-sens-smsv2
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || "send";
    switch (action) {
      case "send":   return _send(data);
      case "status": return _status();
      default:       return _json({ok:false, err:"unknown action: " + action});
    }
  } catch (err) {
    return _json({ok:false, err: err.message || String(err)});
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "status") return _status();
  return _json({ok:true, msg:"SMS SENS Proxy is running"});
}

// ─── 키 읽기: 스크립트 속성 우선, 없으면 요청값(옛 방식) ───
function _keys(data) {
  var p = PropertiesService.getScriptProperties();
  var sk = p.getProperty("SENS_SECRET_KEY");
  if (sk) {
    return {
      inScript:  true,
      serviceId: p.getProperty("SENS_SERVICE_ID") || "",
      accessKey: p.getProperty("SENS_ACCESS_KEY") || "",
      secretKey: sk,
      sender:    data.sender || p.getProperty("SENS_SENDER") || ""
    };
  }
  return {
    inScript:  false,
    serviceId: data.serviceId || "",
    accessKey: data.accessKey || "",
    secretKey: data.secretKey || "",
    sender:    data.sender    || ""
  };
}

// ─── 상태 확인 (비밀키는 절대 돌려주지 않음) ───
function _status() {
  var p = PropertiesService.getScriptProperties();
  var c = _counts();
  return _json({
    ok: true,
    keysInScript: !!p.getProperty("SENS_SECRET_KEY"),
    hasServiceId: !!p.getProperty("SENS_SERVICE_ID"),
    hasAccessKey: !!p.getProperty("SENS_ACCESS_KEY"),
    hasSender:    !!p.getProperty("SENS_SENDER"),
    today: c.total,
    dailyLimit: _limit("DAILY_LIMIT", 1000),
    perTelLimit: _limit("PER_TEL_LIMIT", 30)
  });
}

// ─── 하루 발송 한도 (프록시 주소를 알아낸 사람이 마구 보내지 못하게) ───
function _limit(name, def) {
  var v = Number(PropertiesService.getScriptProperties().getProperty(name));
  return v > 0 ? v : def;
}
function _todayKey() {
  return "CNT_" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd");
}
function _counts() {
  var s = PropertiesService.getScriptProperties().getProperty(_todayKey());
  try { return s ? JSON.parse(s) : {total:0, tel:{}}; } catch(e) { return {total:0, tel:{}}; }
}
// 한도 안이면 미리 세고 true, 넘으면 false (보내기 전에 셈 — 동시 요청도 정확히)
function _reserve(tels) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var key = _todayKey();
    var c = _counts();
    var daily = _limit("DAILY_LIMIT", 1000), perTel = _limit("PER_TEL_LIMIT", 30);
    if (c.total + tels.length > daily) return "오늘 문자 한도(" + daily + "통)를 넘었어요";
    for (var i = 0; i < tels.length; i++) {
      if ((c.tel[tels[i]] || 0) + 1 > perTel) return "같은 번호에 오늘 " + perTel + "통을 넘게 보낼 수 없어요 (" + tels[i].slice(-4) + ")";
    }
    c.total += tels.length;
    tels.forEach(function(t){ c.tel[t] = (c.tel[t] || 0) + 1; });
    props.setProperty(key, JSON.stringify(c));
    // 지난 날짜 카운터 정리
    props.getKeys().forEach(function(k){ if (k.indexOf("CNT_") === 0 && k !== key) props.deleteProperty(k); });
    return "";
  } finally {
    lock.releaseLock();
  }
}

// ─── SMS/LMS 발송 ───
function _send(data) {
  var k = _keys(data);
  var tels      = (data.tels || []).map(function(t){ return String(t).replace(/[^0-9]/g, ""); }).filter(function(t){ return t; });
  var msg       = data.msg       || "";

  if (!k.serviceId || !k.accessKey || !k.secretKey || !k.sender)
    return _json({ok:false, err:"serviceId/accessKey/secretKey/sender 누락"});
  if (!tels.length)
    return _json({ok:false, err:"수신번호 없음"});
  if (!msg)
    return _json({ok:false, err:"메시지 내용 없음"});

  var over = _reserve(tels);
  if (over) return _json({ok:false, sent:0, failed:tels.length, err:over});

  var byteLen = Utilities.newBlob(msg).getBytes().length;
  var msgType = byteLen > 80 ? "LMS" : "SMS";

  var uri = "/sms/v2/services/" + encodeURIComponent(k.serviceId) + "/messages";
  var url = "https://sens.apigw.ntruss.com" + uri;
  var timestamp = String(new Date().getTime());

  // HMAC-SHA256 서명 생성
  var signature = _makeSignature("POST", uri, timestamp, k.accessKey, k.secretKey);

  // 수신자 목록
  var messages = tels.map(function(t) {
    return { to: t };
  });

  var body = {
    type: msgType,
    from: k.sender.replace(/[^0-9]/g, ""),
    content: msg,
    messages: messages
  };

  // 예약 발송
  if (data.rdate && data.rtime) {
    body.reserveTime = data.rdate.replace(/-/g,"") + data.rtime.replace(/:/g,"");
    body.reserveTimeZone = "Asia/Seoul";
  }

  var options = {
    method: "post",
    contentType: "application/json; charset=utf-8",
    headers: {
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": k.accessKey,
      "x-ncp-apigw-signature-v2": signature
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  var result = {};
  try { result = JSON.parse(resp.getContentText()); } catch(ex) { result = {raw: resp.getContentText()}; }

  if (code >= 200 && code < 300) {
    return _json({
      ok: true,
      sent: tels.length,
      failed: 0,
      msgType: msgType,
      requestId: result.requestId || "",
      raw: result
    });
  } else {
    var errMsg = (result.error && result.error.message) || result.message || ("HTTP " + code);
    return _json({
      ok: false,
      sent: 0,
      failed: tels.length,
      msgType: msgType,
      err: errMsg,
      raw: result
    });
  }
}

// ─── HMAC-SHA256 서명 ───
function _makeSignature(method, uri, timestamp, accessKey, secretKey) {
  var space = " ";
  var newline = "\n";
  var message = method + space + uri + newline + timestamp + newline + accessKey;
  var sig = Utilities.computeHmacSha256Signature(message, secretKey);
  return Utilities.base64Encode(sig);
}

// ─── JSON 응답 ───
function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
