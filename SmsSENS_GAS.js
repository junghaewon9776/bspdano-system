/**
 * 네이버 클라우드 SENS SMS 발송 프록시 (Google Apps Script)
 *
 * [배포 방법]
 * 1. Google Apps Script (https://script.google.com) 에서 새 프로젝트 생성
 * 2. 이 코드 붙여넣기
 * 3. 배포 → 새 배포 → 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스: 모든 사용자
 * 4. 배포된 URL을 단오시스템 설정 → SMS 설정 → "SMS 프록시 URL" 에 등록
 *
 * [네이버 SENS API 문서] https://api.ncloud-docs.com/docs/ai-application-service-sens-smsv2
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || "send";
    switch (action) {
      case "send": return _send(data);
      default:     return _json({ok:false, err:"unknown action: " + action});
    }
  } catch (err) {
    return _json({ok:false, err: err.message || String(err)});
  }
}

function doGet(e) {
  return _json({ok:true, msg:"SMS SENS Proxy is running"});
}

// ─── SMS/LMS 발송 ───
function _send(data) {
  var serviceId = data.serviceId || "";
  var accessKey = data.accessKey || "";
  var secretKey = data.secretKey || "";
  var sender    = data.sender    || "";
  var tels      = data.tels      || [];
  var msg       = data.msg       || "";

  if (!serviceId || !accessKey || !secretKey || !sender)
    return _json({ok:false, err:"serviceId/accessKey/secretKey/sender 누락"});
  if (!tels.length)
    return _json({ok:false, err:"수신번호 없음"});
  if (!msg)
    return _json({ok:false, err:"메시지 내용 없음"});

  var byteLen = Utilities.newBlob(msg).getBytes().length;
  var msgType = byteLen > 80 ? "LMS" : "SMS";

  var uri = "/sms/v2/services/" + encodeURIComponent(serviceId) + "/messages";
  var url = "https://sens.apigw.ntruss.com" + uri;
  var timestamp = String(new Date().getTime());

  // HMAC-SHA256 서명 생성
  var signature = _makeSignature("POST", uri, timestamp, accessKey, secretKey);

  // 수신자 목록
  var messages = tels.map(function(t) {
    return { to: t.replace(/[^0-9]/g, "") };
  });

  var body = {
    type: msgType,
    from: sender.replace(/[^0-9]/g, ""),
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
      "x-ncp-iam-access-key": accessKey,
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
