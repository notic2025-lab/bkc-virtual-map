// ============================================================
// 立命館大学 びわこ・くさつキャンパス (BKC) — バーチャルマップデータ
// 出典: 立命館大学 BKCキャンパスマップ（公式パンフレット 2026-07時点）
// 座標系: 公式イラストマップ画像上の percent (left: 0-100, top: 0-100)
//   建物・通路・池・グラウンドの配置は公式イラストの実配置に準拠。
// ============================================================

export const MAP_W = 230;   // ワールド幅 (x) … 公式図の横方向。1単位 ≈ 4m → 約920m
export const MAP_D = 88;    // ワールド奥行 (z) … 公式図の縦方向 → 約350m（図の縦横比 2.63:1 に一致）

// percent座標 → ワールド座標
export function toWorld(left, top) {
  return {
    x: (left - 50) / 100 * MAP_W,
    z: (top - 50) / 100 * MAP_D,
  };
}

// ---- GPSジオリファレンス（実座標 ⇔ マップ座標）----
// lat0/lng0 = マップ中心 (world 0,0) の実座標。rotationDeg = マップ上方向の方位
// （真北から時計回り）。
// ※ 測量データ（survey-data.js）を使う場合、現在地も地図も同じこの変換を
//   通るため互いにズレない。この値は「地図の置き方」を決めるだけになる。
export const GEO = {
  lat0: 34.9822,       // BKCキャンパス中心（34°58'56"N）
  lng0: 135.9617,      // 135°57'42"E
  rotationDeg: 45,     // 公式イラストの「上」の実方位（コンパス表記からの推定・要現地校正）
  meterPerUnit: 4,
};

export function gpsToWorld(lat, lng) {
  const rad = Math.PI / 180;
  const dN = (lat - GEO.lat0) * 111320;                            // 北方向 (m)
  const dE = (lng - GEO.lng0) * 111320 * Math.cos(GEO.lat0 * rad); // 東方向 (m)
  const th = GEO.rotationDeg * rad;
  return {
    x: (dE * Math.cos(th) - dN * Math.sin(th)) / GEO.meterPerUnit,
    z: -(dN * Math.cos(th) + dE * Math.sin(th)) / GEO.meterPerUnit,
  };
}

// 大学生活の目的から探せるカテゴリ
export const CATEGORIES = {
  lecture:  { label: '授業・自習',      color: 0x58759a, css: '#58759a' },
  food:     { label: '食堂・カフェ',    color: 0xb37b2d, css: '#b37b2d' },
  research: { label: '研究・実験棟',    color: 0x4f8179, css: '#4f8179' },
  admin:    { label: '履修・相談',      color: 0xa43850, css: '#a43850' },
  sports:   { label: 'スポーツ',        color: 0x63815d, css: '#63815d' },
  circle:   { label: '課外・サークル',  color: 0x805c78, css: '#805c78' },
  life:     { label: '生活・設備',      color: 0x707b82, css: '#707b82' },
};

// ============================================================
// マップ定義（BKCは屋外キャンパス＝単一マップ）
//   navNodes/navEdges = 通路ネットワーク（A*経路探索用）
//   ノード座標は公式イラストの道路配置をトレースしたもの
// ============================================================
export const FLOOR_ORDER = ['campus'];

