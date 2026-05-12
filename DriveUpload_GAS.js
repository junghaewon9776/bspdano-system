/**
 * 참가신청 첨부파일 → Google Drive 업로드 프록시
 *
 * [배포 방법]
 * 1. Google Apps Script (https://script.google.com) 에서 새 프로젝트 생성
 * 2. 이 코드 붙여넣기
 * 3. FOLDER_ID 에 파일 저장할 Drive 폴더 ID 입력
 * 4. 배포 → 새 배포 → 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스: 모든 사용자
 * 5. 배포된 URL을 단오시스템 설정(Config)의 DRIVE_UPLOAD_URL 에 등록
 */

// ★ 여기에 Drive 폴더 ID 입력 (파일이 저장될 폴더)
var FOLDER_ID = "";  // 예: "1AbC_dEf..."

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var base64 = data.base64 || "";
    var filename = data.filename || "file";
    var mime = data.mime || "application/octet-stream";
    var subFolder = data.subFolder || "uploads";

    // 메인 폴더
    var root = FOLDER_ID ? DriveApp.getFolderById(FOLDER_ID) : DriveApp.getRootFolder();

    // 하위 폴더 생성 (이벤트ID/접수자명_타임스탬프)
    var parts = subFolder.split("/");
    var folder = root;
    for (var i = 0; i < parts.length; i++) {
      var name = parts[i].trim();
      if (!name) continue;
      var subs = folder.getFoldersByName(name);
      folder = subs.hasNext() ? subs.next() : folder.createFolder(name);
    }

    // 파일 생성
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, filename);
    var file = folder.createFile(blob);

    // 링크 공유 설정: 링크가 있는 모든 사용자 보기 가능
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var url = "https://drive.google.com/file/d/" + file.getId() + "/view";

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      url: url,
      fileId: file.getId(),
      name: file.getName()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      err: err.message || String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    msg: "Drive Upload Proxy is running"
  })).setMimeType(ContentService.MimeType.JSON);
}
