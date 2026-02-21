import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
  OFFER_COLORS,
  OBJECTIVE_PARAMS,
  SUBJECTIVE_PARAMS,
  DEFAULT_PARAM_RANGES,
  FIELD_SCHEMA,
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
  findSourceInText,
  loadFromStorage,
  saveToStorage,
  loadDemoOffers,
} from './utils';

// ============================================================================
// HOOKS
// ============================================================================

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
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
        <h3 className="text-lg font-semibold mb-2">Delete offer?</h3>
        <p className="text-gray-600 mb-4">"{offerName}" will be permanently deleted.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={onConfirm} className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label, starredOffers, activeTab }) => {
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
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

function ImagePasteModal({ onClose, onSave, onRemove, currentImage }) {
  const [image, setImage] = useState(currentImage || null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setImage(ev.target.result);
            reader.readAsDataURL(file);
          }
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
    if (file?.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">Property Photo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
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
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full aspect-[4/3] rounded-lg border-2 border-dashed cursor-pointer flex flex-col items-center justify-center ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
            >
              <p className="text-sm text-gray-600 font-medium">Paste, drop, or click</p>
              <p className="text-xs text-gray-400 mt-1">Ctrl+V to paste</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>
        <div className="p-3 border-t border-gray-200 flex justify-between">
          <div>{currentImage && <button onClick={onRemove} className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm">Remove</button>}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
            <button onClick={() => onSave(image)} disabled={!image} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// ADD OFFER MODAL
// ============================================================================

function AddOfferModal({ onClose, onAdd, existingOffers }) {
  const [selectedColor, setSelectedColor] = useState(getNextColor(existingOffers));
  const [urlInput, setUrlInput] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [extractionPhase, setExtractionPhase] = useState('input'); // 'input' | 'extracted'
  
  // Extraction results with sources
  const [regexResult, setRegexResult] = useState(null); // { values, sources }
  const [aiResult, setAiResult] = useState(null); // { values, sources }
  const [activeTab, setActiveTab] = useState(null); // 'regex' | 'ai'
  
  // User edits (pinned, survive tab switching)
  const [userEdits, setUserEdits] = useState({});
  
  // Hover state for source highlighting
  const [hoveredField, setHoveredField] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const textareaRef = useRef(null);
  
  const getActiveResult = () => activeTab === 'ai' ? aiResult : regexResult;
  
  const getFieldValue = (field) => {
    if (userEdits[field] !== undefined) return userEdits[field];
    const result = getActiveResult();
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
    const result = getActiveResult();
    return result?.values?.[field] !== undefined;
  };
  
  const getFieldSource = (field) => {
    const result = getActiveResult();
    return result?.sources?.[field] || null;
  };
  
  const handleFieldFocus = (field) => {
    // Mark as user-edited on focus (turns black)
    if (userEdits[field] === undefined && isFieldFromExtraction(field)) {
      setUserEdits(prev => ({ ...prev, [field]: getFieldValue(field) }));
    }
  };
  
  const handleFieldChange = (field, value) => {
    setUserEdits(prev => ({ ...prev, [field]: value }));
  };
  
  // Highlight source in textarea on hover — use overlay approach
  const highlightInfo = useMemo(() => {
    if (!hoveredField) return null;
    const source = getFieldSource(hoveredField);
    if (!source) return null;
    return source;
  }, [hoveredField, activeTab, regexResult, aiResult]);
  
  // AI assumed available — errors handled on actual extraction attempt
  
  const runRegexExtract = () => {
    const result = parseListingTextWithSources(pasteText);
    result.values.URL = urlInput;
    setRegexResult(result);
    setActiveTab('regex');
    setExtractionPhase('extracted');
  };
  
  const runAiExtract = async () => {
    if (!pasteText.trim()) return;
    setIsExtracting(true);
    
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: `Extract Czech real estate listing data. Return ONLY valid JSON, no markdown.

TEXT:
"""
${pasteText}
"""

Return JSON with these fields (use null if not found):

OBJECTIVE (use raw values, no units in the value):
- "name": "StreetName RoomLayout" (e.g. "Veletržní 3+kk")
- "PRICE": number in CZK (e.g. 12500000)
- "SIZE": number in m² (e.g. 75.5)
- "ROOMS": string (e.g. "3+kk", "2+1")
- "FLOOR": string (e.g. "3", "2/6")
- "ADDRESS": street, district
- "LOCATION": neighborhood (Holešovice, Letná, etc.)
- "BALCONY": number in m² or 0
- "CELLAR": number in m² or 0
- "PARKING": "Garage"/"Dedicated"/"None"
- "BUILDING": "Brick"/"Panel"/"Mixed"
- "ENERGY": letter A-G

SUBJECTIVE (1-10, use 5 if uncertain):
- "Location": transport + amenities
- "Light/Views": natural light, views
- "Layout": room layout quality
- "Renovation": condition (10=new, 1=needs work)
- "Noise": quietness (10=quiet, 1=noisy)
- "Vibe": character, charm

Return ONLY the JSON object.`
          }]
        })
      });

      if (!response.ok) {
        setAiAvailable(false);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      let responseText = '';
      if (data.content) {
        for (const block of data.content) {
          if (block.type === 'text') responseText += block.text;
        }
      }
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const values = {};
        const sources = {};
        
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== null && v !== 'null' && v !== undefined && v !== '') {
            if (SUBJECTIVE_PARAMS.includes(k)) {
              values[k] = typeof v === 'number' ? v : parseFloat(v) || 5;
            } else {
              values[k] = v;
            }
            // Find source in text
            const source = findSourceInText(pasteText, k, v);
            if (source) sources[k] = source;
          }
        }
        
        values.URL = urlInput;
        setAiResult({ values, sources });
        setActiveTab('ai');
        setExtractionPhase('extracted');
        
        // Also run regex in background for comparison
        if (!regexResult) {
          const regexRes = parseListingTextWithSources(pasteText);
          regexRes.values.URL = urlInput;
          setRegexResult(regexRes);
        }
      }
    } catch (err) {
      console.error('AI extraction error:', err);
      setAiAvailable(false);
    }
    
    setIsExtracting(false);
  };
  
  const handleTabSwitch = (tab) => {
    if (tab === 'regex' && !regexResult) return;
    if (tab === 'ai' && !aiResult) {
      if (aiAvailable && !isExtracting) runAiExtract();
      return;
    }
    setActiveTab(tab);
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
    { key: 'PRICE', label: 'Price', unit: 'Kč' },
    { key: 'SIZE', label: 'Size', unit: 'm²' },
    { key: 'ROOMS', label: 'Rooms' },
    { key: 'FLOOR', label: 'Floor' },
    { key: 'ADDRESS', label: 'Address' },
    { key: 'LOCATION', label: 'Location' },
    { key: 'BALCONY', label: 'Balcony', unit: 'm²' },
    { key: 'CELLAR', label: 'Cellar', unit: 'm²' },
    { key: 'PARKING', label: 'Parking' },
    { key: 'BUILDING', label: 'Building' },
    { key: 'ENERGY', label: 'Energy' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] flex flex-col">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">Add Offer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        
        <div className="p-3 flex-grow overflow-y-auto">
          {/* Color picker */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-1.5 flex-wrap">
              {OFFER_COLORS.map(color => (
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
          
          {/* URL input - always editable */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Listing URL</label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://sreality.cz/..."
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          
          {/* Listing text + extraction controls */}
          <div className={`mb-3 ${extractionPhase === 'extracted' ? 'pb-3 border-b border-gray-200' : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Listing Text</label>
              {extractionPhase === 'extracted' && (
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  <button
                    onClick={() => handleTabSwitch('regex')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${activeTab === 'regex' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Regex
                  </button>
                  <button
                    onClick={() => handleTabSwitch('ai')}
                    disabled={!aiAvailable || isExtracting}
                    className={`px-3 py-1 text-xs font-medium transition-colors border-l border-gray-300 ${activeTab === 'ai' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} disabled:opacity-50`}
                  >
                    {isExtracting ? '...' : 'AI'}
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={pasteText}
                onChange={(e) => extractionPhase === 'input' && setPasteText(e.target.value)}
                readOnly={extractionPhase === 'extracted'}
                placeholder="Paste the full listing text from the website..."
                className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none ${extractionPhase === 'extracted' ? 'h-20 bg-gray-50 text-gray-600' : 'h-32'}`}
              />
            </div>
            
            {extractionPhase === 'input' && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={runRegexExtract}
                  disabled={!pasteText.trim()}
                  className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  Extract (Regex)
                </button>
                <button
                  onClick={runAiExtract}
                  disabled={!pasteText.trim() || !aiAvailable || isExtracting}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isExtracting ? 'Extracting...' : aiAvailable ? 'Extract (AI)' : 'AI Unavailable'}
                </button>
              </div>
            )}
          </div>
          
          {/* Extracted data form */}
          {extractionPhase === 'extracted' && (
            <div className="space-y-4" onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}>
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
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
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Property Data</h3>
                <div className="grid grid-cols-3 gap-2">
                  {OBJECTIVE_FIELDS.map(({ key, label, unit }) => (
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
                        className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm ${isFieldFromExtraction(key) ? 'text-blue-600' : 'text-gray-900'}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Subjective ratings */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Ratings</h3>
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
          <button onClick={onClose} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={extractionPhase === 'input'}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Add Offer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EDIT OFFER MODAL
// ============================================================================

function EditOfferModal({ offer, onClose, onSave }) {
  const [name, setName] = useState(offer.name || '');
  const [selectedColor, setSelectedColor] = useState(offer.color || OFFER_COLORS[0]);
  const [formData, setFormData] = useState(offer.data || {});

  const handleSubmit = () => onSave({ name, data: formData, color: selectedColor });
  const inputClass = "w-full px-2 py-1.5 border border-gray-300 rounded text-sm";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-xl max-h-[85vh] flex flex-col">
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-base font-semibold">Edit Offer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-3 flex-grow overflow-y-auto space-y-3">
          <div><label className={labelClass}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></div>
          <div>
            <label className={labelClass}>Color</label>
            <div className="flex gap-1 flex-wrap">
              {OFFER_COLORS.map(color => (
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
            <div><label className={labelClass}>Price</label><input value={formData.PRICE || ''} onChange={(e) => setFormData(p => ({ ...p, PRICE: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Size</label><input value={formData.SIZE || ''} onChange={(e) => setFormData(p => ({ ...p, SIZE: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Rooms</label><input value={formData.ROOMS || ''} onChange={(e) => setFormData(p => ({ ...p, ROOMS: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Floor</label><input value={formData.FLOOR || ''} onChange={(e) => setFormData(p => ({ ...p, FLOOR: e.target.value }))} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Address</label><input value={formData.ADDRESS || ''} onChange={(e) => setFormData(p => ({ ...p, ADDRESS: e.target.value }))} className={inputClass} /></div>
          <div><label className={labelClass}>Location</label><input value={formData.LOCATION || ''} onChange={(e) => setFormData(p => ({ ...p, LOCATION: e.target.value }))} className={inputClass} /></div>
          <div><label className={labelClass}>URL</label><input value={formData.URL || ''} onChange={(e) => setFormData(p => ({ ...p, URL: e.target.value }))} className={inputClass} /></div>
        </div>
        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
          <button onClick={handleSubmit} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">Save</button>
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
          <h2 className="text-base font-semibold">Draft Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-3">
          <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
            <p className="font-medium text-gray-700 mb-1">Subject:</p>
            <p className="mb-2 text-xs">{subject}</p>
            <p className="font-medium text-gray-700 mb-1">Body:</p>
            <p className="whitespace-pre-line text-xs">{body}</p>
          </div>
          <button onClick={copyToClipboard} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm">Copy to Clipboard</button>
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
  const [parameterRanges, setParameterRanges] = useState(DEFAULT_PARAM_RANGES);
  const [currentOfferId, setCurrentOfferId] = useState(null);
  const [hoveredOfferId, setHoveredOfferId] = useState(null);
  const [activeTab, setActiveTab] = useState('objective');
  const [sortCriterion, setSortCriterion] = useState('manual');
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
  const [enabledObjective, setEnabledObjective] = useState(Object.fromEntries(OBJECTIVE_PARAMS.map(p => [p, true])));
  const [enabledSubjective, setEnabledSubjective] = useState(Object.fromEntries(SUBJECTIVE_PARAMS.map(p => [p, true])));
  const fileInputRef = useRef(null);
  
  // Resizable panels
  const [listWidth, setListWidth] = useState(256);
  const [detailWidth, setDetailWidth] = useState(256);
  const [isResizingList, setIsResizingList] = useState(false);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const containerRef = useRef(null);

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

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored) {
      setOffers(stored.offers);
      setParameterRanges(stored.parameterRanges);
    }
  }, []);

  // Save to storage on change
  useEffect(() => {
    if (offers.length) saveToStorage(offers, parameterRanges);
  }, [offers, parameterRanges]);

  const currentOffer = useMemo(() => offers.find(o => o.id === currentOfferId), [offers, currentOfferId]);
  const starredOffers = useMemo(() => offers.filter(o => o.featured && (showSoldInGraph || !o.sold)), [offers, showSoldInGraph]);

  const chartData = useMemo(() => {
    const params = activeTab === 'objective' ? OBJECTIVE_PARAMS : SUBJECTIVE_PARAMS;
    const enabled = activeTab === 'objective' ? enabledObjective : enabledSubjective;
    return params.filter(p => enabled[p]).map(param => {
      const point = { param };
      starredOffers.forEach(offer => {
        point[offer.id] = activeTab === 'objective'
          ? getNormalizedValue(param, offer, parameterRanges)
          : (offer.subjectiveRatings?.[param] ?? 5);
      });
      return point;
    });
  }, [starredOffers, activeTab, enabledObjective, enabledSubjective, parameterRanges]);

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
  }, [offers, sortCriterion, groupCriterion]);

  // Actions
  const addOffer = useCallback((data) => {
    const newOffer = {
      id: generateId(),
      name: data.name,
      color: data.color || getNextColor(offers),
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
  }, [offers]);

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
  }, []);

  const sortByChartArea = useCallback((type) => {
    const params = type === 'objective' ? OBJECTIVE_PARAMS : SUBJECTIVE_PARAMS;
    const enabled = type === 'objective' ? enabledObjective : enabledSubjective;
    const getArea = (offer) => params.filter(p => enabled[p]).reduce((sum, param) => {
      return sum + (type === 'objective' ? getNormalizedValue(param, offer, parameterRanges) : (offer.subjectiveRatings?.[param] ?? 5));
    }, 0);
    const sortedOffers = [...offers].sort((a, b) => getArea(b) - getArea(a));
    setOffers(sortedOffers.map((o, i) => ({ ...o, manualOrder: i })));
    setSortCriterion('manual');
  }, [offers, enabledObjective, enabledSubjective, parameterRanges]);

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
        if (param === 'Price') return parsePrice(o.data?.PRICE) || 0;
        if (param === 'Price per m²') { const p = parsePrice(o.data?.PRICE); const s = parseSize(o.data?.SIZE); return (p && s) ? p / s : 0; }
        if (param === 'Size') return parseSize(o.data?.SIZE) || 0;
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
        color: getNextColor([...offers, ...pendingImport.offers.slice(0, pendingImport.offers.indexOf(o))]),
        manualOrder: offers.length + pendingImport.offers.indexOf(o)
      }));
      setOffers(prev => [...prev, ...newOffers]);
    }
    setPendingImport(null);
  }, [pendingImport, offers]);

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
              <LinkTooltip url={offer.data.URL}>
                <button 
                  onClick={(e) => { e.stopPropagation(); window.open(offer.data.URL, '_blank'); }} 
                  className="p-1 text-blue-500 hover:text-blue-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </button>
              </LinkTooltip>
            )}
            <button onClick={(e) => { e.stopPropagation(); toggleStar(offer.id); }} className={`p-1 ${offer.featured ? 'text-yellow-500' : 'text-gray-300 hover:text-gray-400'}`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(offer); }} className="p-1 text-gray-400 hover:text-red-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===================== MOBILE LAYOUT =====================
  if (isMobile) {
    const MobileTabButton = ({ view, label, icon }) => (
      <button
        onClick={() => setMobileView(view)}
        className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${mobileView === view ? 'text-blue-600' : 'text-gray-500'}`}
      >
        <span className="text-base mb-0.5">{icon}</span>
        <span>{label}</span>
      </button>
    );

    return (
      <div className="h-screen flex flex-col bg-gray-100 relative" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Mobile Header */}
        <header className="bg-white shadow-sm px-3 py-2 flex items-center justify-between flex-shrink-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Flat Analyzer</h1>
          <div className="flex items-center gap-1">
            {offers.length === 0 && <button onClick={loadDemoData} className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded text-xs">Demo</button>}
            <button onClick={() => setModal('add')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium text-xs">+ Add</button>
          </div>
        </header>

        {/* Mobile Content */}
        <div className="flex-grow overflow-hidden">
          {/* LIST VIEW */}
          {mobileView === 'list' && (
            <div className="h-full flex flex-col">
              <div className="p-2 bg-white border-b border-gray-200 flex gap-1">
                <select value={sortCriterion} onChange={(e) => { const v = e.target.value; if (v === 'chartObj') sortByChartArea('objective'); else if (v === 'chartSubj') sortByChartArea('subjective'); else setSortCriterion(v); }} className="flex-1 text-xs border border-gray-300 rounded px-1 py-1.5 bg-white">
                  <optgroup label="Sort"><option value="manual">Manual</option><option value="price">Price</option><option value="size">Size</option><option value="pricePerSqm">Kč/m²</option><option value="name">Name</option></optgroup>
                  <optgroup label="By score"><option value="chartObj">Objective</option><option value="chartSubj">Subjective</option></optgroup>
                </select>
                <select value={groupCriterion} onChange={(e) => setGroupCriterion(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-1 py-1.5 bg-white">
                  <option value="none">No group</option><option value="location">Location</option><option value="renovation">Reno</option>
                </select>
              </div>
              <div className="flex-grow overflow-y-auto p-2 space-y-1">
                {offers.length === 0 ? (
                  <div className="text-center text-gray-400 py-12 text-sm"><p>No offers yet</p><p className="text-xs mt-1">Tap + Add to start</p></div>
                ) : processedOffers.map(g => (
                  <div key={g.key}>
                    {g.isSold ? (
                      <div className="mt-2">
                        <button onClick={() => setSoldCollapsed(!soldCollapsed)} className="flex items-center gap-1 text-xs text-gray-500 py-1 px-2">
                          <span>{soldCollapsed ? '▸' : '▾'}</span><span>Sold ({g.offers.length})</span>
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
          )}

          {/* DETAIL VIEW */}
          {mobileView === 'detail' && (
            <div className="h-full overflow-y-auto bg-white">
              {currentOffer ? (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: currentOffer.color }} />
                    <h2 className="font-semibold text-lg truncate flex-grow">{currentOffer.name}</h2>
                    <button onClick={() => setMobileView('list')} className="text-gray-400 text-sm flex-shrink-0">← List</button>
                  </div>

                  {currentOffer.image && (
                    <div className="w-full aspect-[16/9] mb-3 overflow-hidden rounded-lg" onClick={() => setImagePasteTarget(currentOffer.id)}>
                      <img src={currentOffer.image} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="space-y-1.5 text-sm mb-4">
                    {['PRICE', 'SIZE', 'ROOMS', 'FLOOR', 'ADDRESS', 'LOCATION'].map(k => currentOffer.data?.[k] && (
                      <div key={k} className="flex justify-between">
                        <span className="text-gray-500">{k}</span>
                        <span className="font-medium truncate ml-2">{k === 'PRICE' ? formatPrice(parsePrice(currentOffer.data[k])) : String(currentOffer.data[k])}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 flex-wrap mb-4">
                    {currentOffer.data?.URL && (
                      <a href={currentOffer.data.URL} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium">Link</a>
                    )}
                    <button onClick={() => updateOffer(currentOffer.id, { sold: !currentOffer.sold })} className={`px-3 py-2 rounded-lg text-xs font-medium ${currentOffer.sold ? 'bg-orange-500 text-white' : 'bg-orange-50 border border-orange-200 text-orange-700'}`}>
                      {currentOffer.sold ? 'Sold' : 'Mark Sold'}
                    </button>
                    <button onClick={() => { setEditingOffer(currentOffer); setModal('edit'); }} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">Edit</button>
                    <button onClick={() => setModal('email')} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">Email</button>
                    <button onClick={() => setImagePasteTarget(currentOffer.id)} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">Photo</button>
                  </div>

                  <textarea
                    value={currentOffer.notes || ''}
                    onChange={(e) => updateOffer(currentOffer.id, { notes: e.target.value })}
                    placeholder="Notes..."
                    className="w-full p-3 text-sm border border-gray-300 rounded-lg resize-none h-20 mb-4"
                  />

                  {activeTab === 'subjective' && (
                    <div className="border-t pt-3">
                      <h3 className="text-xs font-medium text-gray-700 mb-2">Ratings</h3>
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
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                  <p className="text-sm">Select an offer from the list</p>
                  <button onClick={() => setMobileView('list')} className="mt-2 text-blue-600 text-sm font-medium">Go to list</button>
                </div>
              )}
            </div>
          )}

          {/* CHART VIEW */}
          {mobileView === 'chart' && (
            <div className="h-full flex flex-col bg-white">
              <div className="flex items-center justify-between p-2 border-b border-gray-200">
                <div className="flex gap-1">
                  <button onClick={() => setActiveTab('objective')} className={`px-3 py-1.5 rounded-lg font-medium text-xs ${activeTab === 'objective' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Objective</button>
                  <button onClick={() => setActiveTab('subjective')} className={`px-3 py-1.5 rounded-lg font-medium text-xs ${activeTab === 'subjective' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Subjective</button>
                </div>
                {activeTab === 'objective' && (
                  <div className="flex gap-1">
                    <button onClick={autoRanges} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded border border-gray-300">Auto</button>
                    <button onClick={() => setShowRangePopup(!showRangePopup)} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded border border-gray-300">Ranges</button>
                  </div>
                )}
              </div>

              <div className="flex-grow relative">
                {starredOffers.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm p-8 text-center">Star offers to compare them here</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="60%">
                      <PolarGrid stroke="#E5E7EB" />
                      <PolarAngleAxis dataKey="param" tick={{ fill: '#6B7280', fontSize: 9 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#9CA3AF', fontSize: 8 }} />
                      {starredOffers.map(offer => (
                        <Radar key={offer.id} name={offer.name} dataKey={offer.id} stroke={offer.color} fill={offer.color} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                      ))}
                      <Tooltip content={<CustomTooltip starredOffers={starredOffers} activeTab={activeTab} />} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}

                {showRangePopup && (
                  <div className="absolute top-2 right-2 left-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-medium text-sm">Ranges</h3>
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

              <div className="p-2 border-t border-gray-200 bg-gray-50">
                <div className="flex flex-wrap gap-1">
                  {(activeTab === 'objective' ? OBJECTIVE_PARAMS : SUBJECTIVE_PARAMS).map(param => {
                    const enabled = activeTab === 'objective' ? enabledObjective[param] : enabledSubjective[param];
                    const toggle = activeTab === 'objective' ? setEnabledObjective : setEnabledSubjective;
                    return (
                      <button key={param} onClick={() => toggle(prev => ({ ...prev, [param]: !prev[param] }))} className={`px-2 py-1 rounded text-[10px] ${enabled ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-white text-gray-500 border border-gray-300'}`}>
                        {param}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="bg-white border-t border-gray-200 flex flex-shrink-0">
          <MobileTabButton view="list" label="List" icon="☰" />
          <MobileTabButton view="detail" label="Detail" icon="◉" />
          <MobileTabButton view="chart" label="Chart" icon="◈" />
        </nav>

        {/* Modals */}
        {modal === 'add' && <AddOfferModal onClose={() => setModal(null)} onAdd={addOffer} existingOffers={offers} />}
        {modal === 'edit' && editingOffer && <EditOfferModal offer={editingOffer} onClose={() => { setModal(null); setEditingOffer(null); }} onSave={(u) => { updateOffer(editingOffer.id, u); setModal(null); setEditingOffer(null); }} />}
        {modal === 'email' && currentOffer && <EmailModal offer={currentOffer} onClose={() => setModal(null)} />}
        {deleteTarget && <DeleteConfirmModal offerName={deleteTarget.name} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}
        {imagePasteTarget && (
          <ImagePasteModal
            onClose={() => setImagePasteTarget(null)}
            onSave={(img) => { updateOffer(imagePasteTarget, { image: img }); setImagePasteTarget(null); }}
            onRemove={() => { updateOffer(imagePasteTarget, { image: null }); setImagePasteTarget(null); }}
            currentImage={offers.find(o => o.id === imagePasteTarget)?.image}
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
          {offers.length === 0 && <button onClick={loadDemoData} className="px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-xs">Demo</button>}
          <button onClick={() => setModal('add')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">+ Add</button>
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
            <div className="flex gap-1">
              <select
                value={sortCriterion}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'chartObj') sortByChartArea('objective');
                  else if (val === 'chartSubj') sortByChartArea('subjective');
                  else setSortCriterion(val);
                }}
                className="flex-1 text-xs border border-gray-300 rounded px-1 py-1 bg-white"
              >
                <optgroup label="Sort">
                  <option value="manual">Manual</option>
                  <option value="price">Price</option>
                  <option value="size">Size</option>
                  <option value="pricePerSqm">Kč/m²</option>
                  <option value="name">Name</option>
                </optgroup>
                <optgroup label="By score">
                  <option value="chartObj">Objective</option>
                  <option value="chartSubj">Subjective</option>
                </optgroup>
              </select>
              <select value={groupCriterion} onChange={(e) => setGroupCriterion(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-1 py-1 bg-white">
                <option value="none">No group</option>
                <option value="location">Location</option>
                <option value="renovation">Reno</option>
              </select>
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
                  {['PRICE', 'SIZE', 'ROOMS', 'FLOOR', 'ADDRESS', 'LOCATION'].map(k => currentOffer.data?.[k] && (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-medium truncate ml-2">{k === 'PRICE' ? formatPrice(parsePrice(currentOffer.data[k])) : currentOffer.data[k]}</span>
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

                {activeTab === 'subjective' && (
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
                )}
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
          <div className="flex items-center justify-between p-2 border-b border-gray-200 bg-gray-50">
            <div className="flex gap-1">
              <button onClick={() => setActiveTab('objective')} className={`px-3 py-1.5 rounded-lg font-medium text-sm ${activeTab === 'objective' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}>Objective</button>
              <button onClick={() => setActiveTab('subjective')} className={`px-3 py-1.5 rounded-lg font-medium text-sm ${activeTab === 'subjective' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}>Subjective</button>
            </div>
            {activeTab === 'objective' && (
              <div className="flex gap-1">
                <button onClick={autoRanges} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded-lg border border-gray-300" title="Fit ranges to starred offers">Auto</button>
                <button onClick={() => setShowRangePopup(!showRangePopup)} className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded-lg border border-gray-300">Ranges</button>
              </div>
            )}
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
                        return (
                          <Radar
                            key={offer.id}
                            name={offer.name}
                            dataKey={offer.id}
                            stroke={offer.color}
                            fill={offer.color}
                            fillOpacity={isHighlighted ? 0.35 : isDimmed ? 0.05 : 0.15}
                            strokeOpacity={isDimmed ? 0.3 : 1}
                            strokeWidth={isHighlighted ? 3 : 2}
                            isAnimationActive={false}
                          />
                        );
                      })}
                      <Tooltip content={<CustomTooltip starredOffers={starredOffers} activeTab={activeTab} />} />
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
              {(activeTab === 'objective' ? OBJECTIVE_PARAMS : SUBJECTIVE_PARAMS).map(param => {
                const enabled = activeTab === 'objective' ? enabledObjective[param] : enabledSubjective[param];
                const toggle = activeTab === 'objective' ? setEnabledObjective : setEnabledSubjective;
                return (
                  <button
                    key={param}
                    onClick={() => toggle(prev => ({ ...prev, [param]: !prev[param] }))}
                    className={`px-2 py-1 rounded text-xs ${enabled ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-white text-gray-500 border border-gray-300'}`}
                  >
                    {param}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'add' && <AddOfferModal onClose={() => setModal(null)} onAdd={addOffer} existingOffers={offers} />}
      {modal === 'edit' && editingOffer && <EditOfferModal offer={editingOffer} onClose={() => { setModal(null); setEditingOffer(null); }} onSave={(u) => { updateOffer(editingOffer.id, u); setModal(null); setEditingOffer(null); }} />}
      {modal === 'email' && currentOffer && <EmailModal offer={currentOffer} onClose={() => setModal(null)} />}
      {deleteTarget && <DeleteConfirmModal offerName={deleteTarget.name} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}
      {imagePasteTarget && (
        <ImagePasteModal
          onClose={() => setImagePasteTarget(null)}
          onSave={(img) => { updateOffer(imagePasteTarget, { image: img }); setImagePasteTarget(null); }}
          onRemove={() => { updateOffer(imagePasteTarget, { image: null }); setImagePasteTarget(null); }}
          currentImage={offers.find(o => o.id === imagePasteTarget)?.image}
        />
      )}
    </div>
  );
}