export const FLOORS = {
  campus: {
    id: 'campus', label: 'BKCキャンパス', short: 'BKC', y: 0,
    navNodes: {
      // 正門 → フロンティアアベニュー（南北） → セントラルサーカス
      GM:  { left: 55.5, top: 96 },   // 正門
      FA1: { left: 54.5, top: 88 },
      FA2: { left: 53.5, top: 79 },
      FA3: { left: 53,   top: 71 },
      BT:  { left: 54,   top: 64 },   // バスターミナル前
      FA4: { left: 54,   top: 57 },
      CS:  { left: 54,   top: 50.5 }, // セントラルサーカス
      // キャンパスプロムナード（サーカスから北東へ、第一グラウンド方面）
      P1:  { left: 58,   top: 45.5 },
      P2:  { left: 62,   top: 41 },
      P3:  { left: 66,   top: 36.5 }, // プリズム前
      P4:  { left: 69.5, top: 32 },   // コラーニングI前
      P5:  { left: 72.5, top: 27.5 }, // コラーニングII前
      P6:  { left: 75.5, top: 23.5 }, // BKCジム・アクトβσ前
      P7:  { left: 78,   top: 19.5 }, // 第一グラウンド・駐車場前
      IH1: { left: 83,   top: 13 },   // インターナショナルハウス前
      // ビュートストリート（サーカスから東へ）
      B1:  { left: 60.5, top: 50 },
      B2:  { left: 65.5, top: 49 },   // セントラルアーク前
      B3:  { left: 70.5, top: 48.5 }, // アクロス前
      B4:  { left: 75.5, top: 49 },   // アドセミナリオ前
      B5:  { left: 80,   top: 50 },   // ラルカディア前
      B6:  { left: 85,   top: 53 },
      GFD: { left: 90.5, top: 56 },   // グリーンフィールド前
      E1:  { left: 80.5, top: 43 },   // アクトμ前
      // 南東（エポック・スタジアム方面）
      S1:  { left: 73,   top: 55 },
      S2:  { left: 76,   top: 61 },   // エポック前
      SE3: { left: 71,   top: 68 },
      SE1: { left: 58,   top: 72 },
      SE2: { left: 62,   top: 74 },
      ST:  { left: 66,   top: 76 },   // スタジアム前
      // 南（スポーツ健康コモンズ・シーキューブ）
      SP:  { left: 50,   top: 87 },   // スポーツ健康コモンズ前
      C1:  { left: 50,   top: 73.5 }, // シー・キューブ／GIC前
      // 西（サーカスから西へ）
      W1:  { left: 49,   top: 49 },
      W2:  { left: 44,   top: 48 },
      W3:  { left: 39,   top: 46.5 },
      W4:  { left: 33.5, top: 45.5 }, // セル前
      // 北西の学術エリア
      NW0: { left: 40,   top: 38 },   // トリシア前
      NW1: { left: 44,   top: 42 },
      NW2: { left: 45,   top: 36 },   // イーストウイング・ワークショップ前
      NW3: { left: 41,   top: 31 },   // エクセル3前
      NW4: { left: 48,   top: 27 },   // エクセル1・2前
      NW5: { left: 52,   top: 22 },   // アクトα・学術フロンティア前
      NW6: { left: 58,   top: 18 },   // バイオリンク前
      NW7: { left: 65,   top: 15 },   // クリエーションコア・バイオフロンティア前
      NT1: { left: 68,   top: 17 },
      NT2: { left: 72,   top: 16 },   // サイエンスコア前
      TN:  { left: 72,   top: 12 },   // テニスコート前
      NR1: { left: 61,   top: 24 },   // フォレスト・リンクスクエア前
      NR2: { left: 66,   top: 22 },
      AC:  { left: 50,   top: 38 },   // コアステーション・ウエストウイング前
      // サーカス南側
      M1:  { left: 47,   top: 54 },   // メディアセンター前
      U1:  { left: 57,   top: 54 },   // ユニオン前
      // 南西 遊歩道 〜 東門
      SW1: { left: 47,   top: 79 },
      SW2: { left: 41,   top: 80 },
      SW3: { left: 34,   top: 81 },
      SW4: { left: 28,   top: 82 },
      SW5: { left: 21,   top: 84 },   // 第三グラウンド前
      EGn: { left: 23,   top: 90 },
      EG:  { left: 23,   top: 94 },   // 東門
      // 南西の研究ゾーン
      R1:  { left: 26,   top: 75 },   // テクノ・防災研・インキュベータ前
      R2:  { left: 17,   top: 75 },   // フォトニクス研前
      RH:  { left: 29,   top: 68 },   // ローム記念館前
    },
    navEdges: [
      // フロンティアアベニュー（メインストリート南）
      ['GM','FA1'], ['FA1','FA2'], ['FA2','FA3'], ['FA3','BT'], ['BT','FA4'], ['FA4','CS'],
      // キャンパスプロムナード（メインストリート北東）
      ['CS','P1'], ['P1','P2'], ['P2','P3'], ['P3','P4'], ['P4','P5'], ['P5','P6'], ['P6','P7'], ['P7','IH1'],
      // ビュートストリート
      ['CS','B1'], ['B1','B2'], ['B2','B3'], ['B3','B4'], ['B4','B5'], ['B5','B6'], ['B6','GFD'], ['B5','E1'],
      // 南東
      ['B3','S1'], ['S1','S2'], ['S2','SE3'], ['SE3','ST'],
      ['FA3','SE1'], ['SE1','SE2'], ['SE2','ST'],
      // 南
      ['FA1','SP'], ['FA3','C1'],
      // 西
      ['CS','W1'], ['W1','W2'], ['W2','W3'], ['W3','W4'],
      // 北西学術エリア
      ['W3','NW0'], ['NW0','NW1'], ['NW1','W1'], ['NW0','NW3'], ['NW3','NW2'],
      ['NW2','NW4'], ['NW4','NW5'], ['NW5','NW6'], ['NW6','NW7'],
      ['NW7','NT1'], ['NT1','NT2'], ['NT2','P6'], ['NT2','TN'],
      ['NW5','NR1'], ['NR1','NR2'], ['NR2','NT1'], ['NR2','P5'],
      ['NW2','AC'], ['AC','W1'],
      // サーカス南
      ['W1','M1'], ['M1','FA4'], ['CS','U1'], ['U1','FA4'],
      // 南西 遊歩道〜東門
      ['FA2','SW1'], ['SW1','SW2'], ['SW2','SW3'], ['SW3','SW4'], ['SW4','SW5'],
      ['SW5','EGn'], ['EGn','EG'],
      // 南西研究ゾーン
      ['SW4','R1'], ['R1','R2'], ['R1','RH'],
    ],
  },
};

