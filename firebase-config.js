// Firebase 설정 - 단오시스템
const firebaseConfig = {
  apiKey: "AIzaSyBx6pqkbjdjba7185H7AtGEA5NN9f0XlMQ",
  authDomain: "bspdano-system.firebaseapp.com",
  databaseURL: "https://bspdano-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bspdano-system",
  storageBucket: "bspdano-system.firebasestorage.app",
  messagingSenderId: "614152392942",
  appId: "1:614152392942:web:de6ddc09a3d9225d83a3ff"
};

firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();
const fbAuth = firebase.auth();

// 🔑 로그인 도우미(Apps Script) 주소 — 비어 있으면 예전 로그인 방식 (2026-10 보안작업 2단계, AuthHelper_GAS.js)
var SEC_AUTH_URL = "";
var SEC_SYS = "dano";
