import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
  DEFAULT_PALETTE,
  generatePalette,
  OBJECTIVE_PARAMS,
  SUBJECTIVE_PARAMS,
  ALL_PARAMS,
  DEFAULT_ENABLED_PARAMS,
  DEFAULT_PARAM_RANGES,
} from './config';
import {
  generateId,
  parsePrice,
  parseSize,
  getNextColor,
  formatPrice,
  getNormalizedValue,
  getRawValue,
  normalizeSubjectiveRatings,
  calculateSubjectiveRatings,
  parseListingTextWithSources,
  loadFromStorage,
  saveToStorage,
  loadDemoOffers,
} from './utils';
import {
  isConfigured as isFirebaseConfigured,
  initFirebase,
  generateRoomCode,
  writeRoom,
  subscribeToRoom,
} from './firebase';

// ============================================================================
// LANGUAGE / TRANSLATION SYSTEM
// ============================================================================

const T = {
  cs: {
    // Header
    addOffer: '+ Přidat', demo: 'Demo', langToggle: 'EN',
    // Mobile tabs
    tabList: 'Seznam', tabDetail: 'Detail', tabChart: 'Graf',
    // List view
    noOffers: 'Žádné nabídky', noOffersTip: 'Klepněte na + Přidat',
    sortGraphScore: 'Skóre', sortManual: 'Ručně', sortPrice: 'Cena',
    sortSize: 'Plocha', sortPricePerSqm: 'Kč/m²', sortName: 'Název',
    groupNone: 'Bez skupin', groupLocation: 'Lokalita', groupRenovation: 'Rekonstrukce',
    soldSection: 'Prodané',
    // Detail view
    backToList: '← Seznam', notesPlaceholder: 'Poznámky...', ratingsSection: 'Hodnocení',
    selectOffer: 'Vyberte nabídku ze seznamu', goToList: 'Přejít na seznam',
    link: 'Odkaz', markSold: 'Označit jako prodané', soldLabel: 'Prodané',
    edit: 'Upravit', email: 'E-mail', photo: 'Fotka',
    // Chart
    starOffersHint: 'Označte nabídky hvězdičkou pro porovnání',
    autoButton: 'Auto', rangesButton: 'Rozsahy', rangesTitle: 'Rozsahy',
    // Shared modal actions
    cancel: 'Zrušit', save: 'Uložit', add: 'Přidat', remove: 'Odebrat',
    close: '✕', colors: 'Barva',
    // AddOfferModal
    addOfferTitle: 'Přidat nabídku',
    listingUrlLabel: 'URL inzerátu', listingTextLabel: 'Text inzerátu',
    listingTextPlaceholder: 'Vložte text inzerátu ze stránky...',
    analyzeButton: 'Analyzovat', editTextButton: '← Upravit text',
    nameLabel: 'Název', propertyDataSection: 'Data nemovitosti',
    addOfferButton: 'Přidat nabídku',
    // EditOfferModal
    editOfferTitle: 'Upravit nabídku',
    priceLabel: 'Cena', sizeLabel: 'Plocha', roomsLabel: 'Dispozice',
    floorLabel: 'Patro', balconyLabel: 'Balkón/Lodžie', cellarLabel: 'Sklep',
    parkingLabel: 'Parkování', buildingLabel: 'Budova', energyLabel: 'Energie',
    addressLabel: 'Adresa', locationLabel: 'Lokalita', urlLabel: 'URL',
    // DeleteConfirmModal
    deleteTitle: 'Smazat nabídku?', deleteWillBeDeleted: 'bude trvale odstraněna.',
    deleteConfirm: 'Smazat',
    // EmailModal
    emailTitle: 'Návrh e-mailu', copyToClipboard: 'Kopírovat do schránky',
    // PaletteEditor
    paletteTitle: 'Barevná paleta', regenerate: 'Obnovit', resetDefault: 'Výchozí',
    // ImagePasteModal
    photoTitle: 'Fotografie nemovitosti',
    photoPasteHint: 'Vložit, přetáhnout nebo kliknout',
    photoPasteShortcut: 'Ctrl+V pro vložení',
    photoMobileHint: 'Klepnutím vyberte fotku',
    photoGallery: 'Galerie', photoCamera: 'Kamera',
    photoPasteClipboard: 'Vložit ze schránky',
    clipboardNotSupported: 'Schránka není v tomto prohlížeči podporována. Použijte Ctrl+V.',
    clipboardNoImage: 'Schránka neobsahuje obrázek.',
    clipboardDenied: 'Přístup ke schránce odepřen. Použijte Ctrl+V.',
    clipboardError: 'Nelze číst schránku.',
    // FIELD_LABELS
    fieldPrice: 'Cena', fieldSize: 'Plocha', fieldRooms: 'Dispozice',
    fieldFloor: 'Patro', fieldAddress: 'Adresa', fieldLocation: 'Lokalita',
    fieldBalcony: 'Balkón/Lodžie', fieldCellar: 'Sklep', fieldParking: 'Parkování',
    fieldBuilding: 'Budova', fieldEnergy: 'Energie',
    // Sync panel
    syncConnected: 'Připojeno', syncCreateRoom: 'Vytvořit místnost',
    syncRoomCodePlaceholder: 'Kód místnosti', syncJoin: 'Připojit',
    syncDisconnect: 'Odpojit', syncCopyLink: 'Kopírovat odkaz',
    syncSharedHint: 'Sdílejte URL nebo kód místnosti. Ostatní uvidí živé úpravy.',
    syncOffersHint: 'Synchronizujte nabídky mezi zařízeními v reálném čase.',
    // Import
    validJsonFound: 'Nalezen platný JSON',
    offersToImport: 'nabídky připraveny k importu.',
    existingOffers: 'Máte',
    existingOffersSuffix: 'stávajících nabídek.',
    addToExisting: 'Přidat ke stávajícím',
    replaceAll: 'Nahradit vše',
    total: 'celkem',
    keepOnly: 'ponechat jen',
    dropJsonHint: 'Pusťte soubor JSON pro import',
    dropJsonSub: 'Uvolněte pro import nabídek',
  },
  en: {
    addOffer: '+ Add', demo: 'Demo', langToggle: 'CS',
    tabList: 'List', tabDetail: 'Detail', tabChart: 'Chart',
    noOffers: 'No offers yet', noOffersTip: 'Tap + Add to start',
    sortGraphScore: 'Graph score', sortManual: 'Manual', sortPrice: 'Price',
    sortSize: 'Interior area', sortPricePerSqm: 'Kč/m²', sortName: 'Name',
    groupNone: 'None', groupLocation: 'Location', groupRenovation: 'Reno',
    soldSection: 'Sold',
    backToList: '← List', notesPlaceholder: 'Notes...', ratingsSection: 'Ratings',
    selectOffer: 'Select an offer from the list', goToList: 'Go to list',
    link: 'Link', markSold: 'Mark Sold', soldLabel: 'Sold',
    edit: 'Edit', email: 'Email', photo: 'Photo',
    starOffersHint: 'Star offers to compare them here',
    autoButton: 'Auto', rangesButton: 'Ranges', rangesTitle: 'Ranges',
    cancel: 'Cancel', save: 'Save', add: 'Add', remove: 'Remove',
    close: '✕', colors: 'Color',
    addOfferTitle: 'Add Offer',
    listingUrlLabel: 'Listing URL', listingTextLabel: 'Listing Text',
    listingTextPlaceholder: 'Paste the full listing text from the website...',
    analyzeButton: 'Analyze', editTextButton: '← Edit text',
    nameLabel: 'Name', propertyDataSection: 'Property Data',
    addOfferButton: 'Add Offer',
    editOfferTitle: 'Edit Offer',
    priceLabel: 'Price', sizeLabel: 'Interior area', roomsLabel: 'Rooms',
    floorLabel: 'Floor', balconyLabel: 'Balcony/Loggia', cellarLabel: 'Cellar',
    parkingLabel: 'Parking', buildingLabel: 'Building', energyLabel: 'Energy',
    addressLabel: 'Address', locationLabel: 'Location', urlLabel: 'URL',
    deleteTitle: 'Delete offer?', deleteWillBeDeleted: 'will be permanently deleted.',
    deleteConfirm: 'Delete',
    emailTitle: 'Draft Email', copyToClipboard: 'Copy to Clipboard',
    paletteTitle: 'Color Palette', regenerate: 'Regenerate', resetDefault: 'Reset',
    photoTitle: 'Property Photo',
    photoPasteHint: 'Paste, drop, or click',
    photoPasteShortcut: 'Ctrl+V to paste',
    photoMobileHint: 'Tap to choose photo',
    photoGallery: 'Gallery', photoCamera: 'Camera',
    photoPasteClipboard: 'Paste from Clipboard',
    clipboardNotSupported: 'Clipboard API not supported. Use Ctrl+V instead.',
    clipboardNoImage: 'No image found in clipboard.',
    clipboardDenied: 'Clipboard access denied. Use Ctrl+V instead.',
    clipboardError: 'Could not read clipboard.',
    fieldPrice: 'Price', fieldSize: 'Interior area', fieldRooms: 'Rooms',
    fieldFloor: 'Floor', fieldAddress: 'Address', fieldLocation: 'Location',
    fieldBalcony: 'Balcony/Loggia', fieldCellar: 'Cellar', fieldParking: 'Parking',
    fieldBuilding: 'Building', fieldEnergy: 'Energy',
    syncConnected: 'Connected', syncCreateRoom: 'Create Room',
    syncRoomCodePlaceholder: 'Room code', syncJoin: 'Join',
    syncDisconnect: 'Disconnect', syncCopyLink: 'Copy link',
    syncSharedHint: 'Share the URL or room code. Anyone with it sees live updates.',
    syncOffersHint: 'Sync offers across devices in real time.',
    validJsonFound: 'Valid JSON found',
    offersToImport: 'offers ready to import.',
    existingOffers: 'You have',
    existingOffersSuffix: 'existing offers.',
    addToExisting: 'Add to existing',
    replaceAll: 'Replace all',
    total: 'total',
    keepOnly: 'keep only',
    dropJsonHint: 'Drop JSON file to import',
    dropJsonSub: 'Release to import offers',
  },
};

