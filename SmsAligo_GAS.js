/**
 * 알리고 SMS 발송 프록시 (Google Apps Script)
 *
 * [배포 방법]
 * 1. Google Apps Script (https://script.google.com) 에서 새 프로젝트 생성
 * 2. 이 코드 붙여넣기
 * 3. 배포 → 새 배포 → 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스: 모든 사용자
 * 4. 배포된 URL을 단오시스템 설정 → SMS 설정 → "알리고 프록시 URL" 에 등록
 *
 * [알리고 API 문서] https://smartsms.aligo.in/admin/api/spec.html
 */

var ALIGO_BASE = "https://apis.aligo.in";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || "send";

    switch (action) {
      case "send":          return _send(data);
      case "reserveList":   return _reserveList(data);
      case "reserveCancel": return _reserveCancel(data);
      default:              return _json({ok:false, err:"unknown action: " + action});
    }
  } catch (err) {
    return _json({ok:false, err: err.message || String(err)});
  }
}

function doGet(e) {
  return _json({ok:true, msg:"SMS Aligo Proxy is running"});
}

// ─── SMS/LMS 발송 ───
function _send(data) {
  if (!data.apiKey || !data.userId || !data.sender)
    return _json({ok:false, err:"apiKey/userId/sender 누락"});
  if (!data.tels || !data.tels.length)
    return _json({ok:false, err:"수신번호 없음"});
  if (!data.msg)
    return _json({ok:false, err:"메시지 내용 없음"});

  var msg = data.msg;
  var byteLen = Utilities.newBlob(msg).getBytes().length;
  var isLms = byteLen > 90;

  var payload = {
    key:      data.apiKey,
    user_id:  data.userId,
    sender:   data.sender,
    receiver: data.tels.join(","),
    msg:      msg,
    msg_type: isLms ? "LMS" : "SMS"
  };
  if (isLms && data.title) payload.title = data.title;
  if (data.rdate) {
    payload.rdate = data.rdate;
    payload.rtime = data.rtime || "";
  }
  if (data.testMode) payload.testmode_yn = "Y";

  var resp = UrlFetchApp.fetch(ALIGO_BASE + "/send/", {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  });
  var r = JSON.parse(resp.getContentText());

  if (String(r.result_code) === "1") {
    return _json({
      ok: true,
      sent:   Number(r.success_cnt) || data.tels.length,
      failed: Number(r.error_cnt)   || 0,
      msgId:  r.msg_id || "",
      msgType: isLms ? "LMS" : "SMS"
    });
  }
  return _json({ok:false, err: r.message || "알리고 오류 (code:" + r.result_code + ")"});
}

// ─── 예약 목록 조회 ───
function _reserveList(data) {
  if (!data.apiKey || !data.userId)
    return _json({ok:false, err:"apiKey/userId 누락"});

  var payload = {
    key:       data.apiKey,
    user_id:   data.userId,
    page:      data.page || 1,
    page_size: data.pageSize || 30
  };

  var resp = UrlFetchApp.fetch(ALIGO_BASE + "/sms/reserve/", {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  });
  var r = JSON.parse(resp.getContentText());

  if (String(r.result_code) === "1") {
    var list = (r.list || []).map(function(item) {
      return {
        mid:       item.mid,
        type:      item.type || "SMS",
        msg:       item.msg  || "",
        cnt:       item.reserve_cnt || item.cnt || 0,
        state:     item.reserve_state || item.state || "",
        reserveDt: item.reserve_date || "",
        sendDt:    item.tran_date || ""
      };
    });
    return _json({ok:true, list:list, total: r.total_cnt || list.length});
  }
  return _json({ok:false, err: r.message || "조회 실패 (code:" + r.result_code + ")"});
}

// ─── 예약 취소 ───
function _reserveCancel(data) {
  if (!data.apiKey || !data.userId || !data.mid)
    return _json({ok:false, err:"apiKey/userId/mid 누락"});

  var payload = {
    key:     data.apiKey,
    user_id: data.userId,
    mid:     data.mid
  };

  var resp = UrlFetchApp.fetch(ALIGO_BASE + "/sms/cancel/", {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  });
  var r = JSON.parse(resp.getContentText());

  if (String(r.result_code) === "1") {
    return _json({ok:true});
  }
  return _json({ok:false, err: r.message || "취소 실패 (code:" + r.result_code + ")"});
}

// ─── JSON 응답 헬퍼 ───
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
