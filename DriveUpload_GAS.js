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
    var action = data.action || "upload";

    // ─── 파일 다운로드 프록시 ───
    if (action === "download") {
      var fileId = data.fileId || "";
      if (!fileId) return _json({ok:false, err:"fileId 누락"});
      try {
        var dlFile = DriveApp.getFileById(fileId);
        var dlBlob = dlFile.getBlob();
        var dlB64 = Utilities.base64Encode(dlBlob.getBytes());
        return _json({
          ok: true,
          name: dlFile.getName(),
          mime: dlBlob.getContentType(),
          size: dlBlob.getBytes().length,
          base64: dlB64
        });
      } catch (dlErr) {
        return _json({ok:false, err:dlErr.message || String(dlErr)});
      }
    }

    // ─── 파일 업로드 (기존) ───
    var base64 = data.base64 || data.dataUrl || "";
    var filename = data.filename || data.fileName || "file";
    var mime = data.mime || "application/octet-stream";
    var subFolder = data.subFolder || "uploads";

    // dataUrl 형식이면 base64 추출
    if (base64.indexOf("data:") === 0) {
      var m = base64.match(/^data:([^;]+);base64,(.+)$/);
      if (m) { mime = m[1]; base64 = m[2]; }
    }

    if (!base64) return _json({ok:false, err:"base64 데이터 누락"});

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

    return _json({
      ok: true,
      url: url,
      fileId: file.getId(),
      name: file.getName()
    });

  } catch (err) {
    return _json({
      ok: false,
      err: err.message || String(err)
    });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return _json({ok: true, msg: "Drive Upload/Download Proxy is running"});
}
