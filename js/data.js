// ============================================================
// 立命館大学 びわこ・くさつキャンパス (BKC) — バーチャルマップデータ
// 出典: 立命館大学 BKCキャンパスマップ（公式パンフレット 2026-07時点）
// 座標系: キャンパス略図上の percent (left: 0-100, top: 0-100)
//   ※ 公式イラストマップを元にしたデフォルメ略図。位置関係は概略。
// ============================================================

export const MAP_W = 170;   // ワールド幅 (x) … 1単位 ≈ 4m → 約680m
export const MAP_D = 110;   // ワールド奥行 (z) … 約440m

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
  rotationDeg: 35,     // 略図の「上」の実方位（略図使用時のみ影響・推定）
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
  lecture:  { label: '授業・学び',      color: 0x3b82f6, css: '#60a5fa' },
  food:     { label: '食堂・カフェ',    color: 0xf59e0b, css: '#fbbf24' },
  research: { label: '研究・実験棟',    color: 0x14b8a6, css: '#2dd4bf' },
  admin:    { label: '窓口・サポート',  color: 0xf43f5e, css: '#fb7185' },
  sports:   { label: 'スポーツ',        color: 0x22c55e, css: '#4ade80' },
  circle:   { label: '課外・サークル',  color: 0xec4899, css: '#f472b6' },
  life:     { label: '生活・施設',      color: 0x94a3b8, css: '#cbd5e1' },
};

// ============================================================
// マップ定義（BKCは屋外キャンパス＝単一マップ）
//   navNodes/navEdges = 通路ネットワーク（A*経路探索用）
// ============================================================
export const FLOOR_ORDER = ['campus'];