// フロア間リンク（BKCは屋外単一マップのため無し）
export const FLOOR_LINKS = [];

// ---- 池・グラウンドなど地面に描く要素（公式図の実配置） ----
export const WATERS = [
  { name: '自然池',     left: 41, top: 80, rx: 2.2, ry: 6 },
  { name: '八左衛門池', left: 27, top: 86.5, rx: 2.0, ry: 4 },
  { name: '調整池',     left: 36, top: 89, rx: 3.0, ry: 4.5 },
];
export const FIELDS = [
  { kind: 'track',  left: 64.5, top: 82.5, w: 13, h: 20 },  // クインススタジアム
  { kind: 'dirt',   left: 75.5, top: 15,   w: 8,  h: 12 },  // 第一グラウンド
  { kind: 'dirt',   left: 13,   top: 83,   w: 10, h: 11 },  // 第三グラウンド
  { kind: 'tennis', left: 71.5, top: 9.5,  w: 7,  h: 8 },   // テニスコート
  { kind: 'turf',   left: 92.5, top: 56,   w: 5,  h: 15 },  // BKCグリーンフィールド
  { kind: 'plot',   left: 66.5, top: 11.5, w: 3,  h: 4 },   // 薬草園
];

// ============================================================
// 建物・施設（no = 公式マップの番号 / entry = 最寄り通路ノード）
//   pin は公式イラスト上の番号マーカー位置に準拠
// ============================================================
export const SHOPS = [
  // ---------- 授業・学び ----------
  {
    id: 'prism', no: 28, entry: 'P3', name: 'プリズムハウス', en: 'PRISM HOUSE',
    tag: '教室・キャリアセンター', cat: 'lecture',
    pin: { left: 66.5, top: 39 }, size: { w: 11, d: 9, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'プリズムホール、情報語学演習室、情報処理演習室、教室、キャリアセンター、マルチメディアルームなど。1・2回生の授業が多く行われるBKCの代表的な講義棟。就活相談はここのキャリアセンターへ。',
  },
  {
    id: 'forest', no: 27, entry: 'NR1', name: 'フォレストハウス', en: 'FOREST HOUSE',
    tag: '教室棟', cat: 'lecture',
    pin: { left: 59, top: 26.5 }, size: { w: 9, d: 7, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '教室が集まる講義棟。プリズムハウスと並ぶ授業の中心地。テスト期間は自習する学生でにぎわいます。',
  },
  {
    id: 'across', no: 5, entry: 'B3', name: 'アクロスウイング', en: 'ACROSS WING',
    tag: '演習室・ぴあら・研究室', cat: 'lecture',
    pin: { left: 69.5, top: 52.5 }, size: { w: 12, d: 8, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'アクロスラウンジ、情報語学演習室、メディアライブラリー、RAINBOW HIROBA、RAINBOWサービスデスク、ぴあら、教員研究室、BKCリサーチオフィス、教職支援センターなど。PCや情報環境のトラブルはRAINBOWサービスデスクへ。',
  },
  {
    id: 'colearn1', no: 19, entry: 'P4', name: 'コラーニングハウスⅠ', en: 'CO-LEARNING HOUSE I',
    tag: '情報処理演習室・教室', cat: 'lecture',
    pin: { left: 72, top: 34 }, size: { w: 9, d: 6, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '情報処理演習室、情報語学演習室、教室。通称「コラI」。',
  },
  {
    id: 'colearn2', no: 20, entry: 'P5', name: 'コラーニングハウスⅡ', en: 'CO-LEARNING HOUSE II',
    tag: '実習室・教室', cat: 'lecture',
    pin: { left: 74, top: 30.5 }, size: { w: 9, d: 6, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '食マネジメント学部の実習室、薬学部の研究実験室、教室など。通称「コラII」。',
  },
  {
    id: 'epoch', no: 13, entry: 'S2', name: 'エポック立命21', en: 'EPOCH RITSUMEI 21',
    tag: 'セミナーハウス', cat: 'lecture',
    pin: { left: 76.5, top: 64.5 }, size: { w: 8, d: 6, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '多機能型セミナーハウス。ゼミ合宿や研修、各種イベントに使われる宿泊機能つきの施設。',
  },
  {
    id: 'creation', no: 17, entry: 'NW7', name: 'クリエーションコア', en: 'CREATION CORE',
    tag: '教室棟', cat: 'lecture',
    pin: { left: 64.5, top: 16 }, size: { w: 9, d: 7, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '講義・演習に使われる教室棟。北側の研究エリアに隣接しています。',
  },

  // ---------- 図書・学習 ----------
  {
    id: 'media', no: 30, entry: 'M1', name: 'メディアセンター', en: 'MEDIA CENTER',
    tag: '図書館・ぴあら', cat: 'lecture',
    pin: { left: 47, top: 52 }, size: { w: 13, d: 10, h: 6 },
    url: 'https://www.ritsumei.ac.jp/library/',
    desc: 'BKCの図書館。開架図書、新聞・雑誌閲覧室、ぴあら（ラーニングコモンズ）、マルチメディアルーム、グループ学習室など。テスト前の自習・グループワークの定番スポット。',
  },

  // ---------- 食堂・カフェ ----------
  {
    id: 'union', no: 31, entry: 'U1', name: 'ユニオンスクエア', en: 'UNION SQUARE',
    tag: '生協食堂・ショップ', cat: 'food',
    pin: { left: 57.5, top: 53.5 }, size: { w: 12, d: 9, h: 5 },
    url: 'https://www.ritsumeikancoop.jp/',
    desc: '生協食堂・ショップ、ユニオンホールなど。BKC最大の学食。お昼のピークは大混雑するので少し時間をずらすのがコツ。',
  },
  {
    id: 'link', no: 34, entry: 'NR1', name: 'リンクスクエア', en: 'LINK SQUARE',
    tag: '生協食堂・書籍部', cat: 'food',
    pin: { left: 63, top: 25.5 }, size: { w: 10, d: 8, h: 5 },
    url: 'https://www.ritsumeikancoop.jp/',
    desc: '生協食堂・書籍部（本屋）。2階に生命科学部事務室など。北側エリアの授業・研究の合間のランチに便利。',
  },
  {
    id: 'ccube', no: 15, entry: 'C1', name: 'シー・キューブ', en: 'C-CUBE',
    tag: 'レストラン', cat: 'food',
    pin: { left: 48.5, top: 72.5 }, size: { w: 7, d: 5, h: 4 },
    url: 'https://www.ritsumeikancoop.jp/',
    desc: 'ナデシコ食堂（レストラン）。落ち着いて食事したい日に。',
  },
  {
    id: 'canopy', no: 16, entry: 'FA4', name: 'キャノピー', en: 'CANOPY',
    tag: 'バス営業所・売店', cat: 'life',
    pin: { left: 53.5, top: 60 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '近江鉄道バス営業所など。バスの定期券・回数券はこちら。目の前がバスターミナル。',
  },

  // ---------- 窓口・サポート ----------
  {
    id: 'adseminario', no: 7, entry: 'B4', name: 'アドセミナリオ', en: 'AD-SEMINARIO',
    tag: '学部事務室・学びステーション', cat: 'admin',
    pin: { left: 74, top: 46.5 }, size: { w: 11, d: 8, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '経済学部事務室、食マネジメント学部事務室、スポーツ健康科学部事務室、学びステーション、教室など。履修や成績の手続きは「学びステーション」へ。',
  },
  {
    id: 'central-arc', no: 23, entry: 'B2', name: 'セントラルアーク', en: 'CENTRAL ARC',
    tag: '学生オフィス・BBP', cat: 'admin',
    pin: { left: 65, top: 45 }, size: { w: 10, d: 7, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '学生オフィス、学生サポートルーム、障害学生支援室、ドリーム・クロスラウンジ、国際教育センター、キャリア教育センター、言語教育センター、Beyond Borders Plaza（BBP）など。奨学金・課外活動・留学の相談はここ。',
  },
  {
    id: 'core-station', no: 18, entry: 'AC', name: 'コアステーション', en: 'CORE STATION',
    tag: '理工学部事務室・キャンパス管理室', cat: 'admin',
    pin: { left: 47, top: 39.5 }, size: { w: 9, d: 7, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'キャンパス管理室、BKCキャンパス業務窓口、理工学部事務室、BKC地域連携課、教員研究室、役員室、立命館みらい保育園など。落とし物・施設利用の窓口もこちら。',
  },

  // ---------- 研究・実験棟 ----------
  {
    id: 'east-wing', no: 8, entry: 'NW2', name: 'イーストウイング', en: 'EAST WING',
    tag: '研究実験室', cat: 'research',
    pin: { left: 41.5, top: 37 }, size: { w: 12, d: 7, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部、生命科学部、薬学部の研究実験室、教員・院生研究室。',
  },
  {
    id: 'west-wing', no: 9, entry: 'AC', name: 'ウエストウイング', en: 'WEST WING',
    tag: '研究実験室・保健センター', cat: 'research',
    pin: { left: 52.5, top: 37.5 }, size: { w: 12, d: 7, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室、教員・院生研究室、保健センター。体調が悪くなったら保健センターへ。',
  },
  {
    id: 'exl1', no: 10, entry: 'NW4', name: 'エクセル１', en: 'EXL1',
    tag: '実験室', cat: 'research',
    pin: { left: 53.5, top: 31.5 }, size: { w: 8, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部のための実験室など。',
  },
  {
    id: 'exl2', no: 11, entry: 'NW4', name: 'エクセル２', en: 'EXL2',
    tag: '研究実験室', cat: 'research',
    pin: { left: 46, top: 29 }, size: { w: 7, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部、生命科学部、薬学部の研究実験室。',
  },
  {
    id: 'exl3', no: 12, entry: 'NW3', name: 'エクセル３', en: 'EXL3',
    tag: '研究実験室', cat: 'research',
    pin: { left: 37.5, top: 33.5 }, size: { w: 7, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室。',
  },
  {
    id: 'science', no: 21, entry: 'NT2', name: 'サイエンスコア', en: 'SCIENCE CORE',
    tag: '研究実験室・薬学部事務室', cat: 'research',
    pin: { left: 71, top: 18.5 }, size: { w: 10, d: 7, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '生命科学部、薬学部の研究実験室、共同研究室、教員研究室、薬学部事務室など。',
  },
  {
    id: 'cel', no: 22, entry: 'W4', name: 'セル', en: 'CEL',
    tag: '研究実験室', cat: 'research',
    pin: { left: 32.5, top: 45 }, size: { w: 6, d: 5, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室。',
  },
  {
    id: 'frontier', no: 14, entry: 'NW5', name: '学術フロンティア共同研究センター', en: 'FRONTIER RESEARCH CENTER',
    short: '学術フロンティア', tag: '共同研究センター', cat: 'research',
    pin: { left: 55, top: 23.5 }, size: { w: 8, d: 6, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部、生命科学部の研究実験室など。',
  },
  {
    id: 'techno', no: 24, entry: 'R1', name: 'テクノコンプレクス', en: 'TECHNO-COMPLEX',
    tag: '産学連携・研究センター', cat: 'research',
    pin: { left: 21, top: 72.5 }, size: { w: 9, d: 7, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'SRセンター、産学連携ラボラトリー、ハイテク・リサーチセンター、マイクロシステムセンター、ロボティクスFAセンターなど。',
  },
  {
    id: 'intra-photonics', no: 25, entry: 'R2', name: 'イントラフォトニクスリサーチセンター', en: 'INTRA-PHOTONICS RESEARCH CENTER',
    short: 'フォトニクス研', tag: '研究センター', cat: 'research',
    pin: { left: 14, top: 76 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '光技術（フォトニクス）の研究センター。',
  },
  {
    id: 'bousai', no: 29, entry: 'R2', name: '防災システムリサーチセンター', en: 'RESEARCH CENTER FOR DISASTER MITIGATION SYSTEM',
    short: '防災リサーチ', tag: '研究センター', cat: 'research',
    pin: { left: 16.5, top: 72.5 }, size: { w: 7, d: 5, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'BKCリサーチオフィス、理工学部の研究実験室。',
  },
  {
    id: 'rexl', no: 35, entry: 'P2', name: 'レクセル', en: 'REXL',
    tag: 'RI実験室', cat: 'research',
    pin: { left: 57, top: 37.5 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'RI（放射性同位元素）実験室。',
  },
  {
    id: 'workshop', no: 36, entry: 'NW2', name: 'ワークショップラボ', en: 'WORKSHOP LAB',
    tag: '機械工作実習室', cat: 'research',
    pin: { left: 44, top: 33.5 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '機械工作実習室。ものづくり実習はここ。',
  },
  {
    id: 'incubator', no: 32, entry: 'R1', name: '立命館大学BKCインキュベータ', en: 'RITSUMEIKAN BKC INCUBATOR',
    short: 'インキュベータ', tag: '起業家育成施設', cat: 'research',
    pin: { left: 25, top: 72 }, size: { w: 8, d: 6, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '（独）中小機構による大学連携起業家育成施設（開発・実験・研究施設）、BKCリサーチオフィス。',
  },
  {
    id: 'tricea', no: 39, entry: 'NW0', name: 'トリシア', en: 'TRICEA',
    tag: '研究実験室', cat: 'research',
    pin: { left: 37.5, top: 41 }, size: { w: 7, d: 6, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室、教員・院生研究室。',
  },
  {
    id: 'biolink', no: 40, entry: 'NW6', name: 'バイオリンク', en: 'BIO LINK',
    tag: '研究実験室・サークルルーム', cat: 'research',
    pin: { left: 61, top: 18.5 }, size: { w: 8, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '生命科学部、薬学部の研究実験室、教員・院生研究室、サークルルームなど。',
  },
  {
    id: 'biofrontier', no: 44, entry: 'NW7', name: 'バイオフロンティア', en: 'BIO FRONTIER',
    tag: '実験室', cat: 'research',
    pin: { left: 63.5, top: 13 }, size: { w: 8, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工系学部の実験室など。',
  },
  {
    id: 'crossverse', no: 42, entry: 'C1', name: '立命館先端クロスバースイノベーションコモンズ', en: 'ADVANCED CROSS-VERSE INNOVATION COMMONS',
    short: 'クロスバース', tag: 'J-PEAKS研究施設', cat: 'research',
    pin: { left: 49.5, top: 75.5 }, size: { w: 6, d: 5, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'J-PEAKS身体圏研究施設（クロスバースアリーナ等）。',
  },
  {
    id: 'grassroots', no: 43, entry: 'C1', name: 'グラスルーツイノベーションセンター', en: 'GRASSROOTS INNOVATION CENTER',
    short: 'グラスルーツ', tag: 'コワーキング・Fab', cat: 'research',
    pin: { left: 51.5, top: 75.5 }, size: { w: 6, d: 5, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'コワーキングスペース、GIC Fab、Startup Lounge、Communal Lab、個別ラボ。起業やプロトタイピングに挑戦するならここ。',
  },
  {
    id: 'integration', no: 37, entry: 'B5', name: 'インテグレーションコア・ラルカディア', en: 'INTEGRATION CORE / RARCADIA',
    short: 'ラルカディア', tag: 'スポ健 研究・教室', cat: 'research',
    pin: { left: 80.5, top: 52 }, size: { w: 11, d: 8, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'スポーツ健康科学部の研究実験室、教員研究室、教室など。',
  },

  // ---------- スポーツ ----------
  {
    id: 'gym', no: 26, entry: 'P6', name: 'BKCジム', en: 'BKC GYMNASIUM',
    tag: 'アリーナ・トレーニングルーム', cat: 'sports',
    pin: { left: 75, top: 26.5 }, size: { w: 12, d: 9, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '第1・第2アリーナ、トレーニングルーム、ミーティングルームなど。体育会の活動拠点。',
  },
  {
    id: 'sports-commons', no: 41, entry: 'SP', name: 'BKCスポーツ健康コモンズ', en: 'BKC SPORTS AND HEALTH COMMONS',
    short: 'スポーツコモンズ', tag: 'プール・アリーナ・知るカフェ', cat: 'sports',
    pin: { left: 49, top: 87.5 }, size: { w: 13, d: 9, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'アリーナ、屋内プール、屋外プール、トレーニングルーム、アクティブスペース、リラックスコモンズ、知るカフェなど。一般学生も使える運動施設。',
  },
  {
    id: 'quince', entry: 'ST', name: 'Daigasエナジースタジアム', en: 'QUINCE STADIUM',
    short: 'スタジアム', tag: '陸上競技場', cat: 'sports',
    pin: { left: 64.5, top: 82.5 }, size: { w: 28, d: 16, h: 2.5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'クインススタジアム。陸上トラックとフィールドを備えるBKCのメインスタジアム。木瓜原遺跡製鉄炉跡が保存されています。',
  },
  {
    id: 'athlete-gym', no: 6, entry: 'P6', name: 'アスリートジム', en: 'ATHLETE GYM',
    tag: 'スポーツ強化オフィス', cat: 'sports',
    pin: { left: 75.5, top: 21.5 }, size: { w: 7, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'スポーツ強化オフィス、トレーニングルームなど。',
  },
  {
    id: 'ground1', entry: 'P7', name: '第一グラウンド', en: 'GROUND 1',
    tag: 'グラウンド', cat: 'sports',
    pin: { left: 75.5, top: 15 }, size: { w: 18, d: 10, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '北エリアのグラウンド。野球・ソフトボールなどで利用。隣は駐車場。',
  },
  {
    id: 'ground3', entry: 'SW5', name: '第三グラウンド', en: 'GROUND 3',
    tag: 'グラウンド', cat: 'sports',
    pin: { left: 13, top: 83 }, size: { w: 22, d: 9, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '南西エリアのグラウンド。',
  },
  {
    id: 'tennis', entry: 'TN', name: 'テニスコート', en: 'TENNIS COURTS',
    tag: 'テニスコート', cat: 'sports',
    pin: { left: 71.5, top: 9.5 }, size: { w: 15, d: 7, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '北エリアのテニスコート。',
  },
  {
    id: 'green-field', entry: 'GFD', name: 'BKCグリーンフィールド', en: 'BKC GREEN FIELD',
    short: 'グリーンフィールド', tag: '人工芝フィールド', cat: 'sports',
    pin: { left: 92.5, top: 56 }, size: { w: 11, d: 13, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '人工芝フィールドとアスリートクラブハウス。ラグビー・アメフトなどの拠点。',
  },

  // ---------- 課外・サークル ----------
  {
    id: 'act-alpha', no: 1, entry: 'NW5', name: 'アクトα', en: 'ACT α',
    tag: 'サークルラボ', cat: 'circle',
    pin: { left: 55, top: 18 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'サークルラボなど。課外活動の拠点。',
  },
  {
    id: 'act-mu', no: 2, entry: 'E1', name: 'アクトμ', en: 'ACT μ',
    tag: '音楽練習場', cat: 'circle',
    pin: { left: 81, top: 41 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '音楽練習場など。軽音・吹奏楽などの練習はここ。',
  },
  {
    id: 'act-beta', no: 3, entry: 'P6', name: 'アクトβ', en: 'ACT β',
    tag: 'サークルルーム', cat: 'circle',
    pin: { left: 77.5, top: 22.5 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'サークルルームなど。',
  },
  {
    id: 'act-sigma', no: 4, entry: 'P6', name: 'アクトσ', en: 'ACT σ',
    tag: 'サークルルーム', cat: 'circle',
    pin: { left: 79, top: 24.5 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'サークルルームなど。',
  },

  // ---------- 生活・施設 ----------
  {
    id: 'rohm', no: 33, entry: 'RH', name: '立命館大学ローム記念館', en: 'RITSUMEIKAN UNIVERSITY ROHM PLAZA',
    short: 'ローム記念館', tag: '大会議室・研究室', cat: 'life',
    pin: { left: 29, top: 65.5 }, size: { w: 8, d: 6, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '大会議室、教員研究室など。南西研究ゾーンのガラス張りの建物。',
  },
  {
    id: 'intl-house', no: 38, entry: 'IH1', name: 'BKCインターナショナルハウス', en: 'BKC INTERNATIONAL HOUSE',
    short: 'Iハウス', tag: '国際教育寮', cat: 'life',
    pin: { left: 86, top: 8 }, size: { w: 9, d: 7, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '国際教育寮。留学生と日本人学生が共に生活する寮。第一グラウンドの北側。',
  },
];

// 屋外キャンパスは単一マップ（全建物とも floor = 'campus'）
SHOPS.forEach(s => { s.floor = 'campus'; });

// 遠景でもラベルを出す主要施設（学生の目的地になりやすい建物）
const LANDMARKS = new Set([
  'union', 'link', 'media', 'prism', 'across', 'adseminario',
  'central-arc', 'core-station', 'gym', 'sports-commons', 'quince', 'ccube',
]);
SHOPS.forEach(s => { s.landmark = LANDMARKS.has(s.id); });

// ---- 施設・エントランス（経路の出発地点にもなる）----
export const PLACES = [
  { id: 'gate-main', floor: 'campus', entry: 'GM', name: '正門', kind: 'entrance', pin: { left: 55.5, top: 97.5 } },
  { id: 'gate-east', floor: 'campus', entry: 'EG', name: '東門', kind: 'entrance', pin: { left: 22.5, top: 95.5 } },
  { id: 'bus',       floor: 'campus', entry: 'BT', name: 'バスターミナル', kind: 'entrance', pin: { left: 56.5, top: 65 } },
  { id: 'plaza',     floor: 'campus', entry: 'CS', name: 'セントラルサーカス', kind: 'plaza', pin: { left: 54, top: 50.5 } },
];

// ---- 装飾用ブロック（現在は地面テクスチャ側で表現するため未使用）----
export const DECOR = [];

// ---- 施設ピクトグラム（未使用）----
export const FACILITIES = [];

// ============================================================
// 現地測量データの適用（js/survey-data.js）
//   測量モード（?survey）で歩いて記録した実GPS座標を略図にマージする。
//   現在地ピンも地図も同じ gpsToWorld 変換を通るため、測量済みの
//   通路・入口ではナビと実際の位置が原理的にズレない。
// ============================================================
export function worldToPercent(x, z) {
  return { left: x / MAP_W * 100 + 50, top: z / MAP_D * 100 + 50 };
}
export function latLngToPercent(lat, lng) {
  const { x, z } = gpsToWorld(lat, lng);
  return worldToPercent(x, z);
}

import { SURVEY } from './survey-data.js';

// 測量データの座標として妥当か（NaN・範囲外が1つでも混ざると
// 経路グラフ全体が壊れるため、取り込み前に必ず検証する）
function isValidLatLng(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat >= 34.9 && p.lat <= 35.1 && p.lng >= 135.8 && p.lng <= 136.1;
}

try {
  const fl = FLOORS.campus;
  if (SURVEY?.nodes && Object.keys(SURVEY.nodes).length) {
    if (SURVEY.replaceGraph) {
      fl.navNodes = {};
      fl.navEdges = [];
    }
    // 測量ノードを percent 座標へ変換してグラフに追加（不正値は捨てる・上限あり）
    let added = 0;
    for (const [id, p] of Object.entries(SURVEY.nodes)) {
      if (!isValidLatLng(p) || typeof id !== 'string' || !/^[\w-]{1,24}$/.test(id)) continue;
      if (++added > 5000) break;
      fl.navNodes[id] = latLngToPercent(p.lat, p.lng);
    }
    for (const [a, b] of SURVEY.edges ?? []) {
      if (fl.navNodes[a] && fl.navNodes[b] && a !== b) fl.navEdges.push([a, b]);
    }
    // 建物・門の実測入口／位置で上書き
    for (const [id, s] of Object.entries(SURVEY.buildings ?? {})) {
      const shop = SHOPS.find(x => x.id === id);
      if (!shop) continue;
      if (s.entry && fl.navNodes[s.entry]) shop.entry = s.entry;
      if (isValidLatLng(s.pin)) shop.pin = latLngToPercent(s.pin.lat, s.pin.lng);
    }
    for (const [id, s] of Object.entries(SURVEY.places ?? {})) {
      const pl = PLACES.find(x => x.id === id);
      if (!pl) continue;
      if (s.entry && fl.navNodes[s.entry]) pl.entry = s.entry;
      if (isValidLatLng(s.pin)) pl.pin = latLngToPercent(s.pin.lat, s.pin.lng);
    }
    // 測量モードで登録した新規スポット（駐輪場・自販機など）を検索・案内できる施設として追加
    let ptAdded = 0;
    for (const [id, s] of Object.entries(SURVEY.points ?? {})) {
      if (typeof id !== 'string' || !/^[\w-]{1,32}$/.test(id)) continue;
      if (typeof s?.name !== 'string' || !s.name.trim() || !isValidLatLng(s.pin)) continue;
      if (SHOPS.some(x => x.id === id) || PLACES.some(x => x.id === id)) continue;
      if (++ptAdded > 200) break;
      SHOPS.push({
        id, floor: 'campus',
        name: s.name.slice(0, 24), en: '', tag: '登録スポット',
        cat: CATEGORIES[s.cat] ? s.cat : 'life',
        pin: latLngToPercent(s.pin.lat, s.pin.lng),
        size: { w: 3, d: 3, h: 1.2 },
        entry: (s.entry && fl.navNodes[s.entry]) ? s.entry : undefined,
        desc: '現地測量で登録されたスポット。',
        url: 'https://www.ritsumei.ac.jp/',
      });
    }
    // replaceGraph で略図ノードが消えた場合、参照切れの entry を最寄りノードへ振り直す
    const nearestNodeId = (pin) => {
      let best = null, bd = Infinity;
      for (const [id, p] of Object.entries(fl.navNodes)) {
        const d = (p.left - pin.left) ** 2 + (p.top - pin.top) ** 2;
        if (d < bd) { bd = d; best = id; }
      }
      return best;
    };
    for (const poi of [...SHOPS, ...PLACES]) {
      if (!fl.navNodes[poi.entry]) poi.entry = nearestNodeId(poi.pin);
    }
  }
} catch (e) {
  console.warn('survey-data の適用に失敗しました（略図データで動作します）', e);
}
