// ============================================================
// GRAND FRONT OSAKA 北館 B1F/1F/2F — マップデータ
// 出典: https://www.gfo-sc.jp/information/floor/north/
// 座標系: フロアマップ画像(1230x930)上の percent (left, top)
//   店舗ピンは公式サイト埋め込みデータの座標をそのまま使用
// ============================================================

export const MAP_W = 123;   // ワールド幅 (x)
export const MAP_D = 70;    // 公式図のフロア部分（元画像の上700px）
const FLOOR_CROP_TOP_PERCENT = 700 / 930 * 100;

// percent座標 → ワールド座標
export function toWorld(left, top) {
  return {
    x: (left - 50) / 100 * MAP_W,
    z: (top / FLOOR_CROP_TOP_PERCENT - 0.5) * MAP_D,
  };
}

// ---- GPSジオリファレンス（実座標 ⇔ フロアマップ座標）----
// lat0/lng0 = マップ中心 (world 0,0) の実座標。rotationDeg = フロアマップ上方向の方位
// （真北から時計回り）。値は地図からの推定のため、現地でズレがあればここを調整する。
export const GEO = {
  lat0: 34.7058,
  lng0: 135.4954,
  rotationDeg: 0,
  meterPerUnit: 1.6,
};

export function gpsToWorld(lat, lng) {
  const rad = Math.PI / 180;
  const dN = (lat - GEO.lat0) * 111320;                          // 北方向 (m)
  const dE = (lng - GEO.lng0) * 111320 * Math.cos(GEO.lat0 * rad); // 東方向 (m)
  const th = GEO.rotationDeg * rad;
  return {
    x: (dE * Math.cos(th) - dN * Math.sin(th)) / GEO.meterPerUnit,
    z: -(dN * Math.cos(th) + dE * Math.sin(th)) / GEO.meterPerUnit,
  };
}

export const CATEGORIES = {
  fashion:  { label: 'ファッション',        color: 0xc5ca00, css: '#c5ca00' },
  interior: { label: 'インテリア・雑貨',    color: 0x00979d, css: '#00979d' },
  cafe:     { label: 'レストラン・カフェ',  color: 0xffc93c, css: '#e8a800' },
  kc:       { label: 'ナレッジキャピタル',  color: 0xe62b67, css: '#e62b67' },
  service:  { label: 'サービス・ビューティ', color: 0x57858f, css: '#6da3b0' },
};

// ============================================================
// フロア定義（縦に積層して表示。y はワールド高さ）
// ============================================================
export const FLOOR_ORDER = ['b1f', '1f', '2f'];

