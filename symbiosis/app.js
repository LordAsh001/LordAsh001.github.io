/* =========================================================
   Symbiosis Workbench — core helpers
   Edit CONFIG to personalise the hosted site.
   ========================================================= */
const CONFIG = {
  title: 'Symbiosis Workbench',
  author: 'Amool, S. H.',              // used in "Cite this tool"
  authorFull: 'Shagbaor Hycent Amool',
  affiliation: 'University of Northern British Columbia',
  year: 2026,
  version: '3.0',
  repoUrl: ''                          // e.g. 'https://github.com/<user>/<repo>' — shows a link in the footer
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const REFS = DATA.REFS;
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const store = {
  get(k, d){ try { const v = localStorage.getItem('sw3.' + k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('sw3.' + k, JSON.stringify(v)); } catch(e){} }
};

/* ---------- citations ---------- */
function cite(ids){
  if (!ids) return '';
  const arr = (Array.isArray(ids) ? ids : [ids]).filter(id => id && REFS[id]);
  if (!arr.length) return '';
  const uniq = [...new Set(arr)].sort((a,b) => REFS[a].n - REFS[b].n);
  return `<span class="cite">[${uniq.map(id => `<a data-ref="${esc(id)}" tabindex="0" role="button" aria-label="Reference ${REFS[id].n}">${REFS[id].n}</a>`).join(',')}]</span>`;
}
function hydrateCites(root){ (root || document).querySelectorAll('.cite[data-c]').forEach(el => { el.outerHTML = cite(el.dataset.c.split(',')); }); }
function shortUrl(u){ try { const x = new URL(u); return x.hostname.replace(/^www\./,'') + (x.pathname.length > 1 ? '/…' : ''); } catch(e){ return u; } }
function refLink(r){ const u = r.doi ? 'https://doi.org/' + r.doi : r.url; return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(r.doi ? 'doi:' + r.doi : shortUrl(u))}</a>` : ''; }
function fmtRef(r, plain = false){
  const who = r.authors || r.publisher || '';
  const e = plain ? (x => String(x ?? '')) : esc;
  const it = plain ? (x => x) : (x => `<i>${x}</i>`);
  let s = `${e(who)} (${e(r.year || 'n.d.')}). ${e(r.title || '')}${/[.?!]$/.test(r.title || '') ? '' : '.'}`;
  if (r.container){
    s += ` ${it(e(r.container))}`;
    if (r.volume) s += `, ${it(e(r.volume))}`;
    if (r.issue) s += `(${e(r.issue)})`;
    if (r.pages) s += `, ${e(r.pages)}`;
    s += '.';
  } else if (r.publisher && r.authors && r.publisher !== r.authors && !r.publisher.startsWith(r.authors)) s += ` ${e(r.publisher)}.`;
  if (plain){ const u = r.doi ? 'https://doi.org/' + r.doi : r.url; if (u) s += ' ' + u; }
  else { const l = refLink(r); if (l) s += ' ' + l; }
  return s;
}
const pop = () => $('#pop');
let popAnchor = null;
function openPop(a){
  const id = a.dataset.ref, r = REFS[id]; if (!r) return;
  popAnchor = a;
  const p = pop();
  const uses = (typeof REF_USES !== 'undefined' && REF_USES[id]) ? REF_USES[id].length : 0;
  p.innerHTML = `<div class="n">[${r.n}] ${esc((r.type || '').toUpperCase())}${uses ? ` · cited in ${uses} place${uses > 1 ? 's' : ''}` : ''}</div><div style="margin-top:4px">${fmtRef(r)}</div>
    <div class="acts"><button class="btn small" type="button" data-goref="${esc(id)}">${icon('quote')}Show in reference list</button><button class="btn small" type="button" data-copyref="${esc(id)}">${icon('copy')}Copy citation</button><button class="btn small" type="button" data-closepop aria-label="Close">${icon('x')}</button></div>`;
  p.hidden = false;
  const b = a.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
  const x = Math.min(window.innerWidth - pw - 12, Math.max(12, b.left - 20));
  let y = b.bottom + 8; if (y + ph > window.innerHeight - 8) y = Math.max(8, b.top - ph - 8);
  p.style.left = x + 'px'; p.style.top = y + 'px';
  p.querySelector('button').focus({preventScroll:true});
}
function closePop(){ if (!pop().hidden){ pop().hidden = true; if (popAnchor) popAnchor.focus({preventScroll:true}); popAnchor = null; } }
document.addEventListener('click', e => {
  const a = e.target.closest('.cite a');
  if (a){ e.preventDefault(); e.stopPropagation(); openPop(a); return; }
  const g = e.target.closest('[data-goref]');
  if (g){ pop().hidden = true; navigate(`/sources/${g.dataset.goref}`); return; }
  const c = e.target.closest('[data-copyref]');
  if (c){ copyText(fmtRef(REFS[c.dataset.copyref], true), 'Citation'); return; }
  if (e.target.closest('[data-closepop]') || (!e.target.closest('#pop') && !pop().hidden)) pop().hidden = true;
}, true);
window.addEventListener('scroll', () => { if (!pop().hidden) pop().hidden = true; }, {passive:true});

/* ---------- numbers ---------- */
function cmp(n){
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e9) return s + (a/1e9).toFixed(1) + 'B';
  if (a >= 1e6) return s + (a/1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return s + Math.round(a/1e3) + 'k';
  if (a >= 1e3) return s + (a/1e3).toFixed(1) + 'k';
  if (a >= 10 || a === 0) return s + Math.round(a);
  if (a >= 0.01) return s + a.toFixed(2);
  return s + a.toPrecision(2);
}
const money = n => (n < 0 ? '−$' : '$') + cmp(Math.abs(n));
const km = d => d < 1 ? d.toFixed(2) + ' km' : d.toFixed(1) + ' km';

/* ---------- toast (with optional action), copy, download ---------- */
let toastT;
function toast(msg, opt = {}){
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>` + (opt.action ? `<button type="button">${esc(opt.action)}</button>` : '');
  if (opt.action) t.querySelector('button').onclick = () => { t.classList.remove('on'); opt.onAction(); };
  t.classList.add('on'); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), opt.action ? 5500 : 2000);
}
function copyText(txt, label){
  const box = $('#jsonBox'); if (box && label !== 'Citation' && label !== 'Link') box.value = txt;
  const fallback = () => {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch(e){}
    ta.remove(); toast(ok ? label + ' copied' : 'Copy blocked here. Select the text and copy it.');
  };
  try { navigator.clipboard.writeText(txt).then(() => toast(label + ' copied'), fallback); } catch(e){ fallback(); }
}
function download(name, text, mime = 'text/plain'){
  try {
    const blob = text instanceof Blob ? text : new Blob([text], {type: mime + ';charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Downloading ' + name);
  } catch(e){ toast('Download blocked here. Use the copy option instead.'); }
}

/* =================== stream factors (with provenance) =================== */
const CATS = {energy:'Energy', water:'Water', material:'Minerals & materials', bio:'Biomass & organics', gas:'Gases'};
// src objects: {ref, basis}. null = illustrative default (no credible generic source found).
const STREAM_DEFAULTS = {
  heat:  {name:'Low-grade waste heat', unit:'MWh', cat:'energy', mode:'pipe',
    co2:0.226, co2Src:{ref:'epa2025', basis:'Displaces natural-gas steam/heat at 80 % boiler efficiency: 66.33 kg CO₂/mmBtu × 3.412 mmBtu/MWh.'},
    value:22, valueSrc:null, maxKm:10, maxKmSrc:{ref:'manz2021', basis:'10 km described as the most realistic connection distance for excess heat to district heating.'},
    pipeCost:45000, costSrc:null, costNote:{ref:'aydemir2020', basis:'Benchmark: transport costs up to €7.5/MWh would connect ~36 % of analysed EU industrial excess heat to district heating.'}},
  steam: {name:'Process steam', unit:'MWh', cat:'energy', mode:'pipe',
    co2:0.226, co2Src:{ref:'epa2025', basis:'Same natural-gas steam counterfactual as waste heat.'},
    value:32, valueSrc:null, maxKm:10, maxKmSrc:{ref:'liu2021', basis:'Long-distance steam pipelines modelled at 10–25 km; pressure and temperature drop constrain design. 10 km used as a cautious limit.'},
    pipeCost:80000, costSrc:null},
  water: {name:'Reclaimed / treated water', unit:'m³', cat:'water', mode:'pipe',
    co2:0.0000378, co2Src:{ref:'nzmfe2026', basis:'Avoided public water supply and treatment, 0.0378 kg CO₂e/m³ (low-carbon New Zealand grid; higher on fossil grids).'},
    value:0.9, valueSrc:null, maxKm:20, maxKmSrc:null, pipeCost:25000, costSrc:null},
  coolw: {name:'Used cooling water', unit:'m³', cat:'water', mode:'pipe',
    co2:0.0000378, co2Src:{ref:'nzmfe2026', basis:'As reclaimed water.'},
    value:0.4, valueSrc:null, maxKm:6, maxKmSrc:null, pipeCost:20000, costSrc:null},
  orgww: {name:'High-strength organic wastewater', unit:'m³', cat:'water', mode:'pipe',
    co2:0.000495, co2Src:{ref:'nzmfe2026', basis:'Avoided municipal treatment, 0.495 kg CO₂e/m³; a lower bound for high-strength effluent.'},
    value:1.1, valueSrc:null, maxKm:8, maxKmSrc:null, pipeCost:30000, costSrc:null},
  co2:   {name:'Concentrated CO₂', unit:'t', cat:'gas', mode:'unitkm',
    co2:0, co2Src:{ref:'ipcc2005', basis:'Credit of 1 t/t applies only to permanent storage. For utilisation (greenhouses, drinks) the CO₂ is soon re-released, so the default credit is 0; enter a value if you model avoided on-site CO₂ production.'},
    value:35, valueSrc:null, maxKm:1000, maxKmSrc:{ref:'ipcc2005', basis:'Pipelines are cheaper than ships below roughly 1,000 km.'},
    unitKmCost:0.018, costSrc:{ref:'ipcc2005', basis:'US$1–8 per t CO₂ per 250 km of pipeline (2005 US$); midpoint 4.5/250 = US$0.018 per t·km.'}},
  biogas:{name:'Biogas / biomethane', unit:'MWh', cat:'gas', mode:'pipe',
    co2:0.202, co2Src:{ref:'ipcc2006a', basis:'Displaces natural gas: 56.1 kg CO₂/GJ × 3.6 GJ/MWh (biogenic CO₂ not counted).'},
    value:30, valueSrc:null, valueNote:{ref:'iea2020', basis:'Benchmark: average biomethane production cost ~US$65/MWh; biogas US$7–68/MWh.'},
    maxKm:25, maxKmSrc:null, pipeCost:35000, costSrc:null},
  flyash:{name:'Coal fly ash', unit:'t', cat:'material', mode:'truck',
    co2:0.959, co2Src:{ref:'epa2015a', basis:'WARM: fly ash replacing Portland cement 1:1 in concrete, 0.87 t CO₂e per short ton.'},
    value:28, valueSrc:null, maxKm:250, maxKmSrc:null},
  gypsum:{name:'FGD gypsum', unit:'t', cat:'material', mode:'truck',
    co2:0, co2Src:{ref:'epa2015b', basis:'WARM finds no net saving from displacing mined gypsum (≈ +0.03 t per short ton).'},
    value:14, valueSrc:null, maxKm:300, maxKmSrc:null},
  slag:  {name:'Granulated blast-furnace slag', unit:'t', cat:'material', mode:'truck',
    co2:0.903, co2Src:{ref:'epa2015a', basis:'WARM cement factor 0.970 t/t minus 0.067 t/t for grinding GGBS; replaces cement 1:1.'},
    value:29, valueSrc:{ref:'usgs2025b', basis:'USGS average unit value of iron and steel slag, US$29–38/t (2020–2024); granulated slag up to ~US$140/t.'},
    maxKm:500, maxKmSrc:null},
  sulfur:{name:'Recovered sulfur', unit:'t', cat:'material', mode:'truck',
    co2:0, co2Src:null, value:50, valueSrc:{ref:'usgs2025a', basis:'USGS average sulfur price US$50/t in 2024 (range US$25–178/t, 2020–2024).'},
    maxKm:500, maxKmSrc:null},
  scrap: {name:'Ferrous scrap', unit:'t', cat:'material', mode:'truck',
    co2:1.96, co2Src:{ref:'worldsteel2025', basis:'Blast furnace–BOF 2.67 minus scrap-EAF 0.71 t CO₂e per t crude steel (2024 data).'},
    value:120, valueSrc:null, maxKm:500, maxKmSrc:null},
  grain: {name:"Brewer's spent grain", unit:'t', cat:'bio', mode:'truck',
    co2:0.30, co2Src:{ref:'davison2026', basis:'UK study: diverting >130,000 t/yr of BSG from cattle feed to AD, with soya replacing it, raised emissions by 39 kt CO₂e/yr (0.30 t/t). The sign reverses if field beans replace it.'},
    value:28, valueSrc:null, maxKm:60, maxKmSrc:null},
  yeast: {name:'Surplus yeast', unit:'t', cat:'bio', mode:'truck', co2:0, co2Src:null, value:45, valueSrc:null, maxKm:150, maxKmSrc:null},
  organics:{name:'Food & organic residues', unit:'t', cat:'bio', mode:'truck',
    co2:0.595, co2Src:{ref:'epa2023a', basis:'WARM v16: anaerobic digestion instead of landfill for food waste, 0.54 t CO₂e per short ton.'},
    value:45, valueSrc:{ref:'wrap2026', basis:'Avoided UK landfill gate fee £34/t excluding landfill tax (2025–26 median), converted at ~US$1.3/£.'},
    maxKm:80, maxKmSrc:null},
  sludge:{name:'Sewage sludge / biosolids', unit:'t', cat:'bio', mode:'truck',
    co2:0.198, co2Src:{ref:'nzmfe2026', basis:'Landfill with gas recovery (0.221 kg/kg) minus anaerobic digestion (0.022 kg/kg), wet basis.'},
    value:15, valueSrc:null, maxKm:80, maxKmSrc:null},
  wood:  {name:'Wood residues', unit:'t', cat:'bio', mode:'truck',
    co2:0.875, co2Src:{ref:'ipcc2006b', basis:'Wood NCV 15.6 GJ/t displacing natural gas at 56.1 kg CO₂/GJ (1.48 t/t if displacing coal).'},
    value:24, valueSrc:null, maxKm:150, maxKmSrc:null},
  digestate:{name:'Digestate', unit:'t', cat:'bio', mode:'truck',
    co2:0.0107, co2Src:{ref:'menegat2022', basis:'~2.6 kg plant-available N per t whole digestate × 4.07 kg CO₂e per kg synthetic N manufactured.'},
    value:7, valueSrc:null, maxKm:50, maxKmSrc:null}
};
const GLOBAL_SRC = {
  truckEF:{ref:'epa2025', basis:'Medium- and heavy-duty truck, 0.186 kg CO₂ per short ton-mile = 0.127 kg per t·km.'},
  truckCost:{ref:'atri2026', basis:'US$1.452 per vehicle-km (2025 operating cost) ÷ an assumed 20 t payload.'}
};
const FT = {
  power:   {code:'PWR', name:'Thermal power station (CHP)', desc:'Solid-fuel combined heat and power. Surplus heat and steam, plus ash and flue-gas desulfurisation gypsum.',
            out:{heat:120000, steam:60000, flyash:12000, gypsum:8000}, inp:{wood:90000, coolw:1500000, water:250000}},
  refinery:{code:'REF', name:'Oil refinery', desc:'Needs steam and process water. Produces recovered sulfur, heat and warm cooling water.',
            out:{sulfur:18000, heat:60000, coolw:1800000}, inp:{steam:40000, water:600000, biogas:20000}},
  fert:    {code:'FRT', name:'Ammonia & fertiliser plant', desc:'Ammonia synthesis releases a near-pure CO₂ stream; sulfuric acid for phosphate fertiliser uses sulfur.',
            out:{co2:100000, heat:30000}, inp:{sulfur:20000, steam:20000}},
  pulp:    {code:'PLP', name:'Pulp & paper mill', desc:'Bark and fibre residues, mill sludge and heat. Can use CO₂ to make precipitated calcium carbonate filler.',
            out:{wood:70000, sludge:25000, heat:80000}, inp:{steam:50000, co2:15000, water:400000}},
  sawmill: {code:'SAW', name:'Sawmill', desc:'Bark, sawdust and chips. Uses heat for drying kilns.', out:{wood:60000}, inp:{heat:10000}},
  brewery: {code:'BRW', name:'Brewery (900,000 hL/yr)', descHtml:`Sized from literature ratios: about 20 kg wet spent grain per 100 L of beer${cite('mussatto2006')} gives ~18,000 t/yr, and 3–10 L of effluent per L of beer${cite('simate2011')} gives 270,000–900,000 m³/yr.`,
            out:{grain:18000, yeast:1200, co2:2500, orgww:350000}, inp:{steam:12000, heat:4000}},
  food:    {code:'FDP', name:'Food processor', desc:'Organic residues and warm effluent heat. Uses steam and some CO₂ for carbonation and chilling.',
            out:{organics:15000, heat:12000}, inp:{steam:10000, co2:1500}},
  pharma:  {code:'BTX', name:'Biotech / fermentation plant', desc:'Fermentation biomass, surplus heat and CO₂. Large steam and water user.',
            out:{organics:35000, heat:25000, co2:8000}, inp:{steam:30000, water:350000}},
  cement:  {code:'CEM', name:'Cement & concrete producer', desc:'Takes fly ash and slag as cement substitutes, gypsum as set regulator, and wood or sludge as alternative fuel.',
            out:{heat:45000}, inp:{flyash:25000, slag:40000, gypsum:6000, wood:20000, sludge:6000}},
  board:   {code:'GYP', name:'Plasterboard plant', desc:'Main user of by-product gypsum. Needs fuel gas for drying.', out:{}, inp:{gypsum:60000, biogas:15000, steam:5000}},
  steel:   {code:'STL', name:'Steelworks', desc:'Slag and very large heat surplus. Takes scrap metal.', out:{slag:180000, heat:140000}, inp:{scrap:60000, water:500000}},
  scrap:   {code:'SCR', name:'Scrap & metals recycler', desc:'Collects and prepares scrap. Counts as a recycler under the 3-2 test.', recycler:true, out:{scrap:65000}, inp:{}},
  wwtp:    {code:'WWT', name:'Municipal wastewater plant', desc:'Produces reclaimed water and biosolids. Can co-treat industrial effluent.', out:{water:3000000, sludge:9000}, inp:{orgww:200000}},
  biogas:  {code:'ADP', name:'Anaerobic digestion plant', desc:'Turns organics and sludge into biogas and digestate.',
            out:{biogas:40000, digestate:30000, co2:5000}, inp:{organics:25000, sludge:15000, grain:4000, yeast:500}},
  ags:     {code:'AGS', name:'AGS wastewater biorefinery', emerging:true,
            descHtml:`Aerobic granular sludge treating high-strength effluent while recovering extracellular polymeric substances. Alginate-like exopolymers are recovered at municipal scale in the Netherlands${cite('kaumera')}; curdlan recovery from granular sludge is at research stage${cite(['adekunle2024','adekunle2025'])}.`,
            out:{water:320000, sludge:1500}, inp:{orgww:350000}},
  greenh:  {code:'GRH', name:'Greenhouse complex', desc:'Uses low-grade heat, CO₂ for crop enrichment, water and digestate.', out:{organics:3000}, inp:{heat:35000, co2:12000, digestate:1500, water:120000}},
  fish:    {code:'AQU', name:'Land-based aquaculture', desc:'Warm water and heat for fish tanks; produces fish sludge.', out:{sludge:1200}, inp:{heat:9000, water:200000}},
  farm:    {code:'FRM', name:'Livestock & crop farms', desc:'Feed and fertiliser users; produce manure and crop residues.', out:{organics:12000}, inp:{grain:15000, yeast:800, digestate:25000, sludge:4000}},
  dh:      {code:'DHN', name:'District heating network', desc:'Town heat network. Absorbs large amounts of low-grade heat in winter.', out:{}, inp:{heat:180000}}
};
const FT_ORDER = ['power','refinery','fert','steel','pulp','sawmill','cement','board','brewery','food','pharma','scrap','wwtp','biogas','ags','greenh','fish','farm','dh'];
const EXAMPLES = {
  riverside: {name:'Riverside Eco-Park (fictional example)', kmAcross:8,
    nodes:[['power',470,290],['refinery',800,140],['pulp',170,150],['sawmill',150,380],['cement',330,520],['board',520,90],['greenh',820,470],['dh',600,520],['wwtp',820,300],['fert',720,40]],
    links:[[3,0,'wood'],[0,5,'gypsum'],[0,7,'heat'],[8,0,'water'],[1,0,'coolw']]},
  brewery: {name:'Brewery-anchored bio-cluster (fictional example)', kmAcross:5,
    nodes:[['brewery',300,210],['ags',560,110],['farm',150,470],['biogas',470,420],['greenh',800,450],['food',790,190],['wwtp',620,560],['fish',850,320]],
    links:[[0,2,'grain'],[0,1,'orgww']]},
  kalundborg: {name:'Kalundborg-inspired layout (simplified; includes coal-era flows)', kmAcross:4,
    nodes:[['power',480,300],['refinery',180,180],['pharma',780,160],['board',480,520],['dh',480,70],['biogas',800,420],['farm',800,560],['cement',160,470]],
    links:[[0,2,'steam'],[0,1,'steam'],[0,4,'heat'],[0,3,'gypsum'],[0,7,'flyash'],[1,0,'coolw'],[2,5,'organics'],[5,3,'biogas'],[5,6,'digestate']]},
  blank: {name:'Blank site', kmAcross:8, nodes:[], links:[]}
};


/* =================== builder state, history, view =================== */
const W = 150, H = 46;
let F = clone(STREAM_DEFAULTS);
const P_DEFAULT = {truckCost:0.073, truckEF:0.127, carbon:50};
let P = Object.assign({kmAcross:8}, P_DEFAULT);
let site = {name:'', nodes:[], links:[]};
let sel = null, uid = 1;
let VB = {x:0, y:0, w:1000, h:600};
const undoStack = [], redoStack = [];
const factorSnapshot = () => Object.fromEntries(Object.entries(F).map(([k,v]) => [k,{co2:v.co2,value:v.value,maxKm:v.maxKm,pipeCost:v.pipeCost,unitKmCost:v.unitKmCost}]));
function save(){ store.set('site', {site, F:factorSnapshot(), P, uid}); }
function restore(){
  const d = store.get('site', null);
  if (!d || !d.site || d.site.nodes.some(n => !FT[n.type])) return false;
  site = d.site; P = Object.assign(P, d.P || {}); uid = d.uid || 1000;
  F = clone(STREAM_DEFAULTS); if (d.F) for (const k in F) if (d.F[k]) Object.assign(F[k], d.F[k]);
  return true;
}
function pushHistory(){ undoStack.push(JSON.stringify({site, uid})); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; updHistBtns(); }
function restoreSnap(s){ const d = JSON.parse(s); site = d.site; uid = d.uid; sel = null; }
function undo(){ if (!undoStack.length) return toast('Nothing to undo'); redoStack.push(JSON.stringify({site, uid})); restoreSnap(undoStack.pop()); renderAll(); updHistBtns(); toast('Undone'); }
function redo(){ if (!redoStack.length) return toast('Nothing to redo'); undoStack.push(JSON.stringify({site, uid})); restoreSnap(redoStack.pop()); renderAll(); updHistBtns(); toast('Redone'); }
function updHistBtns(){ const u = $('#undoBtn'), r = $('#redoBtn'); if (u){ u.disabled = !undoStack.length; r.disabled = !redoStack.length; } }
function mutate(fn, msg){ pushHistory(); fn(); renderAll(); if (msg) toast(msg, {action:'Undo', onAction: undo}); }

function loadExample(key){
  const ex = EXAMPLES[key]; uid = 1;
  site = {name: ex.name, nodes: [], links: []}; P.kmAcross = ex.kmAcross;
  ex.nodes.forEach(([type,x,y]) => site.nodes.push({id:'n'+(uid++), type, x, y, name: FT[type].name}));
  ex.links.forEach(([a,b,s]) => site.links.push({id:'l'+(uid++), from: site.nodes[a].id, to: site.nodes[b].id, stream: s, qty: null}));
  sel = null; VB = {x:0, y:0, w:1000, h:600};
}
const byId = id => site.nodes.find(n => n.id === id);
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y) / 1000 * P.kmAcross;
function evalFlow(a, b, s, q){
  const f = F[s], d = dist(a,b);
  let cost, em = 0;
  if (f.mode === 'pipe') cost = q > 0 ? d * f.pipeCost : 0;
  else if (f.mode === 'unitkm') cost = q * d * f.unitKmCost;
  else { cost = q * d * P.truckCost; em = q * d * P.truckEF / 1000; }
  const value = q * f.value, co2 = q * f.co2 - em, net = value + co2 * P.carbon - cost;
  return {q, d, cost, em, value, co2, net, feasible: d <= f.maxKm};
}
function compute(){
  const sup = {}, dem = {};
  site.nodes.forEach(n => { const t = FT[n.type];
    for (const s in t.out) sup[n.id+'|'+s] = t.out[s];
    for (const s in t.inp) dem[n.id+'|'+s] = t.inp[s]; });
  const res = {}, tot = {n:0, value:0, cost:0, co2:0, net:0, mat:0, energy:0, water:0, bad:0};
  site.links.forEach(l => {
    const a = byId(l.from), b = byId(l.to); if (!a || !b) return;
    const ks = l.from+'|'+l.stream, kd = l.to+'|'+l.stream;
    const avail = Math.max(0, Math.min(sup[ks] || 0, dem[kd] || 0));
    const q = l.qty != null ? Math.max(0, Math.min(l.qty, avail)) : avail;
    sup[ks] = (sup[ks] || 0) - q; dem[kd] = (dem[kd] || 0) - q;
    const r = evalFlow(a, b, l.stream, q); res[l.id] = r;
    if (q > 0){ tot.n++; if (!r.feasible) tot.bad++; }
    tot.value += r.value; tot.cost += r.cost; tot.co2 += r.co2; tot.net += r.net;
    const f = F[l.stream];
    if (f.unit === 'MWh') tot.energy += q; else if (f.unit === 'm³') tot.water += q; else if (f.cat === 'material' || f.cat === 'bio') tot.mat += q;
  });
  return {res, tot, sup, dem};
}
function opportunities(calc, onlyNode){
  const out = [];
  site.nodes.forEach(a => { const ta = FT[a.type];
    site.nodes.forEach(b => {
      if (a === b) return;
      if (onlyNode && a.id !== onlyNode && b.id !== onlyNode) return;
      const tb = FT[b.type];
      for (const s in ta.out){
        if (!tb.inp[s]) continue;
        if (site.links.some(l => l.from === a.id && l.to === b.id && l.stream === s)) continue;
        const q = Math.min(calc.sup[a.id+'|'+s] || 0, calc.dem[b.id+'|'+s] || 0);
        if (q <= 0) continue;
        out.push({a, b, s, r: evalFlow(a, b, s, q)});
      }
    });
  });
  return out.sort((x,y) => (y.r.feasible - x.r.feasible) || (y.r.net - x.r.net));
}
function symTest(calc){
  const active = site.links.filter(l => calc.res[l.id] && calc.res[l.id].q > 0);
  const ents = new Set(), streams = new Set();
  active.forEach(l => { ents.add(l.from); ents.add(l.to); streams.add(l.stream); });
  const nonRec = [...ents].filter(id => { const n = byId(id); return n && !FT[n.type].recycler; });
  const val = {};
  active.forEach(l => { const r = calc.res[l.id]; [l.from,l.to].forEach(id => { val[id] = (val[id]||0) + Math.max(0, r.net); }); });
  const totPos = active.reduce((s,l) => s + Math.max(0, calc.res[l.id].net), 0);
  let key = null; for (const id in val) if (!key || val[id] > val[key]) key = id;
  const n = ents.size;
  return {nonRec: nonRec.length, streams: streams.size, pass: nonRec.length >= 3 && streams.size >= 2,
          key, keyShare: key && totPos > 0 ? val[key] / totPos : 0, density: n > 1 ? active.length / (n*(n-1)) : 0};
}