export const FLOORS = {
  campus: {
    id: 'campus', label: 'BKCキャンパス', short: 'BKC', y: 0,
    navNodes: {
      // 正門〜キャンパスプロムナード（南北のメインストリート）
      GM:  { left: 52, top: 92 },  // 正門
      PM1: { left: 52, top: 83 },
      BT:  { left: 52, top: 75 },  // バスターミナル前
      CS:  { left: 52, top: 68 },  // セントラルサーカス
      PM2: { left: 52, top: 60 },
      PM3: { left: 52, top: 52 },
      PM4: { left: 52, top: 44 },
      PM5: { left: 52, top: 36 },
      PM6: { left: 52, top: 28 },
      PM7: { left: 52, top: 20 },
      PM8: { left: 52, top: 14 },
      // 南東（スタジアム・アクロス方面）
      SE1: { left: 60, top: 66 },
      SE2: { left: 66, top: 70 },
      ST:  { left: 73, top: 77 },  // スタジアム前
      GFD: { left: 90, top: 77 },  // グリーンフィールド
      AC1: { left: 60, top: 60 },  // アクロス前
      EP1: { left: 67, top: 62 },  // エポック前
      // 南西 ビュートストリート 〜 東門
      SW1: { left: 44, top: 68 },
      SW2: { left: 36, top: 66 },
      SW3: { left: 28, top: 66 },
      SW4: { left: 20, top: 67 },
      SW5: { left: 13, top: 70 },
      EG1: { left: 10, top: 78 },
      EG:  { left: 10, top: 86 },  // 東門
      // 南西の研究ゾーン
      R1:  { left: 30, top: 74 },
      R2:  { left: 22, top: 74 },
      R3:  { left: 38, top: 80 },
      // 西（BKCジム・アクト）
      ACT: { left: 26, top: 63 },
      W1:  { left: 24, top: 60 },
      W2:  { left: 16, top: 58 },  // ジム前
      // 中央
      C1:  { left: 44, top: 62 },  // セントラルアーク前
      U1:  { left: 38, top: 58 },  // ユニオン前
      F1:  { left: 42, top: 53 },  // フォレスト前
      PR:  { left: 48, top: 54 },  // プリズム前
      CO:  { left: 56, top: 50 },  // コアステーション前
      CB:  { left: 60, top: 47 },  // シー・キューブ前
      M1:  { left: 44, top: 45 },  // メディアセンター前
      WS:  { left: 32, top: 46 },  // ワークショップラボ前
      CL1: { left: 38, top: 43 },  // コラーニングI前
      CL2: { left: 41, top: 37 },  // コラーニングII前
      L1:  { left: 50, top: 38 },  // リンクスクエア前
      // 北（研究エリア）
      N1:  { left: 44, top: 28 },
      N2:  { left: 36, top: 29 },
      N3:  { left: 28, top: 23 },
      N4:  { left: 36, top: 19 },
      N5:  { left: 46, top: 17 },
      N6:  { left: 56, top: 15 },
      N7:  { left: 62, top: 15 },
      NE1: { left: 58, top: 25 },
      NE2: { left: 62, top: 29 },
      NE3: { left: 68, top: 26 },
      NE4: { left: 70, top: 34 },
      // 東（スポーツ健康コモンズ・インターナショナルハウス方面）
      E1:  { left: 70, top: 46 },
      GR:  { left: 73, top: 37 },
      XV:  { left: 74, top: 24 },
      SPC: { left: 79, top: 16 },
      IH:  { left: 85, top: 40 },
      TN:  { left: 66, top: 9 },
      G1:  { left: 86, top: 12 },
    },
    navEdges: [
      // プロムナード
      ['GM','PM1'], ['PM1','BT'], ['BT','CS'], ['CS','PM2'], ['PM2','PM3'], ['PM3','PM4'],
      ['PM4','PM5'], ['PM5','PM6'], ['PM6','PM7'], ['PM7','PM8'],
      // 南東
      ['CS','SE1'], ['SE1','SE2'], ['SE2','ST'], ['ST','GFD'],
      ['PM2','AC1'], ['AC1','SE1'], ['AC1','EP1'], ['EP1','SE2'],
      // 南西〜東門
      ['CS','SW1'], ['SW1','SW2'], ['SW2','SW3'], ['SW3','SW4'], ['SW4','SW5'],
      ['SW5','EG1'], ['EG1','EG'],
      // 南西研究ゾーン
      ['SW5','R2'], ['R2','R1'], ['R1','R3'], ['R3','PM1'],
      // 西
      ['SW3','ACT'], ['ACT','W1'], ['W1','W2'], ['W2','SW5'], ['W1','U1'],
      // 中央
      ['SW1','C1'], ['C1','PM2'], ['C1','U1'],
      ['U1','F1'], ['F1','PR'], ['PR','PM3'],
      ['PM3','CO'], ['CO','CB'], ['CB','AC1'], ['CB','E1'],
      ['F1','M1'], ['M1','PM4'], ['M1','CL1'], ['CL1','WS'], ['CL1','CL2'],
      ['CL2','L1'], ['PM5','L1'], ['CL2','N2'],
      // 北
      ['PM6','N1'], ['N1','N2'], ['N2','N3'], ['N3','N4'], ['N4','N5'],
      ['N5','N6'], ['N6','N7'], ['N5','PM7'],
      ['PM6','NE1'], ['NE1','NE2'], ['NE1','NE3'], ['NE3','XV'],
      ['NE2','NE4'], ['NE4','GR'], ['GR','E1'], ['GR','XV'],
      ['XV','SPC'], ['SPC','G1'], ['N7','TN'], ['TN','SPC'],
      ['E1','IH'],
    ],
  },
};

// フロア間リンク（BKCは屋外単一マップのため無し）
export const FLOOR_LINKS = [];

// ---- 池・グラウンドなど地面に描く要素 ----
export const WATERS = [
  { name: '八左衛門池', left: 24, top: 53, rx: 5.0, ry: 3.4 },
  { name: '自然池',     left: 29, top: 36, rx: 3.4, ry: 2.6 },
  { name: '調整池',     left: 17, top: 45, rx: 2.6, ry: 2.0 },
];
export const FIELDS = [
  { kind: 'track',  left: 75, top: 83, w: 20, h: 12 },  // クインススタジアム
  { kind: 'dirt',   left: 87, top: 11, w: 13, h: 8 },   // 第一グラウンド
  { kind: 'dirt',   left: 8,  top: 80, w: 9,  h: 6 },   // 第三グラウンド
  { kind: 'tennis', left: 66, top: 6,  w: 10, h: 5 },   // テニスコート
  { kind: 'turf',   left: 91, top: 77, w: 9,  h: 6 },   // BKCグリーンフィールド
  { kind: 'plot',   left: 48, top: 8,  w: 7,  h: 4 },   // 薬草園
];

