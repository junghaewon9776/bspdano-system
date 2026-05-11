/**
 * 단오시스템 — 파일 업로드 GAS 프록시
 *
 * ─────────────────────────────────────────────────────────────
 * 배포 절차:
 *   1) https://script.google.com/ 에서 새 프로젝트 생성
 *   2) 이 코드 붙여넣기
 *   3) 에디터에서 setup() 함수 한 번 실행 (업로드 폴더 자동 생성)
 *   4) 배포 > 새 배포 > 유형: 웹 앱
 *        - 실행 계정: 나(소유자)
 *        - 액세스 권한: "모든 사용자"
 *   5) 생성된 웹앱 URL 을 단오시스템 Apply.html 의 GAS_UPLOAD_URL 에 입력
 *
 * ─────────────────────────────────────────────────────────────
 * 동작:
 *   - POST 요청으로 base64 파일 + 메타데이터 수신
 *   - Google Drive 에 파일 생성 (비공개 — 스크립트 소유자만 접근)
 *   - 파일 URL 반환
 *
 * 보안:
 *   - 파일은 비공개(소유자 전용)로 저장
 *   - 관리시스템 로그인 사용자만 Drive 에서 열람 가능
 * ─────────────────────────────────────────────────────────────
 */

var PROPS = PropertiesService.getScriptProperties();
var UPLOAD_FOLDER_KEY = "UPLOAD_FOLDER_ID";

function setup() {
  var folder = _getOrCreateFolder();
  Logger.log("✅ 셋업 완료");
  Logger.log("   업로드 폴더: " + folder.getName() + " (ID: " + folder.getId() + ")");
  Logger.log("");
  Logger.log("▶ 다음 단계: 배포 > 새 배포 > 웹 앱");
  Logger.log("   실행계정: 나(소유자) / 액세스: 모든 사용자");
}

function _getOrCreateFolder() {
  var fid = PROPS.getProperty(UPLOAD_FOLDER_KEY);
  if (fid) {
    try { return DriveApp.getFolderById(fid); } catch (e) {}
  }
  var folder = DriveApp.createFolder("단오시스템_참가신청_첨부파일");
  PROPS.setProperty(UPLOAD_FOLDER_KEY, folder.getId());
  return folder;
}

// CORS preflight
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ok:true, msg:"FileUpload proxy ready"}))
    .setMimeType(ContentService.MimeType.JSON);
}

// 파일 업로드 처리
function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var dataUrl = p.dataUrl || "";
    var fileName = p.fileName || "file";
    var subFolder = p.subFolder || "misc";

    if (!dataUrl) return _json({ok:false, err:"dataUrl 누락"});

    var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return _json({ok:false, err:"잘못된 dataUrl 형식"});

    var mime = m[1] || "application/octet-stream";
    var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), mime, fileName);

    // 하위 폴더 (접수순번_성명)
    var root = _getOrCreateFolder();
    var sub;
    var subs = root.getFoldersByName(subFolder);
    if (subs.hasNext()) {
      sub = subs.next();
    } else {
      sub = root.createFolder(subFolder);
    }

    var file = sub.createFile(blob);
    // 비공개 유지 (공유 설정 안 함 → 소유자만 접근)
    // 관리시스템 관리자가 볼 수 있도록 필요시 수동 공유

    var url = "https://drive.google.com/file/d/" + file.getId() + "/view";
    return _json({ok:true, url:url, fileId:file.getId(), name:file.getName()});
  } catch (err) {
    return _json({ok:false, err:String(err.message || err)});
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