/* =================== builder rendering =================== */
function renderAll(opts = {}){
  const calc = compute();
  renderKpis(calc); renderPark(calc);
  if (!opts.keepInspector) renderInspector(calc);
  $('#siteName').textContent = site.name || 'Untitled site';
  save(); updHistBtns(); return calc;
}
function renderKpis(calc){
  const t = calc.tot;
  const k = [['Exchanges', t.n, t.bad ? t.bad + ' beyond practical range' : 'active flows'],
    ['Net value', money(t.net), '$/yr after transport, incl. carbon'],
    ['CO₂e avoided', cmp(t.co2) + ' t', 't/yr, net of trucking'],
    ['Materials diverted', cmp(t.mat) + ' t', 't/yr kept out of disposal'],
    ['Energy recovered', cmp(t.energy), 'MWh/yr of heat, steam, gas'],
    ['Water reused', cmp(t.water), 'm³/yr']];
  $('#kpis').innerHTML = k.map(([l,v,s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
}
function bez(p0, c, p2, t){ const u = 1-t; return {x: u*u*p0.x + 2*u*t*c.x + t*t*p2.x, y: u*u*p0.y + 2*u*t*c.y + t*t*p2.y}; }
function bezTan(p0, c, p2, t){ return {x: 2*(1-t)*(c.x-p0.x) + 2*t*(p2.x-c.x), y: 2*(1-t)*(c.y-p0.y) + 2*t*(p2.y-c.y)}; }
function curve(a, b, off){
  const mx = (a.x+b.x)/2, my = (a.y+b.y)/2, dx = b.x-a.x, dy = b.y-a.y, L = Math.hypot(dx,dy) || 1;
  const c = {x: mx - dy/L*off, y: my + dx/L*off};
  return {c, d:`M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`};
}
function arrowAt(a, c, b, t, color, size = 7){
  const p = bez(a,c,b,t), tg = bezTan(a,c,b,t), L = Math.hypot(tg.x,tg.y) || 1, ux = tg.x/L, uy = tg.y/L;
  const pts = [[p.x+ux*size, p.y+uy*size],[p.x-ux*size*0.7-uy*size*0.75, p.y-uy*size*0.7+ux*size*0.75],[p.x-ux*size*0.7+uy*size*0.75, p.y-uy*size*0.7-ux*size*0.75]];
  return `<polygon points="${pts.map(q=>q.map(v=>v.toFixed(1)).join(',')).join(' ')}" style="fill:${color}"/>`;
}
function parkMarkup(calc, forExport){
  const upk = 1000 / P.kmAcross, v = forExport ? {x:0,y:0,w:1000,h:600} : VB, k = v.w / 1000;
  const barKm = [0.25,0.5,1,2,5,10,20].find(x => x*upk >= 90) || 20, barW = barKm * upk;
  let h = `<defs><pattern id="g" width="${upk/2}" height="${upk/2}" patternUnits="userSpaceOnUse"><path d="M ${upk/2} 0 L 0 0 0 ${upk/2}" fill="none" style="stroke:var(--grid)" stroke-width="1"/></pattern></defs>`;
  h += `<rect x="-3000" y="-3000" width="7000" height="6600" style="fill:var(--bg)"/><rect width="1000" height="600" style="fill:var(--ground)"/><rect width="1000" height="600" fill="url(#g)"/><rect width="1000" height="600" fill="none" style="stroke:var(--line)" stroke-dasharray="6 6"/>`;
  h += `<g transform="translate(${(v.x + 20*k).toFixed(1)},${(v.y + v.h - 20*k).toFixed(1)})"><rect x="0" y="${-5*k}" width="${barW}" height="${5*k}" style="fill:var(--ink)"/><rect x="${barW/2}" y="${-5*k}" width="${barW/2}" height="${5*k}" style="fill:var(--panel)"/><rect x="0" y="${-5*k}" width="${barW}" height="${5*k}" fill="none" style="stroke:var(--ink)" stroke-width="${k}"/><text x="0" y="${-10*k}" style="fill:var(--muted);font:500 ${11*k}px var(--mono)">0</text><text x="${barW}" y="${-10*k}" text-anchor="end" style="fill:var(--muted);font:500 ${11*k}px var(--mono)">${barKm} km</text></g>`;
  if (!site.nodes.length) h += `<text x="500" y="290" text-anchor="middle" style="fill:var(--muted);font:600 16px var(--display)">Empty site</text><text x="500" y="314" text-anchor="middle" style="fill:var(--muted);font:13px var(--body)">Add facilities from the list, or load an example site.</text>`;
  const pairCount = {}, pairIdx = {};
  site.links.forEach(l => { const kk = [l.from,l.to].sort().join('~'); pairCount[kk] = (pairCount[kk]||0) + 1; });
  const maxNet = Math.max(1, ...site.links.map(l => calc.res[l.id] ? Math.max(0, calc.res[l.id].net) : 0));
  const selNode = !forExport && sel && sel.kind === 'node' ? sel.id : null;
  site.links.forEach(l => {
    const a = byId(l.from), b = byId(l.to), r = calc.res[l.id]; if (!a || !b || !r) return;
    const kk = [l.from,l.to].sort().join('~'); const i = pairIdx[kk] = (pairIdx[kk] ?? -1) + 1; const n = pairCount[kk];
    const {c, d} = curve(a, b, 26 + (i - (n-1)/2) * 30);
    const color = `var(--${F[l.stream].cat})`;
    const w = r.q > 0 ? 2 + 6 * Math.sqrt(Math.max(0, r.net) / maxNet) : 1.5;
    const dim = selNode && l.from !== selNode && l.to !== selNode;
    const isSel = !forExport && sel && sel.kind === 'link' && sel.id === l.id;
    h += `<g data-link="${l.id}"><path class="link ${r.feasible && r.q > 0 ? (forExport ? '' : 'flow') : 'bad'} ${dim ? 'dim' : ''} ${isSel ? 'sel' : ''}" d="${d}" style="stroke:${color};fill:none" stroke-width="${w.toFixed(1)}" ${!r.feasible || r.q === 0 ? 'stroke-dasharray="2 5"' : ''}/>`;
    if (!dim) h += arrowAt(a, c, b, 0.62, color, 5 + w*0.6);
    if (!forExport) h += `<path class="link-hit" d="${d}"><title>${esc(a.name)} → ${esc(b.name)}: ${esc(F[l.stream].name)}</title></path>`;
    h += `</g>`;
  });
  site.nodes.forEach(n => {
    const t = FT[n.type], isSel = selNode === n.id;
    const linked = selNode && (isSel || site.links.some(l => (l.from === selNode && l.to === n.id) || (l.to === selNode && l.from === n.id)));
    const nm = n.name.length > 22 ? n.name.slice(0,21) + '…' : n.name;
    h += `<g class="node${isSel ? ' sel' : ''}${selNode && !linked ? ' dim' : ''}" data-node="${n.id}" transform="translate(${n.x - W/2},${n.y - H/2})" ${forExport ? '' : `tabindex="0" role="button" aria-label="${esc(n.name)}"`}>
      <rect class="box" width="${W}" height="${H}" rx="6" style="fill:var(--panel);stroke:${isSel ? 'var(--accent)' : 'var(--line)'}" stroke-width="${isSel ? 2.4 : 1.2}"/><text class="code" x="9" y="16" style="font:600 10px var(--mono);fill:var(--muted)">${t.code}</text>
      ${t.emerging ? `<rect x="${W-50}" y="6" width="42" height="14" rx="3" style="fill:var(--accent-soft)"/><text x="${W-29}" y="16.5" text-anchor="middle" style="font:600 9px var(--mono);fill:var(--accent)">PILOT</text>` : ''}
      <text class="nm" x="9" y="35" style="font:600 12.5px var(--body);fill:var(--ink)">${esc(nm)}</text>${forExport ? '' : `<title>${esc(n.name)}</title>`}</g>`;
  });
  return h;
}
function renderPark(calc){
  const svg = $('#park');
  svg.setAttribute('viewBox', `${VB.x.toFixed(1)} ${VB.y.toFixed(1)} ${VB.w.toFixed(1)} ${VB.h.toFixed(1)}`);
  svg.innerHTML = parkMarkup(calc, false);
  $('#scaleNote').textContent = `Site ${P.kmAcross} km wide · zoom ${Math.round(1000 / VB.w * 100)}%`;
}
/* ----- zoom & pan ----- */
function setVB(nv){ nv.w = Math.max(220, Math.min(2400, nv.w)); nv.h = nv.w * 0.6; VB = nv; renderPark(compute()); }
function zoomAt(f, cx = VB.x + VB.w/2, cy = VB.y + VB.h/2){ const w = Math.max(220, Math.min(2400, VB.w * f)), r = w / VB.w; setVB({x: cx - (cx - VB.x) * r, y: cy - (cy - VB.y) * r, w}); }
function fitView(){
  if (!site.nodes.length){ setVB({x:0,y:0,w:1000}); return; }
  const xs = site.nodes.map(n => n.x), ys = site.nodes.map(n => n.y);
  let x0 = Math.min(...xs) - W/2 - 40, x1 = Math.max(...xs) + W/2 + 40, y0 = Math.min(...ys) - H/2 - 50, y1 = Math.max(...ys) + H/2 + 50;
  let w = Math.max(x1 - x0, (y1 - y0) / 0.6, 400);
  setVB({x: (x0 + x1)/2 - w/2, y: (y0 + y1)/2 - w*0.3, w});
}
/* ----- export ----- */
function exportSvgString(){
  const cs = getComputedStyle(document.documentElement);
  const vars = ['--bg','--panel','--panel2','--ink','--muted','--line','--line2','--accent','--accent-soft','--ground','--grid','--energy','--water','--material','--bio','--gas','--display','--body','--mono'];
  const decl = vars.map(v => `${v}:${cs.getPropertyValue(v).trim()}`).join(';');
  const legend = Object.entries(CATS).map(([k,l], i) => `<g transform="translate(${20 + i*150},630)"><circle r="5" cx="5" cy="-4" style="fill:var(--${k})"/><text x="15" y="0" style="font:12px var(--body);fill:var(--ink)">${esc(l)}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1300" viewBox="0 0 1000 650"><style>svg{${decl}}</style><rect width="1000" height="650" style="fill:var(--bg)"/>${parkMarkup(compute(), true)}${legend}<text x="980" y="640" text-anchor="end" style="font:11px var(--mono);fill:var(--muted)">${esc(site.name)} · Symbiosis Workbench</text></svg>`;
}
function exportPng(){
  const svg = exportSvgString(), img = new Image();
  const url = URL.createObjectURL(new Blob([svg], {type:'image/svg+xml;charset=utf-8'}));
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1300;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 2000, 1300); URL.revokeObjectURL(url);
    try { c.toBlob(b => b ? download('symbiosis-park.png', b) : toast('PNG export blocked here. Try SVG.'), 'image/png'); } catch(e){ toast('PNG export blocked here. Try SVG.'); }
  };
  img.onerror = () => toast('PNG export failed. Try SVG.');
  img.src = url;
}
function exchangesCsv(){
  const calc = compute();
  const rows = [['From','To','Stream','Unit','Quantity_per_yr','Distance_km','Mode','Within_range','Value_USD','Transport_USD','CO2e_avoided_t','Net_USD','CO2e_factor_source','Value_source']];
  const s = x => x ? `[${REFS[x.ref].n}] ${REFS[x.ref].authors || REFS[x.ref].publisher} ${REFS[x.ref].year || ''}` : 'illustrative';
  site.links.forEach(l => { const r = calc.res[l.id], f = F[l.stream];
    rows.push([byId(l.from).name, byId(l.to).name, f.name, f.unit, Math.round(r.q), r.d.toFixed(2), f.mode, r.feasible ? 'yes' : 'no', Math.round(r.value), Math.round(r.cost), r.co2.toFixed(1), Math.round(r.net), s(f.co2Src), s(f.valueSrc)]); });
  return rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v).join(',')).join('\n');
}
const siteJson = () => JSON.stringify({app:'symbiosis-workbench', version:CONFIG.version, site, P, F:factorSnapshot()}, null, 1);
function loadSiteObj(d){
  if (!d.site || !Array.isArray(d.site.nodes) || d.site.nodes.some(n => !FT[n.type])) throw new Error('bad');
  pushHistory();
  site = d.site; if (d.P) P = Object.assign(P, d.P); if (d.F) for (const k in F) if (d.F[k]) Object.assign(F[k], d.F[k]);
  uid = 1 + Math.max(0, ...site.nodes.concat(site.links).map(x => +String(x.id).slice(1) || 0));
  sel = null; buildGlobals(); buildFactorTable(); renderAll(); fitView(); toast('Site loaded', {action:'Undo', onAction: undo});
}