// ============================================================
// 建物・施設（no = 公式マップの番号 / entry = 最寄り通路ノード）
// ============================================================
export const SHOPS = [
  // ---------- 授業・学び ----------
  {
    id: 'prism', no: 28, entry: 'PR', name: 'プリズムハウス', en: 'PRISM HOUSE',
    tag: '教室・キャリアセンター', cat: 'lecture',
    pin: { left: 48, top: 56 }, size: { w: 11, d: 9, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'プリズムホール、情報語学演習室、情報処理演習室、教室、キャリアセンター、マルチメディアルームなど。1・2回生の授業が多く行われるBKCの代表的な講義棟。就活相談はここのキャリアセンターへ。',
  },
  {
    id: 'forest', no: 27, entry: 'F1', name: 'フォレストハウス', en: 'FOREST HOUSE',
    tag: '教室棟', cat: 'lecture',
    pin: { left: 40, top: 52 }, size: { w: 9, d: 7, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '教室が集まる講義棟。プリズムハウスと並ぶ授業の中心地。テスト期間は自習する学生でにぎわいます。',
  },
  {
    id: 'across', no: 5, entry: 'AC1', name: 'アクロスウイング', en: 'ACROSS WING',
    tag: '演習室・ぴあら・研究室', cat: 'lecture',
    pin: { left: 63, top: 58 }, size: { w: 12, d: 8, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'アクロスラウンジ、情報語学演習室、メディアライブラリー、RAINBOW HIROBA、RAINBOWサービスデスク、ぴあら、教員研究室、BKCリサーチオフィス、教職支援センターなど。PCや情報環境のトラブルはRAINBOWサービスデスクへ。',
  },
  {
    id: 'colearn1', no: 19, entry: 'CL1', name: 'コラーニングハウスⅠ', en: 'CO-LEARNING HOUSE I',
    tag: '情報処理演習室・教室', cat: 'lecture',
    pin: { left: 36, top: 42 }, size: { w: 9, d: 6, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '情報処理演習室、情報語学演習室、教室。通称「コラI」。',
  },
  {
    id: 'colearn2', no: 20, entry: 'CL2', name: 'コラーニングハウスⅡ', en: 'CO-LEARNING HOUSE II',
    tag: '実習室・教室', cat: 'lecture',
    pin: { left: 40, top: 35 }, size: { w: 9, d: 6, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '食マネジメント学部の実習室、薬学部の研究実験室、教室など。通称「コラII」。',
  },
  {
    id: 'epoch', no: 13, entry: 'EP1', name: 'エポック立命21', en: 'EPOCH RITSUMEI 21',
    tag: 'セミナーハウス', cat: 'lecture',
    pin: { left: 69, top: 64 }, size: { w: 8, d: 6, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '多機能型セミナーハウス。ゼミ合宿や研修、各種イベントに使われる宿泊機能つきの施設。',
  },
  {
    id: 'creation', no: 17, entry: 'N5', name: 'クリエーションコア', en: 'CREATION CORE',
    tag: '教室棟', cat: 'lecture',
    pin: { left: 46, top: 15 }, size: { w: 9, d: 7, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '講義・演習に使われる教室棟。北側の研究エリアに隣接しています。',
  },

  // ---------- 図書・学習 ----------
  {
    id: 'media', no: 30, entry: 'M1', name: 'メディアセンター', en: 'MEDIA CENTER',
    tag: '図書館・ぴあら', cat: 'lecture',
    pin: { left: 44, top: 43 }, size: { w: 13, d: 10, h: 6 },
    url: 'https://www.ritsumei.ac.jp/library/',
    desc: 'BKCの図書館。開架図書、新聞・雑誌閲覧室、ぴあら（ラーニングコモンズ）、マルチメディアルーム、グループ学習室など。テスト前の自習・グループワークの定番スポット。',
  },

  // ---------- 食堂・カフェ ----------
  {
    id: 'union', no: 31, entry: 'U1', name: 'ユニオンスクエア', en: 'UNION SQUARE',
    tag: '生協食堂・ショップ', cat: 'food',
    pin: { left: 36, top: 56 }, size: { w: 12, d: 9, h: 5 },
    url: 'https://www.ritsumeikancoop.jp/',
    desc: '生協食堂・ショップ、ユニオンホールなど。BKC最大の学食。お昼のピークは大混雑するので少し時間をずらすのがコツ。',
  },
  {
    id: 'link', no: 34, entry: 'L1', name: 'リンクスクエア', en: 'LINK SQUARE',
    tag: '生協食堂・書籍部', cat: 'food',
    pin: { left: 50, top: 36 }, size: { w: 10, d: 8, h: 5 },
    url: 'https://www.ritsumeikancoop.jp/',
    desc: '生協食堂・書籍部（本屋）。2階に生命科学部事務室など。北側エリアの授業・研究の合間のランチに便利。',
  },
  {
    id: 'ccube', no: 15, entry: 'CB', name: 'シー・キューブ', en: 'C-CUBE',
    tag: 'レストラン', cat: 'food',
    pin: { left: 60, top: 49 }, size: { w: 7, d: 5, h: 4 },
    url: 'https://www.ritsumeikancoop.jp/',
    desc: 'ナデシコ食堂（レストラン）。落ち着いて食事したい日に。',
  },
  {
    id: 'canopy', no: 16, entry: 'BT', name: 'キャノピー', en: 'CANOPY',
    tag: 'バス営業所・売店', cat: 'life',
    pin: { left: 56, top: 72 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '近江鉄道バス営業所など。バスの定期券・回数券はこちら。目の前がバスターミナル。',
  },

  // ---------- 窓口・サポート ----------
  {
    id: 'adseminario', no: 7, entry: 'AC1', name: 'アドセミナリオ', en: 'AD-SEMINARIO',
    tag: '学部事務室・学びステーション', cat: 'admin',
    pin: { left: 58, top: 63 }, size: { w: 11, d: 8, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '経済学部事務室、食マネジメント学部事務室、スポーツ健康科学部事務室、学びステーション、教室など。履修や成績の手続きは「学びステーション」へ。',
  },
  {
    id: 'central-arc', no: 23, entry: 'C1', name: 'セントラルアーク', en: 'CENTRAL ARC',
    tag: '学生オフィス・BBP', cat: 'admin',
    pin: { left: 44, top: 64 }, size: { w: 10, d: 7, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '学生オフィス、学生サポートルーム、障害学生支援室、ドリーム・クロスラウンジ、国際教育センター、キャリア教育センター、言語教育センター、Beyond Borders Plaza（BBP）など。奨学金・課外活動・留学の相談はここ。',
  },
  {
    id: 'core-station', no: 18, entry: 'CO', name: 'コアステーション', en: 'CORE STATION',
    tag: '理工学部事務室・キャンパス管理室', cat: 'admin',
    pin: { left: 54, top: 48 }, size: { w: 9, d: 7, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'キャンパス管理室、BKCキャンパス業務窓口、理工学部事務室、BKC地域連携課、教員研究室、役員室、立命館みらい保育園など。落とし物・施設利用の窓口もこちら。',
  },

  // ---------- 研究・実験棟 ----------
  {
    id: 'east-wing', no: 8, entry: 'N1', name: 'イーストウイング', en: 'EAST WING',
    tag: '研究実験室', cat: 'research',
    pin: { left: 42, top: 26 }, size: { w: 12, d: 7, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部、生命科学部、薬学部の研究実験室、教員・院生研究室。',
  },
  {
    id: 'west-wing', no: 9, entry: 'N2', name: 'ウエストウイング', en: 'WEST WING',
    tag: '研究実験室・保健センター', cat: 'research',
    pin: { left: 34, top: 27 }, size: { w: 12, d: 7, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室、教員・院生研究室、保健センター。体調が悪くなったら保健センターへ。',
  },
  {
    id: 'exl1', no: 10, entry: 'PM6', name: 'エクセル１', en: 'EXL1',
    tag: '実験室', cat: 'research',
    pin: { left: 50, top: 27 }, size: { w: 8, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部のための実験室など。',
  },
  {
    id: 'exl2', no: 11, entry: 'NE1', name: 'エクセル２', en: 'EXL2',
    tag: '研究実験室', cat: 'research',
    pin: { left: 56, top: 23 }, size: { w: 7, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部、生命科学部、薬学部の研究実験室。',
  },
  {
    id: 'exl3', no: 12, entry: 'NE2', name: 'エクセル３', en: 'EXL3',
    tag: '研究実験室', cat: 'research',
    pin: { left: 60, top: 30 }, size: { w: 7, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室。',
  },
  {
    id: 'science', no: 21, entry: 'N6', name: 'サイエンスコア', en: 'SCIENCE CORE',
    tag: '研究実験室・薬学部事務室', cat: 'research',
    pin: { left: 54, top: 13 }, size: { w: 10, d: 7, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '生命科学部、薬学部の研究実験室、共同研究室、教員研究室、薬学部事務室など。',
  },
  {
    id: 'cel', no: 22, entry: 'N4', name: 'セル', en: 'CEL',
    tag: '研究実験室', cat: 'research',
    pin: { left: 36, top: 17 }, size: { w: 6, d: 5, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室。',
  },
  {
    id: 'frontier', no: 14, entry: 'N3', name: '学術フロンティア共同研究センター', en: 'FRONTIER RESEARCH CENTER',
    short: '学術フロンティア', tag: '共同研究センター', cat: 'research',
    pin: { left: 28, top: 21 }, size: { w: 8, d: 6, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部、生命科学部の研究実験室など。',
  },
  {
    id: 'techno', no: 24, entry: 'R2', name: 'テクノコンプレクス', en: 'TECHNO-COMPLEX',
    tag: '産学連携・研究センター', cat: 'research',
    pin: { left: 22, top: 76 }, size: { w: 9, d: 7, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'SRセンター、産学連携ラボラトリー、ハイテク・リサーチセンター、マイクロシステムセンター、ロボティクスFAセンターなど。',
  },
  {
    id: 'intra-photonics', no: 25, entry: 'EG1', name: 'イントラフォトニクスリサーチセンター', en: 'INTRA-PHOTONICS RESEARCH CENTER',
    short: 'フォトニクス研', tag: '研究センター', cat: 'research',
    pin: { left: 14, top: 76 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '光技術（フォトニクス）の研究センター。',
  },
  {
    id: 'bousai', no: 29, entry: 'R1', name: '防災システムリサーチセンター', en: 'RESEARCH CENTER FOR DISASTER MITIGATION SYSTEM',
    short: '防災リサーチ', tag: '研究センター', cat: 'research',
    pin: { left: 30, top: 78 }, size: { w: 7, d: 5, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'BKCリサーチオフィス、理工学部の研究実験室。',
  },
  {
    id: 'rexl', no: 35, entry: 'SW5', name: 'レクセル', en: 'REXL',
    tag: 'RI実験室', cat: 'research',
    pin: { left: 15, top: 68 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'RI（放射性同位元素）実験室。',
  },
  {
    id: 'workshop', no: 36, entry: 'WS', name: 'ワークショップラボ', en: 'WORKSHOP LAB',
    tag: '機械工作実習室', cat: 'research',
    pin: { left: 30, top: 45 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '機械工作実習室。ものづくり実習はここ。',
  },
  {
    id: 'incubator', no: 32, entry: 'R3', name: '立命館大学BKCインキュベータ', en: 'RITSUMEIKAN BKC INCUBATOR',
    short: 'インキュベータ', tag: '起業家育成施設', cat: 'research',
    pin: { left: 38, top: 84 }, size: { w: 8, d: 6, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '（独）中小機構による大学連携起業家育成施設（開発・実験・研究施設）、BKCリサーチオフィス。',
  },
  {
    id: 'tricea', no: 39, entry: 'NE3', name: 'トリシア', en: 'TRICEA',
    tag: '研究実験室', cat: 'research',
    pin: { left: 68, top: 30 }, size: { w: 7, d: 6, h: 8 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工学部の研究実験室、教員・院生研究室。',
  },
  {
    id: 'biolink', no: 40, entry: 'NE3', name: 'バイオリンク', en: 'BIO LINK',
    tag: '研究実験室・サークルルーム', cat: 'research',
    pin: { left: 66, top: 20 }, size: { w: 8, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '生命科学部、薬学部の研究実験室、教員・院生研究室、サークルルームなど。',
  },
  {
    id: 'biofrontier', no: 44, entry: 'N7', name: 'バイオフロンティア', en: 'BIO FRONTIER',
    tag: '実験室', cat: 'research',
    pin: { left: 61, top: 12 }, size: { w: 8, d: 6, h: 7 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '理工系学部の実験室など。',
  },
  {
    id: 'crossverse', no: 42, entry: 'XV', name: '立命館先端クロスバースイノベーションコモンズ', en: 'ADVANCED CROSS-VERSE INNOVATION COMMONS',
    short: 'クロスバース', tag: 'J-PEAKS研究施設', cat: 'research',
    pin: { left: 77, top: 26 }, size: { w: 8, d: 6, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'J-PEAKS身体圏研究施設（クロスバースアリーナ等）。',
  },
  {
    id: 'grassroots', no: 43, entry: 'GR', name: 'グラスルーツイノベーションセンター', en: 'GRASSROOTS INNOVATION CENTER',
    short: 'グラスルーツ', tag: 'コワーキング・Fab', cat: 'research',
    pin: { left: 70, top: 40 }, size: { w: 7, d: 6, h: 5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'コワーキングスペース、GIC Fab、Startup Lounge、Communal Lab、個別ラボ。起業やプロトタイピングに挑戦するならここ。',
  },
  {
    id: 'integration', no: 37, entry: 'E1', name: 'インテグレーションコア・ラルカディア', en: 'INTEGRATION CORE / RARCADIA',
    short: 'ラルカディア', tag: 'スポ健 研究・教室', cat: 'research',
    pin: { left: 72, top: 48 }, size: { w: 11, d: 8, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'スポーツ健康科学部の研究実験室、教員研究室、教室など。',
  },

  // ---------- スポーツ ----------
  {
    id: 'gym', no: 26, entry: 'W2', name: 'BKCジム', en: 'BKC GYMNASIUM',
    tag: 'アリーナ・トレーニングルーム', cat: 'sports',
    pin: { left: 14, top: 57 }, size: { w: 12, d: 9, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '第1・第2アリーナ、トレーニングルーム、ミーティングルームなど。体育会の活動拠点。',
  },
  {
    id: 'sports-commons', no: 41, entry: 'SPC', name: 'BKCスポーツ健康コモンズ', en: 'BKC SPORTS AND HEALTH COMMONS',
    short: 'スポーツコモンズ', tag: 'プール・アリーナ・知るカフェ', cat: 'sports',
    pin: { left: 80, top: 13 }, size: { w: 13, d: 9, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'アリーナ、屋内プール、屋外プール、トレーニングルーム、アクティブスペース、リラックスコモンズ、知るカフェなど。一般学生も使える運動施設。',
  },
  {
    id: 'quince', entry: 'ST', name: 'Daigasエナジースタジアム', en: 'QUINCE STADIUM',
    short: 'スタジアム', tag: '陸上競技場', cat: 'sports',
    pin: { left: 75, top: 83 }, size: { w: 22, d: 14, h: 2.5 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'クインススタジアム。陸上トラックとフィールドを備えるBKCのメインスタジアム。木瓜原遺跡製鉄炉跡が保存されています。',
  },
  {
    id: 'athlete-gym', no: 6, entry: 'SE2', name: 'アスリートジム', en: 'ATHLETE GYM',
    tag: 'スポーツ強化オフィス', cat: 'sports',
    pin: { left: 66, top: 73 }, size: { w: 7, d: 5, h: 4 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'スポーツ強化オフィス、トレーニングルームなど。',
  },
  {
    id: 'ground1', entry: 'G1', name: '第一グラウンド', en: 'GROUND 1',
    tag: 'グラウンド', cat: 'sports',
    pin: { left: 87, top: 11 }, size: { w: 13, d: 8, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '北東エリアのグラウンド。野球・ソフトボールなどで利用。',
  },
  {
    id: 'ground3', entry: 'EG1', name: '第三グラウンド', en: 'GROUND 3',
    tag: 'グラウンド', cat: 'sports',
    pin: { left: 8, top: 80 }, size: { w: 9, d: 6, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '南西エリアのグラウンド。',
  },
  {
    id: 'tennis', entry: 'TN', name: 'テニスコート', en: 'TENNIS COURTS',
    tag: 'テニスコート', cat: 'sports',
    pin: { left: 66, top: 6 }, size: { w: 10, d: 5, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '北エリアのテニスコート。',
  },
  {
    id: 'green-field', entry: 'GFD', name: 'BKCグリーンフィールド', en: 'BKC GREEN FIELD',
    short: 'グリーンフィールド', tag: '人工芝フィールド', cat: 'sports',
    pin: { left: 91, top: 77 }, size: { w: 9, d: 6, h: 0.6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '人工芝フィールドとアスリートクラブハウス。ラグビー・アメフトなどの拠点。',
  },

  // ---------- 課外・サークル ----------
  {
    id: 'act-alpha', no: 1, entry: 'SW3', name: 'アクトα', en: 'ACT α',
    tag: 'サークルラボ', cat: 'circle',
    pin: { left: 32, top: 68 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'サークルラボなど。課外活動の拠点。',
  },
  {
    id: 'act-mu', no: 2, entry: 'ACT', name: 'アクトμ', en: 'ACT μ',
    tag: '音楽練習場', cat: 'circle',
    pin: { left: 28, top: 63 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '音楽練習場など。軽音・吹奏楽などの練習はここ。',
  },
  {
    id: 'act-beta', no: 3, entry: 'SW4', name: 'アクトβ', en: 'ACT β',
    tag: 'サークルルーム', cat: 'circle',
    pin: { left: 24, top: 68 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'サークルルームなど。',
  },
  {
    id: 'act-sigma', no: 4, entry: 'SW4', name: 'アクトσ', en: 'ACT σ',
    tag: 'サークルルーム', cat: 'circle',
    pin: { left: 20, top: 64 }, size: { w: 5, d: 4, h: 3 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: 'サークルルームなど。',
  },

  // ---------- 生活・施設 ----------
  {
    id: 'rohm', no: 33, entry: 'GM', name: '立命館大学ローム記念館', en: 'RITSUMEIKAN UNIVERSITY ROHM PLAZA',
    short: 'ローム記念館', tag: '大会議室・研究室', cat: 'life',
    pin: { left: 44, top: 88 }, size: { w: 8, d: 6, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '大会議室、教員研究室など。正門近くのガラス張りの建物。',
  },
  {
    id: 'intl-house', no: 38, entry: 'IH', name: 'BKCインターナショナルハウス', en: 'BKC INTERNATIONAL HOUSE',
    short: 'Iハウス', tag: '国際教育寮', cat: 'life',
    pin: { left: 86, top: 40 }, size: { w: 9, d: 7, h: 6 },
    url: 'https://www.ritsumei.ac.jp/',
    desc: '国際教育寮。留学生と日本人学生が共に生活する寮。',
  },
];

// 屋外キャンパスは単一マップ（全建物とも floor = 'campus'）
SHOPS.forEach(s => { s.floor = 'campus'; });

// ---- 施設・エントランス（経路の出発地点にもなる）----
export const PLACES = [
  { id: 'gate-main', floor: 'campus', entry: 'GM', name: '正門', kind: 'entrance', pin: { left: 52, top: 95 } },
  { id: 'gate-east', floor: 'campus', entry: 'EG', name: '東門', kind: 'entrance', pin: { left: 9, top: 87 } },
  { id: 'bus',       floor: 'campus', entry: 'BT', name: 'バスターミナル', kind: 'entrance', pin: { left: 55, top: 75 } },
  { id: 'plaza',     floor: 'campus', entry: 'CS', name: 'セントラルサーカス', kind: 'plaza', pin: { left: 52, top: 68 } },
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

try {
  const fl = FLOORS.campus;
  if (SURVEY?.nodes && Object.keys(SURVEY.nodes).length) {
    if (SURVEY.replaceGraph) {
      fl.navNodes = {};
      fl.navEdges = [];
    }
    // 測量ノードを percent 座標へ変換してグラフに追加
    for (const [id, p] of Object.entries(SURVEY.nodes)) {
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
      if (s.pin) shop.pin = latLngToPercent(s.pin.lat, s.pin.lng);
    }
    for (const [id, s] of Object.entries(SURVEY.places ?? {})) {
      const pl = PLACES.find(x => x.id === id);
      if (!pl) continue;
      if (s.entry && fl.navNodes[s.entry]) pl.entry = s.entry;
      if (s.pin) pl.pin = latLngToPercent(s.pin.lat, s.pin.lng);
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