export const FLOORS = {
  b1f: {
    id: 'b1f', label: '北館 B1F', short: 'B1', y: -16,
    map: 'assets/northb1f-floor-1024.jpg',
    // 通路ナビゲーショングラフ（B1F: 西ブロック回廊＋中央広場＋北3方面）
    navNodes: {
      A1: { left: 13, top: 20 }, A2: { left: 21, top: 20 }, A3: { left: 28, top: 20 }, A4: { left: 35, top: 20 },
      B0: { left: 11, top: 28 },
      B1: { left: 13, top: 31 }, B2: { left: 20, top: 31 }, B3: { left: 27, top: 31 }, B4: { left: 32, top: 31 }, B5: { left: 37, top: 29 },
      C1: { left: 20, top: 37 }, C2: { left: 27, top: 43 }, C3: { left: 25, top: 50 },
      D1: { left: 44, top: 33 }, D2: { left: 42, top: 43 }, D3: { left: 51, top: 47 },
      E1: { left: 45, top: 25 }, E2: { left: 52, top: 20 }, E3: { left: 60, top: 14 },
      T1: { left: 34, top: 13 }, T4: { left: 6, top: 34 },
    },
    navEdges: [
      ['A1','A2'], ['A2','A3'], ['A3','A4'], ['A4','T1'],
      ['A1','B1'], ['A2','B2'], ['A3','B3'], ['A4','B5'],
      ['B0','B1'], ['T4','B0'],
      ['B1','B2'], ['B2','B3'], ['B3','B4'], ['B4','B5'],
      ['B2','C1'], ['C1','C2'], ['C2','C3'],
      ['B5','D1'], ['D1','D2'], ['D2','D3'], ['C2','D2'],
      ['D1','E1'], ['E1','E2'], ['E2','E3'],
    ],
  },
  '1f': {
    id: '1f', label: '北館 1F', short: '1F', y: 0,
    map: 'assets/north1f-floor-1024.jpg',
    // 「創造のみち」＋ナレッジプラザ＋南北連絡通路をモデル化
    navNodes: {
      W0: { left: 8,  top: 34 },   // 北4前
      W1: { left: 12, top: 34 },
      W2: { left: 19, top: 34.5 },
      W3: { left: 26, top: 36 },
      W4: { left: 33, top: 35 },
      W5: { left: 40, top: 34 },
      N0: { left: 9,  top: 24 },   // 南館連絡口付近
      N1: { left: 16, top: 26 },
      N2: { left: 23, top: 26 },
      N3: { left: 30, top: 29 },
      N4: { left: 34, top: 22 },   // 北1下
      T1: { left: 34, top: 13 },   // 北1
      P1: { left: 46, top: 34 },   // プラザ西
      P2: { left: 52, top: 29 },   // プラザ北
      P3: { left: 52, top: 40 },   // プラザ中央
      P4: { left: 58, top: 31 },   // The Lab.前
      P5: { left: 50, top: 46 },   // プラザ南
      U1: { left: 65, top: 20 },   // 北3下
      T3: { left: 65, top: 12 },   // 北3
      E1: { left: 64, top: 33 },   // 東 創造のみち
      E2: { left: 70, top: 33 },
      E3: { left: 76, top: 32 },
      E4: { left: 82, top: 31 },
      E5: { left: 87, top: 29 },   // SOHOLM前
      S1: { left: 46, top: 53 },   // 南通路
      S2: { left: 40, top: 59 },   // 北2前
      SW1: { left: 20, top: 43 },  // 南西通路
      SW2: { left: 20, top: 50 },
      SW3: { left: 22, top: 55 },
    },
    navEdges: [
      ['W0','W1'], ['W1','W2'], ['W2','W3'], ['W3','W4'], ['W4','W5'], ['W5','P1'],
      ['N0','N1'], ['N1','N2'], ['N2','N3'], ['N3','N4'], ['N4','T1'],
      ['N1','W2'], ['N2','W3'], ['N3','W4'], ['N4','W5'],
      ['P1','P2'], ['P1','P3'], ['P2','P4'], ['P3','P4'], ['P3','P5'], ['P2','P3'],
      ['P4','U1'], ['U1','T3'], ['P4','E1'],
      ['E1','E2'], ['E2','E3'], ['E3','E4'], ['E4','E5'],
      ['P5','S1'], ['S1','S2'],
      ['W2','SW1'], ['SW1','SW2'], ['SW2','SW3'],
      ['P5','P1'],
    ],
  },
  '2f': {
    id: '2f', label: '北館 2F', short: '2F', y: 16,
    map: 'assets/north2f-floor-1024.jpg',
    // 創造のみち(2F)＋吹き抜け回廊＋北接続ブリッジ方面
    navNodes: {
      SK: { left: 3,  top: 40 },   // 南館連絡デッキ
      K1: { left: 8,  top: 40 }, K2: { left: 16, top: 40 }, K3: { left: 21, top: 40 },
      K4: { left: 27, top: 40 }, K5: { left: 33, top: 40 }, K6: { left: 39, top: 40 }, K7: { left: 44, top: 41 },
      L1: { left: 50, top: 41 }, L2: { left: 57, top: 42 }, L3: { left: 64, top: 41 },
      L4: { left: 67, top: 37 }, L5: { left: 71, top: 31 }, L6: { left: 76, top: 28 },
      L7: { left: 84, top: 28 }, L8: { left: 90, top: 28 },
      Z2: { left: 42, top: 34 }, Z1: { left: 42, top: 27 }, Z0: { left: 41, top: 21 },
      T1: { left: 38, top: 19 },   // 北1
      P1: { left: 51, top: 33 }, P2: { left: 52, top: 26 }, A1: { left: 60, top: 25 },
      Q1: { left: 64, top: 36 }, Q2: { left: 63, top: 30 },
      S0: { left: 16, top: 43 },
      B2: { left: 44, top: 47 },   // 北2
      N4: { left: 12, top: 34 },   // 北4
      T3: { left: 71, top: 18 },   // 北3
    },
    navEdges: [
      ['SK','K1'], ['K1','K2'], ['K2','K3'], ['K3','K4'], ['K4','K5'], ['K5','K6'], ['K6','K7'],
      ['K7','L1'], ['L1','L2'], ['L2','L3'], ['L3','L4'], ['L4','L5'], ['L5','L6'], ['L6','L7'], ['L7','L8'],
      ['K6','Z2'], ['Z2','Z1'], ['Z1','Z0'], ['Z0','T1'],
      ['L1','P1'], ['P1','P2'], ['P2','A1'], ['A1','Q2'],
      ['L3','Q1'], ['Q1','Q2'],
      ['K2','N4'], ['K2','S0'], ['K7','B2'], ['L5','T3'],
    ],
  },
};

// フロア間の縦動線（エレベーター・エスカレーター）。A*グラフをここで接続する
export const FLOOR_LINKS = [
  { name: '北1エレベーター', nodes: { b1f: 'T1', '1f': 'T1', '2f': 'T1' } },
  { name: '北2エレベーター', nodes: { b1f: 'D2', '1f': 'S2', '2f': 'B2' } },
  { name: '北3エレベーター', nodes: { b1f: 'E3', '1f': 'T3', '2f': 'T3' } },
  { name: '北4エレベーター', nodes: { b1f: 'T4', '1f': 'W0', '2f': 'N4' } },
  { name: 'エスカレーター（西）', nodes: { b1f: 'B1', '1f': 'W2' } },
  { name: 'エスカレーター（創造のみち）', nodes: { '1f': 'P4', '2f': 'P2' } },
];