/* ----- inspector ----- */
const STREAM_WASTE = {};
DATA.WASTES.forEach(w => { if (w.try && !STREAM_WASTE[w.try[0]]) STREAM_WASTE[w.try[0]] = w.id; });
function streamRow(s, qty, used, word){
  const f = F[s], pct = qty ? Math.min(100, used/qty*100) : 0, wid = STREAM_WASTE[s];
  return `<tr><td><span class="c-${f.cat}" style="display:inline-flex;gap:6px;align-items:center"><i class="dot"></i>${wid ? `<a href="#/catalogue/${wid}" title="Evidence for this stream in the catalogue">${esc(f.name)}</a>` : esc(f.name)}</span>
    <div class="bar"><i style="width:${pct.toFixed(0)}%;background:var(--${f.cat})"></i></div></td>
    <td class="r mono">${cmp(qty)} ${f.unit}<br><span class="note">${pct.toFixed(0)}% ${word}</span></td></tr>`;
}
function oppHtml(list, max){
  if (!list.length) return `<p class="note">No unconnected matches. Add facilities that use or supply these streams.</p>`;
  return `<div class="opps">` + list.slice(0, max).map(o => { const f = F[o.s];
    return `<div class="opp"><div class="t"><i class="dot c-${f.cat}"></i>${esc(o.a.name)} → ${esc(o.b.name)}</div>
      <div class="m">${esc(f.name)} · ${cmp(o.r.q)} ${f.unit} · ${km(o.r.d)} · <b style="color:${o.r.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(o.r.net)}/yr</b>${o.r.feasible ? '' : ' · <span class="chip bad">too far</span>'}</div>
      <button class="btn small" type="button" data-act="connect" data-a="${o.a.id}" data-b="${o.b.id}" data-s="${o.s}">Connect</button></div>`; }).join('') + `</div>`;
}
const srcTag = s => s ? `<span class="src-chip ok">sourced</span>${cite(s.ref)}` : `<span class="src-chip ill">illustrative</span>`;
function renderInspector(calc){
  const el = $('#inspector');
  if (sel && sel.kind === 'node'){
    const n = byId(sel.id); if (!n){ sel = null; return renderInspector(calc); }
    const t = FT[n.type];
    const outs = Object.keys(t.out).map(s => streamRow(s, t.out[s], t.out[s] - (calc.sup[n.id+'|'+s] ?? t.out[s]), 'exchanged')).join('');
    const ins = Object.keys(t.inp).map(s => streamRow(s, t.inp[s], t.inp[s] - (calc.dem[n.id+'|'+s] ?? t.inp[s]), 'met by partners')).join('');
    el.innerHTML = `<div class="insp"><div class="insp-head"><input id="nodeName" value="${esc(n.name)}" aria-label="Facility name"><button class="icon-btn" type="button" data-act="deselect" aria-label="Close (Esc)">${icon('x')}</button></div>
      <p class="note mono" style="margin:2px 0 6px">${t.code} · ${esc(t.name)} ${t.emerging ? '<span class="chip warn">Pilot technology</span>' : ''}${t.recycler ? ' <span class="chip">Recycler</span>' : ''}</p>
      <p class="desc">${t.descHtml || esc(t.desc)}</p><p class="note" style="margin-top:6px">Move with arrow keys (<kbd>Shift</kbd> for larger steps) · <kbd>Del</kbd> removes</p></div>
      ${outs ? `<div><h4>Supplies (per year)</h4><table class="mini">${outs}</table></div>` : ''}
      ${ins ? `<div><h4>Needs (per year)</h4><table class="mini">${ins}</table></div>` : ''}
      <div><h4 style="margin-bottom:6px">Matches for this facility</h4>${oppHtml(opportunities(calc, n.id), 8)}</div>
      <div><button class="btn danger" type="button" data-act="delnode">Remove facility</button></div>`;
    return;
  }
  if (sel && sel.kind === 'link'){
    const l = site.links.find(x => x.id === sel.id); if (!l){ sel = null; return renderInspector(calc); }
    const a = byId(l.from), b = byId(l.to), r = calc.res[l.id], f = F[l.stream], wid = STREAM_WASTE[l.stream];
    el.innerHTML = `<div class="insp"><div class="insp-head"><h3>${esc(a.name)} → ${esc(b.name)}</h3><button class="icon-btn" type="button" data-act="deselect" aria-label="Close (Esc)">${icon('x')}</button></div>
      <p class="note" style="margin-top:4px"><span class="c-${f.cat}" style="display:inline-flex;gap:6px;align-items:center"><i class="dot"></i>${esc(f.name)}</span> · ${f.mode === 'truck' ? 'truck' : 'pipeline'}${wid ? ` · <a href="#/catalogue/${wid}">See evidence in catalogue</a>` : ''}</p></div>
      ${!r.feasible ? `<div class="callout bad">At ${km(r.d)} this is beyond the practical range used for ${esc(f.name.toLowerCase())} (${f.maxKm} km). Move the facilities closer or change the range in Assumptions.</div>` : ''}
      ${r.q === 0 ? `<div class="callout warn">No quantity is flowing. Other exchanges already use the supply, or the receiver’s demand is met.</div>` : ''}
      <label class="field" for="linkQty">Quantity (${f.unit}/yr), blank = maximum available
        <input id="linkQty" type="number" min="0" step="any" value="${l.qty ?? ''}" placeholder="auto: ${cmp(r.q)}"></label>
      <dl class="kv">
        <dt>Flowing</dt><dd class="mono">${cmp(r.q)} ${f.unit}/yr</dd>
        <dt>Distance</dt><dd class="mono">${km(r.d)}</dd>
        <dt>Resource value</dt><dd class="mono">${money(r.value)}</dd>
        <dt>Transport cost</dt><dd class="mono">−${money(r.cost)}</dd>
        <dt>CO₂e avoided (net)</dt><dd class="mono">${cmp(r.co2)} t</dd>
        <dt>Carbon value @ $${P.carbon}/t</dt><dd class="mono">${money(r.co2 * P.carbon)}</dd>
        <dt><b>Net value</b></dt><dd class="mono"><b style="color:${r.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.net)}/yr</b></dd>
      </dl>
      <div><h4 style="margin-bottom:4px">Evidence behind this line</h4>
      <table class="mini"><tr><td>CO₂e factor ${f.co2} t/${f.unit}</td><td class="r">${srcTag(f.co2Src)}</td></tr>
      <tr><td>Value $${f.value}/${f.unit}</td><td class="r">${srcTag(f.valueSrc)}</td></tr>
      <tr><td>Practical range ${f.maxKm} km</td><td class="r">${srcTag(f.maxKmSrc)}</td></tr>
      <tr><td>Transport cost</td><td class="r">${f.mode === 'truck' ? srcTag(GLOBAL_SRC.truckCost) : srcTag(f.costSrc)}</td></tr></table>
      ${f.co2Src ? `<p class="note" style="margin-top:6px">${esc(f.co2Src.basis)}</p>` : ''}</div>
      <div><button class="btn danger" type="button" data-act="dellink">Delete exchange</button></div>`;
    return;
  }
  const st = symTest(calc), keyN = st.key ? byId(st.key) : null;
  el.innerHTML = `<div><h3>Is this industrial symbiosis?</h3><p class="note" style="margin-top:2px">Chertow’s 3-2 heuristic${cite('chertow2007')}: at least three entities, none primarily a recycler, exchanging at least two different resources.</p></div>
    <div class="test">
      <div class="row"><span>Non-recycler entities exchanging</span><span class="chip ${st.nonRec >= 3 ? 'good' : 'bad'}">${st.nonRec} of 3 needed</span></div>
      <div class="row"><span>Different resources exchanged</span><span class="chip ${st.streams >= 2 ? 'good' : 'bad'}">${st.streams} of 2 needed</span></div>
      <div class="row"><b>Result</b><span class="chip ${st.pass ? 'good' : 'warn'}">${st.pass ? 'Meets the 3-2 test' : 'Not yet symbiosis'}</span></div>
    </div>
    <div><h4 style="margin-bottom:6px">Network dependency</h4>
      ${keyN ? `<dl class="kv"><dt>Anchor facility</dt><dd>${esc(keyN.name)}</dd><dt>Share of network value</dt><dd class="mono">${(st.keyShare*100).toFixed(0)}%</dd><dt>Link density</dt><dd class="mono">${st.density.toFixed(2)}</dd></dl>
      <p class="note" style="margin-top:6px">${st.keyShare > 0.6 ? `If ${esc(keyN.name)} closed or changed fuel, most of the network’s value would go with it.` : 'Value is spread across several partners, so the network is less exposed to one closure.'} Dependence on particular partners is a resilience risk worth tracking${cite('fraccascia2017')}.</p>` : '<p class="note">No active exchanges yet.</p>'}
    </div>
    <div><h4 style="margin-bottom:6px">Best unconnected matches</h4>${oppHtml(opportunities(calc), 8)}</div>`;
}

/* =================== builder events =================== */
function svgPt(e){ const svg = $('#park'); const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
let drag = null, pan = null;
function addNode(type, x, y){
  if (x == null){
    let best = null;
    for (let tries = 0; tries < 60; tries++){
      const cx = 100 + Math.random()*800, cy = 60 + Math.random()*480;
      const md = Math.min(9999, ...site.nodes.map(n => Math.hypot(n.x-cx, (n.y-cy)*2.2)));
      if (!best || md > best.md) best = {x:cx, y:cy, md};
    }
    x = best.x; y = best.y;
  }
  const n = {id:'n'+(uid++), type, x: Math.round(x), y: Math.round(y), name: FT[type].name};
  site.nodes.push(n); return n;
}
function selectNode(id){ sel = {kind:'node', id}; renderAll(); }
function deleteSelected(){
  if (!sel) return;
  if (sel.kind === 'node'){ const id = sel.id, nm = byId(id)?.name; mutate(() => { site.nodes = site.nodes.filter(n => n.id !== id); site.links = site.links.filter(l => l.from !== id && l.to !== id); sel = null; }, `${nm} removed`); }
  else { const id = sel.id; mutate(() => { site.links = site.links.filter(l => l.id !== id); sel = null; }, 'Exchange deleted'); }
}
function autoConnect(){
  pushHistory(); let added = 0;
  for (let i = 0; i < 200; i++){
    const o = opportunities(compute()).find(o => o.r.feasible && o.r.net > 0); if (!o) break;
    site.links.push({id:'l'+(uid++), from:o.a.id, to:o.b.id, stream:o.s, qty:null}); added++;
  }
  if (!added) undoStack.pop();
  renderAll(); added ? toast(`${added} exchange${added > 1 ? 's' : ''} added`, {action:'Undo', onAction: undo}) : toast('No profitable matches left');
}
function initBuilder(){
  $('#facList').innerHTML = FT_ORDER.map(k => `<button class="fac-btn" type="button" data-add="${k}"><span class="code">${FT[k].code}</span><span>${esc(FT[k].name)}</span><span class="plus">+</span></button>`).join('');
  $('#facList').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    let n; mutate(() => { n = addNode(b.dataset.add); sel = {kind:'node', id:n.id}; }, FT[b.dataset.add].name + ' added');
  });
  const svg = $('#park');
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const g = e.target.closest('[data-node]');
    if (g){ const n = byId(g.dataset.node); const p = svgPt(e); drag = {n, dx: p.x - n.x, dy: p.y - n.y, sx: p.x, sy: p.y, moved:false}; svg.setPointerCapture(e.pointerId); return; }
    const lk = e.target.closest('[data-link]');
    if (lk){ sel = {kind:'link', id: lk.dataset.link}; renderAll(); return; }
    pan = {sx: e.clientX, sy: e.clientY, vx: VB.x, vy: VB.y, moved:false, rect: svg.getBoundingClientRect()};
    if (e.pointerType === 'mouse') svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (drag){
      const p = svgPt(e);
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 4) return;
      if (!drag.moved){ pushHistory(); drag.moved = true; }
      drag.n.x = Math.round(Math.max(W/2+4, Math.min(1000 - W/2 - 4, p.x - drag.dx)));
      drag.n.y = Math.round(Math.max(H/2+4, Math.min(600 - H/2 - 4, p.y - drag.dy)));
      const calc = compute(); renderPark(calc); renderKpis(calc);
    } else if (pan && e.pointerType === 'mouse'){
      const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      pan.moved = true; svg.classList.add('panning');
      const s = VB.w / pan.rect.width;
      VB.x = pan.vx - dx * s; VB.y = pan.vy - dy * s; renderPark(compute());
    }
  });
  const end = () => {
    if (drag){ const d = drag; drag = null; if (!d.moved) sel = {kind:'node', id: d.n.id}; renderAll(); }
    else if (pan){ const p = pan; pan = null; svg.classList.remove('panning'); if (!p.moved && sel){ sel = null; renderAll(); } }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault(); const p = svgPt(e); zoomAt(Math.exp(e.deltaY * 0.0022), p.x, p.y);
  }, {passive:false});
  svg.addEventListener('keydown', e => {
    const g = e.target.closest('[data-node]'); if (!g) return;
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); selectNode(g.dataset.node); setTimeout(() => $(`[data-node="${g.dataset.node}"]`)?.focus(), 0); }
  });
  $('#zIn').onclick = () => zoomAt(0.8); $('#zOut').onclick = () => zoomAt(1.25); $('#zFit').onclick = fitView;
  $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo; $('#pngBtn').onclick = exportPng;
  $('#inspector').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'deselect'){ sel = null; renderAll(); }
    if (act === 'connect') mutate(() => site.links.push({id:'l'+(uid++), from:b.dataset.a, to:b.dataset.b, stream:b.dataset.s, qty:null}), 'Exchange added');
    if (act === 'delnode' || act === 'dellink') deleteSelected();
  });
  $('#inspector').addEventListener('focusin', e => { if (e.target.id === 'nodeName') pushHistory(); });
  $('#inspector').addEventListener('input', e => { if (e.target.id === 'nodeName' && sel){ const n = byId(sel.id); n.name = e.target.value || FT[n.type].name; renderAll({keepInspector:true}); } });
  $('#inspector').addEventListener('change', e => { if (e.target.id === 'linkQty' && sel){ const l = site.links.find(x => x.id === sel.id); const v = e.target.value.trim(); pushHistory(); l.qty = v === '' ? null : Math.max(0, +v); renderAll(); } });
  $('#autoBtn').addEventListener('click', autoConnect);
  $('#clearLinksBtn').addEventListener('click', () => { if (!site.links.length) return; mutate(() => { site.links = []; sel = null; }, 'All exchanges removed'); });
  $('#exampleSel').addEventListener('change', e => { pushHistory(); loadExample(e.target.value); buildGlobals(); renderAll(); toast('Loaded ' + EXAMPLES[e.target.value].name, {action:'Undo', onAction: undo}); });
  buildGlobals(); buildFactorTable();
  $('#dlCsv').onclick = () => download('symbiosis-exchanges.csv', exchangesCsv(), 'text/csv');
  $('#copyCsv').onclick = () => copyText(exchangesCsv(), 'CSV');
  $('#dlJson').onclick = () => download('symbiosis-site.json', siteJson(), 'application/json');
  $('#dlSvg').onclick = () => download('symbiosis-park.svg', exportSvgString(), 'image/svg+xml');
  $('#fileIn').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { try { loadSiteObj(JSON.parse(r.result)); } catch(err){ toast('That file is not a valid site JSON'); } }; r.readAsText(f); e.target.value = '';
  });
  $('#loadJson').addEventListener('click', () => { try { loadSiteObj(JSON.parse($('#jsonBox').value)); } catch(e){ toast('That text is not a valid site JSON'); } });
  $('#resetFactors').addEventListener('click', () => { F = clone(STREAM_DEFAULTS); Object.assign(P, P_DEFAULT); buildGlobals(); buildFactorTable(); renderAll(); toast('Factors reset'); });
  // drag-and-drop a site file onto the canvas
  const box = $('#siteBox');
  box.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')){ e.preventDefault(); } });
  box.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (!f) return; e.preventDefault();
    const r = new FileReader(); r.onload = () => { try { loadSiteObj(JSON.parse(r.result)); } catch(err){ toast('That file is not a valid site JSON'); } }; r.readAsText(f); });
}
function builderKeys(e){
  if (e.key === 'Escape' && sel){ sel = null; renderAll(); return true; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel){ e.preventDefault(); deleteSelected(); return true; }
  if (sel && sel.kind === 'node' && e.key.startsWith('Arrow')){
    e.preventDefault(); const n = byId(sel.id), s = e.shiftKey ? 40 : 10;
    if (!builderKeys.moving){ pushHistory(); builderKeys.moving = true; clearTimeout(builderKeys.t); }
    builderKeys.t = setTimeout(() => builderKeys.moving = false, 600);
    if (e.key === 'ArrowLeft') n.x -= s; if (e.key === 'ArrowRight') n.x += s; if (e.key === 'ArrowUp') n.y -= s; if (e.key === 'ArrowDown') n.y += s;
    n.x = Math.max(W/2+4, Math.min(1000 - W/2 - 4, n.x)); n.y = Math.max(H/2+4, Math.min(600 - H/2 - 4, n.y));
    renderAll(); return true;
  }
  if (e.key === '+' || e.key === '='){ zoomAt(0.8); return true; }
  if (e.key === '-' || e.key === '_'){ zoomAt(1.25); return true; }
  if (e.key.toLowerCase() === 'f'){ fitView(); return true; }
  if (e.key.toLowerCase() === 'a' && e.shiftKey){ autoConnect(); return true; }
  return false;
}
function buildGlobals(){
  const g = [['kmAcross','Site width (km)',0.5,null],['carbon','Carbon price ($/t CO₂e), your choice',5,null],['truckCost','Truck cost ($/t·km)',0.001,GLOBAL_SRC.truckCost],['truckEF','Truck emissions (kg CO₂/t·km)',0.001,GLOBAL_SRC.truckEF]];
  $('#globals').innerHTML = g.map(([k,l,st,src]) => `<label class="field" for="g-${k}">${l}<input id="g-${k}" type="number" step="${st}" min="0" value="${P[k]}" data-g="${k}"><span>${src ? srcTag(src) : ''}</span></label>`).join('');
}
function buildFactorTable(){
  let h = `<thead><tr><th>Stream</th><th>Unit</th><th>Mode</th><th class="r">CO₂e avoided<br>t / unit</th><th>CO₂e source &amp; basis</th><th class="r">Value<br>$ / unit</th><th class="r">Range<br>km</th><th class="r">Transport cost</th></tr></thead><tbody>`;
  for (const s in F){ const f = F[s], wid = STREAM_WASTE[s];
    const inp = (k, st) => `<input type="number" step="${st}" min="0" value="${f[k]}" data-s="${s}" data-k="${k}" aria-label="${esc(f.name)} ${k}">`;
    const cost = f.mode === 'pipe' ? `${inp('pipeCost',1000)}<br><span class="note">$/km·yr</span> ${srcTag(f.costSrc)}` : f.mode === 'unitkm' ? `${inp('unitKmCost',0.001)}<br><span class="note">$/t·km</span> ${srcTag(f.costSrc)}` : '<span class="note">truck rate</span>';
    const notes = [f.costNote, f.valueNote].filter(Boolean).map(n => `<div class="note" style="margin-top:3px">${esc(n.basis)}${cite(n.ref)}</div>`).join('');
    h += `<tr><td><span class="c-${f.cat}" style="display:inline-flex;gap:6px;align-items:center"><i class="dot"></i>${wid ? `<a href="#/catalogue/${wid}">${esc(f.name)}</a>` : esc(f.name)}</span></td><td class="mono">${f.unit}</td><td>${f.mode === 'truck' ? 'truck' : 'pipe'}</td>
      <td class="r">${inp('co2','any')}</td><td style="min-width:260px;font-size:12px">${f.co2Src ? `${srcTag(f.co2Src)}<div class="note">${esc(f.co2Src.basis)}</div>` : '<span class="src-chip ill">no credible factor found</span>'}</td>
      <td class="r">${inp('value','any')}<br>${srcTag(f.valueSrc)}${notes}</td><td class="r">${inp('maxKm',1)}<br>${srcTag(f.maxKmSrc)}</td><td class="r">${cost}</td></tr>`; }
  $('#factorTable').innerHTML = h + '</tbody>';
}
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.g){ const v = parseFloat(t.value); if (!isNaN(v) && v >= 0){ P[t.dataset.g] = t.dataset.g === 'kmAcross' ? Math.max(0.5, v) : v; renderAll(); } }
  if (t.dataset && t.dataset.s && t.dataset.k){ const v = parseFloat(t.value); if (!isNaN(v) && v >= 0){ F[t.dataset.s][t.dataset.k] = v; renderAll(); } }
});