// Module-level lang state — initialized from localStorage so t() works before first render.
// Updated synchronously when user toggles language.
let _lang = (typeof localStorage !== 'undefined' && localStorage.getItem('flatAnalyzerLang')) || 'cs';
const t = (key) => T[_lang]?.[key] ?? T.en?.[key] ?? key;

// ============================================================================
// HOOKS
// ============================================================================

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ============================================================================
// TOOLTIP COMPONENT - renders fixed position, unclipped
// ============================================================================

function LinkTooltip({ url, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  
  const handleMouseMove = (e) => {
    setPos({ x: e.clientX, y: e.clientY });
  };
  
  let domain = 'link';
  let path = '';
  try {
    const u = new URL(url);
    domain = u.hostname.replace('www.', '');
    path = u.pathname.slice(0, 30) + (u.pathname.length > 30 ? '...' : '');
  } catch {}
  
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onMouseMove={handleMouseMove}
      className="inline-flex"
    >
      {children}
      {show && (
        <div 
          className="fixed z-[9999] px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg pointer-events-none"
          style={{ left: pos.x + 8, top: pos.y + 8 }}
        >
          <span className="font-semibold">{domain}</span>
          <span className="text-gray-400 ml-1">{path}</span>
        </div>
      )}
    </span>
  );
}

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

