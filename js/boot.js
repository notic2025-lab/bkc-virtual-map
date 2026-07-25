// ============================================================
// 起動ブートストラップ（app.js 本体とは独立して動く最小コード）
//   - Service Worker 登録（オフラインキャッシュ・再訪高速化）
//   - 起動ウォッチドッグ: 本体JSの読み込みに失敗しても
//     ローディング画面で固まったままにしない
//   ※ CSP対応のためインラインではなく外部ファイルにしている
// ============================================================

// Service Worker（非対応・file:// 環境では静かにスキップ）
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 登録失敗でもアプリは動作する */ });
  });
}

// 起動ウォッチドッグ: 15秒経ってもローダーが消えない場合は読み込み失敗とみなし、
// ユーザーに再読み込みを促す（通信断・キャッシュ破損・スクリプトエラー時の固まり対策）
setTimeout(() => {
  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('done')) {
    const msg = loader.querySelector('p');
    if (msg) msg.textContent = '読み込みに時間がかかっています。通信環境をご確認のうえ、再読み込みしてください';
  }
}, 15000);