/* =================== saved items & history =================== */
let SAVED = store.get('saved', []);
let RECENT = store.get('recent', []);
const isSaved = (type, id) => SAVED.some(s => s.type === type && s.id === id);
function toggleSaved(type, id){
  if (isSaved(type, id)){ SAVED = SAVED.filter(s => !(s.type === type && s.id === id)); toast('Removed from saved'); }
  else { SAVED.unshift({type, id}); toast('Saved', {action:'View saved', onAction: openDrawer}); }
  store.set('saved', SAVED); updSavedCount();
  refreshCurrent();
}
function addRecent(type, id){
  RECENT = [{type, id}, ...RECENT.filter(r => !(r.type === type && r.id === id))].slice(0, 12);
  store.set('recent', RECENT);
}
function updSavedCount(){ const b = $('#savedCount'); b.textContent = SAVED.length; b.hidden = !SAVED.length; }
function itemLabel(it){
  if (it.type === 'waste'){ const w = WASTES.find(x => x.id === it.id); return w ? {t:w.name, k:'Waste stream', h:`/catalogue/${w.id}`} : null; }
  if (it.type === 'case'){ const c = CASES.find(x => x.id === it.id); return c ? {t:c.name, k:'Case', h:`/cases/${c.id}`} : null; }
  if (it.type === 'ref'){ const r = REFS[it.id]; return r ? {t:`[${r.n}] ${(r.authors || r.publisher || '').split(',')[0]} ${r.year || ''}`, k:'Reference', h:`/sources/${it.id}`} : null; }
  return null;
}
function toolsHtml(type, id, prev, next){
  const saved = isSaved(type, id);
  return `<div class="dtools"><div class="grp">
      <button class="btn small" type="button" data-save="${type}:${id}" aria-pressed="${saved}" title="Save (S)">${icon('bookmark')}${saved ? 'Saved' : 'Save'}</button>
      <button class="btn small" type="button" data-copylink title="Copy a link to this page">${icon('link')}Copy link</button>
      ${navigator.share ? `<button class="btn small" type="button" data-share>${icon('right')}Share</button>` : ''}
      <button class="btn small" type="button" data-print title="Print or save as PDF">${icon('print')}Print</button></div>
    <div class="grp">
      <button class="icon-btn" type="button" data-go="${prev ? esc(prev) : ''}" ${prev ? '' : 'disabled'} aria-label="Previous (K)">${icon('left')}</button>
      <button class="icon-btn" type="button" data-go="${next ? esc(next) : ''}" ${next ? '' : 'disabled'} aria-label="Next (J)">${icon('right')}</button></div></div>`;
}
document.addEventListener('click', e => {
  const s = e.target.closest('[data-save]'); if (s){ const [t, id] = s.dataset.save.split(':'); toggleSaved(t, id); return; }
  if (e.target.closest('[data-copylink]')){ copyText(location.href, 'Link'); return; }
  if (e.target.closest('[data-share]')){ navigator.share({title: document.title, url: location.href}).catch(() => {}); return; }
  if (e.target.closest('[data-print]')){ window.print(); return; }
  const g = e.target.closest('[data-go]'); if (g && g.dataset.go){ navigate(g.dataset.go); return; }
  const nv = e.target.closest('[data-nav]'); if (nv){ e.preventDefault(); navigate(nv.dataset.nav); }
});