function FloorVisualizer({ floor }) {
  if (!floor) return null;
  const match = String(floor).match(/(\d+)(?:\s*[\/of]+\s*(\d+))?/i);
  if (!match) return null;
  const currentFloor = parseInt(match[1], 10);
  const totalFloors = match[2] ? parseInt(match[2], 10) : Math.max(currentFloor + 2, 6);
  if (currentFloor < 1 || totalFloors < 1) return null;
  const floors = [];
  for (let i = totalFloors; i >= 1; i--) floors.push(i);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-gray-400 mb-0.5">{currentFloor}/{totalFloors}</span>
      {floors.map(f => (
        <div key={f} className={`w-6 h-1.5 rounded-sm ${f === currentFloor ? 'bg-blue-500' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}

function DeleteConfirmModal({ offerName, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-4 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold mb-2">{t('deleteTitle')}</h3>
        <p className="text-gray-600 mb-4">„{offerName}" {t('deleteWillBeDeleted')}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg">{t('cancel')}</button>
          <button onClick={onConfirm} className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">{t('deleteConfirm')}</button>
        </div>
      </div>
    </div>
  );
}

// Computed dynamically inside FlatOfferAnalyzer using t() — see fieldLabels below
const FIELD_LABELS_STATIC = { PRICE: 'Price', SIZE: 'Interior area', ROOMS: 'Rooms', FLOOR: 'Floor', ADDRESS: 'Address', LOCATION: 'Location', BALCONY: 'Balcony/Loggia', CELLAR: 'Cellar', PARKING: 'Parking', BUILDING: 'Building', ENERGY: 'Energy' };
const formatFieldValue = (k, v) => {
  if (!v) return '';
  if (k === 'PRICE') return formatPrice(parsePrice(v));
  if (k === 'SIZE' || k === 'BALCONY' || k === 'CELLAR') {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return (!isNaN(n) && n > 0) ? n + ' m²' : String(v);
  }
  return String(v);
};

const CustomTooltip = ({ active, payload, label, starredOffers }) => {
  if (!active || !payload?.length) return null;
  const param = label;
  const sortedPayload = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs max-w-xs">
      <div className="font-medium text-gray-700 mb-1">{param}</div>
      {sortedPayload.map(entry => {
        const offer = starredOffers.find(o => o.id === entry.dataKey);
        if (!offer) return null;
        const rawValue = getRawValue(param, offer);
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="truncate flex-1">{offer.name}</span>
            <span className="font-medium">{rawValue}</span>
          </div>
        );
      })}
    </div>
  );
};

function ZoomableChart({ children }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const lastTouchDistRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.5, Math.min(3, z * delta)));
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleDoubleClick = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Touch handlers for pinch-zoom and single-finger pan
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.stopPropagation(); // Always capture pinch — never let tab swipe handler see it
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistRef.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      if (zoomRef.current > 1) e.stopPropagation(); // Capture single-finger pan when zoomed in
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.touches[0].clientX - panRef.current.x, y: e.touches[0].clientY - panRef.current.y };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastTouchDistRef.current) {
        const scale = dist / lastTouchDistRef.current;
        setZoom(z => Math.max(0.5, Math.min(3, z * scale)));
      }
      lastTouchDistRef.current = dist;
    } else if (e.touches.length === 1 && isDraggingRef.current) {
      const newPan = {
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      };
      panRef.current = newPan;
      setPan(newPan);
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    lastTouchDistRef.current = null;
  };

  // Register non-passive touchmove so we can preventDefault on pinch and zoomed-pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.touches.length > 1 || zoomRef.current > 1) e.preventDefault();
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  // Keep panRef and zoomRef in sync with state (used by touch handlers and non-passive listener)
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center', height: '100%' }}>
        {children}
      </div>
      {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
        <div className="absolute bottom-2 left-2 text-xs text-gray-400">{Math.round(zoom * 100)}%</div>
      )}
    </div>
  );
}

// ============================================================================
// IMAGE PASTE MODAL
// ============================================================================

function ImagePasteModal({ onClose, onSave, onRemove, currentImage, isMobile }) {
  const [image, setImage] = useState(currentImage || null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteError, setPasteError] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Compress image to max 800px wide, JPEG 0.7 quality (~50-100KB)
  const compressImage = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 800;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(dataUrl); // fallback to original
      img.src = dataUrl;
    });
  };

  const loadImage = (file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await compressImage(ev.target.result);
      setImage(compressed);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) loadImage(file);
          break;
        }
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && image) { e.preventDefault(); onSave(image); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [image, onSave, onClose]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith('image/')) loadImage(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) loadImage(file);
  };

  const handleClipboardPaste = async () => {
    setPasteLoading(true);
    setPasteError(null);
    try {
      if (!navigator.clipboard?.read) {
        setPasteError(t('clipboardNotSupported'));
        return;
      }
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        const imageType = item.types.find(tp => tp.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'clipboard.jpg', { type: imageType });
          loadImage(file);
          found = true;
          break;
        }
      }
      if (!found) setPasteError(t('clipboardNoImage'));
    } catch (err) {
      if (err.name === 'NotAllowedError') setPasteError(t('clipboardDenied'));
      else setPasteError(t('clipboardError'));
    } finally {
      setPasteLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">{t('photoTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">{t('close')}</button>
        </div>
        <div className="p-4">
          {image ? (
            <div className="relative">
              <div className="w-full aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
                <img src={image} alt="" className="w-full h-full object-cover" />
              </div>
              <button onClick={() => setImage(null)} className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white">✕</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Paste from clipboard — primary action for copy-from-browser workflow */}
              <button
                onClick={handleClipboardPaste}
                disabled={pasteLoading}
                className="w-full py-3.5 rounded-xl border-2 border-green-300 bg-green-50 flex items-center justify-center gap-2 active:bg-green-100 disabled:opacity-60"
              >
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                <span className="text-sm text-green-700 font-semibold">{pasteLoading ? '…' : t('photoPasteClipboard')}</span>
              </button>
              {pasteError && <p className="text-xs text-red-500 text-center -mt-1">{pasteError}</p>}

              {isMobile ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1"
                  >
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-xs text-gray-600 font-medium">{t('photoGallery')}</span>
                  </button>
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 py-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 flex flex-col items-center justify-center gap-1"
                  >
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span className="text-xs text-blue-600 font-medium">{t('photoCamera')}</span>
                  </button>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-6 rounded-lg border-2 border-dashed cursor-pointer flex flex-col items-center justify-center ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                >
                  <p className="text-sm text-gray-600 font-medium">{t('photoPasteHint')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('photoPasteShortcut')}</p>
                </div>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        </div>
        <div className="p-3 border-t border-gray-200 flex justify-between">
          <div>{currentImage && <button onClick={onRemove} className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm">{t('remove')}</button>}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">{t('cancel')}</button>
            <button onClick={() => onSave(image)} disabled={!image} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// ADD OFFER MODAL
// ============================================================================

function AddOfferModal({ onClose, onAdd, existingOffers, palette }) {
  const [selectedColor, setSelectedColor] = useState(getNextColor(existingOffers, palette));
  const [urlInput, setUrlInput] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [extractionPhase, setExtractionPhase] = useState('input'); // 'input' | 'extracted'
  
  // Extraction result
  const [result, setResult] = useState(null); // { values, sources }
  
  // User edits (survive re-analysis)
  const [userEdits, setUserEdits] = useState({});
  
  // Hover state for source highlighting
  const [hoveredField, setHoveredField] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const textareaRef = useRef(null);
  
  const getFieldValue = (field) => {
    if (userEdits[field] !== undefined) return userEdits[field];
    if (result?.values?.[field] !== undefined) return result.values[field];
    if (SUBJECTIVE_PARAMS.includes(field)) return 5;
    return '';
  };
  
  const getDisplayValue = (field) => {
    const val = getFieldValue(field);
    if (field === 'PRICE' && val && typeof val === 'number') {
      return String(Math.round(val)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    return val;
  };
  
  const isFieldFromExtraction = (field) => {
    if (userEdits[field] !== undefined) return false;
    return result?.values?.[field] !== undefined;
  };
  
  const getFieldSource = (field) => result?.sources?.[field] || null;
  
  const handleFieldFocus = (field) => {
    if (userEdits[field] === undefined && isFieldFromExtraction(field)) {
      setUserEdits(prev => ({ ...prev, [field]: getFieldValue(field) }));
    }
  };
  
  const handleFieldChange = (field, value) => {
    setUserEdits(prev => ({ ...prev, [field]: value }));
  };
  
  const highlightInfo = useMemo(() => {
    if (!hoveredField) return null;
    return getFieldSource(hoveredField);
  }, [hoveredField, result]);
  
  const runAnalysis = () => {
    const res = parseListingTextWithSources(pasteText);
    res.values.URL = urlInput;
    setResult(res);
    setExtractionPhase('extracted');
  };

  const handleReanalyze = () => {
    setExtractionPhase('input');
    setResult(null);
    setUserEdits({});
  };
  
  const handleSubmit = () => {
    const data = {};
    
    ['PRICE', 'SIZE', 'ROOMS', 'FLOOR', 'ADDRESS', 'LOCATION', 'BALCONY', 'CELLAR', 'PARKING', 'BUILDING', 'ENERGY', 'URL'].forEach(f => {
      const val = getFieldValue(f);
      if (val !== '' && val !== null && val !== undefined) {
        data[f] = val;
      }
    });
    
    const subjective = {};
    SUBJECTIVE_PARAMS.forEach(f => {
      subjective[f] = getFieldValue(f) || 5;
    });
    
    const name = getFieldValue('name') || `Offer ${existingOffers.length + 1}`;
    onAdd({ name, data, color: selectedColor, subjectiveRatings: subjective });
  };

  const OBJECTIVE_FIELDS = [
    { key: 'PRICE', label: t('priceLabel'), unit: 'Kč', inputMode: 'numeric' },
    { key: 'SIZE', label: t('sizeLabel'), unit: 'm²', inputMode: 'decimal' },
    { key: 'ROOMS', label: t('roomsLabel') },
    { key: 'FLOOR', label: t('floorLabel'), inputMode: 'numeric' },
    { key: 'ADDRESS', label: t('addressLabel') },
    { key: 'LOCATION', label: t('locationLabel') },
    { key: 'BALCONY', label: t('balconyLabel'), unit: 'm²', inputMode: 'decimal' },
    { key: 'CELLAR', label: t('cellarLabel'), unit: 'm²', inputMode: 'decimal' },
    { key: 'PARKING', label: t('parkingLabel') },
    { key: 'BUILDING', label: t('buildingLabel') },
    { key: 'ENERGY', label: t('energyLabel') },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl modal-max-h-90 flex flex-col">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">{t('addOfferTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-3 flex-grow overflow-y-auto">
          {/* Color picker */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('colors')}</label>
            <div className="flex gap-1.5 flex-wrap">
              {palette.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === color ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          
          {/* URL input */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('listingUrlLabel')}</label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://sreality.cz/..."
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>

          {/* Listing text */}
          <div className={`mb-3 ${extractionPhase === 'extracted' ? 'pb-3 border-b border-gray-200' : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">{t('listingTextLabel')}</label>
              {extractionPhase === 'extracted' && (
                <button onClick={handleReanalyze} className="text-xs text-blue-600 hover:text-blue-700">{t('editTextButton')}</button>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={pasteText}
              onChange={(e) => extractionPhase === 'input' && setPasteText(e.target.value)}
              readOnly={extractionPhase === 'extracted'}
              placeholder={t('listingTextPlaceholder')}
              className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none ${extractionPhase === 'extracted' ? 'h-20 bg-gray-50 text-gray-600' : 'h-32'}`}
            />

            {extractionPhase === 'input' && (
              <button
                onClick={runAnalysis}
                disabled={!pasteText.trim()}
                className="w-full mt-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {t('analyzeButton')}
              </button>
            )}
          </div>

          {/* Extracted data form */}
          {extractionPhase === 'extracted' && (
            <div className="space-y-4" onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}>
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('nameLabel')}</label>
                <input
                  value={getFieldValue('name')}
                  onFocus={() => handleFieldFocus('name')}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  onMouseEnter={() => setHoveredField('name')}
                  onMouseLeave={() => setHoveredField(null)}
                  placeholder="e.g. Veletržní 3+kk"
                  className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm ${isFieldFromExtraction('name') ? 'text-blue-600' : 'text-gray-900'}`}
                />
              </div>
              
              {/* Objective fields */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('propertyDataSection')}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {OBJECTIVE_FIELDS.map(({ key, label, unit, inputMode }) => (
                    <div key={key}>
                      <label className="block text-[10px] text-gray-500 mb-0.5">
                        {label}{unit && <span className="text-gray-400 ml-1">({unit})</span>}
                      </label>
                      <input
                        value={getDisplayValue(key)}
                        onFocus={() => handleFieldFocus(key)}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                        onMouseEnter={() => setHoveredField(key)}
                        onMouseLeave={() => setHoveredField(null)}
                        inputMode={inputMode}
                        className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm ${isFieldFromExtraction(key) ? 'text-blue-600' : 'text-gray-900'}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Subjective ratings */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('ratingsSection')}</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {SUBJECTIVE_PARAMS.map(param => {
                    const value = getFieldValue(param);
                    const isExtracted = isFieldFromExtraction(param);
                    return (
                      <div key={param}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className={isExtracted ? 'text-blue-600' : 'text-gray-700'}>{param}</span>
                          <span className={`font-medium ${isExtracted ? 'text-blue-600' : 'text-gray-900'}`}>{value}</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.5"
                          value={value}
                          onChange={(e) => {
                            const newVal = parseFloat(e.target.value);
                            if (userEdits[param] === undefined) {
                              setUserEdits(prev => ({ ...prev, [param]: newVal }));
                            } else {
                              handleFieldChange(param, newVal);
                            }
                          }}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Cursor-following source tooltip */}
              {hoveredField && highlightInfo && (
                <div
                  className="fixed z-[9999] px-2 py-1 bg-blue-600 text-white text-xs rounded shadow-lg pointer-events-none max-w-xs truncate"
                  style={{ left: mousePos.x + 10, top: mousePos.y + 10 }}
                >
                  "{highlightInfo.text}"
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">{t('cancel')}</button>
          <button
            onClick={handleSubmit}
            disabled={extractionPhase === 'input'}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {t('addOfferButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EDIT OFFER MODAL
// ============================================================================

function EditOfferModal({ offer, onClose, onSave, palette }) {
  const [name, setName] = useState(offer.name || '');
  const [selectedColor, setSelectedColor] = useState(offer.color || palette[0]);
  const [formData, setFormData] = useState(offer.data || {});

  const handleSubmit = () => onSave({ name, data: formData, color: selectedColor });
  const inputClass = "w-full px-2 py-1.5 border border-gray-300 rounded text-sm";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-xl modal-max-h-85 flex flex-col">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">{t('editOfferTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-3 flex-grow overflow-y-auto space-y-3">
          <div><label className={labelClass}>{t('nameLabel')}</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></div>
          <div>
            <label className={labelClass}>{t('colors')}</label>
            <div className="flex gap-1 flex-wrap">
              {palette.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === color ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>{t('priceLabel')}</label><input inputMode="numeric" value={formData.PRICE || ''} onChange={(e) => setFormData(p => ({ ...p, PRICE: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('sizeLabel')}</label><input inputMode="decimal" value={formData.SIZE || ''} onChange={(e) => setFormData(p => ({ ...p, SIZE: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('roomsLabel')}</label><input value={formData.ROOMS || ''} onChange={(e) => setFormData(p => ({ ...p, ROOMS: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('floorLabel')}</label><input inputMode="numeric" value={formData.FLOOR || ''} onChange={(e) => setFormData(p => ({ ...p, FLOOR: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('balconyLabel')}</label><input inputMode="decimal" value={formData.BALCONY || ''} onChange={(e) => setFormData(p => ({ ...p, BALCONY: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('cellarLabel')}</label><input inputMode="decimal" value={formData.CELLAR || ''} onChange={(e) => setFormData(p => ({ ...p, CELLAR: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('parkingLabel')}</label><input value={formData.PARKING || ''} onChange={(e) => setFormData(p => ({ ...p, PARKING: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('buildingLabel')}</label><input value={formData.BUILDING || ''} onChange={(e) => setFormData(p => ({ ...p, BUILDING: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>{t('energyLabel')}</label><input value={formData.ENERGY || ''} onChange={(e) => setFormData(p => ({ ...p, ENERGY: e.target.value }))} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>{t('addressLabel')}</label><input value={formData.ADDRESS || ''} onChange={(e) => setFormData(p => ({ ...p, ADDRESS: e.target.value }))} className={inputClass} /></div>
          <div><label className={labelClass}>{t('locationLabel')}</label><input value={formData.LOCATION || ''} onChange={(e) => setFormData(p => ({ ...p, LOCATION: e.target.value }))} className={inputClass} /></div>
          <div><label className={labelClass}>{t('urlLabel')}</label><input type="url" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={formData.URL || ''} onChange={(e) => setFormData(p => ({ ...p, URL: e.target.value }))} className={inputClass} /></div>
        </div>
        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">{t('cancel')}</button>
          <button onClick={handleSubmit} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">{t('save')}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EMAIL MODAL
// ============================================================================

function EmailModal({ offer, onClose }) {
  const subject = `Zájem o byt - ${offer.data?.ADDRESS || offer.name}`;
  const body = `Dobrý den,\n\nrád/a bych se zeptal/a na dostupnost bytu ${offer.data?.ADDRESS || offer.name}.\n\nMám zájem o prohlídku.\n\nS pozdravem`;
  const copyToClipboard = () => navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">{t('emailTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-3">
          <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
            <p className="font-medium text-gray-700 mb-1">Subject:</p>
            <p className="mb-2 text-xs">{subject}</p>
            <p className="font-medium text-gray-700 mb-1">Body:</p>
            <p className="whitespace-pre-line text-xs">{body}</p>
          </div>
          <button onClick={copyToClipboard} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm">{t('copyToClipboard')}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PALETTE EDITOR
// ============================================================================

function PaletteEditor({ palette, onSave, onClose }) {
  const [colors, setColors] = useState([...palette]);

  const updateColor = (i, hex) => {
    setColors(prev => prev.map((c, j) => j === i ? hex : c));
  };

  const removeColor = (i) => {
    if (colors.length <= 3) return;
    setColors(prev => prev.filter((_, j) => j !== i));
  };

  const addColor = () => {
    if (colors.length >= 16) return;
    // Pick a hue far from existing
    const randomHex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    setColors(prev => [...prev, randomHex]);
  };

  const regenerate = () => {
    setColors(generatePalette(colors.length));
  };

  const resetDefault = () => {
    setColors([...DEFAULT_PALETTE]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">{t('paletteTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-5 gap-3 mb-4">
            {colors.map((color, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <label className="relative cursor-pointer group">
                  <div
                    className="w-10 h-10 rounded-lg shadow-sm border border-gray-200 group-hover:scale-105 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => updateColor(i, e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  {colors.length > 3 && (
                    <button
                      onClick={(e) => { e.preventDefault(); removeColor(i); }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      ×
                    </button>
                  )}
                </label>
                <span className="text-[9px] text-gray-400 font-mono">{color}</span>
              </div>
            ))}
            {colors.length < 16 && (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={addColor}
                  className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  +
                </button>
                <span className="text-[9px] text-transparent">.</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={regenerate} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors">
              {t('regenerate')}
            </button>
            <button onClick={resetDefault} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors">
              {t('resetDefault')}
            </button>
          </div>

          {/* Preview strip */}
          <div className="flex rounded-lg overflow-hidden h-3 mb-4">
            {colors.map((c, i) => (
              <div key={i} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">{t('cancel')}</button>
          <button onClick={() => onSave(colors)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">{t('save')}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FlatOfferAnalyzer() {
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'detail' | 'chart'
  const [offers, setOffers] = useState([]);

  // Language toggle — syncs module-level _lang so t() works in all render paths
  const [lang, setLang] = useState(_lang);
  const handleLangToggle = useCallback(() => {
    const next = _lang === 'cs' ? 'en' : 'cs';
    _lang = next;
    localStorage.setItem('flatAnalyzerLang', next);
    setLang(next);
  }, []);

  // Field labels computed from current language
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fieldLabels = {
    PRICE: t('fieldPrice'), SIZE: t('fieldSize'), ROOMS: t('fieldRooms'),
    FLOOR: t('fieldFloor'), ADDRESS: t('fieldAddress'), LOCATION: t('fieldLocation'),
    BALCONY: t('fieldBalcony'), CELLAR: t('fieldCellar'), PARKING: t('fieldParking'),
    BUILDING: t('fieldBuilding'), ENERGY: t('fieldEnergy'),
  };
  const [parameterRanges, setParameterRanges] = useState(DEFAULT_PARAM_RANGES);
  const [currentOfferId, setCurrentOfferId] = useState(null);
  const [hoveredOfferId, setHoveredOfferId] = useState(null);
  const [sortCriterion, setSortCriterion] = useState('graphScore');
  const [groupCriterion, setGroupCriterion] = useState('none');
  const [modal, setModal] = useState(null);
  const [editingOffer, setEditingOffer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [imagePasteTarget, setImagePasteTarget] = useState(null);
  const [showRangePopup, setShowRangePopup] = useState(false);
  const [soldCollapsed, setSoldCollapsed] = useState(true);
  const [showSoldInGraph, setShowSoldInGraph] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [enabledParams, setEnabledParams] = useState(DEFAULT_ENABLED_PARAMS);
  const [palette, setPalette] = useState([...DEFAULT_PALETTE]);
  const fileInputRef = useRef(null);
  
  // Resizable panels
  const [listWidth, setListWidth] = useState(400);
  const [detailWidth, setDetailWidth] = useState(400);
  const [isResizingList, setIsResizingList] = useState(false);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const containerRef = useRef(null);

  // Firebase sync state
  const [roomId, setRoomId] = useState(null);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [syncStatus, setSyncStatus] = useState('disconnected'); // 'disconnected' | 'connected' | 'error'
  const remoteUpdateRef = useRef(false);
  const [joinCode, setJoinCode] = useState('');

  // Handle panel resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      if (isResizingList) {
        const newWidth = Math.max(180, Math.min(400, e.clientX - rect.left));
        setListWidth(newWidth);
      } else if (isResizingDetail) {
        const newWidth = Math.max(180, Math.min(400, e.clientX - rect.left - listWidth - 4));
        setDetailWidth(newWidth);
      }
    };
    
    const handleMouseUp = () => {
      setIsResizingList(false);
      setIsResizingDetail(false);
    };
    
    if (isResizingList || isResizingDetail) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingList, isResizingDetail, listWidth]);

  // Load from localStorage on mount + init Firebase
  useEffect(() => {
    const stored = loadFromStorage();
    console.log('[FA] stored:', stored?.offers?.length, 'offers');
    if (stored) {
      setOffers(stored.offers);
      setParameterRanges(stored.parameterRanges);
      if (stored.palette) setPalette(stored.palette);
    }
    // Init Firebase and check URL for room
    const db = initFirebase();
    console.log('[FA] firebase init:', db ? 'ok' : 'FAILED');
    if (db) {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      console.log('[FA] room from URL:', room);
      if (room) setRoomId(room);
    }
  }, []);

  // Subscribe to Firebase room
  useEffect(() => {
    console.log('[FA] room effect, roomId:', roomId);
    if (!roomId) {
      setSyncStatus('disconnected');
      // Remove room from URL
      const url = new URL(window.location);
      if (url.searchParams.has('room')) {
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url);
      }
      return;
    }

    setSyncStatus('connected');

    // Put room in URL so it's shareable
    const url = new URL(window.location);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url);

    const unsub = subscribeToRoom(roomId, (data) => {
      console.log('[FA] firebase data received:', data ? Object.keys(data) : 'null', 'offers:', data?.offers ? (Array.isArray(data.offers) ? data.offers.length : Object.keys(data.offers).length) : 0);
      remoteUpdateRef.current = true;
      if (data.offers) {
        // Firebase may return arrays as objects with numeric keys
        const offersArr = Array.isArray(data.offers) ? data.offers : Object.values(data.offers);
        setOffers(offersArr.filter(Boolean).map(o => ({
          ...o,
          subjectiveRatings: normalizeSubjectiveRatings(o.subjectiveRatings)
        })));
      }
      if (data.meta?.parameterRanges) {
        const RANGE_MIGRATION = { 'Price': 'Low price', 'Price per m²': 'Low price per m²', 'Size': 'Interior area' };
        const migrated = {};
        for (const [k, v] of Object.entries(data.meta.parameterRanges)) {
          migrated[RANGE_MIGRATION[k] || k] = v;
        }
        setParameterRanges({ ...DEFAULT_PARAM_RANGES, ...migrated });
      }
      if (data.meta?.palette) {
        setPalette(data.meta.palette);
      }
      setTimeout(() => { remoteUpdateRef.current = false; }, 300);
    });

    // Push current data to Firebase only if we have local data (new room creation)
    if (offers.length > 0) {
      writeRoom(roomId, offers, parameterRanges, palette);
    }

    return unsub;
  }, [roomId]);

  // Sync local changes to Firebase (debounced)
  useEffect(() => {
    if (!roomId || remoteUpdateRef.current) return;
    const timer = setTimeout(() => {
      if (!remoteUpdateRef.current) {
        writeRoom(roomId, offers, parameterRanges, palette);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [offers, parameterRanges, palette, roomId]);

  // Always save to localStorage as fallback
  useEffect(() => {
    if (offers.length) saveToStorage(offers, parameterRanges, palette);
  }, [offers, parameterRanges, palette]);

  // Sync actions
  const handleCreateRoom = useCallback(() => {
    const code = generateRoomCode();
    setRoomId(code);
    setShowSyncPanel(false);
  }, []);

  const handleJoinRoom = useCallback(() => {
    const code = joinCode.trim().toLowerCase();
    if (code.length >= 4) {
      setRoomId(code);
      setShowSyncPanel(false);
      setJoinCode('');
    }
  }, [joinCode]);

  const handleDisconnect = useCallback(() => {
    setRoomId(null);
    setShowSyncPanel(false);
  }, []);

  const currentOffer = useMemo(() => offers.find(o => o.id === currentOfferId), [offers, currentOfferId]);
  const starredOffers = useMemo(() => offers.filter(o => o.featured && (showSoldInGraph || !o.sold)), [offers, showSoldInGraph]);

  const chartData = useMemo(() => {
    return ALL_PARAMS.filter(p => enabledParams[p]).map(param => {
      const point = { param };
      starredOffers.forEach(offer => {
        point[offer.id] = OBJECTIVE_PARAMS.includes(param)
          ? getNormalizedValue(param, offer, parameterRanges)
          : (offer.subjectiveRatings?.[param] ?? 5);
      });
      return point;
    });
  }, [starredOffers, enabledParams, parameterRanges]);

  const processedOffers = useMemo(() => {
    const activeOffers = offers.filter(o => !o.sold);
    const soldOffers = offers.filter(o => o.sold);
    let sorted = [...activeOffers];
    
    if (sortCriterion === 'price') sorted.sort((a, b) => (parsePrice(a.data?.PRICE) || 0) - (parsePrice(b.data?.PRICE) || 0));
    else if (sortCriterion === 'size') sorted.sort((a, b) => (parseSize(b.data?.SIZE) || 0) - (parseSize(a.data?.SIZE) || 0));
    else if (sortCriterion === 'pricePerSqm') {
      sorted.sort((a, b) => {
        const aR = (parsePrice(a.data?.PRICE) && parseSize(a.data?.SIZE)) ? parsePrice(a.data.PRICE) / parseSize(a.data.SIZE) : Infinity;
        const bR = (parsePrice(b.data?.PRICE) && parseSize(b.data?.SIZE)) ? parsePrice(b.data.PRICE) / parseSize(b.data.SIZE) : Infinity;
        return aR - bR;
      });
    } else if (sortCriterion === 'name') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortCriterion === 'graphScore') {
      const getScore = (offer) => ALL_PARAMS.filter(p => enabledParams[p]).reduce((sum, param) => {
        return sum + (OBJECTIVE_PARAMS.includes(param)
          ? getNormalizedValue(param, offer, parameterRanges)
          : (offer.subjectiveRatings?.[param] ?? 5));
      }, 0);
      sorted.sort((a, b) => getScore(b) - getScore(a));
    }
    else sorted.sort((a, b) => (a.manualOrder || 0) - (b.manualOrder || 0));

    let groups = [];
    if (groupCriterion === 'none') {
      groups = [{ key: 'all', label: null, offers: sorted }];
    } else {
      const groupMap = {};
      sorted.forEach(o => {
        const k = groupCriterion === 'location' ? (o.data?.LOCATION || 'Unknown') : (o.data?.RENOVATION || 'Unknown');
        if (!groupMap[k]) groupMap[k] = [];
        groupMap[k].push(o);
      });
      groups = Object.entries(groupMap).map(([k, os]) => ({ key: k, label: k, offers: os }));
    }

    if (soldOffers.length > 0) {
      groups.push({ key: 'sold', label: 'Sold', offers: soldOffers, isSold: true });
    }
    return groups;
  }, [offers, sortCriterion, groupCriterion, enabledParams, parameterRanges]);

  // Actions
  const addOffer = useCallback((data) => {
    const newOffer = {
      id: generateId(),
      name: data.name,
      color: data.color || getNextColor(offers, palette),
      data: data.data,
      subjectiveRatings: data.subjectiveRatings || calculateSubjectiveRatings(data.data),
      notes: '',
      featured: true,
      manualOrder: offers.length,
      image: null,
      sold: false,
    };
    setOffers(prev => [...prev, newOffer]);
    setCurrentOfferId(newOffer.id);
    setModal(null);
  }, [offers, palette]);

  const updateOffer = useCallback((id, updates) => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  }, []);

  const toggleStar = useCallback((id) => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, featured: !o.featured } : o));
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      setOffers(prev => prev.filter(o => o.id !== deleteTarget.id));
      if (currentOfferId === deleteTarget.id) setCurrentOfferId(null);
      setDeleteTarget(null);
    }
  }, [deleteTarget, currentOfferId]);

  const moveOffer = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setOffers(prev => {
      const newOffers = [...prev];
      const fromIndex = newOffers.findIndex(o => o.id === fromId);
      const toIndex = newOffers.findIndex(o => o.id === toId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = newOffers.splice(fromIndex, 1);
      newOffers.splice(toIndex, 0, moved);
      return newOffers.map((o, i) => ({ ...o, manualOrder: i }));
    });
    setSortCriterion('manual');
  }, []);

  const loadDemoData = useCallback(() => {
    const demo = loadDemoOffers();
    setOffers(demo.offers);
    setParameterRanges(demo.parameterRanges);
  }, []);

  const autoRanges = useCallback(() => {
    const activeOffers = offers.filter(o => o.featured && !o.sold);
    if (activeOffers.length < 2) return;
    const newRanges = { ...parameterRanges };
    OBJECTIVE_PARAMS.forEach(param => {
      const range = parameterRanges[param];
      if (range?.type === 'discrete') return;
      const vals = activeOffers.map(o => {
        if (param === 'Low price') return parsePrice(o.data?.PRICE) || 0;
        if (param === 'Low price per m²') { const p = parsePrice(o.data?.PRICE); const s = parseSize(o.data?.SIZE); return (p && s) ? p / s : 0; }
        if (param === 'Interior area') return parseSize(o.data?.SIZE) || 0;
        if (param === 'Rooms') { const m = String(o.data?.ROOMS || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; }
        if (param === 'Cellar') { const c = o.data?.CELLAR; if (c == null) return 0; if (typeof c === 'number') return c; const s = String(c); if (s.toLowerCase() === 'no' || s.toLowerCase() === 'none') return 0; const m = s.match(/(\d+([.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : 0; }
        if (param === 'Balcony/Loggia') { const b = o.data?.BALCONY; if (b == null) return 0; if (typeof b === 'number') return b; const s = String(b); if (s.toLowerCase() === 'no' || s.toLowerCase() === 'none') return 0; const m = s.match(/(\d+([.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : 0; }
        return 0;
      }).filter(v => v > 0);
      if (vals.length < 2) return;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const pad = (max - min) * 0.1 || max * 0.05;
      newRanges[param] = { ...range, min: Math.floor(min - pad), max: Math.ceil(max + pad) };
    });
    setParameterRanges(newRanges);
  }, [offers, parameterRanges]);

  const exportData = useCallback(() => {
    try {
      const d = JSON.stringify({ offers, meta: { parameterRanges } }, null, 2);
      const b = new Blob([d], { type: 'application/json' });
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u;
      a.download = `flat_comparison_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(u), 100);
    } catch (err) {
      navigator.clipboard.writeText(JSON.stringify({ offers, meta: { parameterRanges } }, null, 2));
      alert('Copied to clipboard');
    }
  }, [offers, parameterRanges]);

  const importData = useCallback((file) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const d = JSON.parse(e.target.result);
        if (d.offers && Array.isArray(d.offers)) {
          const normalizedOffers = d.offers.map(o => ({ 
            ...o, 
            subjectiveRatings: normalizeSubjectiveRatings(o.subjectiveRatings) 
          }));
          const ranges = d.meta?.parameterRanges ? { ...DEFAULT_PARAM_RANGES, ...d.meta.parameterRanges } : null;
          
          // If we have existing offers, ask what to do
          if (offers.length > 0) {
            setPendingImport({ offers: normalizedOffers, parameterRanges: ranges, count: normalizedOffers.length });
          } else {
            // No existing offers, just import directly
            setOffers(normalizedOffers);
            if (ranges) setParameterRanges(ranges);
          }
        } else {
          alert('Invalid file: no offers found');
        }
      } catch (err) { 
        console.error(err);
        alert('Invalid JSON file');
      }
    };
    r.readAsText(file);
  }, [offers.length]);

  const handleImportDecision = useCallback((mode) => {
    if (!pendingImport) return;
    
    if (mode === 'replace') {
      setOffers(pendingImport.offers);
      if (pendingImport.parameterRanges) setParameterRanges(pendingImport.parameterRanges);
    } else if (mode === 'extend') {
      // Add new offers with new IDs and colors to avoid conflicts
      const newOffers = pendingImport.offers.map(o => ({
        ...o,
        id: generateId(),
        color: getNextColor([...offers, ...pendingImport.offers.slice(0, pendingImport.offers.indexOf(o))], palette),
        manualOrder: offers.length + pendingImport.offers.indexOf(o)
      }));
      setOffers(prev => [...prev, ...newOffers]);
    }
    setPendingImport(null);
  }, [pendingImport, offers, palette]);

  // File drag & drop handlers
  const handleFileDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if we're leaving the container entirely
    if (e.currentTarget === e.target) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    
    const file = e.dataTransfer?.files?.[0];
    if (file && file.name.endsWith('.json')) {
      importData(file);
    }
  }, [importData]);

  // Sync UI
  const renderSyncButton = () => {
    const fbConfigured = isFirebaseConfigured();
    
    return (
      <div className="relative">
        <button
          onClick={() => setShowSyncPanel(!showSyncPanel)}
          className={`p-1.5 rounded-lg transition-colors ${roomId ? 'text-green-600 hover:bg-green-50' : 'text-gray-500 hover:bg-gray-100'}`}
          title={roomId ? `Synced: ${roomId}` : 'Sync'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {roomId && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />}
        </button>
        
        {showSyncPanel && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50 p-3">
            {!fbConfigured ? (
              <div className="text-xs text-gray-600">
                <p className="font-medium mb-1">Sync not configured</p>
                <p>Add your Firebase config to <code className="bg-gray-100 px-1 rounded">src/firebase.js</code> to enable real-time sync across devices.</p>
              </div>
            ) : roomId ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-xs font-medium text-green-700">{t('syncConnected')}</span>
                </div>
                <div className="flex items-center gap-1 mb-3">
                  <code className="flex-1 bg-gray-100 px-2 py-1.5 rounded text-sm font-mono tracking-wider text-center">{roomId}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                    className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium text-gray-700 whitespace-nowrap"
                  >
                    {t('syncCopyLink')}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">{t('syncSharedHint')}</p>
                <button onClick={handleDisconnect} className="w-full py-1.5 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200">{t('syncDisconnect')}</button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-600 mb-3">{t('syncOffersHint')}</p>
                <button onClick={handleCreateRoom} className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 mb-2">
                  {t('syncCreateRoom')}
                </button>
                <div className="flex gap-1">
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                    placeholder={t('syncRoomCodePlaceholder')}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs font-mono"
                  />
                  <button onClick={handleJoinRoom} disabled={joinCode.trim().length < 4} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium disabled:opacity-50">{t('syncJoin')}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render offer item
  const renderOfferItem = (offer, inSoldSection = false) => {
    const isSelected = offer.id === currentOfferId;
    const isHovered = offer.id === hoveredOfferId;
    return (
      <div
        key={offer.id}
        draggable={groupCriterion === 'none' && !inSoldSection}
        onDragStart={() => setDraggedId(offer.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => { moveOffer(draggedId, offer.id); setDraggedId(null); }}
        onClick={() => { setCurrentOfferId(offer.id); if (isMobile) setMobileView('detail'); }}
        onMouseEnter={() => setHoveredOfferId(offer.id)}
        onMouseLeave={() => setHoveredOfferId(null)}
        className={`rounded-lg cursor-pointer border-2 transition-colors flex overflow-hidden ${isSelected ? 'border-blue-500 bg-blue-50' : isHovered ? 'border-blue-300 bg-gray-50' : 'border-transparent hover:bg-gray-100'} ${offer.sold ? 'opacity-60' : ''}`}
      >
        {/* Color slab on left edge */}
        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: offer.color }} />
        
        <div className="flex items-center gap-2 p-2 flex-grow min-w-0">
          {offer.image && (
            <div className="relative w-14 h-10 flex-shrink-0">
              <img 
                src={offer.image} 
                alt="" 
                className={`absolute top-0 left-0 w-14 h-10 object-cover rounded transition-transform duration-200 origin-left ${isHovered ? 'scale-150 z-50 shadow-lg' : ''}`}
              />
            </div>
          )}
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`font-medium text-sm truncate ${offer.sold ? 'line-through text-gray-500' : ''}`}>{offer.name}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5 truncate">{formatPrice(parsePrice(offer.data?.PRICE))} · {offer.data?.SIZE || 'N/A'}</div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {offer.data?.URL && (
              isMobile ? (
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(offer.data.URL, '_blank'); }}
                  className="p-2 text-blue-500"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </button>
              ) : (
                <LinkTooltip url={offer.data.URL}>
                  <button
                    onClick={(e) => { e.stopPropagation(); window.open(offer.data.URL, '_blank'); }}
                    className="p-1 text-blue-500 hover:text-blue-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </button>
                </LinkTooltip>
              )
            )}
            <button onClick={(e) => { e.stopPropagation(); toggleStar(offer.id); if (navigator.vibrate) navigator.vibrate(10); }} className={`${isMobile ? 'p-2' : 'p-1'} ${offer.featured ? 'text-yellow-500' : 'text-gray-300 hover:text-gray-400'}`}>
              <svg className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(offer); }} className={`${isMobile ? 'p-2' : 'p-1'} text-gray-400 hover:text-red-500`}>
              <svg className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===================== MOBILE LAYOUT =====================

  // 3-panel slider: direction-locking gesture state machine
  const TAB_ORDER = ['list', 'detail', 'chart'];
  const tabContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const gestureRef = useRef({ state: 'idle', startX: 0, startY: 0, startTime: 0, startTabIdx: 0 });
  // mobileViewRef lets gesture handlers always see current tab without being in their deps
  const mobileViewRef = useRef(mobileView);
  // prevMobileViewRef lets the mobileView-change effect skip when gesture already handled animation
  const prevMobileViewRef = useRef(mobileView);

  // Keep mobileViewRef current
  useEffect(() => { mobileViewRef.current = mobileView; }, [mobileView]);

  // When mobileView changes via button/tap (not gesture), animate slider to new position
  useEffect(() => {
    if (!sliderRef.current) return;
    if (prevMobileViewRef.current === mobileView) return;
    prevMobileViewRef.current = mobileView;
    const newIdx = TAB_ORDER.indexOf(mobileView);
    sliderRef.current.style.transition = 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    sliderRef.current.style.transform = `translateX(${-(newIdx * 100 / 3)}%)`;
    const timer = setTimeout(() => { if (sliderRef.current) sliderRef.current.style.transition = 'none'; }, 310);
    return () => clearTimeout(timer);
  }, [mobileView]);

  // Gesture handler: attach once, use mobileViewRef for current tab
  useEffect(() => {
    const container = tabContainerRef.current;
    const slider = sliderRef.current;
    if (!container || !slider) return;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      gestureRef.current = {
        state: 'undecided',
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTime: Date.now(),
        startTabIdx: TAB_ORDER.indexOf(mobileViewRef.current),
      };
      slider.style.transition = 'none';
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (g.state === 'idle' || g.state === 'vertical') return;
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      if (g.state === 'undecided') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // wait for 10px threshold
        g.state = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
        if (g.state === 'vertical') return; // let native scroll take over
      }
      // Horizontal swipe locked — prevent scroll and move slider
      e.preventDefault();
      const { startTabIdx } = g;
      const atLeftEdge = startTabIdx === 0 && dx > 0;
      const atRightEdge = startTabIdx === TAB_ORDER.length - 1 && dx < 0;
      const offset = (atLeftEdge || atRightEdge) ? dx * 0.3 : dx; // rubber-band at edges
      slider.style.transform = `translateX(calc(${-(startTabIdx * 100 / 3)}% + ${offset}px))`;
    };

    const onTouchEnd = (e) => {
      const g = gestureRef.current;
      if (g.state !== 'horizontal') { g.state = 'idle'; return; }
      g.state = 'idle';
      const dx = e.changedTouches[0].clientX - g.startX;
      const dt = Math.max(1, Date.now() - g.startTime);
      const velocity = Math.abs(dx) / dt; // px/ms
      const containerWidth = container.offsetWidth || 375;
      const { startTabIdx } = g;
      let newIdx = startTabIdx;
      if (velocity > 0.5 || Math.abs(dx) > Math.min(50, containerWidth * 0.2)) {
        if (dx < 0 && startTabIdx < TAB_ORDER.length - 1) newIdx = startTabIdx + 1;
        if (dx > 0 && startTabIdx > 0) newIdx = startTabIdx - 1;
      }
      // Animate snap to final position
      slider.style.transition = 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      slider.style.transform = `translateX(${-(newIdx * 100 / 3)}%)`;
      setTimeout(() => { if (slider) slider.style.transition = 'none'; }, 310);
      // Sync React state; pre-update prevMobileViewRef so the mobileView effect skips re-animating
      prevMobileViewRef.current = TAB_ORDER[newIdx];
      setMobileView(TAB_ORDER[newIdx]);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobile]); // Re-run when mobile layout mounts/unmounts so refs are populated

  if (isMobile) {
    const MobileTabButton = ({ view, label, icon }) => (
      <button
        onClick={() => setMobileView(view)}
        className={`flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors ${mobileView === view ? 'text-blue-600' : 'text-gray-500'}`}
      >
        <span className="text-base mb-0.5">{icon}</span>
        <span>{label}</span>
      </button>
    );

    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        {/* Mobile Header */}
        <header className="bg-white shadow-sm px-3 py-2 flex items-center justify-between flex-shrink-0 z-10 safe-top">
          <h1 className="text-base font-semibold text-gray-900">Flat Analyzer</h1>
          <div className="flex items-center gap-1">
            {offers.length === 0 && <button onClick={loadDemoData} className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded text-xs">{t('demo')}</button>}
            <button onClick={handleLangToggle} className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded text-xs font-mono">{t('langToggle')}</button>
            {renderSyncButton()}
            <button onClick={() => setModal('add')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium text-xs">{t('addOffer')}</button>
          </div>
        </header>

        {/* Mobile Content — 3-panel slider; gesture handler attached via ref in useEffect above */}
        <div ref={tabContainerRef} className="flex-grow overflow-hidden relative">
          {/* Slider: width=300% so each panel occupies 1/3, translateX moves between them */}
          <div ref={sliderRef} style={{ display: 'flex', width: '300%', height: '100%', transform: 'translateX(0%)', transition: 'none', willChange: 'transform' }}>

            {/* PANEL 0: LIST */}
            <div style={{ width: '33.333%', flexShrink: 0, height: '100%', overflow: 'hidden' }} className="flex flex-col">
              <div className="p-2 bg-white border-b border-gray-200 flex gap-1 items-center">
                <select value={sortCriterion} onChange={(e) => setSortCriterion(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-1 py-2 bg-white">
                  <option value="graphScore">{t('sortGraphScore')}</option>
                  <option value="manual">{t('sortManual')}</option>
                  <option value="price">{t('sortPrice')}</option>
                  <option value="size">{t('sortSize')}</option>
                  <option value="pricePerSqm">{t('sortPricePerSqm')}</option>
                  <option value="name">{t('sortName')}</option>
                </select>
                <select value={groupCriterion} onChange={(e) => setGroupCriterion(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-1 py-2 bg-white">
                  <option value="none">{t('groupNone')}</option>
                  <option value="location">{t('groupLocation')}</option>
                  <option value="renovation">{t('groupRenovation')}</option>
                </select>
                <button onClick={() => setModal('palette')} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg flex-shrink-0" title="Colors">
                  <div className="w-4 h-4 rounded-full" style={{ background: `conic-gradient(${palette.slice(0, 4).map((c, i) => `${c} ${i * 25}% ${(i + 1) * 25}%`).join(', ')})` }} />
                </button>
              </div>
              <div className="flex-grow overflow-y-auto p-2 space-y-1">
                {offers.length === 0 ? (
                  <div className="text-center text-gray-400 py-12 text-sm"><p>{t('noOffers')}</p><p className="text-xs mt-1">{t('noOffersTip')}</p></div>
                ) : processedOffers.map(g => (
                  <div key={g.key}>
                    {g.isSold ? (
                      <div className="mt-2">
                        <button onClick={() => setSoldCollapsed(!soldCollapsed)} className="flex items-center gap-1 text-xs text-gray-500 py-1 px-2">
                          <span>{soldCollapsed ? '▸' : '▾'}</span><span>{t('soldSection')} ({g.offers.length})</span>
                        </button>
                        {!soldCollapsed && g.offers.map(o => renderOfferItem(o, true))}
                      </div>
                    ) : (
                      <>
                        {g.label && <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase mt-1">{g.label}</div>}
                        {g.offers.map(o => renderOfferItem(o, false))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* PANEL 1: DETAIL */}
            <div style={{ width: '33.333%', flexShrink: 0, height: '100%', overflowY: 'auto' }} className="bg-white">
              {currentOffer ? (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: currentOffer.color }} />
                    <h2 className="font-semibold text-lg truncate flex-grow">{currentOffer.name}</h2>
                    <button onClick={() => setMobileView('list')} className="text-blue-500 text-sm flex-shrink-0 px-1">{t('backToList')}</button>
                  </div>

                  {currentOffer.image && (
                    <div className="w-full aspect-[16/9] mb-3 overflow-hidden rounded-lg" onClick={() => setImagePasteTarget(currentOffer.id)}>
                      <img src={currentOffer.image} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="space-y-1.5 text-sm mb-4">
                    {['PRICE', 'SIZE', 'ROOMS', 'FLOOR', 'ADDRESS', 'LOCATION', 'BALCONY', 'CELLAR', 'PARKING', 'BUILDING', 'ENERGY'].map(k => currentOffer.data?.[k] && (
                      <div key={k} className="flex justify-between">
                        <span className="text-gray-500">{fieldLabels[k] || k}</span>
                        <span className="font-medium truncate ml-2">{formatFieldValue(k, currentOffer.data[k])}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 flex-wrap mb-4">
                    {currentOffer.data?.URL && (
                      <a href={currentOffer.data.URL} target="_blank" rel="noopener noreferrer" className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium">{t('link')}</a>
                    )}
                    <button
                      onClick={() => { updateOffer(currentOffer.id, { sold: !currentOffer.sold }); if (navigator.vibrate) navigator.vibrate(10); }}
                      className={`px-3 py-2.5 rounded-lg text-xs font-medium ${currentOffer.sold ? 'bg-orange-500 text-white' : 'bg-orange-50 border border-orange-200 text-orange-700'}`}
                    >
                      {currentOffer.sold ? t('soldLabel') : t('markSold')}
                    </button>
                    <button onClick={() => { setEditingOffer(currentOffer); setModal('edit'); }} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">{t('edit')}</button>
                    <button onClick={() => setModal('email')} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">{t('email')}</button>
                    <button onClick={() => setImagePasteTarget(currentOffer.id)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">{t('photo')}</button>
                    <button onClick={() => { const idx = offers.findIndex(o => o.id === currentOffer.id); if (idx > 0) moveOffer(currentOffer.id, offers[idx - 1].id); }} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">↑</button>
                    <button onClick={() => { const idx = offers.findIndex(o => o.id === currentOffer.id); if (idx < offers.length - 1) moveOffer(currentOffer.id, offers[idx + 1].id); }} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">↓</button>
                  </div>

                  <textarea
                    value={currentOffer.notes || ''}
                    onChange={(e) => updateOffer(currentOffer.id, { notes: e.target.value })}
                    placeholder={t('notesPlaceholder')}
                    className="w-full p-3 text-sm border border-gray-300 rounded-lg resize-none min-h-[80px] h-20 mb-4"
                  />

                  <div className="border-t pt-3">
                    <h3 className="text-xs font-medium text-gray-700 mb-2">{t('ratingsSection')}</h3>
                    {SUBJECTIVE_PARAMS.map(param => (
                      <div key={param} className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{param}</span>
                          <span className="font-medium">{currentOffer.subjectiveRatings?.[param] ?? 5}</span>
                        </div>
                        <input type="range" min="0" max="10" step="0.5" value={currentOffer.subjectiveRatings?.[param] ?? 5} onChange={(e) => updateOffer(currentOffer.id, { subjectiveRatings: { ...currentOffer.subjectiveRatings, [param]: parseFloat(e.target.value) } })} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                  <p className="text-sm">{t('selectOffer')}</p>
                  <button onClick={() => setMobileView('list')} className="mt-2 text-blue-600 text-sm font-medium">{t('goToList')}</button>
                </div>
              )}
            </div>

            {/* PANEL 2: CHART */}
            <div style={{ width: '33.333%', flexShrink: 0, height: '100%', overflow: 'hidden' }} className="flex flex-col bg-white">
              <div className="flex items-center justify-between p-2 border-b border-gray-200">
                <div className="flex gap-1">
                  <button onClick={autoRanges} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded border border-gray-300">{t('autoButton')}</button>
                  <button onClick={() => setShowRangePopup(!showRangePopup)} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded border border-gray-300">{t('rangesButton')}</button>
                </div>
              </div>

              <div className="flex-grow relative">
                {starredOffers.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm p-8 text-center">{t('starOffersHint')}</div>
                ) : (
                  <ZoomableChart>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="60%">
                        <PolarGrid stroke="#E5E7EB" />
                        <PolarAngleAxis dataKey="param" tick={{ fill: '#6B7280', fontSize: 9 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#9CA3AF', fontSize: 8 }} />
                        {starredOffers.map(offer => {
                          const isHighlighted = offer.id === hoveredOfferId || offer.id === currentOfferId;
                          const isDimmed = (hoveredOfferId || currentOfferId) && !isHighlighted;
                          const noSelection = !hoveredOfferId && !currentOfferId;
                          return (
                            <Radar key={offer.id} name={offer.name} dataKey={offer.id} stroke={offer.color}
                              fill={offer.color}
                              fillOpacity={isHighlighted ? 0.35 : isDimmed ? 0.03 : noSelection ? 0.08 : 0.15}
                              strokeOpacity={isDimmed ? 0.3 : 1}
                              strokeWidth={isHighlighted ? 3 : noSelection ? 2.5 : 2}
                              isAnimationActive={false}
                            />
                          );
                        })}
                        <Tooltip content={<CustomTooltip starredOffers={starredOffers} />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </ZoomableChart>
                )}

                {showRangePopup && (
                  <div className="absolute top-2 right-2 left-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-medium text-sm">{t('rangesTitle')}</h3>
                      <button onClick={() => setShowRangePopup(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                    </div>
                    <div className="space-y-2">
                      {OBJECTIVE_PARAMS.filter(p => !parameterRanges[p]?.type).map(param => (
                        <div key={param} className="text-xs">
                          <div className="text-gray-600 mb-0.5">{param}</div>
                          <div className="flex gap-1">
                            <input type="number" value={parameterRanges[param]?.min ?? 0} onChange={(e) => setParameterRanges(prev => ({ ...prev, [param]: { ...prev[param], min: parseFloat(e.target.value) || 0 } }))} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" placeholder="Min" />
                            <input type="number" value={parameterRanges[param]?.max ?? 100} onChange={(e) => setParameterRanges(prev => ({ ...prev, [param]: { ...prev[param], max: parseFloat(e.target.value) || 100 } }))} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" placeholder="Max" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {starredOffers.length > 0 && (
                <div className="px-2 py-1.5 border-t border-gray-200 flex flex-wrap gap-x-3 gap-y-1">
                  {starredOffers.map(o => (
                    <span key={o.id} className="flex items-center gap-1 text-[10px] text-gray-600">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />
                      <span className="truncate">{o.name}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="p-2 border-t border-gray-200 bg-gray-50 max-h-24 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {ALL_PARAMS.map(param => (
                    <button key={param} onClick={() => setEnabledParams(prev => ({ ...prev, [param]: !prev[param] }))} className={`px-2 py-1 rounded text-[10px] ${enabledParams[param] ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-white text-gray-500 border border-gray-300'}`}>
                      {param}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>{/* end slider */}
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="bg-white border-t border-gray-200 flex flex-shrink-0 safe-bottom">
          <MobileTabButton view="list" label={t('tabList')} icon="☰" />
          <MobileTabButton view="detail" label={t('tabDetail')} icon="◉" />
          <MobileTabButton view="chart" label={t('tabChart')} icon="◈" />
        </nav>

        {/* Modals */}
        {modal === 'add' && <AddOfferModal onClose={() => setModal(null)} onAdd={addOffer} existingOffers={offers} palette={palette} />}
        {modal === 'edit' && editingOffer && <EditOfferModal offer={editingOffer} onClose={() => { setModal(null); setEditingOffer(null); }} onSave={(u) => { updateOffer(editingOffer.id, u); setModal(null); setEditingOffer(null); }} palette={palette} />}
        {modal === 'email' && currentOffer && <EmailModal offer={currentOffer} onClose={() => setModal(null)} />}
        {modal === 'palette' && (
          <PaletteEditor
            palette={palette}
            onSave={(p) => { setPalette(p); setModal(null); }}
            onClose={() => setModal(null)}
          />
        )}
        {deleteTarget && <DeleteConfirmModal offerName={deleteTarget.name} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}
        {imagePasteTarget && (
          <ImagePasteModal
            onClose={() => setImagePasteTarget(null)}
            onSave={(img) => { updateOffer(imagePasteTarget, { image: img }); setImagePasteTarget(null); }}
            onRemove={() => { updateOffer(imagePasteTarget, { image: null }); setImagePasteTarget(null); }}
            currentImage={offers.find(o => o.id === imagePasteTarget)?.image}
            isMobile={isMobile}
          />
        )}
      </div>
    );
  }

  // ===================== DESKTOP LAYOUT (untouched) =====================
  return (
    <div 
      className="h-screen flex flex-col bg-gray-200 p-1 relative"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {/* File drop overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Drop JSON file to import</h3>
            <p className="text-sm text-gray-500 mt-1">Release to import offers</p>
          </div>
        </div>
      )}

      {/* Import decision modal */}
      {pendingImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full shadow-xl p-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-center mb-1">Valid JSON found</h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              {pendingImport.count} offer{pendingImport.count !== 1 ? 's' : ''} ready to import.<br/>
              You have {offers.length} existing offer{offers.length !== 1 ? 's' : ''}.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleImportDecision('extend')}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                Add to existing ({offers.length + pendingImport.count} total)
              </button>
              <button
                onClick={() => handleImportDecision('replace')}
                className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
              >
                Replace all (keep only {pendingImport.count})
              </button>
              <button
                onClick={() => setPendingImport(null)}
                className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white rounded-lg shadow-sm p-2 mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Flat Analyzer</h1>
        <div className="flex items-center gap-1">
          {offers.length === 0 && <button onClick={loadDemoData} className="px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-xs">{t('demo')}</button>}
          <button onClick={() => setModal('add')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">{t('addOffer')}</button>
          {renderSyncButton()}
          <button onClick={handleLangToggle} className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-xs font-mono">{t('langToggle')}</button>
          <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="Import">↑</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} className="hidden" />
          <button onClick={exportData} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="Export">↓</button>
        </div>
      </header>

      {/* Main content */}
      <div ref={containerRef} className="flex-grow flex overflow-hidden">
        {/* Left: List */}
        <div style={{ width: listWidth }} className="bg-white rounded-lg shadow-sm flex flex-col flex-shrink-0">
          <div className="p-1.5 border-b border-gray-200 bg-gray-50">
            <div className="flex gap-1 items-center">
              <select
                value={sortCriterion}
                onChange={(e) => setSortCriterion(e.target.value)}
                className="flex-1 text-xs border border-gray-300 rounded px-1 py-1 bg-white"
              >
                <optgroup label="Sort">
                  <option value="graphScore">Graph score</option>
                  <option value="manual">Manual</option>
                  <option value="price">Price</option>
                  <option value="size">Interior area</option>
                  <option value="pricePerSqm">Kč/m²</option>
                  <option value="name">Name</option>
                </optgroup>
              </select>
              <select value={groupCriterion} onChange={(e) => setGroupCriterion(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-1 py-1 bg-white">
                <optgroup label="Grouping"><option value="none">None</option>
                <option value="location">Location</option>
                <option value="renovation">Reno</option>
                </optgroup>
              </select>
              <button onClick={() => setModal('palette')} className="p-1 text-gray-500 hover:bg-gray-100 rounded flex-shrink-0" title="Colors">
                <div className="w-4 h-4 rounded-full" style={{ background: `conic-gradient(${palette.slice(0, 4).map((c, i) => `${c} ${i * 25}% ${(i + 1) * 25}%`).join(', ')})` }} />
              </button>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto p-1" onClick={(e) => { if (e.target === e.currentTarget) setCurrentOfferId(null); }}>
            {offers.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">
                <p>No offers yet</p>
                <p className="text-xs mt-1">Add or import</p>
              </div>
            ) : processedOffers.map(g => (
              <div key={g.key}>
                {g.isSold ? (
                  <div className="mt-2">
                    <div className="w-full px-2 py-1.5 bg-gray-200 rounded-t-lg flex items-center justify-between">
                      <button onClick={() => setSoldCollapsed(!soldCollapsed)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                        <span className={`transition-transform ${soldCollapsed ? '' : 'rotate-90'}`}>▶</span>
                        Sold
                        <span className="bg-gray-400 text-white text-xs px-1.5 py-0.5 rounded-full">{g.offers.length}</span>
                      </button>
                      <button onClick={() => setShowSoldInGraph(!showSoldInGraph)} className={`p-1 rounded ${showSoldInGraph ? 'text-blue-600 bg-blue-100' : 'text-gray-400 hover:bg-gray-300'}`} title="Show in graph">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {showSoldInGraph ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          )}
                        </svg>
                      </button>
                    </div>
                    {!soldCollapsed && <div className="bg-gray-100 rounded-b-lg p-1">{g.offers.map(o => renderOfferItem(o, true))}</div>}
                  </div>
                ) : (
                  <>
                    {g.label && <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase mt-1">{g.label}</div>}
                    {g.offers.map(o => renderOfferItem(o, false))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Resize handle: List */}
        <div
          className="w-1 bg-gray-300 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={() => setIsResizingList(true)}
        />

        {/* Middle: Details */}
        <div style={{ width: detailWidth }} className="bg-white rounded-lg shadow-sm flex flex-shrink-0 overflow-hidden">
          {currentOffer ? (
            <>
              {/* Color slab on left edge */}
              <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: currentOffer.color }} />
              
              <div className="flex-grow overflow-y-auto p-3">
                <h2 className="font-semibold text-base truncate mb-2">{currentOffer.name}</h2>

                {currentOffer.image ? (
                  <div className="w-full aspect-[4/3] mb-3 overflow-hidden rounded-lg cursor-pointer relative group" onClick={() => setImagePasteTarget(currentOffer.id)}>
                    <img src={currentOffer.image} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs">Click to change</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-[4/3] mb-3 rounded-lg cursor-pointer bg-gray-100 hover:bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300" onClick={() => setImagePasteTarget(currentOffer.id)}>
                    <span className="text-xs text-gray-500">+ Add photo</span>
                  </div>
                )}

                <div className="space-y-1 text-sm">
                  {['PRICE', 'SIZE', 'ROOMS', 'FLOOR', 'ADDRESS', 'LOCATION', 'BALCONY', 'CELLAR', 'PARKING', 'BUILDING', 'ENERGY'].map(k => currentOffer.data?.[k] && (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500">{fieldLabels[k] || k}</span>
                      <span className="font-medium truncate ml-2">{formatFieldValue(k, currentOffer.data[k])}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  {currentOffer.data?.URL && (
                    <LinkTooltip url={currentOffer.data.URL}>
                      <a 
                        href={currentOffer.data.URL} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium hover:bg-blue-100"
                      >
                        Link
                      </a>
                    </LinkTooltip>
                  )}
                  <button onClick={() => updateOffer(currentOffer.id, { sold: !currentOffer.sold })} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${currentOffer.sold ? 'bg-orange-500 text-white' : 'bg-orange-50 border border-orange-200 text-orange-700'}`}>
                    {currentOffer.sold ? 'Sold' : 'Mark Sold'}
                  </button>
                  <button onClick={() => { setEditingOffer(currentOffer); setModal('edit'); }} className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">Edit</button>
                  <button onClick={() => setModal('email')} className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">Email</button>
                </div>

                <div className="mt-3">
                  <textarea
                    value={currentOffer.notes || ''}
                    onChange={(e) => updateOffer(currentOffer.id, { notes: e.target.value })}
                    placeholder="Notes..."
                    className="w-full p-2 text-xs border border-gray-300 rounded-lg resize-none h-16"
                  />
                </div>

                <div className="mt-3 border-t pt-3">
                  <h3 className="text-xs font-medium text-gray-700 mb-2">Ratings</h3>
                  {SUBJECTIVE_PARAMS.map(param => (
                    <div key={param} className="mb-2">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span>{param}</span>
                        <span className="font-medium">{currentOffer.subjectiveRatings?.[param] ?? 5}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={currentOffer.subjectiveRatings?.[param] ?? 5}
                        onChange={(e) => updateOffer(currentOffer.id, { subjectiveRatings: { ...currentOffer.subjectiveRatings, [param]: parseFloat(e.target.value) } })}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center text-gray-400 text-sm">Select an offer</div>
          )}
        </div>

        {/* Resize handle: Detail */}
        <div
          className="w-1 bg-gray-300 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={() => setIsResizingDetail(true)}
        />

        {/* Right: Chart */}
        <div className="flex-grow bg-white rounded-lg shadow-sm flex flex-col min-w-0">
          <div className="flex items-center justify-end p-2 border-b border-gray-200 bg-gray-50">
            <div className="flex gap-1">
              <button onClick={autoRanges} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded-lg border border-gray-300" title="Fit ranges to starred offers">Auto</button>
              <button onClick={() => setShowRangePopup(!showRangePopup)} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded-lg border border-gray-300">Ranges</button>
            </div>
          </div>

          <div className="flex-grow relative" onClick={(e) => { if (e.target === e.currentTarget) setCurrentOfferId(null); }}>
            {starredOffers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">Star offers to compare</div>
            ) : (
              <>
                <ZoomableChart>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="#E5E7EB" />
                      <PolarAngleAxis dataKey="param" tick={{ fill: '#6B7280', fontSize: 10 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#9CA3AF', fontSize: 9 }} />
                      {starredOffers.map(offer => {
                        const isHighlighted = offer.id === hoveredOfferId || offer.id === currentOfferId;
                        const isDimmed = (hoveredOfferId || currentOfferId) && !isHighlighted;
                        const noSelection = !hoveredOfferId && !currentOfferId;
                        return (
                          <Radar
                            key={offer.id}
                            name={offer.name}
                            dataKey={offer.id}
                            stroke={offer.color}
                            fill={offer.color}
                            fillOpacity={isHighlighted ? 0.35 : isDimmed ? 0.03 : noSelection ? 0.08 : 0.15}
                            strokeOpacity={isDimmed ? 0.3 : 1}
                            strokeWidth={isHighlighted ? 3 : noSelection ? 2.5 : 2}
                            isAnimationActive={false}
                          />
                        );
                      })}
                      <Tooltip content={<CustomTooltip starredOffers={starredOffers} />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </ZoomableChart>
                {(currentOffer || hoveredOfferId) && (
                  <div className="absolute top-2 left-2 bg-white/90 rounded-lg p-2 shadow-sm border border-gray-200">
                    <FloorVisualizer floor={(offers.find(o => o.id === hoveredOfferId) || currentOffer)?.data?.FLOOR} />
                  </div>
                )}
              </>
            )}

            {showRangePopup && (
              <div className="absolute top-2 right-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium text-sm">Ranges</h3>
                  <button onClick={() => setShowRangePopup(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="space-y-2">
                  {OBJECTIVE_PARAMS.filter(p => !parameterRanges[p]?.type).map(param => (
                    <div key={param} className="text-xs">
                      <div className="text-gray-600 mb-0.5">{param}</div>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={parameterRanges[param]?.min ?? 0}
                          onChange={(e) => setParameterRanges(prev => ({ ...prev, [param]: { ...prev[param], min: parseFloat(e.target.value) || 0 } }))}
                          className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                          placeholder="Min"
                        />
                        <input
                          type="number"
                          value={parameterRanges[param]?.max ?? 100}
                          onChange={(e) => setParameterRanges(prev => ({ ...prev, [param]: { ...prev[param], max: parseFloat(e.target.value) || 100 } }))}
                          className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                          placeholder="Max"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-wrap gap-1">
              {ALL_PARAMS.map(param => (
                <button
                  key={param}
                  onClick={() => setEnabledParams(prev => ({ ...prev, [param]: !prev[param] }))}
                  className={`px-2 py-1 rounded text-xs ${enabledParams[param] ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-white text-gray-500 border border-gray-300'}`}
                >
                  {param}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'add' && <AddOfferModal onClose={() => setModal(null)} onAdd={addOffer} existingOffers={offers} palette={palette} />}
      {modal === 'edit' && editingOffer && <EditOfferModal offer={editingOffer} onClose={() => { setModal(null); setEditingOffer(null); }} onSave={(u) => { updateOffer(editingOffer.id, u); setModal(null); setEditingOffer(null); }} palette={palette} />}
      {modal === 'email' && currentOffer && <EmailModal offer={currentOffer} onClose={() => setModal(null)} />}
      {modal === 'palette' && (
        <PaletteEditor
          palette={palette}
          onSave={(p) => { setPalette(p); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {deleteTarget && <DeleteConfirmModal offerName={deleteTarget.name} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}
      {imagePasteTarget && (
        <ImagePasteModal
          onClose={() => setImagePasteTarget(null)}
          onSave={(img) => { updateOffer(imagePasteTarget, { image: img }); setImagePasteTarget(null); }}
          onRemove={() => { updateOffer(imagePasteTarget, { image: null }); setImagePasteTarget(null); }}
          currentImage={offers.find(o => o.id === imagePasteTarget)?.image}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