// ============================================================
// ショップ（全フロア横断。floor / entry(最寄り通路ノード) 付き）
// ============================================================
export const SHOPS = [
  // ---------------- 1F ----------------
  {
    id: 'noom', floor: '1f', entry: 'W1', name: 'イタリアン&カフェバー NOOM', en: 'Italian and Cafebar NOOM',
    tag: 'イタリアン・フレンチ・洋食', cat: 'cafe',
    pin: { left: 13.6, top: 30.2 }, size: { w: 7, d: 7, h: 5 },
    url: 'https://www.gfo-sc.jp/shop-detail/noom/',
    logo: 'https://www.gfo-sc.jp/files/20250731/0f05bc375c7accfcd76979dd8b39321f95cc55d3.jpg',
    desc: 'ミシュランシェフ監修のもと、素材の持ち味を活かした本格イタリアンを、日常の中で気軽に楽しめるNOOM。ランチやディナーはもちろん、自家製スイーツや厳選ワインを楽しむカフェバー利用もおすすめ。ランチからバータイムまで、多彩なシーンに寄り添う都会のレストランです。',
  },
  {
    id: 'pelle-morbida', floor: '1f', entry: 'W2', name: 'PELLE MORBIDA', en: 'PELLE MORBIDA',
    tag: 'バッグ・革小物', cat: 'fashion',
    pin: { left: 20.1, top: 29.6 }, size: { w: 5, d: 5, h: 4.2 },
    url: 'https://www.gfo-sc.jp/shop-detail/PELLEMORBIDA/',
    logo: 'https://www.gfo-sc.jp/files/20220831/9c83f64eea9dcbfc744ec1d62e02b09649cbd504.jpg',
    desc: '"旅の理想形"として知られる船旅を楽しむ大人たちに向けて誕生したバッグブランド。その名は「柔らかな肌（革）」を意味するイタリア語から。優雅な船旅に持って行きたくなるような、上品で良質なアイテムを製作しています。流行は追わず、現代感覚をバランスよく取り入れたグローバルスタンダードを目指し、耐久性や機能性も兼備。',
  },
  {
    id: 'starbucks', floor: '1f', entry: 'N1', name: 'STARBUCKS', en: 'STARBUCKS TEAVANA',
    tag: 'カフェ', cat: 'cafe',
    pin: { left: 18.6, top: 21.0 }, size: { w: 8, d: 5, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/STARBUCKS_kitakanten/',
    logo: 'https://www.gfo-sc.jp/files/20220720/e50a5bc33c426dea35ad1a465d99235104e50c77.png',
    desc: '彩りあふれる、心あたたまるティーのひとときを。鮮やかで香り豊かなティービバレッジに特化したスターバックス。上質な茶葉とボタニカルな素材を選び抜いたティーブランド TEAVANA™ の多彩なティービバレッジをご用意。洗練された空間の中で、香り豊かなティー体験をお届けします。',
  },
  {
    id: 'global-style', floor: '1f', entry: 'N3', name: 'GINZA Global Style', en: 'GINZA Global Style',
    tag: 'オーダースーツ', cat: 'fashion',
    pin: { left: 28.2, top: 24.2 }, size: { w: 7, d: 9, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/GINZAGlobalStyle/',
    logo: 'https://www.gfo-sc.jp/files/20220221/3d8f6cf30a0986d44f65c6454a5d1c3b8c8b0be6.jpg',
    desc: '「ENJOY ORDER！」をコンセプトに、"あなただけ"のスーツを提案する本格オーダースーツ専門店。1着2万円台から、業界最多の約5,000種類の生地と豊富なスーツモデルをご用意。シャツやシューズのオーダーも可能。レディースコーナーとプライベートフィッティングルームも設置。',
  },
  {
    id: 'the-lab', floor: '1f', entry: 'P4', name: 'The Lab.（CAFE Lab.）', en: 'Communication Cafe',
    tag: 'コミュニケーションカフェ', cat: 'kc',
    pin: { left: 57.4, top: 25.1 }, size: { w: 13, d: 9, h: 6 },
    url: 'https://kc-i.jp/facilities/the-lab/cafe-lab/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: 'ナレッジキャピタルの交流拠点「The Lab.」内のコミュニケーションカフェ。本を片手にコーヒーを楽しんだり、最先端の技術・研究の展示に触れながら、人と人との出会い・交流が生まれる場所。誰でも気軽に立ち寄れる知的好奇心を刺激する空間です。',
  },
  {
    id: 'ring-jacket', floor: '1f', entry: 'W2', name: 'RING JACKET', en: 'RING JACKET',
    tag: 'メンズ', cat: 'fashion',
    pin: { left: 19.4, top: 39.4 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/ring-jacket/',
    logo: 'https://www.gfo-sc.jp/files/20180827/fe762361460312b69ff7d1bbdb27b6a6417883f4.png',
    desc: '1954年創業、日本を代表するドレスクロージングブランド。世界的にも注目されるクオリティーと希少性あふれるコレクションはまさに「グローバルスタンダード」。自社一貫生産のドレスクロージングに加え、トレンドを捉えたインポートアイテムや、特別な空間でご案内する「オーダーサービス」も真骨頂。',
  },
  {
    id: 'g-shock', floor: '1f', entry: 'W4', name: 'G-SHOCK STORE', en: 'G-SHOCK STORE OSAKA',
    tag: '腕時計', cat: 'fashion',
    pin: { left: 29.5, top: 39.6 }, size: { w: 5.5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/g-shock-store/',
    logo: 'https://www.gfo-sc.jp/files/20180827/ee4c517b3ba2c7e2297d7a16e239266e1d71fcc7.png',
    desc: '直営店最大の売場面積を誇るG-SHOCK STORE OSAKA！広々とした店内には最新・人気モデルを常時300モデル以上ラインアップ。専門技師が常駐するメンテナンスブースも併設し、アフターサービスも万全。修理のご相談もお気軽にどうぞ！',
  },
  {
    id: 'tsuchiya-kaban', floor: '1f', entry: 'W3', name: 'TSUCHIYA KABAN', en: 'Tsuchiya Kaban',
    tag: 'バッグ・革小物', cat: 'fashion',
    pin: { left: 23.7, top: 39.8 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/tsuchiya-kaban/',
    logo: 'https://www.gfo-sc.jp/files/20230617/b41ae7609d9a6cbeb828d3e6929b949482a3e3dd.jpeg',
    desc: '1965年の創業以来、日本の職人による、つくり手の見えるものづくりを心掛ける「土屋鞄製造所」。10年以上愛される定番から季節の限定品まで、良質な革素材を生かした鞄アイテムをご用意。店内へ一歩足を踏み入れると、本革ならではの豊かな香りに包まれます。',
  },
  {
    id: 'yondoshi', floor: '1f', entry: 'W4', name: '4℃ SHOWCASE', en: '4℃ SHOWCASE',
    tag: 'ジュエリー', cat: 'fashion',
    pin: { left: 36.5, top: 37.8 }, size: { w: 4.5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/4-bridal/',
    logo: 'https://www.gfo-sc.jp/files/20250705/b067b29f809c9b47435bcdfc240f9f83ba6bbab0.jpg',
    desc: '★2025年7月リニューアルオープン★ ショーケース越しに眺めるだけでなく、まるでご自身の部屋でくつろぐようにゆったりとした気持ちでジュエリーをご試着いただける空間。心惹かれる"運命のジュエリー"との出会いを、より深くパーソナルな体験としてお楽しみいただけます。',
  },
  {
    id: 'zara-home', floor: '1f', entry: 'SW2', name: 'ZARA HOME', en: 'ZARA HOME',
    tag: 'インテリア・生活雑貨', cat: 'interior',
    pin: { left: 16.7, top: 50.9 }, size: { w: 10, d: 8, h: 5 },
    url: 'https://www.gfo-sc.jp/shop-detail/zara-home/',
    logo: 'https://www.gfo-sc.jp/files/20230724/8f9f98e7ab300042bbd31012b062d4d4d8171f03.jpg',
    desc: 'スペイン発のインテリアファッションブランド。ベッドリネン、テーブルウェア、キッチンアイテム、ルームウェア、ディフューザー、キッズ&ベビーまでバリエーション豊かなインテリア雑貨を展開。週2回新作を投入しながらインテリアの最新トレンドをお届けします。',
  },
  {
    id: 'il-ghiottone', floor: '1f', entry: 'SW3', name: "IL GHIOTTONE di piu'", en: "IL GHIOTTONE di piu'",
    tag: 'イタリア料理', cat: 'cafe',
    pin: { left: 22.7, top: 58.9 }, size: { w: 7, d: 5.5, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/il-ghiottone/',
    logo: 'https://www.gfo-sc.jp/files/20180827/2756ae4c771f2070ec251d53194b6f1cde1771ba.png',
    desc: '全国各地の生産者から届く新鮮な素材を、京料理のエッセンスを取り入れた新しい切り口で楽しむ『イノベーティブ・イタリアン』。春夏秋冬、四季折々の日本の素晴らしさを感じられるお料理をお楽しみください。',
  },
  {
    id: 'tullys', floor: '1f', entry: 'P5', name: "TULLY'S COFFEE", en: "TULLY'S COFFEE",
    tag: 'コーヒー', cat: 'cafe',
    pin: { left: 53.4, top: 50.5 }, size: { w: 7, d: 5.5, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/tullys/',
    logo: 'https://www.gfo-sc.jp/files/20180827/067b16b256779af8ecac49e21ceb3899bafe9ff8.png',
    desc: 'シンボル空間ナレッジプラザの一角に位置するスペシャリティーコーヒーショップ。一杯一杯手作りの本格コーヒーとエスプレッソドリンク。店内はNYの図書館がコンセプトで、たくさんの本とコーヒーの香りに包まれた空間。テラス席では巨大な吹き抜けを見上げながら開放感あふれる時間を。',
  },
  {
    id: 'soholm', floor: '1f', entry: 'E5', name: 'SOHOLM CAFE+DINING', en: 'SOHOLM CAFE+DINING',
    tag: 'カフェ', cat: 'cafe',
    pin: { left: 83.8, top: 26.2 }, size: { w: 8, d: 6, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/soholm/',
    logo: 'https://www.gfo-sc.jp/files/20180827/75192de7f83dc9f53ec56320a77e8631b304d2c1.png',
    desc: 'スーホルムとはデンマーク語で「湖のほとりの小さな町」。太陽のふりそそぐ開放的な空間で、ゆっくりと流れる時間を。テラス席は木々の緑や水の流れを感じる季節ごとの風景が人気。名物ミートボールやミール系パンケーキ、丁寧に焼き上げたワッフルもおすすめ。ディナーは集まりからウェディングまで。',
  },
  {
    id: 'actus', floor: '1f', entry: 'E3', name: 'ACTUS', en: 'ACTUS',
    tag: 'インテリア・生活雑貨', cat: 'interior',
    pin: { left: 74.3, top: 28.8 }, size: { w: 11, d: 7, h: 5 },
    url: 'https://www.gfo-sc.jp/shop-detail/actus/',
    logo: 'https://www.gfo-sc.jp/files/20180827/5cc8a9037da8196220d575df671db8fbaa202c33.png',
    desc: '本格カフェダイニングを併設し、オリジナル家具、食卓を楽しくするグロッサリー、体験型ボディケアからアパレルまで。衣食住を網羅する関西初のライフスタイル発信型セレクトショップ。北欧・ナチュラル・モダンと様々なスタイルで編集した店内を回遊しながら、暮らしのヒントを見つけて。',
  },

  // ---------------- B1F ----------------
  {
    id: 'lables-one', floor: 'b1f', entry: 'B5', name: 'LaBless ONE / LaLaBless', en: 'LaBless ONE / LaLa Bless',
    tag: 'ヘアサロン・アイサロン', cat: 'service',
    pin: { left: 35.7, top: 31.3 }, size: { w: 5, d: 4, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/LaBlessONE/',
    logo: 'https://www.gfo-sc.jp/files/20260401/71f1addefd2fae953b591e43a6dd3a3dfb5ae2ab.png',
    desc: 'ヘア＆アイの最高峰！大人のための美の拠点、LaBless ONE ＆ LaLa Bless。南館で圧倒的支持を得るヘアサロンとアイサロンが北館B1Fに。',
  },
  {
    id: 'jackson-garden', floor: 'b1f', entry: 'C1', name: 'THE JACKSON GARDEN BRIDAL SALON', en: 'THE JACKSON GARDEN',
    tag: 'ブライダルサロン', cat: 'service',
    pin: { left: 19.3, top: 36.5 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/THE_JACKSON_GARDEN/',
    logo: 'https://www.gfo-sc.jp/files/20231121/17896b07364219562f6181d7d064b2cc96317eb2.jpg',
    desc: 'グラングリーン大阪のパーティーレストラン「THE JACKSON GARDEN」専門のブライダルサロン。ウェディングの相談はこちらで。',
  },
  {
    id: 'icure', floor: 'b1f', entry: 'B3', name: 'iCure鍼灸接骨院', en: 'iCure Acupuncture Clinic',
    tag: '鍼灸接骨院', cat: 'service',
    pin: { left: 24.0, top: 25.3 }, size: { w: 4.5, d: 4, h: 3.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/icure/',
    logo: 'https://www.gfo-sc.jp/files/20190606/260a70961789e801bd30039d8b0317b9f9835130.png',
    desc: '「柔道整復師」「鍼灸師」の国家資格を持った施術者が責任をもって施術。肩こり・腰痛などの不調を根本から改善へ導きます。',
  },
  {
    id: 'event-lab', floor: 'b1f', entry: 'E1', name: 'The Lab.（EVENT Lab.）', en: 'Event Space',
    tag: 'イベントスペース', cat: 'kc',
    pin: { left: 55.2, top: 22.0 }, size: { w: 18, d: 10, h: 6 },
    url: 'https://kc-space.jp/eventlab/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: 'ナレッジキャピタルの大型イベントスペース。展示会・体験イベント・ワークショップなど、日々多彩な催しが開かれています。',
  },
  {
    id: 'eyecity', floor: 'b1f', entry: 'B0', name: 'eyecity', en: 'eyecity',
    tag: 'コンタクトレンズ', cat: 'service',
    pin: { left: 11.4, top: 27.9 }, size: { w: 5, d: 4.5, h: 3.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/eyecity/',
    logo: 'https://www.gfo-sc.jp/files/20180925/064cb7b5af8cc76c6413b6c6bbc371c28e2fdc36.png',
    desc: 'お手頃価格のコンタクトレンズから高機能な遠近両用・乱視用、カラーコンタクトまで幅広く取り扱い。お気軽にご相談ください。',
  },
  {
    id: 'world-beer', floor: 'b1f', entry: 'C2', name: '世界のビール博物館', en: 'World Beer Museum',
    tag: 'ビアレストラン', cat: 'cafe',
    pin: { left: 28.0, top: 42.9 }, size: { w: 7, d: 6, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/world-beer/',
    logo: 'https://www.gfo-sc.jp/files/20180925/8d1f045b44b314b55758961606b50882415557a4.png',
    desc: '80種類以上のビールの品揃え！ドイツ、ベルギー、イギリス、アメリカ、チェコ、アジアなど世界のビールを樽生と料理と共に楽しめるビアレストラン。',
  },
  {
    id: 'world-wine', floor: 'b1f', entry: 'C3', name: '世界のワイン博物館', en: 'World Wine Museum',
    tag: 'イタリアン・フレンチ', cat: 'cafe',
    pin: { left: 24.6, top: 49.9 }, size: { w: 7, d: 6, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/world-wine/',
    logo: 'https://www.gfo-sc.jp/files/20180827/6afc5836b0003e4f08df77242b97e3362fee2994.png',
    desc: '2000本収納可能な特注ワインセラーを備え、いつでも世界各国のワインを楽しめるレストラン。こだわりのグラスワインと料理のマリアージュを。',
  },
  {
    id: 'cocokara', floor: 'b1f', entry: 'A2', name: 'ココカラファイン', en: 'Cocokara Fine',
    tag: 'ドラッグストア・調剤薬局', cat: 'service',
    pin: { left: 17.4, top: 19.5 }, size: { w: 7, d: 5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/cocokarafine/',
    logo: 'https://www.gfo-sc.jp/files/20180827/7f96e25ed68f7e9f23e70b5fd4d93e7f414aa968.png',
    desc: '「美しさと健やかさを、もっと楽しく、身近に」。医薬品や健康食品、化粧品などヘルス＆ビューティ関連商品を中心に取り扱うドラッグストア。',
  },
  {
    id: 'mitsui-atm', floor: 'b1f', entry: 'B5', name: '三井住友銀行 ATM', en: 'SMBC ATM',
    tag: 'ATM', cat: 'service',
    pin: { left: 35.7, top: 27.3 }, size: { w: 4, d: 3.5, h: 3 },
    url: 'https://www.gfo-sc.jp/shop-detail/mitsui-north/',
    logo: 'https://www.gfo-sc.jp/files/20180827/ed474a7cd4aa7eb1685767111049a94b91768ca5.png',
    desc: '生体認証・IC対応ATM設置拠点。',
  },
  {
    id: 'umekita-ganka', floor: 'b1f', entry: 'B2', name: '梅北眼科', en: 'Umekita Eye Clinic',
    tag: '眼科', cat: 'service',
    pin: { left: 19.4, top: 29.5 }, size: { w: 4.5, d: 4, h: 3.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/umekitaganka/',
    logo: 'https://www.gfo-sc.jp/files/20180925/be247a5b6254d7f59fd4013c87ae45009f5a95a3.png',
    desc: 'お子様からお年寄りまで、安全で適切な治療を基本に地域に開かれた医院を目指す眼科クリニック。眼科一般治療のほかコンタクト処方も。',
  },
  {
    id: 'orix-rentacar', floor: 'b1f', entry: 'A3', name: 'オリックスレンタカー', en: 'ORIX Rent-A-Car',
    tag: 'レンタカー', cat: 'service',
    pin: { left: 27.6, top: 24.7 }, size: { w: 4.5, d: 4, h: 3.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/orix/',
    logo: 'https://www.gfo-sc.jp/files/20180925/b7eb60ee0e1dc18943697e7ee2001c0a95ef9cf8.png',
    desc: 'コンパクトタイプから高級車まで幅広い車種を用意するレンタカーステーション。旅行やビジネスの拠点、グランフロントから直接出発できます。',
  },
  {
    id: 'hakuyosya', floor: 'b1f', entry: 'B4', name: '白洋舍クリーニング', en: 'Hakuyosha',
    tag: 'クリーニング', cat: 'service',
    pin: { left: 31.5, top: 30.5 }, size: { w: 4.5, d: 4, h: 3.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/hakuyosya/',
    logo: 'https://www.gfo-sc.jp/files/20180827/a82d7fc9c844353f49f09f919d104d2042345d24.png',
    desc: '1907年に日本で初めてドライクリーニングを導入した白洋舍。大切な衣類を確かな技術でケアします。',
  },
  {
    id: 'seven-eleven', floor: 'b1f', entry: 'A3', name: 'セブン-イレブン', en: 'Seven-Eleven',
    tag: 'コンビニエンスストア', cat: 'service',
    pin: { left: 25.8, top: 19.8 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/7eleven/',
    logo: 'https://www.gfo-sc.jp/files/20180827/8c57de944147070d924cae4b71072b6c7389bc65.png',
    desc: '従来のカラーとは全く違う、グランフロント仕様のスタイリッシュなセブン-イレブン。',
  },

  // ---------------- 2F ----------------
  {
    id: 'muji', floor: '2f', entry: 'K3', name: '無印良品', en: 'MUJI',
    tag: 'インテリア・生活雑貨・衣料', cat: 'interior',
    pin: { left: 21.5, top: 22.0 }, size: { w: 13, d: 9, h: 5.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/muji_2f/',
    logo: 'https://www.gfo-sc.jp/files/20180827/e3391f93ce5e946b3604c0671635bd74b0902e17.png',
    desc: '衣服から生活雑貨、食品まで「感じ良いくらし」を支える商品が揃う無印良品。シンプルで長く使えるものづくりが魅力です。',
  },
  {
    id: 'sense-of-place', floor: '2f', entry: 'S0', name: 'SENSE OF PLACE by URBAN RESEARCH', en: 'SENSE OF PLACE',
    tag: 'メンズ・レディス', cat: 'fashion',
    pin: { left: 17.8, top: 52.2 }, size: { w: 11, d: 7, h: 5 },
    url: 'https://www.gfo-sc.jp/shop-detail/sense-of-place/',
    logo: 'https://www.gfo-sc.jp/files/20180827/020c92c725b4569af40ef3cf2107a7527a12dd94.png',
    desc: '「THE WORLD STANDARD FASHION」。グローバルスタンダードなトレンドを、手に取りやすい価格で提案するアーバンリサーチのブランド。',
  },
  {
    id: 'zoff', floor: '2f', entry: 'Z1', name: 'Zoff', en: 'Zoff',
    tag: 'メガネ・サングラス', cat: 'fashion',
    pin: { left: 38.9, top: 26.7 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/zoff/',
    logo: 'https://www.gfo-sc.jp/files/20210309/d0e983c75990ae96caf8883aacc3f1a41332a9b5.png',
    desc: 'メガネを「マイナスをプラスに変える存在」へ。豊富なフレームと最短即日渡しで、ファッションとしてのアイウェアを提案するZoff。',
  },
  {
    id: 'seiko-boutique', floor: '2f', entry: 'K4', name: 'セイコーブティック', en: 'Seiko Boutique',
    tag: '腕時計', cat: 'fashion',
    pin: { left: 26.9, top: 37.6 }, size: { w: 5, d: 4, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/seiko_boutique/',
    logo: 'https://www.gfo-sc.jp/files/20190615/d9d18ab7f875eb2051f146eb05bd2293b0bf0ef3.jpg',
    desc: 'セイコーブランドのみを取り扱うブティック。革新と洗練を体現した店内で、スポーツからドレスまで多彩なウォッチを。',
  },
  {
    id: 'samsonite', floor: '2f', entry: 'K5', name: 'Samsonite BLACK LABEL', en: 'Samsonite BLACK LABEL',
    tag: 'バッグ', cat: 'fashion',
    pin: { left: 33.2, top: 37.2 }, size: { w: 5, d: 4, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/samsonite/',
    logo: 'https://www.gfo-sc.jp/files/20220609/122e1af6107ac6e8bff18cad06e48acbee9f1209.png',
    desc: 'グローバルバッグブランド「サムソナイト」の上位ライン。上質な日常や旅のスタイルを彩るプレミアムなコレクション。',
  },
  {
    id: 'iori', floor: '2f', entry: 'K5', name: '伊織', en: 'iori',
    tag: 'タオル・ベビー・雑貨', cat: 'interior',
    pin: { left: 34.8, top: 29.4 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/iori/',
    logo: 'https://www.gfo-sc.jp/files/20180827/dde189ea9df2cc6e12037c4b0bb3a0c40cc5d6c0.png',
    desc: '百十余年の歴史を受け継ぐ「今治タオル」の専門店。確かな品質のタオルやベビーアイテム、雑貨が揃います。',
  },
  {
    id: 'avirex', floor: '2f', entry: 'K6', name: 'AVIREX', en: 'AVIREX',
    tag: 'メンズ・レディス・キッズ', cat: 'fashion',
    pin: { left: 39.0, top: 35.5 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/avirex/',
    logo: 'https://www.gfo-sc.jp/files/20180827/e210dd19c7cb1b12605c35c170cfd072e2531b7e.png',
    desc: '米空軍の正式コンストラクターの実績を持つアヴィレックス。歴史が物語る機能性と加工技術を駆使したミリタリーカジュアル。',
  },
  {
    id: 'rayban', floor: '2f', entry: 'K6', name: 'Ray-Ban Store', en: 'Ray-Ban Store',
    tag: 'メガネ・サングラス', cat: 'fashion',
    pin: { left: 40.4, top: 46.3 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://ray-ban-japan-store.com/',
    logo: 'https://www.gfo-sc.jp/files/20211008/140a5381d5ad0a9850bb639862b128a57d022a02.png',
    desc: 'アイウェアの王道Ray-Banの直営ストア。定番のウェイファーラーやアビエイターから最新モデルまで揃います。',
  },
  {
    id: 'softbank', floor: '2f', entry: 'Z1', name: 'ソフトバンク／ワイモバイル', en: 'SoftBank / Y!mobile',
    tag: '携帯電話', cat: 'service',
    pin: { left: 45.3, top: 29.7 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://kc-i.jp/facilities/fls/softbank/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: 'ソフトバンク・ワイモバイルの取扱店。新規契約・機種変更・各種相談はこちらで。',
  },
  {
    id: 'au-style', floor: '2f', entry: 'L2', name: 'au Style OSAKA', en: 'au Style OSAKA',
    tag: '携帯電話', cat: 'service',
    pin: { left: 55.7, top: 52.0 }, size: { w: 6, d: 5, h: 4 },
    url: 'https://kc-i.jp/facilities/fls/kddi/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: 'auの旗艦店「au Style OSAKA」。最新スマートフォンの体験や各種手続きができます。',
  },
  {
    id: 'subway', floor: '2f', entry: 'Q1', name: 'サブウェイ野菜ラボ', en: 'SUBWAY',
    tag: 'サンドイッチ', cat: 'cafe',
    pin: { left: 65.5, top: 36.1 }, size: { w: 5, d: 4, h: 4 },
    url: 'https://kc-i.jp/facilities/fls/subway/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: '野菜にこだわるサブウェイの実験店舗「野菜ラボ」。店産店消をコンセプトに、新鮮なサンドイッチを提供します。',
  },
  {
    id: 'springx', floor: '2f', entry: 'Q1', name: 'SpringX', en: 'SpringX',
    tag: 'カフェ&バー・教室', cat: 'kc',
    pin: { left: 65.8, top: 41.1 }, size: { w: 6, d: 5, h: 4.5 },
    url: 'https://kc-i.jp/facilities/springx/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: '学びと交流が生まれるナレッジキャピタルの拠点。カフェ&バーと教室が一体になった、大人の学び場です。',
  },
  {
    id: 'active-lab', floor: '2f', entry: 'A1', name: 'The Lab.（ACTIVE Lab.）', en: 'Exhibition & Communication',
    tag: '展示・交流スペース', cat: 'kc',
    pin: { left: 60.3, top: 21.0 }, size: { w: 12, d: 7, h: 5 },
    url: 'https://kc-i.jp/facilities/the-lab/active-lab/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: '大学・企業の最先端技術やプロジェクトを体験できる展示・交流スペース。見て、触れて、対話しながら未来を感じられます。',
  },
  {
    id: 'suntory-whisky-house', floor: '2f', entry: 'L7', name: 'SUNTORY WHISKY HOUSE', en: 'SUNTORY WHISKY HOUSE',
    tag: 'バー・ダイニング・ギャラリー', cat: 'kc',
    pin: { left: 87.7, top: 23.3 }, size: { w: 14, d: 8, h: 5 },
    url: 'https://kc-i.jp/facilities/fls/suntory/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: 'ウイスキーの魅力を丸ごと体験できる複合空間。Whisky Bottle Bar・ダイニング「WWW.W」・樽ものがたり・ギャラリーが集結。',
  },
];

// ---- 施設・エントランス（経路の出発/到着地点にもなる）----
export const PLACES = [
  // 1F
  { id: 'ent-north1', floor: '1f', entry: 'T1', name: '北1 エレベーター', kind: 'entrance', pin: { left: 34, top: 10 } },
  { id: 'ent-north2', floor: '1f', entry: 'S2', name: '北2 エレベーター（正面入口）', kind: 'entrance', pin: { left: 40, top: 62 } },
  { id: 'ent-north3', floor: '1f', entry: 'T3', name: '北3 エレベーター', kind: 'entrance', pin: { left: 65, top: 10 } },
  { id: 'ent-north4', floor: '1f', entry: 'W0', name: '北4 エレベーター', kind: 'entrance', pin: { left: 5, top: 36 } },
  { id: 'ent-south', floor: '1f', entry: 'N0', name: '南館 連絡通路', kind: 'entrance', pin: { left: 7, top: 19 } },
  { id: 'info', floor: '1f', entry: 'S1', name: 'インフォメーション', kind: 'info', pin: { left: 43, top: 47 } },
  { id: 'plaza', floor: '1f', entry: 'P3', name: 'ナレッジプラザ（吹き抜け広場）', kind: 'plaza', pin: { left: 52, top: 38 } },
  // B1F
  { id: 'ent-north1-b1', floor: 'b1f', entry: 'T1', name: '北1 エレベーター（B1F）', kind: 'entrance', pin: { left: 34, top: 10 } },
  { id: 'ent-north2-b1', floor: 'b1f', entry: 'D2', name: '北2 エレベーター（B1F）', kind: 'entrance', pin: { left: 41, top: 46 } },
  { id: 'ent-north3-b1', floor: 'b1f', entry: 'E3', name: '北3 エレベーター（B1F）', kind: 'entrance', pin: { left: 60, top: 10 } },
  { id: 'ent-north4-b1', floor: 'b1f', entry: 'T4', name: '北4 エレベーター（B1F）', kind: 'entrance', pin: { left: 4, top: 36 } },
  // 2F
  { id: 'ent-north1-2f', floor: '2f', entry: 'T1', name: '北1 エレベーター（2F）', kind: 'entrance', pin: { left: 37, top: 10 } },
  { id: 'ent-north2-2f', floor: '2f', entry: 'B2', name: '北2 エレベーター（2F）', kind: 'entrance', pin: { left: 44, top: 50 } },
  { id: 'ent-north3-2f', floor: '2f', entry: 'T3', name: '北3 エレベーター（2F）', kind: 'entrance', pin: { left: 70, top: 14 } },
  { id: 'ent-north4-2f', floor: '2f', entry: 'N4', name: '北4 エレベーター（2F）', kind: 'entrance', pin: { left: 9, top: 27 } },
  { id: 'deck-south-2f', floor: '2f', entry: 'SK', name: '南館 連絡デッキ（2F）', kind: 'entrance', pin: { left: 3, top: 40 } },
];

// ---- 装飾用ブロック（クリック不可・雰囲気用 / 1Fのみ・現在非表示）----
export const DECOR = [
  { name: 'InterContinental Osaka', pin: { left: 76.5, top: 40 }, size: { w: 14, d: 13, h: 14 }, color: 0x9a8b7d, label: true },
  { name: 'タワーB オフィス', pin: { left: 30, top: 48 }, size: { w: 13, d: 7, h: 9 }, color: 0x5a5f66, label: false },
  { name: 'オフィスコア', pin: { left: 44, top: 21 }, size: { w: 8, d: 6, h: 9 }, color: 0x5a5f66, label: false },
  { name: 'オフィスコア', pin: { left: 25.5, top: 31.5 }, size: { w: 6, d: 6, h: 8 }, color: 0x666b73, label: false },
  { name: 'タワーC オフィス', pin: { left: 66, top: 44 }, size: { w: 9, d: 7, h: 9 }, color: 0x5a5f66, label: false },
];

// ---- 施設ピクトグラム（1F・現在は公式図のピクトグラムを優先し未使用）----
export const FACILITIES = [];