/* =================== waste catalogue =================== */
const WASTES = DATA.WASTES;
const LOW = {'01':'01 Mining & quarrying','02':'02 Agriculture, food & beverage','03':'03 Wood, pulp & paper','04':'04 Leather, fur & textiles','05':'05 Petroleum refining & gas','06':'06 Inorganic chemical processes','07':'07 Organic chemical processes','08':'08 Coatings, adhesives & inks','10':'10 Thermal processes','11':'11 Metal surface treatment','12':'12 Shaping & machining','13':'13 Oil wastes','14':'14 Solvents','15':'15 Packaging','16':'16 Not otherwise specified (catalysts, batteries, WEEE, vehicles)','17':'17 Construction & demolition','19':'19 Waste & water treatment','20':'20 Municipal & commercial','':'No LoW code (utility, energy or gas stream)'};
const chap = w => (w.ewcChapter && w.ewcChapter !== 'n/a') ? w.ewcChapter : '';
const TRL_ORDER = ['Commercial','Demonstrated','Emerging'];
const TRL_CLASS = {Commercial:'good', Demonstrated:'warn', Emerging:'bad'};
const HAZ_CLASS = {'non-hazardous':'good', 'mirror entry':'warn', 'hazardous':'bad'};
const RECV_ALL = [...new Set(WASTES.flatMap(w => w.routes.flatMap(r => r.rtags)))].sort();
const SECT_ALL = [...new Set(WASTES.map(w => w.sector))].sort();
const MM_DEFAULT = {q:'', cat:'all', sector:'', recv:'', trl:'', haz:'', ewc:'__any', sort:'az'};
let mm = Object.assign({}, MM_DEFAULT, {sel:'coal_fly_ash'});
let mmItems = [];
function optHtml(list, label){ return `<option value="">${label}</option>` + list.map(([v,l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); }
function hl(text, q){
  const t = esc(text); if (!q) return t;
  const terms = q.toLowerCase().split(/\s+/).filter(x => x.length > 1).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return t;
  return t.replace(new RegExp(`(${terms.join('|')})`, 'gi'), '<mark>$1</mark>');
}
function mmFilter(){
  const q = mm.q.toLowerCase().trim();
  let out = WASTES.filter(w => {
    if (mm.cat !== 'all' && w.cat !== mm.cat) return false;
    if (mm.sector && w.sector !== mm.sector) return false;
    if (mm.haz && w.hazard !== mm.haz) return false;
    if (mm.ewc !== '__any' && chap(w) !== mm.ewc) return false;
    if (mm.recv && !w.routes.some(r => r.rtags.includes(mm.recv) && (!mm.trl || r.trl === mm.trl))) return false;
    if (mm.trl && !w.routes.some(r => r.trl === mm.trl)) return false;
    if (q){
      const hay = [w.name, ...(w.aliases||[]), ...(w.ewc||[]), ...(w.sources||[]), w.sector, ...w.routes.map(r => r.use + ' ' + r.receiver)].join(' ').toLowerCase();
      if (!q.split(/\s+/).every(t => hay.includes(t))) return false;
    }
    return true;
  });
  const by = {
    az: (a,b) => a.name.localeCompare(b.name),
    routes: (a,b) => b.routes.length - a.routes.length || a.name.localeCompare(b.name),
    code: (a,b) => ((a.ewc && a.ewc[0]) || 'zz').localeCompare((b.ewc && b.ewc[0]) || 'zz'),
    saved: (a,b) => (isSaved('waste', b.id) - isSaved('waste', a.id)) || a.name.localeCompare(b.name)
  };
  return out.sort(by[mm.sort] || by.az);
}
function mmQueryString(){
  const p = new URLSearchParams();
  for (const k of ['q','cat','sector','recv','trl','haz','ewc','sort']) if (mm[k] !== MM_DEFAULT[k]) p.set(k, mm[k]);
  const s = p.toString(); return s ? '?' + s : '';
}
function mmSyncControls(){
  $('#mmSearch').value = mm.q; $('#fSector').value = mm.sector; $('#fRecv').value = mm.recv; $('#fTrl').value = mm.trl;
  $('#fHaz').value = mm.haz; $('#fEwc').value = mm.ewc; $('#mmSort').value = mm.sort;
}
function mmChanged(){ const items = mmFilter(); if (items.length && !items.some(w => w.id === mm.sel)) mm.sel = items[0].id; navigate(`/catalogue/${mm.sel}${mmQueryString()}`, {replace:true, silent:true}); renderMM(); }
function propList(arr){ return `<ul class="cited">${arr.map(p => `<li>${esc(p.text)}${cite(p.ref)}</li>`).join('')}</ul>`; }
function renderMMList(){
  $('#mmCats').innerHTML = [['all','All'], ...Object.entries(CATS)].map(([k,l]) =>
    `<button type="button" class="chip ${k !== 'all' ? 'c-'+k : ''}" data-cat="${k}" aria-pressed="${mm.cat === k}">${k !== 'all' ? '<i class="dot"></i>' : ''}${l}</button>`).join('');
  mmItems = mmFilter();
  $('#mmCount').textContent = `${mmItems.length} of ${WASTES.length} streams`;
  const act = [];
  if (mm.q) act.push(['q', `“${mm.q}”`]);
  if (mm.cat !== 'all') act.push(['cat', CATS[mm.cat]]);
  if (mm.sector) act.push(['sector', mm.sector]);
  if (mm.recv) act.push(['recv', '→ ' + mm.recv]);
  if (mm.trl) act.push(['trl', mm.trl]);
  if (mm.haz) act.push(['haz', mm.haz]);
  if (mm.ewc !== '__any') act.push(['ewc', 'Chapter ' + (mm.ewc || 'none')]);
  $('#mmActive').innerHTML = act.map(([k,l]) => `<button type="button" class="chip" data-clear="${k}" aria-label="Remove filter ${esc(l)}">${esc(l)} ${icon('x','ico')}</button>`).join('') + (act.length > 1 ? `<button type="button" class="chip" data-clear="all">Clear all</button>` : '');
  $$('#mmActive .ico').forEach(i => { i.style.width = '12px'; i.style.height = '12px'; });
  $('#mmList').innerHTML = mmItems.length ? mmItems.map(w => `<button type="button" class="mm-item" role="option" data-id="${w.id}" aria-selected="${w.id === mm.sel}" aria-current="${w.id === mm.sel}" tabindex="-1">
      <i class="dot c-${w.cat}"></i><span class="n">${hl(w.name, mm.q)}${isSaved('waste', w.id) ? ' <span class="star" aria-label="saved">★</span>' : ''}</span><span class="c">${esc((w.ewc && w.ewc[0]) || '—')}</span></button>`).join('')
    : `<p class="note" style="padding:8px">No streams match these filters. <a href="#" data-clearall>Clear all filters</a>.</p>`;
}
function renderMM(){
  renderMMList();
  const d = $('#mmDetail');
  const w = WASTES.find(x => x.id === mm.sel) || mmItems[0];
  if (!w){ d.innerHTML = ''; return; }
  mm.sel = w.id;
  const i = mmItems.findIndex(x => x.id === w.id);
  const qs = mmQueryString();
  const prev = i > 0 ? `/catalogue/${mmItems[i-1].id}${qs}` : null, next = i >= 0 && i < mmItems.length - 1 ? `/catalogue/${mmItems[i+1].id}${qs}` : null;
  const routes = [...w.routes].sort((a,b) => TRL_ORDER.indexOf(a.trl) - TRL_ORDER.indexOf(b.trl));
  const counts = TRL_ORDER.map(t => [t, routes.filter(r => r.trl === t).length]).filter(x => x[1]);
  d.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/catalogue">Catalogue</a><span class="sep">›</span><a href="#/catalogue?sector=${encodeURIComponent(w.sector)}">${esc(w.sector)}</a><span class="sep">›</span><span aria-current="page">${esc(w.name)}</span></nav>
    ${toolsHtml('waste', w.id, prev, next)}
    <div><div class="meta-row"><span class="c-${w.cat}" style="display:inline-flex;gap:6px;align-items:center;font-size:12px;font-weight:600;color:var(--muted)"><i class="dot"></i>${CATS[w.cat]}</span>${counts.map(([t,n]) => `<span class="chip ${TRL_CLASS[t]}">${n} ${t.toLowerCase()}</span>`).join('')}</div>
      <h2 style="margin-top:6px" id="wasteTitle" tabindex="-1">${esc(w.name)}</h2>
      ${w.aliases && w.aliases.length ? `<p class="src" style="margin-top:2px">Also: ${esc(w.aliases.join(', '))}</p>` : ''}
      <div class="meta-row" style="margin-top:8px">${(w.ewc||[]).map(c => `<span class="ewc" title="${/\*/.test(c) ? 'Hazardous entry' : 'EU List of Waste code'}">${esc(c)}</span>`).join('') || '<span class="note">No List of Waste code</span>'}
        <span class="chip ${HAZ_CLASS[w.hazard] || ''}">${esc(w.hazard)}</span>${w.ewc && w.ewc.length ? cite('eu2014') : ''}</div>
      <p class="src" style="margin-top:8px">Typical sources: ${esc((w.sources||[]).join('; '))}</p>
      ${w.generation ? `<p style="margin-top:6px"><b>Scale:</b> ${esc(w.generation.text)}${cite(w.generation.ref)}</p>` : ''}</div>
    <div class="cols2">
      <div><h4 style="margin-bottom:4px">Properties that matter for reuse</h4>${propList(w.props || [])}</div>
      <div><h4 style="margin-bottom:4px">Barriers</h4>${(w.barriers||[]).length ? propList(w.barriers) : '<p class="note">None recorded in the cited sources.</p>'}
        ${(w.standards||[]).length ? `<h4 style="margin:10px 0 4px">Standards &amp; regulations</h4><div class="meta-row">${w.standards.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}</div>
    </div>
    <div><h4 style="margin-bottom:8px">Reuse routes (${routes.length})</h4><div class="routes">${routes.map(r => `<div class="route ${mm.recv && r.rtags.includes(mm.recv) ? 'hl' : ''}">
      <h3>${esc(r.use)}${cite(r.refs)}</h3><span class="trl"><span class="chip ${TRL_CLASS[r.trl]}">${r.trl}</span></span>
      <span class="who">Receiver: ${esc(r.receiver)}</span>
      ${r.requirements ? `<p class="req"><b>Conditions:</b> ${esc(r.requirements)}</p>` : ''}
      ${r.example ? `<p class="ex"><b>Real-world example:</b> ${esc(r.example)}</p>` : ''}
      <div class="rt">${r.rtags.map(t => `<a class="tag" href="#/catalogue?recv=${encodeURIComponent(t)}" title="All streams that can supply ${esc(t)}">${esc(t)}</a>`).join('')}</div></div>`).join('')}</div></div>
    <p class="note">Maturity: <b>Commercial</b> = routine full-scale use · <b>Demonstrated</b> = pilot or first full-scale plants · <b>Emerging</b> = laboratory or early research.</p>
    ${w.try ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary" type="button" data-try="${w.id}">${icon('net')}Model this exchange in the park builder</button><span class="note">Adds a ${esc(FT[w.try[1]].name.toLowerCase())} and a ${esc(FT[w.try[2]].name.toLowerCase())} if the site lacks them.</span></div>` : ''}
    ${relatedCases(w)}
    <div><h4 style="margin-bottom:4px">Sources for this entry</h4><ol class="refs" style="padding-left:18px;margin:0">${[...new Set(w.refs || [])].filter(id => REFS[id]).sort((a,b) => REFS[a].n - REFS[b].n).map(id => `<li value="${REFS[id].n}">${fmtRef(REFS[id])}</li>`).join('')}</ol></div>
    <div class="pager">${prev ? `<button class="btn" type="button" data-go="${esc(prev)}">${icon('left')}<span><small>Previous</small>${esc(mmItems[i-1].name)}</span></button>` : '<span></span>'}${next ? `<button class="btn" type="button" data-go="${esc(next)}"><span><small>Next</small>${esc(mmItems[i+1].name)}</span>${icon('right')}</button>` : ''}</div>`;
  $$('#mmList .mm-item').forEach(b => { if (b.dataset.id === mm.sel) b.scrollIntoView({block:'nearest'}); });
}
function relatedCases(w){
  const words = [w.name, ...(w.aliases || [])].map(x => x.toLowerCase().replace(/\(.*?\)/g,'').trim()).filter(x => x.length > 3);
  const hits = CASES.filter(c => c.exchanges.some(x => words.some(k => x.stream.toLowerCase().includes(k) || k.includes(x.stream.toLowerCase()))));
  if (!hits.length) return '';
  return `<div><h4 style="margin-bottom:6px">Seen in real cases</h4><div class="meta-row">${hits.map(c => `<a class="chip" href="#/cases/${c.id}">${icon('pin')}${esc(c.name)}</a>`).join('')}</div></div>`;
}
function initMM(){
  $('#catIntro').innerHTML = `${WASTES.length} residues and by-products keyed to the EU List of Waste${cite('eu2014')}, each with properties, reuse routes, maturity, standards and barriers. Every statement links to its source. Filters are kept in the address, so you can bookmark or share any view.`;
  $('#fSector').innerHTML = optHtml(SECT_ALL.map(s => [s,s]), 'Any source sector');
  $('#fRecv').innerHTML = optHtml(RECV_ALL.map(s => [s,s]), 'Any receiving sector');
  $('#fTrl').innerHTML = optHtml(TRL_ORDER.map(t => [t,t]), 'Any maturity');
  $('#fHaz').innerHTML = optHtml([['non-hazardous','Non-hazardous'],['mirror entry','Mirror entry'],['hazardous','Hazardous']], 'Any status');
  const chs = [...new Set(WASTES.map(chap))].sort((a,b) => (a||'99').localeCompare(b||'99'));
  $('#fEwc').innerHTML = `<option value="__any">Any chapter</option>` + chs.map(c => `<option value="${c}">${esc(LOW[c] || c)}</option>`).join('');
  const upd = () => { mm.sector = $('#fSector').value; mm.recv = $('#fRecv').value; mm.trl = $('#fTrl').value; mm.haz = $('#fHaz').value; mm.ewc = $('#fEwc').value; mm.sort = $('#mmSort').value; mmChanged(); };
  ['#fSector','#fRecv','#fTrl','#fHaz','#fEwc','#mmSort'].forEach(s => $(s).addEventListener('change', upd));
  let qt; $('#mmSearch').addEventListener('input', e => { mm.q = e.target.value; clearTimeout(qt); qt = setTimeout(mmChanged, 120); });
  $('#mmSearch').addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'Enter'){ e.preventDefault(); if (mmItems[0]) navigate(`/catalogue/${mmItems[0].id}${mmQueryString()}`); $('#mmList').focus(); } });
  $('#mmCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b){ mm.cat = b.dataset.cat; mmChanged(); } });
  $('#mmActive').addEventListener('click', e => { const b = e.target.closest('[data-clear]'); if (!b) return; const k = b.dataset.clear;
    if (k === 'all') Object.assign(mm, MM_DEFAULT, {sort: mm.sort}); else mm[k] = MM_DEFAULT[k]; mmSyncControls(); mmChanged(); });
  $('#mmList').addEventListener('click', e => {
    if (e.target.closest('[data-clearall]')){ e.preventDefault(); Object.assign(mm, MM_DEFAULT); mmSyncControls(); mmChanged(); return; }
    const b = e.target.closest('[data-id]'); if (b){ navigate(`/catalogue/${b.dataset.id}${mmQueryString()}`); if (window.innerWidth < 820) $('#mmDetail').scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth'}); } });
  $('#mmList').addEventListener('keydown', e => listKeys(e, mmItems.map(w => w.id), mm.sel, id => navigate(`/catalogue/${id}${mmQueryString()}`, {replace:true})));
  $('#mmDetail').addEventListener('click', e => {
    const b = e.target.closest('[data-try]'); if (!b) return;
    const w = WASTES.find(x => x.id === b.dataset.try); const [stream, ta, tb] = w.try;
    pushHistory();
    let a = site.nodes.find(n => n.type === ta), c = site.nodes.find(n => n.type === tb);
    if (!a) a = addNode(ta, 380, 300);
    if (!c) c = addNode(tb, 620, 300);
    if (!site.links.some(l => l.from === a.id && l.to === c.id && l.stream === stream)) site.links.push({id:'l'+(uid++), from:a.id, to:c.id, stream, qty:null});
    sel = {kind:'node', id:a.id}; navigate('/builder'); renderAll(); toast('Exchange added to the park', {action:'Undo', onAction: undo});
  });
}
function listKeys(e, ids, cur, go){
  const i = ids.indexOf(cur);
  let n = null;
  if (e.key === 'ArrowDown') n = Math.min(ids.length - 1, i + 1);
  else if (e.key === 'ArrowUp') n = Math.max(0, i - 1);
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = ids.length - 1;
  if (n != null && ids[n]){ e.preventDefault(); go(ids[n]); }
}

/* =================== cases =================== */
const CASES = DATA.CASES;
const REGION = c => ({'Denmark':'Europe','United Kingdom':'Europe','Netherlands':'Europe','Austria':'Europe','Finland':'Europe','France':'Europe',
  'South Korea':'Asia','China':'Asia','Japan':'Asia','India':'Asia','Australia':'Oceania','South Africa':'Africa'})[c.country] || 'Americas';
const MODEL_LABEL = {'self-organised':'Self-organised','planned':'Planned / government-led','facilitated':'Facilitated','corporate':'Corporate-led','mixed':'Mixed'};
let caseSel = 'kalundborg', cf = {model:'', region:''}, caseItems = CASES;
function wrapLabel(s, n = 22){
  if (s.length <= n) return [s];
  let cut = s.lastIndexOf(' ', n); if (cut < 8) cut = n;
  const a = s.slice(0, cut), b = s.slice(cut).trim();
  return [a, b.length > n + 4 ? b.slice(0, n + 2) + '…' : b];
}
function caseDiagram(c){
  const Wd = 960, Hd = 470, NW = 176;
  const ids = c.nodes.map(n => n.id), deg = {};
  ids.forEach(id => deg[id] = 0);
  c.exchanges.forEach(x => { if (deg[x.from] != null) deg[x.from]++; if (deg[x.to] != null) deg[x.to]++; });
  const adj = (a,b) => c.exchanges.filter(x => (x.from === a && x.to === b) || (x.from === b && x.to === a)).length;
  let hub = null;
  const maxId = ids.slice().sort((a,b) => deg[b] - deg[a])[0];
  if (ids.length >= 5 && deg[maxId] >= Math.max(3, ids.length - 2)) hub = maxId;
  const ring = ids.filter(id => id !== hub), order = [], rest = new Set(ring);
  let cur = ring.slice().sort((a,b) => deg[b] - deg[a])[0];
  while (cur){ order.push(cur); rest.delete(cur);
    let best = null, bs = -1;
    rest.forEach(id => { const s = adj(cur, id) * 10 + order.reduce((t,o) => t + adj(o, id), 0) + deg[id] * 0.1; if (s > bs){ bs = s; best = id; } });
    cur = best; }
  const P2 = {}, cx = Wd/2, cy = Hd/2, rx = 355, ry = 175;
  order.forEach((id, i) => { const a = -Math.PI/2 + i * 2*Math.PI / order.length; P2[id] = {x: cx + rx*Math.cos(a), y: cy + ry*Math.sin(a)}; });
  if (hub) P2[hub] = {x: cx, y: cy};
  const label = Object.fromEntries(c.nodes.map(n => [n.id, n.label]));
  const cnt = {}, idx = {};
  c.exchanges.forEach(x => { const k = [x.from,x.to].sort().join('~'); cnt[k] = (cnt[k]||0) + 1; });
  let links = '', badges = '';
  c.exchanges.forEach((x, i) => {
    const a = P2[x.from], b = P2[x.to]; if (!a || !b) return;
    const k = [x.from,x.to].sort().join('~'); const j = idx[k] = (idx[k] ?? -1) + 1;
    const sgn = x.from > x.to ? -1 : 1;
    const off = cnt[k] > 1 ? (j - (cnt[k]-1)/2) * 60 * sgn : 18;
    const {c:cp, d} = curve(a, b, off);
    const hist = x.status === 'historical', col = hist ? 'var(--muted)' : `var(--${x.cat || 'material'})`;
    const nodesAttr = `data-x="${i}" data-a="${esc(x.from)}" data-b="${esc(x.to)}"`;
    links += `<g class="dl" ${nodesAttr}><path d="${d}" fill="none" style="stroke:${col}" stroke-width="${hist ? 1.8 : 2.8}" ${hist ? 'stroke-dasharray="5 5"' : ''}/>${arrowAt(a, cp, b, 0.72, col, 7)}</g>`;
    const p = bez(a, cp, b, 0.5);
    badges += `<g class="dl" ${nodesAttr} style="cursor:pointer"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" style="fill:${col};stroke:var(--ground)" stroke-width="2"/><text x="${p.x.toFixed(1)}" y="${(p.y+3.8).toFixed(1)}" text-anchor="middle" style="font:600 10.5px var(--mono);fill:#fff">${i+1}</text><title>${esc(label[x.from])} → ${esc(label[x.to])}: ${esc(x.stream)}</title></g>`;
  });
  let nodes = '';
  ids.forEach(id => { const p = P2[id], lines = wrapLabel(label[id]), h = lines.length > 1 ? 48 : 36;
    nodes += `<g class="dnode" data-n="${esc(id)}" tabindex="0" role="button" aria-label="${esc(label[id])}: highlight its exchanges" transform="translate(${(p.x - NW/2).toFixed(1)},${(p.y - h/2).toFixed(1)})"><rect width="${NW}" height="${h}" rx="6" style="fill:var(--panel);stroke:${id === hub ? 'var(--accent)' : 'var(--line)'}" stroke-width="${id === hub ? 2 : 1.2}"/>
      ${lines.map((ln, j) => `<text x="${NW/2}" y="${lines.length > 1 ? 20 + j*15 : 22.5}" text-anchor="middle" style="font:600 12px var(--body);fill:var(--ink)">${esc(ln)}</text>`).join('')}</g>`; });
  return `<svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="Exchange diagram for ${esc(c.name)}">${links}${nodes}${badges}</svg>`;
}
function focusDiagram(nodeId, exIdx){
  const d = $('#caseDiagram'); if (!d) return;
  if (nodeId == null && exIdx == null){ d.classList.remove('focus'); $$('#caseDiagram .on, #xtable tr.on').forEach(e => e.classList.remove('on')); return; }
  d.classList.add('focus');
  $$('#caseDiagram .dl').forEach(g => g.classList.toggle('on', exIdx != null ? g.dataset.x == exIdx : (g.dataset.a === nodeId || g.dataset.b === nodeId)));
  const onNodes = new Set(); $$('#caseDiagram .dl.on').forEach(g => { onNodes.add(g.dataset.a); onNodes.add(g.dataset.b); });
  if (nodeId) onNodes.add(nodeId);
  $$('#caseDiagram .dnode').forEach(g => g.classList.toggle('on', onNodes.has(g.dataset.n)));
  const onX = new Set($$('#caseDiagram .dl.on').map(g => g.dataset.x));
  $$('#xtable tbody tr').forEach(tr => tr.classList.toggle('on', onX.has(tr.dataset.x)));
}
function caseFiltered(){ return CASES.filter(c => (!cf.model || c.model === cf.model) && (!cf.region || REGION(c) === cf.region)); }
function caseQs(){ const p = new URLSearchParams(); if (cf.model) p.set('model', cf.model); if (cf.region) p.set('region', cf.region); const s = p.toString(); return s ? '?' + s : ''; }
function renderCases(){
  caseItems = caseFiltered();
  if (!caseItems.find(c => c.id === caseSel) && caseItems.length) caseSel = caseItems[0].id;
  $('#caseList').innerHTML = caseItems.map(c => `<button type="button" class="case-btn" role="option" tabindex="-1" data-case="${c.id}" aria-selected="${c.id === caseSel}" aria-current="${c.id === caseSel}"><b>${esc(c.name)}${isSaved('case', c.id) ? ' <span class="star" style="color:var(--warn)">★</span>' : ''}</b><span>${esc(c.place)}, ${esc(c.country)} · ${esc(MODEL_LABEL[c.model] || c.model)}</span></button>`).join('') || '<p class="note" style="padding:8px">No cases match.</p>';
  const c = CASES.find(x => x.id === caseSel); if (!c){ $('#caseDetail').innerHTML = ''; return; }
  const i = caseItems.indexOf(c), qs = caseQs();
  const prev = i > 0 ? `/cases/${caseItems[i-1].id}${qs}` : null, next = i >= 0 && i < caseItems.length - 1 ? `/cases/${caseItems[i+1].id}${qs}` : null;
  const labels = Object.fromEntries(c.nodes.map(n => [n.id, n.label]));
  const cats = [...new Set(c.exchanges.filter(x => x.status !== 'historical').map(x => x.cat))];
  $('#caseDetail').innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/cases">Case atlas</a><span class="sep">›</span><a href="#/cases?region=${encodeURIComponent(REGION(c))}">${esc(REGION(c))}</a><span class="sep">›</span><span aria-current="page">${esc(c.name)}</span></nav>
    ${toolsHtml('case', c.id, prev, next)}
    <div class="case-head"><div><div class="loc">${esc(c.place)}, ${esc(c.country)} · <a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=11/${c.lat}/${c.lon}" target="_blank" rel="noopener">${Math.abs(c.lat).toFixed(2)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(c.lon).toFixed(2)}°${c.lon >= 0 ? 'E' : 'W'} ↗</a></div><h2 style="margin-top:3px" tabindex="-1">${esc(c.name)}</h2></div>
      <div class="meta-row"><span class="chip">Since ${esc(c.start)}</span><a class="chip" href="#/cases?model=${encodeURIComponent(c.model)}">${esc(MODEL_LABEL[c.model] || c.model)}</a><span class="chip">Chertow type ${esc(c.chertowType)}</span></div></div>
    <p style="max-width:78ch">${esc(c.summary)}</p>
    <p class="note" style="margin-top:-8px"><b>How it developed:</b> ${esc(c.modelNote)} · <b>Status:</b> ${esc(c.status)}</p>
    ${c.facts.length ? `<div class="facts">${c.facts.map(f => `<div class="fact"><div class="v">${esc(f.value)}</div><div class="l">${esc(f.label)}${f.year ? ` (${esc(f.year)})` : ''}${cite(f.ref)}</div></div>`).join('')}</div>` : '<p class="note">The cited sources describe this case qualitatively; no verified figures are shown.</p>'}
    <div><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px"><h4>Documented exchanges <span class="note" style="text-transform:none;letter-spacing:0;font-weight:400">· hover or tap a partner to trace its flows</span></h4>
      <span class="note" style="display:flex;gap:10px;flex-wrap:wrap">${cats.map(k => `<span class="c-${k}" style="display:inline-flex;gap:5px;align-items:center"><i class="dot"></i>${CATS[k]}</span>`).join('')}${c.exchanges.some(x => x.status === 'historical') ? '<span>┄ ended</span>' : ''}</span></div>
      <div class="diagram" id="caseDiagram">${caseDiagram(c)}</div></div>
    <div class="scroll-x"><table class="xtable" id="xtable"><thead><tr><th>#</th><th>From → to</th><th>Stream</th><th>Quantity</th><th>Status</th><th>Source</th></tr></thead><tbody>
      ${c.exchanges.map((x,i) => `<tr data-x="${i}"${x.status === 'historical' ? ' class="status-hist"' : ''}><td><span class="num-badge" style="background:${x.status === 'historical' ? 'var(--muted)' : `var(--${x.cat})`}">${i+1}</span></td><td>${esc(labels[x.from] || x.from)} → ${esc(labels[x.to] || x.to)}</td><td>${esc(x.stream)}</td><td>${esc(x.quantity || '—')}</td><td>${esc(x.status)}</td><td>${cite(x.ref)}</td></tr>`).join('')}
    </tbody></table></div>
    <div><h4 style="margin-bottom:4px">Lessons</h4><ul class="cited">${c.lessons.map(l => `<li>${esc(l.text)}${cite(l.ref)}</li>`).join('')}</ul></div>
    <div><h4 style="margin-bottom:4px">Sources for this case</h4><ol class="refs" style="padding-left:18px;margin:0">${[...new Set(c.refs)].filter(id => REFS[id]).sort((a,b) => REFS[a].n - REFS[b].n).map(id => `<li value="${REFS[id].n}">${fmtRef(REFS[id])}</li>`).join('')}</ol></div>
    <div class="pager">${prev ? `<button class="btn" type="button" data-go="${esc(prev)}">${icon('left')}<span><small>Previous</small>${esc(caseItems[i-1].name)}</span></button>` : '<span></span>'}${next ? `<button class="btn" type="button" data-go="${esc(next)}"><span><small>Next</small>${esc(caseItems[i+1].name)}</span>${icon('right')}</button>` : ''}</div>`;
  $$('#caseList .case-btn').forEach(b => { if (b.dataset.case === caseSel) b.scrollIntoView({block:'nearest'}); });
}
function initCases(){
  $('#caseIntro').innerHTML = `${CASES.length} documented industrial symbioses across ${new Set(CASES.map(REGION)).size} continents, from peer-reviewed studies and official programme reports. Figures carry the year they refer to. Diagrams are simplified from the cited sources; dashed grey links have ended.`;
  $('#cfModel').innerHTML = optHtml([...new Set(CASES.map(c => c.model))].map(m => [m, MODEL_LABEL[m] || m]), 'All models');
  $('#cfRegion').innerHTML = optHtml([...new Set(CASES.map(REGION))].sort().map(r => [r,r]), 'All regions');
  const chg = () => { cf.model = $('#cfModel').value; cf.region = $('#cfRegion').value; renderCases(); navigate(`/cases/${caseSel}${caseQs()}`, {replace:true, silent:true}); };
  $('#cfModel').addEventListener('change', chg); $('#cfRegion').addEventListener('change', chg);
  $('#caseList').addEventListener('click', e => { const b = e.target.closest('[data-case]'); if (b){ navigate(`/cases/${b.dataset.case}${caseQs()}`); if (window.innerWidth < 820) $('#caseDetail').scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth'}); } });
  $('#caseList').addEventListener('keydown', e => listKeys(e, caseItems.map(c => c.id), caseSel, id => navigate(`/cases/${id}${caseQs()}`, {replace:true})));
  const det = $('#caseDetail');
  det.addEventListener('mouseover', e => { const n = e.target.closest('.dnode'), l = e.target.closest('.dl'), r = e.target.closest('#xtable tbody tr');
    if (n) focusDiagram(n.dataset.n); else if (l) focusDiagram(null, l.dataset.x); else if (r) focusDiagram(null, r.dataset.x); });
  det.addEventListener('mouseout', e => { if (e.target.closest('.dnode,.dl,#xtable tbody tr') && !e.relatedTarget?.closest?.('.dnode,.dl,#xtable tbody tr')) focusDiagram(); });
  det.addEventListener('focusin', e => { const n = e.target.closest('.dnode'); if (n) focusDiagram(n.dataset.n); });
  det.addEventListener('focusout', e => { if (e.target.closest('.dnode')) focusDiagram(); });
  det.addEventListener('click', e => { const n = e.target.closest('.dnode'); if (n){ const on = n.classList.contains('on') && $('#caseDiagram').classList.contains('focus'); on ? focusDiagram() : focusDiagram(n.dataset.n); } });
  $('#caseCmp').innerHTML = `<thead><tr><th>Case</th><th>Country</th><th>Started</th><th>Model</th><th>Chertow type</th><th>Headline figure</th></tr></thead><tbody>` +
    CASES.map(c => { const f = c.facts[0];
      return `<tr><td><a href="#/cases/${c.id}"><b>${esc(c.name)}</b></a></td><td>${esc(c.country)}</td><td class="mono">${esc(c.start)}</td><td>${esc(MODEL_LABEL[c.model] || c.model)}</td><td>${esc(c.chertowType)}</td><td>${f ? `${esc(f.value)} ${esc(f.label)}${f.year ? ` (${esc(f.year)})` : ''}${cite(f.ref)}` : '<span class="note">qualitative only</span>'}</td></tr>`; }).join('') + '</tbody>';
}

/* =================== learn & quiz =================== */
const TH = Object.fromEntries(DATA.THEORY.map(t => [t.topic, t]));
const tp = topic => { const t = TH[topic]; return t ? `${esc(t.keyPoint)}${cite(t.ref)}` : ''; };
function lessonHtml(){
  const rest = DATA.THEORY.filter(t => ['Quantifying co-location benefits','Comparing IS dynamics across cases','Quantifying Kalundborg','LCA case: forest-industry symbiosis','State of IS research','IS in Europe','Eco-industrial park performance framework'].includes(t.topic));
  return `
<section><h4>1 · Origins</h4><h3>From industrial ecosystems to symbiosis</h3>
<p>${tp('Origin of the industrial-ecosystem idea')}</p>
<p>${tp('Kalundborg as self-organised symbiosis')}</p></section>

<section><h4>2 · Definition</h4><h3>What industrial symbiosis is</h3>
<blockquote>“Industrial symbiosis engages traditionally separate industries in a collective approach to competitive advantage involving physical exchange of materials, energy, water, and by-products.” — Chertow (2000)${cite('chertow2000')}</blockquote>
<p>${tp('Redefinition without proximity')}</p>
<p>Chertow also groups opportunities into three kinds: by-product reuse, utility and infrastructure sharing, and joint provision of services${cite('chertow2000')}.</p></section>

<section><h4>3 · Test</h4><h3>The 3-2 heuristic</h3>
<p>${tp('The 3-2 heuristic')} The park builder applies this test to your design.</p></section>

<section><h4>4 · Scale</h4><h3>Five types of exchange${cite('chertow2000')}</h3>
<div class="types">
<div class="type"><b>TYPE 1</b>Through waste exchanges: one-off trades via brokers or markets.</div>
<div class="type"><b>TYPE 2</b>Within a facility, firm or organisation.</div>
<div class="type"><b>TYPE 3</b>Among firms co-located in a defined eco-industrial park.</div>
<div class="type"><b>TYPE 4</b>Among local firms that are not co-located.</div>
<div class="type"><b>TYPE 5</b>Among firms organised virtually across a broader region.</div>
</div><p class="note">The Case atlas tags each case with its type.</p></section>

<section><h4>5 · Development</h4><h3>How networks form</h3>
<div class="stages">
<div class="stage-card"><b>Sprouting</b>Individual, self-interested exchanges.</div>
<div class="stage-card"><b>Uncovering</b>Actors recognise the network and its collective value.</div>
<div class="stage-card"><b>Embeddedness &amp; institutionalisation</b>Norms and organisations sustain it.</div>
</div>
<p>${tp('Three-stage model of IS development')}</p>
<p>The Case atlas groups cases as self-organised (Kalundborg, Kwinana), planned by government (Ulsan, TEDA, Kitakyushu), facilitated by a broker (NISP, WISP) or corporate-led (Guitang, British Sugar Wissington). ${tp('Comparing IS dynamics across cases')}</p></section>

<section><h4>6 · Regulation</h4><h3>Is it waste or a by-product?</h3>
<p>The legal status of a residue decides which permits an exchange needs. ${tp('Classifying waste streams (EU List of Waste)')}</p>
<p>${tp('By-product vs waste (WFD Art. 5)')}</p>
<p>${tp('End-of-waste (WFD Art. 6)')}</p></section>

<section><h4>7 · Barriers</h4><h3>What gets in the way</h3>
<div class="barriers">
<div><b>Distance</b>Low-value streams stop paying off quickly. For excess heat, about 10 km is the realistic connection distance${cite('manz2021')}.</div>
<div><b>Business case</b>At Kalundborg, firms’ motivation was tied more to overall operational performance than to the value of the by-products themselves${cite('jacobsen2006')}.</div>
<div><b>Regulation</b>Waste status brings permits and liability unless by-product or end-of-waste conditions are met${cite('eu2008')}.</div>
<div><b>Information</b>Firms rarely know who produces or needs a stream; information-sharing platforms change network performance${cite('fraccascia2018')}.</div>
<div><b>Dependency</b>Reliance on particular partners or flows makes the network vulnerable when one changes${cite(['fraccascia2017','ehrenfeld1997'])}.</div>
<div><b>Quality &amp; reliability</b>Each entry in the waste catalogue lists the specific conditions receivers set, with sources.</div>
</div></section>

<section><h4>8 · Measurement</h4><h3>Judging performance fairly</h3>
<ul class="cited">
<li>${tp('LCA of IS: system boundaries and allocation')}</li>
<li>${tp('Indicators for eco-industrial parks')}</li>
<li>${tp('Resilience and dependency')}</li>
<li>${tp('Eco-industrial park performance framework')}</li>
</ul></section>

<section><h4>Further reading</h4><ul class="cited">
${rest.filter(t => !['Comparing IS dynamics across cases','Eco-industrial park performance framework'].includes(t.topic)).map(t => `<li><b>${esc(t.topic)}.</b> ${esc(t.keyPoint)}${cite(t.ref)}</li>`).join('')}
</ul></section>`;
}
const QUIZ = [
 {q:'Which set of conditions is Chertow’s 3-2 heuristic?', o:['Three firms within two kilometres of each other','At least three entities, none mainly recyclers, exchanging at least two different resources','Three resources exchanged between two firms','Two industries sharing three utilities'], a:1, e:'The heuristic counts entities (three or more, not primarily recyclers) and different resources exchanged (two or more). It says nothing about distance.', r:'chertow2007'},
 {q:'How did Lombardi and Laybourn change the definition of industrial symbiosis?', o:['They required co-location in a park','They dropped geographic proximity as a requirement and included knowledge sharing','They limited it to energy exchanges','They required government planning'], a:1, e:'Their redefinition centres on networks that foster eco-innovation, without requiring proximity.', r:'lombardi2012'},
 {q:'The UK National Industrial Symbiosis Programme is best described as which type of exchange?', o:['Type 2: within a single firm','Type 3: co-located in an eco-industrial park','Type 5: firms organised virtually across a region','Type 1: a one-off waste exchange'], a:2, e:'NISP connected firms that were not neighbours, using facilitators and workshops across whole regions.', r:'chertow2000'},
 {q:'What happens at the “uncovering” stage of Chertow and Ehrenfeld’s model?', o:['The first bilateral exchange is signed','Actors recognise the existing exchanges as a network with collective value','The park is designed on paper','All firms merge'], a:1, e:'Sprouting → uncovering → embeddedness and institutionalisation.', r:'chertow2012'},
 {q:'Under the EU Waste Framework Directive, which is NOT a condition for a residue to be a by-product?', o:['Further use is certain','It can be used directly without processing beyond normal industrial practice','It is produced as an integral part of a production process','It has been landfilled for at least a year'], a:3, e:'Article 5 sets four conditions: certain further use, direct use, integral production, and lawful use.', r:'eu2008'},
 {q:'Roughly what connection distance do Manz et al. call most realistic for excess heat to district heating?', o:['1 km','10 km','100 km','500 km'], a:1, e:'They modelled 100, 25 and 10 km search radii and describe 10 km as the most realistic. Try dragging a heat receiver in the park builder.', r:'manz2021'},
 {q:'Why do LCA results for industrial symbiosis differ so much between studies?', o:['LCA cannot be applied to industry','They depend on system boundary, allocation among partners and the counterfactual production displaced','Only energy flows are counted','Results are always identical'], a:1, e:'Avoided-burden credits must state what the exchange displaces.', r:'mattila2012'},
 {q:'In the park builder, why is the default CO₂e credit for supplying CO₂ to greenhouses zero?', o:['Greenhouses cannot use industrial CO₂','A 1 t/t credit applies only to permanent storage; utilised CO₂ is soon re-released','CO₂ pipelines are illegal','The CO₂ is burned first'], a:1, e:'The benefit of utilisation depends on what on-site CO₂ production it avoids, so the tool asks you to set it explicitly.', r:'ipcc2005'},
 {q:'What did Jacobsen find about firms’ motivation at Kalundborg?', o:['Only by-product sales mattered','Motivation was tied more to overall operational performance than to the direct value of by-products','Firms joined only because of regulation','Firms were paid by the municipality'], a:1, e:'Gains ranged from substantial to minor; operational benefits drove participation.', r:'jacobsen2006'},
 {q:'Which development model does the Western Cape Industrial Symbiosis Programme (WISP) follow?', o:['Corporate-led','Planned eco-industrial park','Facilitated brokerage modelled on NISP','Self-organised only'], a:2, e:'GreenCape provides free facilitation, funded by government, modelled on NISP.', r:'emf2021'},
 {q:'Why is heavy dependence on one anchor facility a risk?', o:['It lowers transport costs','If the anchor closes or changes process, the linked exchanges can disappear','It always breaks the 3-2 test','It prevents LCA'], a:1, e:'Resilience work treats dependence on particular flows or partners as a vulnerability to monitor.', r:'fraccascia2017'},
 {q:'Recovering curdlan from aerobic granular sludge is currently at which maturity level?', o:['Commercial','Demonstrated at full scale','Emerging (laboratory research)','Banned'], a:2, e:'Peer-reviewed work so far is a review and laboratory-scale studies; alginate-like exopolymers, by contrast, are already recovered at municipal scale.', r:'adekunle2024'}
];
let qi = 0, qAns = [];
function renderQuiz(){
  const el = $('#quiz');
  const prog = `<div class="qprog">${QUIZ.map((_,i) => `<i class="${qAns[i] == null ? (i === qi ? 'cur' : '') : (qAns[i] === QUIZ[i].a ? 'ok' : 'no')}"></i>`).join('')}</div>`;
  if (qi >= QUIZ.length){
    const score = qAns.filter((a,i) => a === QUIZ[i].a).length;
    el.innerHTML = `<h3>Self-check</h3>${prog}<div style="text-align:center;padding:16px 0"><div style="font:800 44px var(--display);font-stretch:110%">${score}/${QUIZ.length}</div>
      <p class="note">${score >= 10 ? 'Strong grasp of the fundamentals.' : score >= 7 ? 'Good. Review the sections behind the questions you missed.' : 'Worth another read through the concepts, then try again.'}</p></div>
      <button class="btn primary" type="button" id="qRestart">Start again</button>`;
    return;
  }
  const Q = QUIZ[qi], answered = qAns[qi] != null;
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3>Self-check</h3><span class="mono note">${qi+1} / ${QUIZ.length}</span></div>${prog}
    <p style="font-weight:600">${esc(Q.q)}</p><p class="note">Press <kbd>1</kbd>–<kbd>4</kbd> to answer</p>
    <div class="qopts">${Q.o.map((o,i) => `<button type="button" class="qopt ${answered ? (i === Q.a ? 'ok' : (i === qAns[qi] ? 'no' : '')) : ''}" data-o="${i}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
    ${answered ? `<div class="qexp"><b>${qAns[qi] === Q.a ? 'Correct.' : 'Not quite.'}</b> ${esc(Q.e)}${cite(Q.r)}</div>
      <button class="btn primary" type="button" id="qNext">${qi === QUIZ.length - 1 ? 'See score' : 'Next question'}</button>` : ''}`;
}

const LEARN_IDS = ['origins','definition','test','types','development','regulation','barriers','measurement','reading'];
const LEARN_TITLES = ['Origins','Definition','3-2 test','Five types','Development','Regulation','Barriers','Measurement','Further reading'];
let learnObs = null;
function initLearn(){
  $('#lesson').innerHTML = `<nav class="toc" id="toc" aria-label="Lesson sections">${LEARN_TITLES.map((t,i) => `<a data-sec="${LEARN_IDS[i]}" href="#/learn/${LEARN_IDS[i]}">${t}</a>`).join('')}</nav>` + lessonHtml();
  $$('#lesson section').forEach((s, i) => { s.id = 'learn-' + LEARN_IDS[i]; const h = s.querySelector('h3'); if (h) h.insertAdjacentHTML('beforeend', `<a class="anchor" data-copysec="${LEARN_IDS[i]}" aria-label="Copy link to this section">#</a>`); });
  $('#lesson').addEventListener('click', e => { const a = e.target.closest('[data-copysec]'); if (a){ e.preventDefault(); navigate('/learn/' + a.dataset.copysec, {replace:true, silent:true}); copyText(location.href, 'Link'); } });
  if ('IntersectionObserver' in window){
    learnObs = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting){ const id = en.target.id.replace('learn-',''); $$('#toc a').forEach(a => a.classList.toggle('on', a.dataset.sec === id)); const on = $(`#toc a[data-sec="${id}"]`), toc = $('#toc'); if (on && toc) toc.scrollLeft = on.offsetLeft - toc.clientWidth / 2 + on.offsetWidth / 2; } });
    }, {rootMargin:'-35% 0px -60% 0px'});
    $$('#lesson section').forEach(s => learnObs.observe(s));
  }
  $('#quiz').addEventListener('click', e => {
    const o = e.target.closest('[data-o]');
    if (o && qAns[qi] == null){ qAns[qi] = +o.dataset.o; store.set('quiz', {qi, qAns}); renderQuiz(); $('#qNext')?.focus(); return; }
    if (e.target.id === 'qNext'){ qi++; store.set('quiz', {qi, qAns}); renderQuiz(); $('#quiz .qopt')?.focus(); }
    if (e.target.id === 'qRestart'){ qi = 0; qAns = []; store.set('quiz', {qi, qAns}); renderQuiz(); }
  });
  $('#quiz').addEventListener('keydown', e => { if (/^[1-4]$/.test(e.key) && qAns[qi] == null){ const b = $$('#quiz .qopt')[+e.key - 1]; if (b){ e.stopPropagation(); b.click(); } } });
  const saved = store.get('quiz', null); if (saved && Array.isArray(saved.qAns)){ qi = saved.qi || 0; qAns = saved.qAns; }
  renderQuiz();
}
function gotoLearn(sec){ const el = document.getElementById('learn-' + sec); if (el) el.scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth'}); }

/* =================== sources =================== */
const BIB = Object.entries(REFS).map(([id,r]) => ({id, ...r})).sort((a,b) => a.n - b.n);
const REF_USES = {};
(function(){
  const add = (id, use) => { if (!id || !REFS[id]) return; (REF_USES[id] = REF_USES[id] || []); if (!REF_USES[id].some(u => u.h === use.h)) REF_USES[id].push(use); };
  const walk = (o, use) => { if (Array.isArray(o)) o.forEach(x => walk(x, use)); else if (o && typeof o === 'object'){ for (const k in o){ if (k === 'ref' && typeof o[k] === 'string') add(o[k], use); else if (k === 'refs' && Array.isArray(o[k])) o[k].forEach(r => add(r, use)); else walk(o[k], use); } } };
  WASTES.forEach(w => walk(w, {t: w.name, h: `/catalogue/${w.id}`, k:'waste'}));
  CASES.forEach(c => walk(c, {t: c.name, h: `/cases/${c.id}`, k:'case'}));
  DATA.THEORY.forEach(t => add(t.ref, {t: 'Learn: ' + t.topic, h: '/learn', k:'learn'}));
  Object.values(STREAM_DEFAULTS).forEach(f => [f.co2Src, f.valueSrc, f.maxKmSrc, f.costSrc, f.costNote, f.valueNote].forEach(s => s && add(s.ref, {t: 'Builder factor: ' + f.name, h: '/builder', k:'builder'})));
  Object.values(GLOBAL_SRC).forEach(s => add(s.ref, {t: 'Builder: truck freight', h: '/builder', k:'builder'}));
})();
const typeGroup = t => ['article','report','web'].includes(t) ? t : 'other';
let bibState = {q:'', type:''};
function bibList(){
  const q = bibState.q.toLowerCase().trim();
  return BIB.filter(r => (!bibState.type || typeGroup(r.type) === bibState.type) && (!q || [r.authors, r.title, r.container, r.publisher, r.year, r.doi].join(' ').toLowerCase().includes(q)));
}
function renderBib(){
  const list = bibList();
  $('#bibList').innerHTML = list.map(r => { const uses = REF_USES[r.id] || [];
    return `<li id="ref-${r.id}"><span class="no">[${r.n}]</span><div><div>${fmtRef(r)}</div>
      ${uses.length ? `<div class="used">${uses.slice(0, 8).map(u => `<a href="#${esc(u.h)}">${esc(u.t)}</a>`).join('')}${uses.length > 8 ? `<span class="note">+${uses.length - 8} more</span>` : ''}</div>` : ''}
      <div class="row-acts"><button type="button" data-copyref="${r.id}">Copy citation</button><button type="button" data-save="ref:${r.id}">${isSaved('ref', r.id) ? '★ Saved' : 'Save'}</button></div></div></li>`; }).join('');
  $('#bibTitle').textContent = `References (${list.length}${list.length !== BIB.length ? ' of ' + BIB.length : ''})`;
}
function flashRef(id){
  if (bibState.q || bibState.type){ bibState = {q:'', type:''}; $('#bibSearch').value = ''; $('#bibType').value = ''; renderBib(); }
  const li = document.getElementById('ref-' + id);
  if (li){ li.scrollIntoView({block:'center'}); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1800); }
}
function bibtexKey(r){ return r.id.replace(/[^a-z0-9]/gi, ''); }
function toBibtex(list){
  const f = (k, v) => v ? `  ${k} = {${String(v).replace(/[{}]/g, '')}},\n` : '';
  return list.map(r => {
    const type = r.type === 'article' ? 'article' : r.type === 'book' ? 'book' : r.type === 'chapter' ? 'incollection' : r.type === 'report' ? 'techreport' : 'misc';
    const au = (r.authors || '').replace(/,?\s*&\s*/g, ', ').split(/,\s*(?=[A-Z][^,]*?,)/).join(' and ');
    return `@${type}{${bibtexKey(r)},\n` + f('author', r.authors ? au : `{${r.publisher || ''}}`) + f('year', r.year) + f('title', r.title) +
      f(type === 'article' ? 'journal' : 'booktitle', r.container) + f('volume', r.volume) + f('number', r.issue) + f('pages', (r.pages || '').replace('–','--')) +
      f(type === 'techreport' ? 'institution' : 'publisher', r.publisher) + f('doi', r.doi) + f('url', !r.doi ? r.url : '') + '}';
  }).join('\n\n');
}
function toRis(list){
  return list.map(r => {
    const ty = r.type === 'article' ? 'JOUR' : r.type === 'book' ? 'BOOK' : r.type === 'chapter' ? 'CHAP' : r.type === 'report' ? 'RPRT' : 'ELEC';
    const lines = [`TY  - ${ty}`];
    (r.authors || '').split(/,\s(?=[A-Z][\w'’\- ]+,)|,?\s&\s/).map(a => a.trim()).filter(Boolean).forEach(a => lines.push(`AU  - ${a}`));
    if (!r.authors && r.publisher) lines.push(`AU  - ${r.publisher}`);
    if (r.year) lines.push(`PY  - ${r.year}`); if (r.title) lines.push(`TI  - ${r.title}`); if (r.container) lines.push(`T2  - ${r.container}`);
    if (r.volume) lines.push(`VL  - ${r.volume}`); if (r.issue) lines.push(`IS  - ${r.issue}`);
    if (r.pages){ const [sp, ep] = r.pages.split(/[–-]/); lines.push(`SP  - ${sp}`); if (ep) lines.push(`EP  - ${ep}`); }
    if (r.publisher) lines.push(`PB  - ${r.publisher}`); if (r.doi) lines.push(`DO  - ${r.doi}`); if (r.url) lines.push(`UR  - ${r.doi ? 'https://doi.org/' + r.doi : r.url}`);
    lines.push('ER  - '); return lines.join('\n');
  }).join('\n\n');
}
function toolCitation(plain){
  const url = location.origin && location.origin !== 'null' ? location.origin + location.pathname : '';
  const t = `${CONFIG.author} (${CONFIG.year}). ${CONFIG.title}: An evidence-based industrial symbiosis tool (Version ${CONFIG.version}) [Web application]. ${CONFIG.affiliation}.${url ? ' ' + url : ''}`;
  return plain ? t : esc(t).replace(CONFIG.title, `<i>${CONFIG.title}</i>`);
}
function initSources(){
  renderBib();
  let t; $('#bibSearch').addEventListener('input', e => { bibState.q = e.target.value; clearTimeout(t); t = setTimeout(renderBib, 100); });
  $('#bibType').addEventListener('change', e => { bibState.type = e.target.value; renderBib(); });
  $('#dlBib').onclick = () => download('symbiosis-workbench-references.bib', toBibtex(bibList()), 'application/x-bibtex');
  $('#dlRis').onclick = () => download('symbiosis-workbench-references.ris', toRis(bibList()), 'application/x-research-info-systems');
  const nDoi = BIB.filter(r => r.doi).length;
  $('#method').innerHTML = `<h3>How this evidence was assembled</h3>
    <p><b>${BIB.length} references</b> support ${WASTES.length} waste streams, ${CASES.length} cases and the builder’s factors. ${nDoi} have DOIs, each checked against Crossref metadata (title, authors, year, journal, volume, pages). Reports and web pages were opened and figures read from them directly. Claims that could not be verified were left out, and a separate audit re-checked a random sample.</p>
    <p><b>Numbers</b> are shown with the year they refer to. Where two sources disagree, both are given. Each reference lists where it is used, so you can trace any source back to the claims it supports.</p>
    <p><b>Limits to keep in mind</b></p>
    <ul class="plain">
      <li>List of Waste codes were assigned from the 2014/955/EU list${cite('eu2014')}; confirm the exact code and any mirror-entry assessment against the official text before regulatory use.</li>
      <li>Some historical case exchanges (e.g. Guitang, Styria, Kalundborg coal-era flows) come from standard accounts in the cited papers, confirmed from abstracts rather than full text.</li>
      <li>Prices for heat, steam, water and most residues are local. The builder marks them illustrative; replace them with quotes or site data.</li>
      <li>Emission factors are avoided-burden credits against a stated counterfactual. Change the counterfactual and the credit changes${cite('mattila2012')}.</li>
    </ul>
    <p class="note">Evidence compiled September 2026 · version ${CONFIG.version}.</p>`;
  $('#repoGrid').innerHTML = DATA.REPOS.map(r => `<div class="repo"><b><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></b><span class="org">${esc(r.org)} · <span class="chip ${r.access === 'open' ? 'good' : r.access === 'commercial' ? 'warn' : ''}">${esc(r.access)}</span></span><p>${esc(r.what)}${r.ref ? cite(r.ref) : ''}</p></div>`).join('');
  $('#citeTool').innerHTML = toolCitation(false);
  $('#copyCiteTool').onclick = () => copyText(toolCitation(true), 'Citation');
  $('#aboutTxt').innerHTML = `An open teaching and research tool for industrial symbiosis by ${esc(CONFIG.authorFull)}, ${esc(CONFIG.affiliation)}. ${WASTES.length} waste streams, ${CASES.length} cases and ${BIB.length} sources. Works offline once loaded, and saves your work in this browser only.`;
  $('#footLinks').innerHTML = '<a href="/#work">← Shagbaor Hycent Amool\u2019s website</a> · <a href="/sustainatable.html">The SustainaTable</a>' + (CONFIG.repoUrl ? ` · <a href="${esc(CONFIG.repoUrl)}" target="_blank" rel="noopener">Source code on GitHub ↗</a>` : '');
}

/* =================== router =================== */
const TABS = ['builder','catalogue','cases','learn','sources'];
const TAB_TITLE = {builder:'Park builder', catalogue:'Waste catalogue', cases:'Case atlas', learn:'Learn & quiz', sources:'Sources & data'};
let curTab = null, booted = false;
const tabScroll = {};
function parseHash(){
  let h = decodeURIComponent(location.hash.slice(1) || '');
  if (!h.startsWith('/')) h = '/' + h;
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  let tab = parts[0] === 'match' ? 'catalogue' : parts[0];
  if (!TABS.includes(tab)) tab = null;
  return {tab, id: parts[1] || null, params: Object.fromEntries(new URLSearchParams(qs || ''))};
}
function navigate(path, opt = {}){
  const h = '#' + path;
  if (opt.silent){ try { history.replaceState(null, '', h); } catch(e){} return; }
  if (location.hash === h){ applyRoute({user:true}); return; }
  if (opt.replace){ try { history.replaceState(null, '', h); } catch(e){ location.hash = h; return; } applyRoute({user:true}); }
  else location.hash = h;
}
window.addEventListener('hashchange', () => applyRoute({user:true}));
function applyRoute(o = {}){
  const r = parseHash();
  const tab = r.tab || (booted ? 'builder' : store.get('tab', 'builder'));
  const sameTab = tab === curTab;
  showTab(tab, {keepScroll: sameTab || (r.id && (tab === 'learn' || tab === 'sources'))});
  let title = TAB_TITLE[tab];
  if (tab === 'catalogue'){
    Object.assign(mm, MM_DEFAULT, pick(r.params, ['q','cat','sector','recv','trl','haz','ewc','sort']));
    if (r.id && WASTES.some(w => w.id === r.id)) mm.sel = r.id;
    else { const items = mmFilter(); if (items.length && !items.some(w => w.id === mm.sel)) mm.sel = items[0].id; }
    mmSyncControls(); renderMM(); addRecent('waste', mm.sel);
    title = WASTES.find(w => w.id === mm.sel)?.name || title;
    if (o.user && r.id && sameTab) $('#wasteTitle')?.focus({preventScroll:true});
  } else if (tab === 'cases'){
    cf.model = r.params.model || ''; cf.region = r.params.region || '';
    $('#cfModel').value = cf.model; $('#cfRegion').value = cf.region;
    if (r.id && CASES.some(c => c.id === r.id)) caseSel = r.id;
    else { const items = caseFiltered(); if (items.length && !items.some(c => c.id === caseSel)) caseSel = items[0].id; }
    renderCases(); addRecent('case', caseSel);
    title = CASES.find(c => c.id === caseSel)?.name || title;
  } else if (tab === 'learn'){
    if (r.id) setTimeout(() => gotoLearn(r.id), 140);
  } else if (tab === 'sources'){
    if (r.id && REFS[r.id]){ setTimeout(() => flashRef(r.id), 140); addRecent('ref', r.id); }
  }
  document.title = `${title} · ${CONFIG.title}`;
  booted = true;
}
function pick(o, keys){ const out = {}; keys.forEach(k => { if (o[k] != null && o[k] !== '') out[k] = o[k]; }); return out; }
function showTab(name, opt = {}){
  if (curTab && curTab !== name) tabScroll[curTab] = window.scrollY;
  const doSwitch = () => {
    $$('.tabs [role="tab"]').forEach(b => { b.setAttribute('aria-selected', b.dataset.tab === name); b.tabIndex = b.dataset.tab === name ? 0 : -1; });
    $$('[role="tabpanel"]').forEach(p => p.hidden = p.id !== 'tab-' + name);
    $$('.bnav button').forEach(b => b.dataset.tab === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    store.set('tab', name);
  };
  const changed = curTab !== name;
  if (changed && booted && document.startViewTransition && !REDUCED) document.startViewTransition(doSwitch); else doSwitch();
  if (changed){
    const prev = curTab; curTab = name;
    if (prev && !opt.keepScroll) requestAnimationFrame(() => window.scrollTo({top: tabScroll[name] || 0, behavior:'instant'}));
    if (booted) setTimeout(() => $(`#tab-${name} h2`)?.focus({preventScroll:true}), 60);
  }
}
function refreshCurrent(){ if (curTab === 'catalogue') renderMM(); else if (curTab === 'cases') renderCases(); else if (curTab === 'sources') renderBib(); }
$$('[data-tab]').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.tab;
  const path = t === 'catalogue' ? `/catalogue/${mm.sel}${mmQueryString()}` : t === 'cases' ? `/cases/${caseSel}${caseQs()}` : '/' + t;
  navigate(path);
}));
$('.tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
  const i = TABS.indexOf(curTab); let n = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'Home' ? 0 : TABS.length - 1;
  n = (n + TABS.length) % TABS.length; e.preventDefault(); $(`#t-${TABS[n]}`).click(); $(`#t-${TABS[n]}`).focus();
});

