// Google Drive 사진 저장 웹앱
// 업로드(doPost) + 조회(doGet) + 삭제
// Drive에 비공개로 저장, 토큰 검증으로 접근 제어
//
// [배포 방법]
// 1. script.google.com → 새 프로젝트
// 2. 이 코드 전체 붙여넣기
// 3. TOKEN 설정 (admin과 같은 값)
// 4. 배포 → 새 배포 → 웹앱
//    - 실행 사용자: 본인
//    - 액세스 권한: 모든 사용자
// 5. 웹앱 URL 복사 → admin 페이지에 붙여넣기

var TOKEN = ''; // admin과 같은 토큰 (비워두면 검증 안 함)

// 프로그램명으로 폴더 자동 생성
function getOrCreateFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getPhotoFolder(appName) {
  var root = DriveApp.getRootFolder();
  var appFolder = getOrCreateFolder(root, appName || '방역코스');
  return getOrCreateFolder(appFolder, '자료실');
}

// 사진 조회 (GET) — 토큰 검증 후 base64 반환
function doGet(e) {
  var p = e.parameter || {};
  if (TOKEN && p.token !== TOKEN) return _ok({error:'토큰 불일치'});

  if (p.action === 'view' && p.fileId) {
    try {
      var file = DriveApp.getFileById(p.fileId);
      var blob = file.getBlob();
      var b64 = Utilities.base64Encode(blob.getBytes());
      var mime = blob.getContentType();
      return _ok({ok:true, dataUrl:'data:' + mime + ';base64,' + b64});
    } catch(err) {
      return _ok({error:'파일 조회 실패: ' + err.message});
    }
  }
  return _ok({error:'잘못된 요청'});
}

// 사진 업로드/삭제 (POST)
function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); }
  catch(err) { return _ok({error:'JSON 파싱 실패'}); }

  if (TOKEN && p.token !== TOKEN) return _ok({error:'토큰 불일치'});

  // 삭제 요청
  if (p.action === 'delete' && p.fileId) {
    try { DriveApp.getFileById(p.fileId).setTrashed(true); }
    catch(err) {}
    return _ok({ok:true});
  }

  // 업로드
  var folder = getPhotoFolder(p.appName);
  var subName = (p.type === 'receipt') ? '영수증' : '현장사진';
  var subFolder = getOrCreateFolder(folder, subName);

  var m = (p.dataUrl || '').match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!m) return _ok({error:'이미지 데이터 없음'});

  var fileName = (p.type || 'photo') + '_' + new Date(p.takenAt || Date.now()).toISOString().replace(/[:.]/g, '-') + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName);
  var file = subFolder.createFile(blob);
  // 비공개 유지 (공유 설정 안 함)

  var folderPath = (p.appName || '방역코스') + '/자료실/' + subName;
  return _ok({ok:true, fileId:file.getId(), folderPath:folderPath});
}

function _ok(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
