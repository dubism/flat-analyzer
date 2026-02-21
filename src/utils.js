import {
  OFFER_COLORS,
  OBJECTIVE_PARAMS,
  SUBJECTIVE_PARAMS,
  DEFAULT_PARAM_RANGES,
  DEFAULT_SUBJECTIVE,
  LEGACY_SUBJECTIVE_MAP,
  FIELD_SCHEMA,
  SAMPLE_DATA,
} from './config';

// ============================================================================
// BASIC PARSERS & FORMATTERS
// ============================================================================

export const generateId = () => `offer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const parsePrice = (priceStr) => {
  if (priceStr === null || priceStr === undefined) return null;
  if (typeof priceStr === 'number') return priceStr;
  const stripped = String(priceStr).replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, '');
  const cleaned = stripped.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : null;
};

export const parseSize = (sizeStr) => {
  if (sizeStr === null || sizeStr === undefined) return null;
  if (typeof sizeStr === 'number') return sizeStr;
  const stripped = String(sizeStr).replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, '');
  const match = stripped.match(/(\d+([.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : null;
};

export const getNextColor = (offers) => {
  const usedColors = new Set(offers.map(o => o.color));
  for (const color of OFFER_COLORS) {
    if (!usedColors.has(color)) return color;
  }
  return OFFER_COLORS[offers.length % OFFER_COLORS.length];
};

export const formatPrice = (price) => {
  if (!price) return 'N/A';
  const str = String(Math.round(price));
  const formatted = str.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return formatted + ' Kč';
};

export const formatFieldValue = (field, value) => {
  const schema = FIELD_SCHEMA[field];
  if (!schema) return String(value ?? '');
  return schema.format(value);
};

// ============================================================================
// NORMALIZATION (for radar chart)
// ============================================================================

export const getNormalizedValue = (param, offer, parameterRanges) => {
  const range = parameterRanges[param] || DEFAULT_PARAM_RANGES[param];
  if (!range) return 5;

  let rawValue = 0;
  if (param === 'Price') {
    rawValue = parsePrice(offer.data?.PRICE) || 0;
  } else if (param === 'Price per m²') {
    const price = parsePrice(offer.data?.PRICE);
    const size = parseSize(offer.data?.SIZE);
    rawValue = (price && size) ? price / size : 0;
  } else if (param === 'Size') {
    rawValue = parseSize(offer.data?.SIZE) || 0;
  } else if (param === 'Rooms') {
    const roomsStr = String(offer.data?.ROOMS || '');
    const match = roomsStr.match(/(\d+)/);
    rawValue = match ? parseInt(match[1], 10) : 0;
  } else if (param === 'Parking') {
    if (range.type === 'discrete') {
      const val = offer.data?.PARKING || 'None';
      rawValue = range.values[val] ?? range.values['None'] ?? 0;
      return rawValue;
    }
  } else if (param === 'Cellar') {
    const cellarVal = offer.data?.CELLAR;
    if (cellarVal != null) {
      if (typeof cellarVal === 'number') { rawValue = cellarVal; }
      else { const s = String(cellarVal); if (s.toLowerCase() !== 'no' && s.toLowerCase() !== 'none') { const match = s.match(/(\d+([.,]\d+)?)/); rawValue = match ? parseFloat(match[1].replace(',', '.')) : 0; } }
    }
  } else if (param === 'Balcony/Loggia') {
    const balconyVal = offer.data?.BALCONY;
    if (balconyVal != null) {
      if (typeof balconyVal === 'number') { rawValue = balconyVal; }
      else { const s = String(balconyVal); if (s.toLowerCase() !== 'no' && s.toLowerCase() !== 'none') { const match = s.match(/(\d+([.,]\d+)?)/); rawValue = match ? parseFloat(match[1].replace(',', '.')) : 0; } }
    }
  }

  let normalized = ((rawValue - range.min) / (range.max - range.min)) * 10;
  normalized = Math.max(0, Math.min(10, normalized));
  if (range.inverse) normalized = 10 - normalized;
  return normalized;
};

export const getRawValue = (param, offer) => {
  if (param === 'Price') return formatPrice(parsePrice(offer.data?.PRICE));
  if (param === 'Price per m²') {
    const price = parsePrice(offer.data?.PRICE);
    const size = parseSize(offer.data?.SIZE);
    return (price && size) ? formatPrice(Math.round(price / size)) + '/m²' : 'N/A';
  }
  if (param === 'Size') { const v = offer.data?.SIZE; return v ? (typeof v === 'number' ? v + ' m²' : v) : 'N/A'; }
  if (param === 'Rooms') return offer.data?.ROOMS || 'N/A';
  if (param === 'Parking') return offer.data?.PARKING || 'None';
  if (param === 'Cellar') { const v = offer.data?.CELLAR; return v != null ? String(v) : 'None'; }
  if (param === 'Balcony/Loggia') { const v = offer.data?.BALCONY; return v != null ? String(v) : 'None'; }
  if (SUBJECTIVE_PARAMS.includes(param)) return (offer.subjectiveRatings?.[param] ?? 5) + '/10';
  return 'N/A';
};

// ============================================================================
// SUBJECTIVE RATINGS
// ============================================================================

export const normalizeSubjectiveRatings = (ratings) => {
  if (!ratings) return { ...DEFAULT_SUBJECTIVE };
  const normalized = { ...DEFAULT_SUBJECTIVE };
  SUBJECTIVE_PARAMS.forEach(param => {
    if (ratings[param] !== undefined) normalized[param] = ratings[param];
  });
  Object.entries(LEGACY_SUBJECTIVE_MAP).forEach(([oldKey, newKey]) => {
    if (ratings[oldKey] !== undefined && normalized[newKey] === DEFAULT_SUBJECTIVE[newKey]) {
      normalized[newKey] = ratings[oldKey];
    }
  });
  return normalized;
};

export const calculateSubjectiveRatings = (data) => {
  const ratings = { ...DEFAULT_SUBJECTIVE };
  if (data?.RENOVATION) {
    const reno = String(data.RENOVATION).toLowerCase();
    if (reno.includes('new') || reno.includes('po')) ratings['Renovation'] = 9;
    else if (reno.includes('partial') || reno.includes('good')) ratings['Renovation'] = 7;
    else if (reno.includes('original') || reno.includes('pred')) ratings['Renovation'] = 3;
  }
  return ratings;
};

// ============================================================================
// TEXT PARSER WITH SOURCE TRACKING
// ============================================================================

export function parseListingTextWithSources(text) {
  const values = {};
  const sources = {};
  const cleaned = text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, '');

  const recordMatch = (field, value, match) => {
    if (!match) return false;
    values[field] = value;
    const matchStr = match[0];
    const idx = text.indexOf(matchStr);
    if (idx !== -1) sources[field] = { start: idx, end: idx + matchStr.length, text: matchStr };
    return true;
  };

  // Price
  const pricePatterns = [/cena[:\s]*([0-9]{1,3}(?:[\s.][0-9]{3})+)\s*(?:kč|czk|,-)/i, /([0-9]{1,3}(?:[\s.][0-9]{3})+)\s*(?:kč|czk|,-)/i];
  for (const pattern of pricePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const priceNum = parseInt(match[1].replace(/[\s.]/g, ''), 10);
      if (priceNum > 100000) { recordMatch('PRICE', priceNum, match); break; }
    }
  }

  // Size
  const sizePatterns = [/(?:užitná\s+)?(?:plocha|podlahová)[:\s]*([0-9]+(?:[.,][0-9]+)?)\s*m/i, /([0-9]+(?:[.,][0-9]+)?)\s*m²/i];
  for (const pattern of sizePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const size = parseFloat(match[1].replace(',', '.'));
      if (size > 10 && size < 500) { recordMatch('SIZE', size, match); break; }
    }
  }

  // Rooms
  const roomsMatch = cleaned.match(/(\d\s*\+\s*(?:kk|1|2))/i);
  if (roomsMatch) recordMatch('ROOMS', roomsMatch[1].replace(/\s/g, ''), roomsMatch);
  else {
    const bedroomMatch = cleaned.match(/(\d+)\s*(?:ložnic|bedroom)/i);
    if (bedroomMatch) recordMatch('ROOMS', `${parseInt(bedroomMatch[1], 10) + 1}+kk`, bedroomMatch);
  }

  // Floor
  const floorPatterns = [/(\d+)\.\s*(?:patro|podlaží|np)(?:\s*(?:z|ze|\/)\s*(\d+))?/i, /(\d+)\s*\/\s*(\d+)\s*(?:patro|np|podlaží)?/i];
  for (const pattern of floorPatterns) {
    const match = cleaned.match(pattern);
    if (match) { recordMatch('FLOOR', match[2] ? `${match[1]}/${match[2]}` : match[1], match); break; }
  }

  // Balcony
  const balconyMatch = cleaned.match(/(?:balkon|balkón|lodžie|terasa)[:\s]*([0-9]+(?:[.,][0-9]+)?)\s*m/i);
  if (balconyMatch) recordMatch('BALCONY', parseFloat(balconyMatch[1].replace(',', '.')), balconyMatch);

  // Cellar
  const cellarMatch = cleaned.match(/sklep[:\s]*([0-9]+(?:[.,][0-9]+)?)\s*m/i);
  if (cellarMatch) recordMatch('CELLAR', parseFloat(cellarMatch[1].replace(',', '.')), cellarMatch);
  else { const cellarYes = cleaned.match(/sklep[:\s]*ano/i); if (cellarYes) recordMatch('CELLAR', 1, cellarYes); }

  // Parking
  const garageMatch = cleaned.match(/garáž|garage/i);
  if (garageMatch) recordMatch('PARKING', 'Garage', garageMatch);
  else { const parkingMatch = cleaned.match(/parkovací\s*(stání|místo)/i); if (parkingMatch) recordMatch('PARKING', 'Dedicated', parkingMatch); }

  // Building
  const brickMatch = cleaned.match(/cihlový|cihlová|cihla|brick/i);
  if (brickMatch) recordMatch('BUILDING', 'Brick', brickMatch);
  else { const panelMatch = cleaned.match(/panel/i); if (panelMatch) recordMatch('BUILDING', 'Panel', panelMatch); }

  // Location
  const locationMatch = cleaned.match(/(Vinohrady|Žižkov|Smíchov|Karlín|Holešovice|Holešovičky|Dejvice|Letná|Libeň|Rokoska|Kobylisy|Bubeneč|Vršovice|Nusle|Břevnov|Strašnice|Praha\s*\d+)/i);
  if (locationMatch) recordMatch('LOCATION', locationMatch[1], locationMatch);

  // Address
  const addressMatch1 = cleaned.match(/(?:ulice|ul\.?)[:\s]*([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)/i);
  if (addressMatch1) { recordMatch('ADDRESS', addressMatch1[1], addressMatch1); }
  else {
    const titleMatch = cleaned.match(/prodej\s+bytu[^,]*,\s*([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(?:\s+[a-záčďéěíňóřšťúůýž]+)?)/i);
    if (titleMatch) { recordMatch('ADDRESS', titleMatch[1], titleMatch); }
    else {
      const streetNumMatch = cleaned.match(/([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(?:\s+[a-záčďéěíňóřšťúůýž]+)?)\s+\d{1,4}(?:\/\d+)?(?:\s*,)/);
      if (streetNumMatch) { recordMatch('ADDRESS', streetNumMatch[1], streetNumMatch); }
      else if (values.LOCATION) { values.ADDRESS = values.LOCATION; sources.ADDRESS = sources.LOCATION; }
    }
  }

  // Energy
  const energyMatch = cleaned.match(/(?:PENB|energetick)[:\s]*([A-G])\b/i);
  if (energyMatch) recordMatch('ENERGY', energyMatch[1].toUpperCase(), energyMatch);
  else { const gMatch = cleaned.match(/mimořádně\s*nehospodárná/i); if (gMatch) recordMatch('ENERGY', 'G', gMatch); }

  // Subjective hints
  const subjective = {};
  const textLower = cleaned.toLowerCase();
  if (/po rekonstrukci|zrekonstruovan|novostavba/.test(textLower)) subjective.Renovation = 9;
  else if (/dobrém stavu|udržovan/.test(textLower)) subjective.Renovation = 6;
  else if (/původní|před rekonstrukc/.test(textLower)) subjective.Renovation = 3;
  if (/centrum|střed města/.test(textLower)) subjective.Location = 8;
  if (/metro|tramvaj/.test(textLower)) subjective.Location = Math.min((subjective.Location || 5) + 1, 10);
  if (/světlý|prosluněn|slunný|výhled/.test(textLower)) subjective['Light/Views'] = 8;
  if (/tichý|klidný/.test(textLower)) subjective.Noise = 8;
  if (/rušn|frekventovan/.test(textLower)) subjective.Noise = 3;
  if (/prostorný|velkorys/.test(textLower)) subjective.Layout = 7;
  if (/secesn|histori|charakter/.test(textLower)) subjective.Vibe = 8;

  // Name
  const street = values.ADDRESS?.split(',')[0]?.trim() || values.LOCATION || '';
  const rooms = values.ROOMS || '';
  values.name = street && rooms ? `${street} ${rooms}` : street || '';

  return { values: { ...values, ...subjective }, sources };
}

export function findSourceInText(text, field, value) {
  if (!value || !text) return null;
  const searchStr = String(value).toLowerCase();
  const textLower = text.toLowerCase();
  let idx = textLower.indexOf(searchStr);
  if (idx !== -1) return { start: idx, end: idx + searchStr.length, text: text.slice(idx, idx + searchStr.length) };
  if (FIELD_SCHEMA[field]?.type === 'number') {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const formatted = new Intl.NumberFormat('cs-CZ').format(num);
      idx = text.indexOf(formatted);
      if (idx !== -1) return { start: idx, end: idx + formatted.length, text: text.slice(idx, idx + formatted.length) };
    }
  }
  return null;
}

export function parseListingText(text) {
  return parseListingTextWithSources(text).values;
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

const STORAGE_KEY = 'flat-analyzer-data';

export const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        offers: (parsed.offers || []).map(o => ({
          ...o,
          subjectiveRatings: normalizeSubjectiveRatings(o.subjectiveRatings)
        })),
        parameterRanges: { ...DEFAULT_PARAM_RANGES, ...parsed.meta?.parameterRanges }
      };
    }
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
  }
  return null;
};

export const saveToStorage = (offers, parameterRanges) => {
  try {
    const data = {
      offers: offers.map(({ image, ...rest }) => rest), // strip base64 images for size
      meta: { parameterRanges }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
};

export const loadDemoOffers = () => ({
  offers: (SAMPLE_DATA.offers || []).map(o => ({
    ...o,
    subjectiveRatings: normalizeSubjectiveRatings(o.subjectiveRatings)
  })),
  parameterRanges: { ...DEFAULT_PARAM_RANGES }
});