/* =================== theme =================== */
const THEMES = ['system','light','dark'];
let theme = store.get('theme', 'system');
function applyTheme(){
  const root = document.documentElement;
  theme === 'system' ? root.removeAttribute('data-theme') : root.setAttribute('data-theme', theme);
  const b = $('#themeBtn'); b.innerHTML = icon(theme === 'system' ? 'auto' : theme === 'dark' ? 'moon' : 'sun');
  b.setAttribute('aria-label', `Theme: ${theme}. Click to change (T)`); b.title = `Theme: ${theme}`;
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161F1C' : '#FFFFFF');
}
function cycleTheme(){ theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set('theme', theme); applyTheme(); renderPark(compute()); toast('Theme: ' + theme); }
$('#themeBtn').onclick = cycleTheme;
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch(e){}

/* =================== overlay layer helpers =================== */
let layerOpen = null, layerReturn = null;
function openLayer(kind, html, onKey){
  closeLayer(true);
  layerReturn = document.activeElement;
  $('#layer').innerHTML = `<div class="scrim" data-scrim></div>${html}`;
  layerOpen = {kind, onKey};
  $('#layer [data-scrim]').onclick = () => closeLayer();
  document.body.style.overflow = 'hidden';
}
function closeLayer(silent){
  if (!layerOpen) return;
  $('#layer').innerHTML = ''; layerOpen = null; document.body.style.overflow = '';
  if (!silent && layerReturn && layerReturn.focus) layerReturn.focus({preventScroll:true});
}
function trapTab(e, root){
  if (e.key !== 'Tab') return;
  const f = [...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return; const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

/* =================== command palette =================== */
let PINDEX = null;
function buildIndex(){
  const I = [];
  const add = (g, t, sub, run, ic, kw = '') => I.push({g, t, sub, run, ic, s: (t + ' ' + sub + ' ' + kw).toLowerCase()});
  TABS.forEach((t, i) => add('Pages', TAB_TITLE[t], `Press ${i+1}`, () => $(`#t-${t}`).click(), {builder:'net',catalogue:'list',cases:'pin',learn:'book',sources:'quote'}[t]));
  add('Actions', 'Auto-connect best matches', 'Builder · Shift A', () => { navigate('/builder'); autoConnect(); }, 'net', 'link exchanges');
  add('Actions', 'Fit park to view', 'Builder · F', () => { navigate('/builder'); fitView(); }, 'fit', 'zoom');
  add('Actions', 'Undo', 'Ctrl Z', undo, 'undo'); add('Actions', 'Redo', 'Ctrl Shift Z', redo, 'redo');
  add('Actions', 'Download park diagram (PNG)', 'Export', exportPng, 'image', 'image picture');
  add('Actions', 'Download park diagram (SVG)', 'Export', () => download('symbiosis-park.svg', exportSvgString(), 'image/svg+xml'), 'image', 'vector');
  add('Actions', 'Download exchanges (CSV)', 'Export', () => download('symbiosis-exchanges.csv', exchangesCsv(), 'text/csv'), 'download', 'spreadsheet excel');
  add('Actions', 'Download site (JSON)', 'Export', () => download('symbiosis-site.json', siteJson(), 'application/json'), 'download', 'save');
  add('Actions', 'Download all references (BibTeX)', 'Sources', () => download('symbiosis-workbench-references.bib', toBibtex(BIB), 'application/x-bibtex'), 'download', 'bibliography zotero mendeley');
  add('Actions', 'Download all references (RIS)', 'Sources', () => download('symbiosis-workbench-references.ris', toRis(BIB), 'application/x-research-info-systems'), 'download', 'endnote zotero');
  add('Actions', 'Change theme (light / dark / system)', 'T', cycleTheme, 'moon', 'dark mode');
  add('Actions', 'Take the guided tour', 'Help', startTour, 'play', 'onboarding tutorial');
  add('Actions', 'Keyboard shortcuts', '?', openHelp, 'cmd', 'help keys');
  add('Actions', 'Saved items and history', 'B', openDrawer, 'bookmark', 'favourites recent');
  add('Actions', 'Copy link to this view', 'Share', () => copyText(location.href, 'Link'), 'link', 'url share');
  add('Actions', 'Print this view', 'Ctrl P', () => window.print(), 'print', 'pdf');
  add('Actions', 'Open assumptions & evidence table', 'Builder', () => { navigate('/builder'); $('#assump').open = true; setTimeout(() => $('#assump').scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth'}), 80); }, 'quote', 'factors emission');
  Object.entries(EXAMPLES).forEach(([k, ex]) => add('Actions', 'Load site: ' + ex.name, 'Builder', () => { navigate('/builder'); $('#exampleSel').value = k; $('#exampleSel').dispatchEvent(new Event('change')); }, 'net', 'example'));
  FT_ORDER.forEach(k => add('Facilities', 'Add ' + FT[k].name, FT[k].code, () => { navigate('/builder'); let n; mutate(() => { n = addNode(k); sel = {kind:'node', id:n.id}; }, FT[k].name + ' added'); }, 'plus', (FT[k].desc || '')));
  WASTES.forEach(w => add('Waste streams', w.name, (w.ewc && w.ewc[0] ? w.ewc[0] + ' · ' : '') + w.sector, () => navigate(`/catalogue/${w.id}`), 'list', [...(w.aliases || []), ...(w.ewc || []), ...w.routes.map(r => r.use)].join(' ')));
  RECV_ALL.forEach(r => add('Receiving sectors', 'Streams that can supply ' + r, 'Catalogue filter', () => navigate(`/catalogue?recv=${encodeURIComponent(r)}`), 'list'));
  CASES.forEach(c => add('Cases', c.name, `${c.country} · ${MODEL_LABEL[c.model] || c.model}`, () => navigate(`/cases/${c.id}`), 'pin', c.place + ' ' + c.sectors.join(' ')));
  LEARN_IDS.forEach((id, i) => add('Concepts', LEARN_TITLES[i], 'Learn', () => navigate(`/learn/${id}`), 'book'));
  DATA.THEORY.forEach(t => add('Concepts', t.topic, 'Learn', () => navigate('/learn'), 'book', t.keyPoint.slice(0, 120)));
  BIB.forEach(r => add('References', `${(r.authors || r.publisher || '').split(/,|&/)[0].trim()} (${r.year || 'n.d.'})`, r.title || '', () => navigate(`/sources/${r.id}`), 'quote', (r.container || '') + ' ' + (r.doi || '')));
  return I;
}
const GROUP_ORDER = ['Recent','Pages','Actions','Waste streams','Cases','Facilities','Receiving sectors','Concepts','References'];
function searchIndex(q){
  q = q.toLowerCase().trim();
  if (!q){
    const rec = RECENT.map(itemLabel).filter(Boolean).slice(0, 5).map(l => ({g:'Recent', t:l.t, sub:l.k, ic:'undo', run:() => navigate(l.h)}));
    return [...rec, ...PINDEX.filter(x => x.g === 'Pages'), ...PINDEX.filter(x => x.g === 'Actions').slice(0, 6)];
  }
  const terms = q.split(/\s+/);
  const scored = [];
  PINDEX.forEach(x => {
    if (!terms.every(t => x.s.includes(t))) return;
    const tl = x.t.toLowerCase(); let sc = 0;
    if (tl.startsWith(q)) sc += 100; else if (tl.includes(q)) sc += 60; else if (terms.every(t => tl.includes(t))) sc += 40;
    sc -= GROUP_ORDER.indexOf(x.g) * 2; sc -= tl.length / 100;
    scored.push([sc, x]);
  });
  scored.sort((a,b) => b[0] - a[0]);
  const per = {}, out = [];
  scored.forEach(([, x]) => { per[x.g] = (per[x.g] || 0) + 1; if (per[x.g] <= (x.g === 'References' ? 5 : 7)) out.push(x); });
  return out.sort((a,b) => GROUP_ORDER.indexOf(a.g) - GROUP_ORDER.indexOf(b.g));
}
function openPalette(initial = ''){
  if (!PINDEX) PINDEX = buildIndex();
  openLayer('palette', `<div class="palette-dlg" role="dialog" aria-modal="true" aria-label="Search everything">
    <div class="pin">${icon('search')}<input id="pq" type="text" role="combobox" aria-expanded="true" aria-controls="pres" aria-autocomplete="list" placeholder="Search streams, cases, references, actions…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <div class="presults" id="pres" role="listbox"></div>
    <div class="pfoot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><span id="pcount"></span></div></div>`,
    e => {
      const items = $$('#pres .pitem'); let i = items.findIndex(x => x.getAttribute('aria-selected') === 'true');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); i = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1); setActive(i); return true; }
      if (e.key === 'Enter'){ e.preventDefault(); if (items[i]) items[i].click(); return true; }
      trapTab(e, $('.palette-dlg')); return false;
    });
  let res = [];
  const setActive = i => { $$('#pres .pitem').forEach((x, j) => x.setAttribute('aria-selected', j === i)); const a = $$('#pres .pitem')[i]; if (a){ a.scrollIntoView({block:'nearest'}); $('#pq').setAttribute('aria-activedescendant', a.id); } };
  const draw = () => {
    res = searchIndex($('#pq').value);
    let last = '', h = '';
    res.forEach((x, i) => { if (x.g !== last){ h += `<div class="pgroup" role="presentation">${esc(x.g)}</div>`; last = x.g; }
      h += `<button type="button" class="pitem" role="option" id="po${i}" data-i="${i}" aria-selected="${i === 0}">${icon(x.ic || 'right')}<span>${hl(x.t, $('#pq').value)}</span><span class="sub">${esc(x.sub || '')}</span></button>`; });
    $('#pres').innerHTML = h || `<p class="note" style="padding:14px">No matches. Try a waste code such as “10 01 02”, a material, a country or an author.</p>`;
    $('#pcount').textContent = $('#pq').value ? `${res.length} result${res.length === 1 ? '' : 's'}` : '';
  };
  $('#pq').addEventListener('input', draw);
  $('#pres').addEventListener('click', e => { const b = e.target.closest('.pitem'); if (!b) return; const x = res[+b.dataset.i]; closeLayer(true); x.run(); });
  $('#pres').addEventListener('mousemove', e => { const b = e.target.closest('.pitem'); if (b && b.getAttribute('aria-selected') !== 'true') setActive(+b.dataset.i); });
  $('#pq').value = initial; draw(); $('#pq').focus();
}
$('#openPalette').onclick = () => openPalette();

/* =================== help, drawer =================== */
const SHORTCUTS = [
  ['Ctrl/⌘ K','Search everything'],['/','Search in the current section'],['1 – 5','Go to a section'],['← →','Move between section tabs (when a tab has focus)'],
  ['J / K','Next / previous stream or case'],['↑ ↓','Move through a focused list'],['S','Save or unsave the current stream or case'],['B','Saved items and history'],
  ['T','Change theme'],['?','This help'],['Esc','Close dialogs, clear selection'],
  ['Ctrl/⌘ Z · Shift Z','Undo / redo in the park builder'],['Arrows','Move the selected facility (Shift for bigger steps)'],['Delete','Remove the selected facility or exchange'],
  ['+ / − / F','Zoom in, zoom out, fit (builder)'],['Ctrl/⌘ + scroll','Zoom the park under the pointer'],['Shift A','Auto-connect best matches'],['1 – 4','Answer a quiz question (when the quiz has focus)']
];
function openHelp(){
  openLayer('help', `<div class="help-dlg" role="dialog" aria-modal="true" aria-labelledby="helpT">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3 id="helpT">Keyboard shortcuts &amp; navigation</h3><button class="icon-btn" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <table style="margin-top:10px">${SHORTCUTS.map(([k, d]) => `<tr><td>${k.split(' ').map(x => /^[·–\/]$/.test(x) ? x : `<kbd>${esc(x)}</kbd>`).join(' ')}</td><td>${esc(d)}</td></tr>`).join('')}</table>
    <p class="note" style="margin-top:10px">Every stream, case, reference and lesson section has its own address, so the browser’s back and forward buttons work and any view can be bookmarked or shared. On phones, swipe left or right on a stream or case to move between them.</p>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" type="button" id="helpTour">${icon('play')}Take the guided tour</button><button class="btn" type="button" data-close>Close</button></div></div>`,
    e => { trapTab(e, $('.help-dlg')); return false; });
  $$('#layer [data-close]').forEach(b => b.onclick = () => closeLayer());
  $('#helpTour').onclick = () => { closeLayer(true); startTour(); };
  $('.help-dlg [data-close]').focus();
}
$('#helpBtn').onclick = openHelp;
function openDrawer(){
  const row = it => { const l = itemLabel(it); return l ? `<button type="button" data-h="${esc(l.h)}">${icon(it.type === 'waste' ? 'list' : it.type === 'case' ? 'pin' : 'quote')}<span>${esc(l.t)}</span><span class="k">${l.k}</span></button>` : ''; };
  openLayer('drawer', `<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drT">
    <div style="display:flex;justify-content:space-between;align-items:center"><h3 id="drT">Saved &amp; recent</h3><button class="icon-btn" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div><h4 style="margin-bottom:6px">Saved (${SAVED.length})</h4>${SAVED.length ? `<div class="dlist">${SAVED.map(row).join('')}</div>` : '<p class="note">Press <kbd>S</kbd> or the Save button on any stream, case or reference to keep it here. Saved items stay in this browser.</p>'}</div>
    <div><h4 style="margin-bottom:6px">Recently viewed</h4>${RECENT.length ? `<div class="dlist">${RECENT.map(row).join('')}</div>` : '<p class="note">Nothing yet.</p>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto">${SAVED.length ? `<button class="btn small" type="button" id="exportSaved">${icon('download')}Export saved references</button>` : ''}<button class="btn small danger" type="button" id="clearRecent">Clear history</button></div></aside>`,
    e => { trapTab(e, $('.drawer')); return false; });
  $$('#layer [data-close]').forEach(b => b.onclick = () => closeLayer());
  $('.drawer').addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b){ closeLayer(true); navigate(b.dataset.h); } });
  $('#clearRecent').onclick = () => { RECENT = []; store.set('recent', RECENT); openDrawer(); toast('History cleared'); };
  const ex = $('#exportSaved'); if (ex) ex.onclick = () => {
    const ids = new Set(); SAVED.forEach(s => { if (s.type === 'ref') ids.add(s.id); if (s.type === 'waste') (WASTES.find(w => w.id === s.id)?.refs || []).forEach(r => ids.add(r)); if (s.type === 'case') (CASES.find(c => c.id === s.id)?.refs || []).forEach(r => ids.add(r)); });
    download('saved-references.bib', toBibtex(BIB.filter(r => ids.has(r.id))), 'application/x-bibtex');
  };
  $('.drawer [data-close]').focus();
}
$('#savedBtn').onclick = openDrawer;

