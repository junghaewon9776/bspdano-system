// 단오시스템 계정 인증 모듈
// - 단오시스템 Firebase에서 Users 조회
// - localStorage에 24시간 세션 유지
// - 사용법: HTML에서 이 파일 로드 후 danoAuthGate(callback) 호출

var _DANO_FB_CONFIG = {
  apiKey: "AIzaSyBx6pqkbjdjba7185H7AtGEA5NN9f0XlMQ",
  authDomain: "bspdano-system.firebaseapp.com",
  databaseURL: "https://bspdano-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bspdano-system",
  storageBucket: "bspdano-system.firebasestorage.app",
  messagingSenderId: "614152392942",
  appId: "1:614152392942:web:de6ddc09a3d9225d83a3ff"
};

var _DANO_TTL = 24 * 60 * 60 * 1000; // 24시간
var _danoApp2, _danoDb2;

function _danoInitFb() {
  if (_danoApp2) return;
  try {
    _danoApp2 = firebase.app("dano");
  } catch (e) {
    _danoApp2 = firebase.initializeApp(_DANO_FB_CONFIG, "dano");
  }
  _danoDb2 = _danoApp2.database();
}

function _danoCheckSession() {
  // 1) danoAuth 세션 확인
  var s = localStorage.getItem('danoAuth');
  if (s) {
    try {
      var d = JSON.parse(s);
      if (Date.now() - d.ts < _DANO_TTL) return d;
      localStorage.removeItem('danoAuth');
    } catch (e) { localStorage.removeItem('danoAuth'); }
  }
  // 2) 단오시스템 메인 세션(cleanFarm_auth_v1)이 있으면 그대로 사용
  var m = localStorage.getItem('cleanFarm_auth_v1');
  if (m) {
    try {
      var md = JSON.parse(m);
      if (md && md.id && Date.now() - md.ts < _DANO_TTL) {
        var session = { id: md.id, nm: md.nm || '', r: md.r || 'user', ts: md.ts };
        localStorage.setItem('danoAuth', JSON.stringify(session));
        return session;
      }
    } catch (e) {}
  }
  return null;
}

function danoAuthGate(onSuccess) {
  var session = _danoCheckSession();
  if (session) { onSuccess(session); return; }
  _danoShowLogin(onSuccess);
}

function _danoShowLogin(onSuccess) {
  if (document.getElementById('danoAuthGate')) return;
  var html = '<div id="danoAuthGate" style="position:fixed;inset:0;background:rgba(15,23,42,0.97);z-index:99999;display:flex;align-items:center;justify-content:center">';
  html += '<div style="background:#1e293b;padding:28px;border-radius:14px;width:360px;max-width:92vw;color:#e2e8f0">';
  html += '<h2 style="margin-bottom:6px;color:#fff;font-size:18px">🔐 로그인</h2>';
  html += '<p style="font-size:12px;color:#94a3b8;margin-bottom:16px">단오시스템 계정으로 로그인하세요</p>';
  html += '<label style="font-size:11px;color:#94a3b8;font-weight:600">아이디</label>';
  html += '<input id="_daId" type="text" placeholder="아이디" autocomplete="username" style="width:100%;padding:10px 12px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#fff;font-size:14px;margin:4px 0 10px">';
  html += '<label style="font-size:11px;color:#94a3b8;font-weight:600">비밀번호</label>';
  html += '<input id="_daPw" type="password" placeholder="비밀번호" autocomplete="current-password" style="width:100%;padding:10px 12px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#fff;font-size:14px;margin:4px 0" onkeydown="if(event.key===\'Enter\')_danoSubmitLogin()">';
  html += '<div id="_daErr" style="color:#ef4444;font-size:12px;margin-top:6px;min-height:16px"></div>';
  html += '<button onclick="_danoSubmitLogin()" style="width:100%;padding:12px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-size:14px;font-weight:700;cursor:pointer;margin-top:10px">로그인</button>';
  html += '<div style="text-align:center;margin-top:12px"><a href="index.html" style="font-size:11px;color:#64748b;text-decoration:none">← 메인으로</a></div>';
  html += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  window._danoAuthCallback = onSuccess;
  setTimeout(function () { document.getElementById('_daId').focus(); }, 100);
}

function _danoSubmitLogin() {
  var id = document.getElementById('_daId').value.trim();
  var pw = document.getElementById('_daPw').value;
  var errEl = document.getElementById('_daErr');
  if (!id || !pw) { errEl.textContent = '아이디와 비밀번호를 입력하세요'; return; }
  errEl.textContent = '로그인 중...';
  errEl.style.color = '#94a3b8';

  _danoInitFb();
  _danoDb2.ref('/main/Users').once('value').then(function (snap) {
    var users = snap.val() || [];
    var found = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i] && users[i].id === id) { found = users[i]; break; }
    }
    if (!found) { errEl.style.color = '#ef4444'; errEl.textContent = '아이디가 존재하지 않습니다'; return; }
    if (found.pw !== pw) { errEl.style.color = '#ef4444'; errEl.textContent = '비밀번호가 일치하지 않습니다'; return; }

    var session = { id: found.id, nm: found.nm || '', r: found.r || 'user', ts: Date.now() };
    localStorage.setItem('danoAuth', JSON.stringify(session));

    var gate = document.getElementById('danoAuthGate');
    if (gate) gate.remove();
    if (window._danoAuthCallback) window._danoAuthCallback(session);
  }).catch(function (e) {
    errEl.style.color = '#ef4444';
    errEl.textContent = '서버 오류: ' + e.message;
  });
}

function danoLogout() {
  localStorage.removeItem('danoAuth');
  location.reload();
}
