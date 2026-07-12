// ============================================================
// GRAND FRONT OSAKA 北館1F — マップデータ
// 出典: https://www.gfo-sc.jp/information/floor/north/1f
// 座標系: フロアマップ画像(1230x930)上の percent (left, top)
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

export const CATEGORIES = {
  fashion:  { label: 'ファッション',        color: 0xc5ca00, css: '#c5ca00' },
  interior: { label: 'インテリア・雑貨',    color: 0x00979d, css: '#00979d' },
  cafe:     { label: 'レストラン・カフェ',  color: 0xffc93c, css: '#e8a800' },
  kc:       { label: 'ナレッジキャピタル',  color: 0xe62b67, css: '#e62b67' },
};

export const SHOPS = [
  {
    id: 'noom', name: 'イタリアン&カフェバー NOOM', en: 'Italian and Cafebar NOOM',
    tag: 'イタリアン・フレンチ・洋食', cat: 'cafe',
    pin: { left: 13.6, top: 30.2 }, size: { w: 7, d: 7, h: 5 },
    url: 'https://www.gfo-sc.jp/shop-detail/noom/',
    logo: 'https://www.gfo-sc.jp/files/20250731/0f05bc375c7accfcd76979dd8b39321f95cc55d3.jpg',
    desc: 'ミシュランシェフ監修のもと、素材の持ち味を活かした本格イタリアンを、日常の中で気軽に楽しめるNOOM。ランチやディナーはもちろん、自家製スイーツや厳選ワインを楽しむカフェバー利用もおすすめ。ランチからバータイムまで、多彩なシーンに寄り添う都会のレストランです。',
  },
  {
    id: 'pelle-morbida', name: 'PELLE MORBIDA', en: 'PELLE MORBIDA',
    tag: 'バッグ・革小物', cat: 'fashion',
    pin: { left: 20.1, top: 29.6 }, size: { w: 5, d: 5, h: 4.2 },
    url: 'https://www.gfo-sc.jp/shop-detail/PELLEMORBIDA/',
    logo: 'https://www.gfo-sc.jp/files/20220831/9c83f64eea9dcbfc744ec1d62e02b09649cbd504.jpg',
    desc: '"旅の理想形"として知られる船旅を楽しむ大人たちに向けて誕生したバッグブランド。その名は「柔らかな肌（革）」を意味するイタリア語から。優雅な船旅に持って行きたくなるような、上品で良質なアイテムを製作しています。流行は追わず、現代感覚をバランスよく取り入れたグローバルスタンダードを目指し、耐久性や機能性も兼備。',
  },
  {
    id: 'starbucks', name: 'STARBUCKS', en: 'STARBUCKS TEAVANA',
    tag: 'カフェ', cat: 'cafe',
    pin: { left: 18.6, top: 21.0 }, size: { w: 8, d: 5, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/STARBUCKS_kitakanten/',
    logo: 'https://www.gfo-sc.jp/files/20220720/e50a5bc33c426dea35ad1a465d99235104e50c77.png',
    desc: '彩りあふれる、心あたたまるティーのひとときを。鮮やかで香り豊かなティービバレッジに特化したスターバックス。上質な茶葉とボタニカルな素材を選び抜いたティーブランド TEAVANA™ の多彩なティービバレッジをご用意。洗練された空間の中で、香り豊かなティー体験をお届けします。',
  },
  {
    id: 'global-style', name: 'GINZA Global Style', en: 'GINZA Global Style',
    tag: 'オーダースーツ', cat: 'fashion',
    pin: { left: 28.2, top: 24.2 }, size: { w: 7, d: 9, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/GINZAGlobalStyle/',
    logo: 'https://www.gfo-sc.jp/files/20220221/3d8f6cf30a0986d44f65c6454a5d1c3b8c8b0be6.jpg',
    desc: '「ENJOY ORDER！」をコンセプトに、"あなただけ"のスーツを提案する本格オーダースーツ専門店。1着2万円台から、業界最多の約5,000種類の生地と豊富なスーツモデルをご用意。シャツやシューズのオーダーも可能。レディースコーナーとプライベートフィッティングルームも設置。',
  },
  {
    id: 'the-lab', name: 'The Lab.（CAFE Lab.）', en: 'Communication Cafe',
    tag: 'コミュニケーションカフェ', cat: 'kc',
    pin: { left: 57.4, top: 25.1 }, size: { w: 13, d: 9, h: 6 },
    url: 'https://kc-i.jp/facilities/the-lab/cafe-lab/',
    logo: 'https://www.gfo-sc.jp/files/20180913/35ff76fdd956c47afd5ce02c38f209dec0ff844c.png',
    desc: 'ナレッジキャピタルの交流拠点「The Lab.」内のコミュニケーションカフェ。本を片手にコーヒーを楽しんだり、最先端の技術・研究の展示に触れながら、人と人との出会い・交流が生まれる場所。誰でも気軽に立ち寄れる知的好奇心を刺激する空間です。',
  },
  {
    id: 'ring-jacket', name: 'RING JACKET', en: 'RING JACKET',
    tag: 'メンズ', cat: 'fashion',
    pin: { left: 19.4, top: 39.4 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/ring-jacket/',
    logo: 'https://www.gfo-sc.jp/files/20180827/fe762361460312b69ff7d1bbdb27b6a6417883f4.png',
    desc: '1954年創業、日本を代表するドレスクロージングブランド。世界的にも注目されるクオリティーと希少性あふれるコレクションはまさに「グローバルスタンダード」。自社一貫生産のドレスクロージングに加え、トレンドを捉えたインポートアイテムや、特別な空間でご案内する「オーダーサービス」も真骨頂。',
  },
  {
    id: 'g-shock', name: 'G-SHOCK STORE', en: 'G-SHOCK STORE OSAKA',
    tag: '腕時計', cat: 'fashion',
    pin: { left: 29.5, top: 39.6 }, size: { w: 5.5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/g-shock-store/',
    logo: 'https://www.gfo-sc.jp/files/20180827/ee4c517b3ba2c7e2297d7a16e239266e1d71fcc7.png',
    desc: '直営店最大の売場面積を誇るG-SHOCK STORE OSAKA！広々とした店内には最新・人気モデルを常時300モデル以上ラインアップ。専門技師が常駐するメンテナンスブースも併設し、アフターサービスも万全。修理のご相談もお気軽にどうぞ！',
  },
  {
    id: 'tsuchiya-kaban', name: 'TSUCHIYA KABAN', en: 'Tsuchiya Kaban',
    tag: 'バッグ・革小物', cat: 'fashion',
    pin: { left: 23.7, top: 39.8 }, size: { w: 5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/tsuchiya-kaban/',
    logo: 'https://www.gfo-sc.jp/files/20230617/b41ae7609d9a6cbeb828d3e6929b949482a3e3dd.jpeg',
    desc: '1965年の創業以来、日本の職人による、つくり手の見えるものづくりを心掛ける「土屋鞄製造所」。10年以上愛される定番から季節の限定品まで、良質な革素材を生かした鞄アイテムをご用意。店内へ一歩足を踏み入れると、本革ならではの豊かな香りに包まれます。',
  },
  {
    id: 'yondoshi', name: '4℃ SHOWCASE', en: '4℃ SHOWCASE',
    tag: 'ジュエリー', cat: 'fashion',
    pin: { left: 36.5, top: 37.8 }, size: { w: 4.5, d: 4.5, h: 4 },
    url: 'https://www.gfo-sc.jp/shop-detail/4-bridal/',
    logo: 'https://www.gfo-sc.jp/files/20250705/b067b29f809c9b47435bcdfc240f9f83ba6bbab0.jpg',
    desc: '★2025年7月リニューアルオープン★ ショーケース越しに眺めるだけでなく、まるでご自身の部屋でくつろぐようにゆったりとした気持ちでジュエリーをご試着いただける空間。心惹かれる"運命のジュエリー"との出会いを、より深くパーソナルな体験としてお楽しみいただけます。',
  },
  {
    id: 'zara-home', name: 'ZARA HOME', en: 'ZARA HOME',
    tag: 'インテリア・生活雑貨', cat: 'interior',
    pin: { left: 16.7, top: 50.9 }, size: { w: 10, d: 8, h: 5 },
    url: 'https://www.gfo-sc.jp/shop-detail/zara-home/',
    logo: 'https://www.gfo-sc.jp/files/20230724/8f9f98e7ab300042bbd31012b062d4d4d8171f03.jpg',
    desc: 'スペイン発のインテリアファッションブランド。ベッドリネン、テーブルウェア、キッチンアイテム、ルームウェア、ディフューザー、キッズ&ベビーまでバリエーション豊かなインテリア雑貨を展開。週2回新作を投入しながらインテリアの最新トレンドをお届けします。',
  },
  {
    id: 'il-ghiottone', name: "IL GHIOTTONE di piu'", en: "IL GHIOTTONE di piu'",
    tag: 'イタリア料理', cat: 'cafe',
    pin: { left: 22.7, top: 58.9 }, size: { w: 7, d: 5.5, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/il-ghiottone/',
    logo: 'https://www.gfo-sc.jp/files/20180827/2756ae4c771f2070ec251d53194b6f1cde1771ba.png',
    desc: '全国各地の生産者から届く新鮮な素材を、京料理のエッセンスを取り入れた新しい切り口で楽しむ『イノベーティブ・イタリアン』。春夏秋冬、四季折々の日本の素晴らしさを感じられるお料理をお楽しみください。',
  },
  {
    id: 'tullys', name: "TULLY'S COFFEE", en: "TULLY'S COFFEE",
    tag: 'コーヒー', cat: 'cafe',
    pin: { left: 53.4, top: 50.5 }, size: { w: 7, d: 5.5, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/tullys/',
    logo: 'https://www.gfo-sc.jp/files/20180827/067b16b256779af8ecac49e21ceb3899bafe9ff8.png',
    desc: 'シンボル空間ナレッジプラザの一角に位置するスペシャリティーコーヒーショップ。一杯一杯手作りの本格コーヒーとエスプレッソドリンク。店内はNYの図書館がコンセプトで、たくさんの本とコーヒーの香りに包まれた空間。テラス席では巨大な吹き抜けを見上げながら開放感あふれる時間を。',
  },
  {
    id: 'soholm', name: 'SOHOLM CAFE+DINING', en: 'SOHOLM CAFE+DINING',
    tag: 'カフェ', cat: 'cafe',
    pin: { left: 83.8, top: 26.2 }, size: { w: 8, d: 6, h: 4.5 },
    url: 'https://www.gfo-sc.jp/shop-detail/soholm/',
    logo: 'https://www.gfo-sc.jp/files/20180827/75192de7f83dc9f53ec56320a77e8631b304d2c1.png',
    desc: 'スーホルムとはデンマーク語で「湖のほとりの小さな町」。太陽のふりそそぐ開放的な空間で、ゆっくりと流れる時間を。テラス席は木々の緑や水の流れを感じる季節ごとの風景が人気。名物ミートボールやミール系パンケーキ、丁寧に焼き上げたワッフルもおすすめ。ディナーは集まりからウェディングまで。',
  },
  {
    id: 'actus', name: 'ACTUS', en: 'ACTUS',
    tag: 'インテリア・生活雑貨', cat: 'interior',
    pin: { left: 74.3, top: 28.8 }, size: { w: 11, d: 7, h: 5 },
    url: 'https://www.gfo-sc.jp/shop-detail/actus/',
    logo: 'https://www.gfo-sc.jp/files/20180827/5cc8a9037da8196220d575df671db8fbaa202c33.png',
    desc: '本格カフェダイニングを併設し、オリジナル家具、食卓を楽しくするグロッサリー、体験型ボディケアからアパレルまで。衣食住を網羅する関西初のライフスタイル発信型セレクトショップ。北欧・ナチュラル・モダンと様々なスタイルで編集した店内を回遊しながら、暮らしのヒントを見つけて。',
  },
];

// ---- 施設・エントランス（経路の出発/到着地点にもなる）----
export const PLACES = [
  { id: 'ent-north1', name: '北1 エレベーター', kind: 'entrance', pin: { left: 34, top: 10 } },
  { id: 'ent-north2', name: '北2 エレベーター（正面入口）', kind: 'entrance', pin: { left: 40, top: 62 } },
  { id: 'ent-north3', name: '北3 エレベーター', kind: 'entrance', pin: { left: 65, top: 10 } },
  { id: 'ent-north4', name: '北4 エレベーター', kind: 'entrance', pin: { left: 5, top: 36 } },
  { id: 'ent-south', name: '南館 連絡通路', kind: 'entrance', pin: { left: 7, top: 19 } },
  { id: 'info', name: 'インフォメーション', kind: 'info', pin: { left: 43, top: 47 } },
  { id: 'plaza', name: 'ナレッジプラザ（吹き抜け広場）', kind: 'plaza', pin: { left: 52, top: 38 } },
];

// ---- 施設ピクトグラム（公式フロアマップ上の位置を3D化。座標は公式マップ準拠）----
// type: elevator / escalator / restroom / info / aed / parking / connector
export const FACILITIES = [
  { type: 'elevator',  name: '北1',         pin: { left: 34, top: 8 } },
  { type: 'elevator',  name: '北3',         pin: { left: 66, top: 8 } },
  { type: 'elevator',  name: '北4',         pin: { left: 5,  top: 40 } },
  { type: 'elevator',  name: '北2（正面）',  pin: { left: 40, top: 71 } },
  { type: 'elevator',  name: 'タワーB',      pin: { left: 30, top: 71 } },
  { type: 'elevator',  name: 'タワーC',      pin: { left: 71, top: 71 } },
  { type: 'escalator', name: '',            pin: { left: 17, top: 31 }, angle: 25 },
  { type: 'escalator', name: '',            pin: { left: 23, top: 46 }, angle: 100 },
  { type: 'escalator', name: '',            pin: { left: 35, top: 46 }, angle: 100 },
  { type: 'escalator', name: '',            pin: { left: 63, top: 35 }, angle: 20 },
  { type: 'escalator', name: '',            pin: { left: 50, top: 53 }, angle: 100 },
  { type: 'restroom',  name: 'トイレ',       pin: { left: 68, top: 41 } },
  { type: 'info',      name: 'インフォメーション', pin: { left: 43, top: 48 } },
  { type: 'aed',       name: 'AED',         pin: { left: 42, top: 45 } },
  { type: 'parking',   name: '地下駐車場',    pin: { left: 58, top: 63 } },
  { type: 'connector', name: '南館へ',       pin: { left: 5,  top: 20 } },
];

// ---- 装飾用ブロック（クリック不可・雰囲気用）----
export const DECOR = [
  { name: 'InterContinental Osaka', pin: { left: 76.5, top: 40 }, size: { w: 14, d: 13, h: 14 }, color: 0x9a8b7d, label: true },
  { name: 'タワーB オフィス', pin: { left: 30, top: 48 }, size: { w: 13, d: 7, h: 9 }, color: 0x5a5f66, label: false },
  { name: 'オフィスコア', pin: { left: 44, top: 21 }, size: { w: 8, d: 6, h: 9 }, color: 0x5a5f66, label: false },
  { name: 'オフィスコア', pin: { left: 25.5, top: 31.5 }, size: { w: 6, d: 6, h: 8 }, color: 0x666b73, label: false },
  { name: 'タワーC オフィス', pin: { left: 66, top: 44 }, size: { w: 9, d: 7, h: 9 }, color: 0x5a5f66, label: false },
];

// ---- 通路ナビゲーショングラフ（A*用）----
// 「創造のみち」＋ナレッジプラザ＋南北連絡通路をモデル化
export const NAV_NODES = {
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
};

export const NAV_EDGES = [
  ['W0','W1'], ['W1','W2'], ['W2','W3'], ['W3','W4'], ['W4','W5'], ['W5','P1'],
  ['N0','N1'], ['N1','N2'], ['N2','N3'], ['N3','N4'], ['N4','T1'],
  ['N1','W2'], ['N2','W3'], ['N3','W4'], ['N4','W5'],
  ['P1','P2'], ['P1','P3'], ['P2','P4'], ['P3','P4'], ['P3','P5'], ['P2','P3'],
  ['P4','U1'], ['U1','T3'], ['P4','E1'],
  ['E1','E2'], ['E2','E3'], ['E3','E4'], ['E4','E5'],
  ['P5','S1'], ['S1','S2'],
  ['W2','SW1'], ['SW1','SW2'], ['SW2','SW3'],
  ['P5','P1'],
];

// 各ショップ/施設の「入口」を最寄りノードに接続するための対応表
export const ENTRY_NODE = {
  'noom': 'W1', 'pelle-morbida': 'W2', 'starbucks': 'N1', 'global-style': 'N3',
  'the-lab': 'P4', 'ring-jacket': 'W2', 'g-shock': 'W4', 'tsuchiya-kaban': 'W3',
  'yondoshi': 'W4', 'zara-home': 'SW2', 'il-ghiottone': 'SW3', 'tullys': 'P5',
  'soholm': 'E5', 'actus': 'E3',
  'ent-north1': 'T1', 'ent-north2': 'S2', 'ent-north3': 'T3', 'ent-north4': 'W0',
  'ent-south': 'N0', 'info': 'S1', 'plaza': 'P3',
};
