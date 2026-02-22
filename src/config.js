export const DEFAULT_PALETTE = [
  '#6366F1', '#E07B54', '#0D9488', '#A855F7', '#84CC16',
  '#F472B6', '#D97706', '#64748B', '#BE185D', '#059669',
];

export const OFFER_COLORS = DEFAULT_PALETTE;

export const generatePalette = (count = 10) => {
  const baseHue = Math.random() * 360;
  const hueStep = 360 / count;
  const colors = [];
  for (let i = 0; i < count; i++) {
    const hue = (baseHue + i * hueStep + (Math.random() - 0.5) * hueStep * 0.25) % 360;
    const sat = 62 + (i % 3) * 8;
    const lit = i % 2 === 0 ? 43 : 53;
    colors.push(hslToHex(hue, sat, lit));
  }
  return colors;
};

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export const OBJECTIVE_PARAMS = ['Low price', 'Low price per m²', 'Interior area', 'Rooms', 'Parking', 'Cellar', 'Balcony/Loggia'];
export const SUBJECTIVE_PARAMS = ['Location', 'Light/Views', 'Layout', 'Renovation', 'Noise', 'Vibe'];
export const ALL_PARAMS = [...OBJECTIVE_PARAMS, ...SUBJECTIVE_PARAMS];

export const DEFAULT_ENABLED_PARAMS = Object.fromEntries(
  ALL_PARAMS.map(p => [p, p !== 'Parking' && (OBJECTIVE_PARAMS.includes(p) || p === 'Vibe')])
);

export const DEFAULT_PARAM_RANGES = {
  'Low price': { min: 5000000, max: 20000000, inverse: true },
  'Low price per m²': { min: 100000, max: 150000, inverse: true },
  'Interior area': { min: 0, max: 150, inverse: false },
  'Rooms': { min: 1, max: 5, inverse: false },
  'Parking': { type: 'discrete', values: { 'None': 0, 'Dedicated': 5, 'Garage': 10 } },
  'Cellar': { min: 0, max: 15, inverse: false },
  'Balcony/Loggia': { min: 0, max: 20, inverse: false },
};

export const DEFAULT_SUBJECTIVE = {
  'Location': 5, 'Light/Views': 5, 'Layout': 5,
  'Renovation': 5, 'Noise': 5, 'Vibe': 5,
};

export const LEGACY_SUBJECTIVE_MAP = {
  'Public Transport': 'Location', 'Condition': 'Renovation',
  'Amenities': 'Vibe', 'Building Quality': 'Layout',
};

export const FIELD_SCHEMA = {
  PRICE: { type: 'number', unit: 'Kč' },
  SIZE: { type: 'number', unit: 'm²' },
  ROOMS: { type: 'string' }, FLOOR: { type: 'string' },
  ADDRESS: { type: 'string' }, LOCATION: { type: 'string' },
  BALCONY: { type: 'number', unit: 'm²' },
  CELLAR: { type: 'number', unit: 'm²' },
  PARKING: { type: 'string' }, BUILDING: { type: 'string' }, ENERGY: { type: 'string' },
};

export const SAMPLE_DATA = {
  offers: [
    {"id":"1758658522883","name":"👀 Veletržní 2+1","color":"#4C5BF7","data":{"URL":"https://www.sreality.cz/detail/prodej/byt/2+1/praha-holesovice-veletrzni/2122748748","ADDRESS":"Veletržní, Praha - Holešovice","PRICE":"10 950 000 CZK","SIZE":"74 m²","ROOMS":"2+1","FLOOR":"2","PARKING":"N/A","CELLAR":"Yes","BUILDING":"Brick","ENERGY":"E","LOCATION":"Letná","RENOVATION":"pred"},"subjectiveRatings":{"Location":6,"Light/Views":5,"Layout":8,"Renovation":5,"Noise":5,"Vibe":7},"notes":"down from 11,5","featured":true,"manualOrder":0},
    {"id":"1758658556591","name":"🪡 Dělnická 2+kk","color":"#F2C900","data":{"URL":"https://www.sreality.cz/detail/prodej/byt/2+kk/praha-holesovice-delnicka/1992725324","ADDRESS":"Dělnická, Praha - Holešovice","PRICE":"8 200 000 CZK","SIZE":"54 m²","ROOMS":"2+kk","FLOOR":"3","PARKING":"Park Lift","CELLAR":"Yes","BUILDING":"Brick","ENERGY":"G","LOCATION":"Holešovice","RENOVATION":""},"subjectiveRatings":{"Location":6,"Light/Views":5,"Layout":7,"Renovation":6,"Noise":5,"Vibe":6},"notes":"down from 8,7","featured":true,"manualOrder":1},
    {"id":"1760806810553","name":"⬜️ U Uranie 3+1","color":"#BE3E3E","data":{"URL":"https://www.eurobydleni.cz/prodej-bytu-31-60-m-praha-7-holesovice/detail/9917273/","ADDRESS":"U Uranie, Praha 7, Holešovice","PRICE":"8 450 000 CZK","SIZE":"60 m²","ROOMS":"3+1","FLOOR":"1/6","PARKING":"N/A","CELLAR":"4 m²","BUILDING":"Brick","ENERGY":"D","LOCATION":"Holešovice","RENOVATION":"po"},"subjectiveRatings":{"Location":6,"Light/Views":5,"Layout":7,"Renovation":6,"Noise":5,"Vibe":5},"notes":"down from 9,5","featured":true,"manualOrder":2},
    {"id":"offer_1769287957284","name":"🚋 Bubenské nábř. 3+1","color":"#2563EB","data":{"PRICE":"13 300 000","SIZE":"84","ROOMS":"3+1","ADDRESS":"Bubenské nábřeží 866/11","URL":"https://www.sreality.cz/detail/prodej/byt/3+1/praha-holesovice-bubenska/2609607500","FLOOR":"2/6","PARKING":"None","BALCONY":"2","LOCATION":"Holešovice","RENOVATION":"Original"},"subjectiveRatings":{"Location":5,"Light/Views":5,"Layout":5,"Renovation":3,"Noise":5,"Vibe":5},"featured":true,"manualOrder":3},
  ],
  meta: { parameterRanges: null },
};
