// Firebase 설정 - 단오시스템 (방역코스/코스관리)
const firebaseConfig = {
  apiKey: "AIzaSyBx6pqkbjdjba7185H7AtGEA5NN9f0XlMQ",
  authDomain: "bspdano-system.firebaseapp.com",
  databaseURL: "https://bspdano-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bspdano-system",
  storageBucket: "bspdano-system.firebasestorage.app",
  messagingSenderId: "614152392942",
  appId: "1:614152392942:web:de6ddc09a3d9225d83a3ff"
};

// Firebase compat SDK 로드 후 초기화
firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();
const fbAuth = firebase.auth();