/* =================== guided tour =================== */
const TOUR = [
  {sel:null, tab:'builder', t:'Welcome to Symbiosis Workbench', d:'A quick look at how to get around. You can leave at any time with Esc.'},
  {sel:() => window.innerWidth < 820 ? '.bnav' : '.tabs', t:'Five sections', d:'Design a park, browse the waste catalogue, study real cases, learn the theory, and check every source. Keys 1–5 jump between them.'},
  {sel:'#openPalette', t:'Search everything', d:'Press Ctrl K (⌘ K on Mac) to find any waste stream, case, reference or action and jump straight to it.'},
  {sel:'#siteBox', tab:'builder', t:'The park canvas', d:'Drag facilities to change distances. Drag empty ground to pan, Ctrl-scroll to zoom. Click a flow line to see the evidence behind its numbers.'},
  {sel:'#kpis', tab:'builder', t:'Live results', d:'Value, carbon, materials, energy and water update as you edit. Undo anything with Ctrl Z.'},
  {sel:'#inspector', tab:'builder', t:'Inspector', d:'Checks Chertow’s 3-2 test, shows dependency risk, and suggests the best unconnected matches.'},
  {sel:'#mmDetail', tab:'catalogue', t:'Cited catalogue', d:'Each stream lists its waste code, reuse routes and maturity. Click a bracketed number to see the source. J and K move to the next or previous stream.'},
  {sel:'#savedBtn', t:'Save and come back', d:'Press S to save a stream, case or reference. Saved items and your recent history live here, in this browser.'},
  {sel:'#helpBtn', t:'All shortcuts', d:'Press ? at any time for the full list. Enjoy exploring.'}
];
let tourI = -1;
function startTour(){ store.set('welcomed', true); $('#welcome').hidden = true; tourI = 0; drawTour(); }
function endTour(){ tourI = -1; closeLayer(); }
function drawTour(){
  const s = TOUR[tourI];
  if (s.tab && curTab !== s.tab) navigate(s.tab === 'catalogue' ? `/catalogue/${mm.sel}` : '/' + s.tab);
  setTimeout(() => {
    const selr = typeof s.sel === 'function' ? s.sel() : s.sel, el = selr ? $(selr) : null;
    if (el) el.scrollIntoView({block:'center', behavior:'instant'});
    requestAnimationFrame(() => {
      const r = el ? el.getBoundingClientRect() : null, pad = 6;
      openLayer('tour', `${r ? `<div class="tour-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad*2}px;height:${r.height + pad*2}px"></div>` : ''}
        <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourT"><span class="step">${tourI + 1} / ${TOUR.length}</span><h3 id="tourT">${esc(s.t)}</h3><p>${esc(s.d)}</p>
        <div class="acts"><button class="btn small" type="button" id="tourSkip">Skip tour</button><span style="display:flex;gap:6px">${tourI ? `<button class="btn small" type="button" id="tourBack">Back</button>` : ''}<button class="btn small primary" type="button" id="tourNext">${tourI === TOUR.length - 1 ? 'Finish' : 'Next'}</button></span></div></div>`,
        e => { if (e.key === 'ArrowRight'){ $('#tourNext').click(); return true; } if (e.key === 'ArrowLeft' && tourI){ $('#tourBack').click(); return true; } trapTab(e, $('.tour-card')); return false; });
      $('#layer .scrim').style.background = r ? 'transparent' : '';
      $('#layer .scrim').onclick = null;
      const card = $('.tour-card'), cw = card.offsetWidth, ch = card.offsetHeight;
      let x, y;
      if (!r){ x = (innerWidth - cw) / 2; y = (innerHeight - ch) / 2; }
      else { x = Math.min(innerWidth - cw - 16, Math.max(16, r.left)); y = r.bottom + 14; if (y + ch > innerHeight - 16) y = r.top - ch - 14; if (y < 16) y = Math.min(innerHeight - ch - 16, Math.max(16, r.top + 16)); }
      card.style.left = x + 'px'; card.style.top = y + 'px';
      $('#tourNext').onclick = () => { if (tourI === TOUR.length - 1){ endTour(); toast('Tour finished. Press ? for shortcuts any time.'); } else { tourI++; drawTour(); } };
      const bk = $('#tourBack'); if (bk) bk.onclick = () => { tourI--; drawTour(); };
      $('#tourSkip').onclick = endTour;
      $('#tourNext').focus();
    });
  }, s.tab && curTab !== s.tab ? 120 : 10);
}
$('#startTour').onclick = startTour;
$('#closeWelcome').onclick = () => { store.set('welcomed', true); $('#welcome').hidden = true; };

