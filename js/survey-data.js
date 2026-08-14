// ============================================================
// BKC 現地測量データ
//   スマホで https://<公開URL>/?survey を開き、キャンパスを歩いて
//   記録 → 「エクスポート」で生成されたファイルでこのファイルを
//   丸ごと置き換えて push すると、マップとナビが実測GPSベースになる。
//   （空のままなら従来どおり略図データで動作する）
// ============================================================
export const SURVEY = {
  version: 3,
  recordedAt: null,
  // 実測グラフ公開時の地図原点・方位。nullの間は略図用推定値を使う。
  geo: null,
  // true にすると略図の通路グラフを捨て、測量した通路だけを使う
  // （キャンパス全域を歩き終えてからONにする）
  replaceGraph: false,
  // 通路ノード: { S1: { lat: 34.98, lng: 135.96 }, ... }
  nodes: {},
  // 通路のつながり: [ ['S1','S2'], ... ]（略図ノードIDとの接続も可）
  edges: [],
  // 建物の実測情報: { media: { entry, entrance:{lat,lng,...}, center:{lat,lng}, footprint:[{lat,lng},...], footprintQuality } }
  buildings: {},
  // 門・広場の実測位置: { 'gate-main': { entry: 'S1', pin: { lat, lng } }, ... }
  places: {},
  // 測量モードで登録した新規スポット（駐輪場・自販機など）:
  // { 'pt-1': { name: '第一駐輪場', cat: 'life', entry: 'S3', pin: { lat, lng } }, ... }
  points: {},
  // 建物名称の現地確認:
  // { prism: { status: 'ok'|'corrected'|'unconfirmed'|'not-found', observedName, note, checkedAt, location } }
  audits: {},
  // 往復軌跡の平均化・外れ値除去に使う生GPS。公開地図には直接描画しない。
  // [{ id:'T1', startedAt, endedAt, samples:[{ lat, lng, accuracy, timestamp }] }]
  tracks: [],
  // 調査プランナーの後回し・履歴・時間設定（測量端末間の引継ぎ用）
  planner: { skipped: {}, history: [], budgetMin: 30 },
};
