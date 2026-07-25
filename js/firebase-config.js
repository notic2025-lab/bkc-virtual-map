// ============================================================
// Firebase 設定（ライブ位置共有で使用）
//   apiKey はFirebaseのWebアプリでは「公開情報」扱い。
//   セキュリティは Realtime Database のルール側で担保する。
// ============================================================
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDqOFuUydXjOMypj7vacLdU9HXIXyvdgqA',
  authDomain: 'bkc-map-a0332.firebaseapp.com',
  projectId: 'bkc-map-a0332',
  storageBucket: 'bkc-map-a0332.firebasestorage.app',
  messagingSenderId: '122924187107',
  appId: '1:122924187107:web:149d7605540fd1961af4d6',
  // Realtime Database のURL。コンソールでシンガポール（asia-southeast1）以外の
  // リージョンで作成した場合は、コンソールに表示される実際のURLへ変更する。
  databaseURL: 'https://bkc-map-a0332-default-rtdb.asia-southeast1.firebasedatabase.app',
};