/* =================== global keyboard =================== */
const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k'){ e.preventDefault(); layerOpen && layerOpen.kind === 'palette' ? closeLayer() : openPalette(); return; }
  if (layerOpen){
    if (e.key === 'Escape'){ e.preventDefault(); layerOpen.kind === 'tour' ? endTour() : closeLayer(); return; }
    if (layerOpen.onKey) layerOpen.onKey(e);
    return;
  }
  if (e.key === 'Escape' && !pop().hidden){ closePop(); return; }
  if (e.key === 'Enter' && e.target.closest && e.target.closest('.cite a')){ e.preventDefault(); openPop(e.target.closest('.cite a')); return; }
  if (curTab === 'builder' && mod && !typing(e.target)){
    if (e.key.toLowerCase() === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
  }
  if (typing(e.target)){ if (e.key === 'Escape') e.target.blur(); return; }
  if (mod || e.altKey) return;
  const k = e.key;
  if (k === '?'){ e.preventDefault(); openHelp(); return; }
  if (k === '/'){ e.preventDefault(); if (curTab === 'catalogue') $('#mmSearch').focus(); else if (curTab === 'sources') $('#bibSearch').focus(); else openPalette(); return; }
  if (/^[1-5]$/.test(k) && !(e.target.closest && e.target.closest('#quiz'))){ $(`#t-${TABS[+k - 1]}`).click(); return; }
  if (k.toLowerCase() === 't'){ cycleTheme(); return; }
  if (k.toLowerCase() === 'b'){ openDrawer(); return; }
  if (curTab === 'catalogue' || curTab === 'cases'){
    const root = curTab === 'catalogue' ? '#mmDetail' : '#caseDetail';
    if (k === 'j' || k === ']'){ const b = $(`${root} .dtools [data-go]:last-child`); if (b && b.dataset.go) navigate(b.dataset.go, {replace:true}); return; }
    if (k === 'k' || k === '['){ const b = $(`${root} .dtools [data-go]:first-child`); if (b && b.dataset.go) navigate(b.dataset.go, {replace:true}); return; }
    if (k === 's'){ curTab === 'catalogue' ? toggleSaved('waste', mm.sel) : toggleSaved('case', caseSel); return; }
  }
  if (curTab === 'builder') builderKeys(e);
});

/* =================== swipe between items (touch) =================== */
function swipe(el, onLeft, onRight){
  let sx = 0, sy = 0, ok = false;
  el.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; ok = !e.target.closest('.scroll-x,.diagram,input,select,textarea'); }, {passive:true});
  el.addEventListener('touchend', e => { if (!ok) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) (dx < 0 ? onLeft : onRight)(); }, {passive:true});
}
swipe($('#mmDetail'), () => { const b = $('#mmDetail .dtools [data-go]:last-child'); if (b?.dataset.go) navigate(b.dataset.go, {replace:true}); }, () => { const b = $('#mmDetail .dtools [data-go]:first-child'); if (b?.dataset.go) navigate(b.dataset.go, {replace:true}); });
swipe($('#caseDetail'), () => { const b = $('#caseDetail .dtools [data-go]:last-child'); if (b?.dataset.go) navigate(b.dataset.go, {replace:true}); }, () => { const b = $('#caseDetail .dtools [data-go]:first-child'); if (b?.dataset.go) navigate(b.dataset.go, {replace:true}); });

/* =================== scroll affordances =================== */
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    $('#top').classList.toggle('scrolled', y > 4);
    $('#progress').style.width = (max > 0 ? Math.min(100, y / max * 100) : 0) + '%';
    $('#backTop').hidden = y < 700;
    ticking = false;
  });
}, {passive:true});
$('#backTop').onclick = () => { window.scrollTo({top:0, behavior: REDUCED ? 'auto' : 'smooth'}); $('#main').focus({preventScroll:true}); };

/* =================== boot =================== */
$('#kbdHint').textContent = IS_MAC ? '⌘ K' : 'Ctrl K';
applyTheme();
if (!restore()) loadExample('riverside');
initBuilder(); initMM(); initCases(); initLearn(); initSources();
renderAll(); hydrateCites(); updSavedCount();
$('#brandSub').textContent = `${WASTES.length} STREAMS · ${CASES.length} CASES · ${BIB.length} SOURCES`;
if (!store.get('welcomed', false)) $('#welcome').hidden = false;
applyRoute();
if ('serviceWorker' in navigator && /^https:$/.test(location.protocol) && !window.__NO_SW__){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
