/*******************************************************************
 *  PICK VERIFY — MATCH ENGINE (shared)
 *  Same code runs in the Android app (instant local check) and in the
 *  Google Sheet server (re-check before writing). Barcode NOT required:
 *  label text read by on-device AI (ML Kit) is matched with the sheet.
 *
 *  Rules (zero-wrong design):
 *   - Every field in the sheet (MRP, Weight, Batch, Keyword, Barcode*)
 *     must MATCH. (*barcode only if one is read from the box)
 *   - Product identity must be proven by Batch / Barcode / Keyword /
 *     full product name on the label.  MRP+Weight alone never pass.
 *   - 3 of last 5 camera frames must agree, and none of them may show
 *     a mismatch. Doubt = no pick.
 *******************************************************************/
var PVEngine = (function () {
  'use strict';
  var VERSION = 10208, API = 1;        // 1.2.8 · the app and the Sheet load newer engines only with the same API

  var DEF = {
    MRP_TOL: 0.01,          // Rs difference allowed
    WEIGHT_TOL_PCT: 0,      // 0 = exact
    DEFAULT_UNIT: 'g',      // sheet weight without unit
    BATCH_FREE_MIN: 5,      // batch searched anywhere on label if this long
    REQUIRE_IDENTITY: true, // MRP + weight alone are never enough
    CAPTURE_BATCH: false,   // inward: sheet batch blank -> read & record batch from label
    WIN: 5,                 // frames looked at
    WIN_MULTI: 12,          // frames looked at when MRP / batch / weight are on different faces of the box
    NEED_FIT: 3,            // frames that must agree for GREEN
    NEED_BAD: 3,            // frames that must show mismatch for RED
    NEED_NOTINDOC: 2,       // frames with a barcode that is not in this document
    CODE_CHECK: true        // product code printed on the box, e.g. "(731774)" / "# 726771": a different code = wrong product
  };
  function opts(o) {
    var r = {}, k;
    for (k in DEF) r[k] = DEF[k];
    if (o) for (k in o) if (o[k] !== undefined && o[k] !== null) r[k] = o[k];
    return r;
  }

  function trim(s) { return String(s == null ? '' : s).trim(); }
  function res(s, exp, read, note) { return { s: s, exp: exp == null ? '' : String(exp), read: read == null ? '' : String(read), note: note || '' }; }
  function na() { return res('NA', '', '', ''); }
  function conf(s) { return s.replace(/[OQ]/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2'); }
  function flatNorm(s) { return conf(String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '')); }
  function isNABatch(s) { return /^(NA|N\/A|-+|NONE|NIL)$/i.test(trim(s)); }

  /* ---------------- context from one camera frame ---------------- */
  function buildCtx(codes, text) {
    var gs1 = {}, list = [];
    (codes || []).forEach(function (c) {
      var clean = String(c).replace(/^\][A-Za-z]\d/, '').trim();
      if (!clean || /^(https?:|www\.)/i.test(clean)) return;          // marketing QR
      list.push(clean);
      var g = parseGS1(clean);
      if (g) {
        if (g.gtin) list.push(g.gtin);
        if (g.batch && !gs1.batch) gs1.batch = g.batch;
        if (g.weight && !gs1.weight) gs1.weight = g.weight;
      }
    });
    var T = String(text || '').toUpperCase().replace(/\r/g, '');
    return {
      codes: list, normCodes: list.map(normCode).filter(Boolean), gs1: gs1, text: T,
      mrps: extractMRPs(T), weights: extractWeights(T, true), allWeights: extractWeights(T, false), packs: extractPacks(T),
      batches: extractBatches(T), spaced: spaced(T), flat: flatNorm(T), codeCands: extractCodes(T),
      combo: /\+|FREE/.test(T),
      // shipper carton printed once for many variants (tick box / "refer coding panel for brand name"): printed names prove nothing
      carton: /WHOLESALE\s*PACK|NOT\s*FOR\s*RETAIL\s*SALE|REFER\s*(?:TO\s*)?(?:THE\s*)?CODING|FOR\s*BRAND\s*NAME/.test(T)
    };
  }

  function readSummary(ctx) {
    var w = ctx.gs1.weight || ctx.weights[0] || ctx.allWeights[0];
    return {
      barcode: ctx.codes.slice(0, 3).join(' | ').replace(/\u001d/g, '·'),
      mrp: ctx.mrps.length ? ctx.mrps[0].primary.s : '',
      weight: w ? w.s : '',
      batch: ctx.gs1.batch || ctx.batches[0] || ''
    };
  }

  /* ---------------- barcode / GS1 ---------------- */
  function normCode(c) {
    var s = String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^\d+$/.test(s)) s = s.replace(/^0+/, '');
    return s;
  }
  function splitCodes(v) { return String(v == null ? '' : v).split(/[,;|\s\/]+/).map(trim).filter(Boolean); }
  function digits(s) { return String(s).replace(/\D/g, ''); }
  /* same code, or carton ITF-14/GTIN-14 that wraps the unit EAN-13 */
  function codeMatch(a, b) {
    if (normCode(a) && normCode(a) === normCode(b)) return true;
    var x = digits(a), y = digits(b);
    if (x.length !== String(a).replace(/\s/g, '').length || y.length !== String(b).replace(/\s/g, '').length) return false;
    if (x.length === 14 && y.length === 13) return x.slice(1, 13) === y.slice(0, 12);
    if (y.length === 14 && x.length === 13) return y.slice(1, 13) === x.slice(0, 12);
    return false;
  }

  /* real product barcode number: EAN-8 / EAN-13 / ITF-14 with a correct check digit */
  function isGTIN(s) {
    s = String(s == null ? '' : s).trim();
    if (!/^(\d{8}|\d{13}|\d{14})$/.test(s)) return false;
    var d = s.split('').map(Number), c = d.pop(), sum = 0;
    d.reverse().forEach(function (x, i) { sum += x * (i % 2 ? 1 : 3); });
    return (10 - sum % 10) % 10 === c;
  }
  /* A barcode can prove a WRONG product only when the sheet has a barcode number for this item and the box shows a
   * real product barcode. Transporter stickers, QR codes, courier numbers etc. are ignored. */
  function checkBarcode(l, ctx) {
    var exp = splitCodes(l.barcode);
    if (trim(l.sku)) exp.push(trim(l.sku));
    var E = trim(l.barcode) || trim(l.sku);
    if (!exp.length || !ctx.codes.length) return na();
    for (var i = 0; i < ctx.codes.length; i++)
      for (var j = 0; j < exp.length; j++)
        if (codeMatch(ctx.codes[i], exp[j])) return res('MATCH', E, ctx.codes[i]);
    if (!exp.some(isGTIN)) return na();
    var g = ctx.codes.filter(isGTIN);
    return g.length ? res('MISMATCH', E, g[0]) : na();
  }

  function parseGS1(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    var ais = {}, m;
    if (/^\(\d{2,4}\)/.test(s)) {
      var re = /\((\d{2,4})\)([^(]*)/g;
      while ((m = re.exec(s))) ais[m[1]] = m[2].replace(/\u001d/g, '').trim();
    } else {
      if (s.indexOf('\u001d') === -1 && !(/^(01|02)\d{14}/.test(s) && s.length >= 16)) return null;
      s = s.replace(/^\u001d+/, '');
      var FIXED = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
      var VAR2 = ['10', '21', '22', '30', '37', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99'];
      var i = 0, guard = 0;
      while (i < s.length && guard++ < 30) {
        if (s[i] === '\u001d') { i++; continue; }
        var two = s.substr(i, 2), four = s.substr(i, 4), ai, len;
        if (FIXED[two] !== undefined) { ai = two; len = FIXED[two]; }
        else if (/^3[1-6]\d\d$/.test(four)) { ai = four; len = 6; }
        else if (VAR2.indexOf(two) !== -1) { ai = two; len = -1; }
        else break;
        i += ai.length;
        var val;
        if (len > 0) { val = s.substr(i, len); i += len; }
        else {
          var end = s.indexOf('\u001d', i);
          val = end === -1 ? s.substr(i) : s.substring(i, end);
          i = end === -1 ? s.length : end + 1;
        }
        ais[ai] = val;
      }
    }
    var out = {};
    if (ais['01'] || ais['02']) out.gtin = ais['01'] || ais['02'];
    if (ais['10']) out.batch = ais['10'];
    Object.keys(ais).forEach(function (k) {
      var mm = /^3(10|15)(\d)$/.exec(k);
      if (mm && /^\d{6}$/.test(ais[k])) {
        var v = Number(ais[k]) / Math.pow(10, Number(mm[2]));
        out.weight = { v: v * 1000, d: mm[1] === '10' ? 'M' : 'V', s: v + (mm[1] === '10' ? ' KG' : ' L') };
      }
    });
    return Object.keys(out).length ? out : null;
  }

  /* ---------------- MRP ---------------- */
  function toNum(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    var m = String(x == null ? '' : x).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  function fmtMoney(v) { return '₹' + (Math.round(v) === v ? v : v.toFixed(2)); }

  /* "₹0.66/ml", "₹ 66.00 per 100 ml" = unit sale price, never the MRP */
  function unitPriceAfter(rest) { return /^\s*(?:\/|PER(?![A-Z]))\s*(?:\d|(?:ML|G|GM|GMS|GRAMS?|KGS?|L|LTRS?|LITRES?|LITERS?|CC)(?![A-Z]))/.test(rest); }
  function extractMRPs(T) {
    var out = [], m, n, pointer = false;
    var NUM = /\d[\d,]*(?:\.\d{1,2})?(?!\d)(?![.,]\d)(?!\s*(?:KGS?|KILOS?|GMS?|GRAMS?|G|MG|ML|LTRS?|LITRES?|L)(?![A-Z]))/g;
    var KW = /(?:^|[^A-Z])(M\s*[.,]?\s*R\s*[.,]?\s*P|MRF|NRP)/g;
    while ((m = KW.exec(T))) {
      var seg = T.substr(KW.lastIndex, 45);
      if (/(?:^|[^A-Z])(?:SEE|REFER|PRINTED|MENTIONED|BELOW|OVERLEAF)(?![A-Z])/.test(seg.split(/\d/)[0])) { pointer = true; continue; }  // "MRP ... see below"
      var cands = [];
      NUM.lastIndex = 0;
      while ((n = NUM.exec(seg))) {
        if (unitPriceAfter(seg.substr(NUM.lastIndex))) continue;
        var v = parseFloat(n[0].replace(/,/g, ''));
        if (v > 0) cands.push({ s: n[0], v: v, dec: /\.\d{2}$/.test(n[0]) });
      }
      if (cands.length) out.push({ primary: cands[0], cands: cands, lab: true });
    }
    if (!out.length) {                                  // no "MRP <value>": take ₹ / Rs prices (inkjet coding line)
      var RS = /(?:^|[^A-Z])(?:RS|INR|₹)\s*[.:\/-]?\s*(\d[\d,]*(?:\.\d{1,2})?)/g;
      while ((m = RS.exec(T))) {
        if (unitPriceAfter(T.substr(RS.lastIndex))) continue;
        var s = m[1];
        out.push({ primary: { s: s, v: parseFloat(s.replace(/,/g, '')), dec: /\.\d{2}$/.test(s) }, cands: [], lab: pointer });
      }
    }
    return out;
  }
  /* "₹249" sometimes reads "2249"/"7249": never treated as a match */
  function rupeeGlitch(s, exp) {
    var a = String(s).replace(/,/g, '').split('.')[0], b = String(Math.floor(exp));
    return a.length === b.length + 1 && a.slice(1) === b;
  }
  function checkMRP(l, ctx, o) {
    var exp = toNum(l.mrp);
    if (!exp) return na();
    var E = fmtMoney(exp);
    var eq = function (v) { return Math.abs(v - exp) <= o.MRP_TOL + 1e-9; };
    var occ = ctx.mrps;
    if (occ.length) {
      var hit = null, others = [];
      occ.forEach(function (o) {
        if (eq(o.primary.v) || o.cands.some(function (c) { return c.dec && eq(c.v); })) { hit = hit || o; }
        else if (!rupeeGlitch(o.primary.s, exp)) others.push(o);
      });
      if (hit && others.length) return res('UNCLEAR', E, hit.primary.s + ' / ' + others[0].primary.s, 'Do alag MRP dikh rahe — ek hi box frame me rakho');
      if (hit) return res('MATCH', E, eq(hit.primary.v) ? hit.primary.s : exp.toFixed(2));
      var p = occ[0].primary;
      if (rupeeGlitch(p.s, exp)) return res('UNCLEAR', E, p.s, 'MRP saaf nahi');
      // a bare ₹ price with no "MRP" word near it may be another price (single-unit price on a combo, offer price):
      // it can confirm the MRP but never prove a wrong MRP
      if (!occ.some(function (x) { return x.lab; })) return res('UNCLEAR', E, p.s, 'MRP likha hua hissa frame me lao');
      return res('MISMATCH', E, p.s);
    }
    var re = new RegExp('(?:^|[^\\d])' + exp.toFixed(2).replace('.', '\\.') + '(?!\\d)');
    if (re.test(ctx.text)) return res('MATCH', E, exp.toFixed(2));
    return res('UNCLEAR', E, '', 'MRP nahi dikha');
  }

  /* ---------------- weight / volume ---------------- */
  var UNIT_SRC = '(KILOGRAMS?|KILOS?|KGS?|GRAMS?|GMS?|GRM|GR|G|MG|LITRES?|LITERS?|LTRS?|LT|L|ML)';
  function unit(u) {
    u = String(u || '').toUpperCase();
    if (/^(KILOGRAMS?|KILOS?|KGS?)$/.test(u)) return { f: 1000, d: 'M' };
    if (/^(GRAMS?|GMS?|GRM|GR|G)$/.test(u)) return { f: 1, d: 'M' };
    if (u === 'MG') return { f: 0.001, d: 'M' };
    if (/^(LITRES?|LITERS?|LTRS?|LT|L)$/.test(u)) return { f: 1000, d: 'V' };
    if (u === 'ML') return { f: 1, d: 'V' };
    return null;
  }
  function fixNum(s) { return String(s).replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2'); }
  function parseQty(s, defUnit) {
    var t = fixNum(String(s == null ? '' : s).toUpperCase());
    var m = new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + UNIT_SRC + '?(?![A-Z])').exec(t);
    if (!m) return null;
    var u = unit(m[2] || defUnit);
    if (!u) return null;
    return { v: parseFloat(m[1]) * u.f, d: u.d, s: m[0].trim() };
  }
  function extractWeights(T, kwOnly) {
    var t = fixNum(T);
    var re = kwOnly
      ? new RegExp('(?:^|[^A-Z])(?:NET\\s*(?:WT|WEIGHT|WGT|QTY|QUANTITY|CONTENTS?|VOL(?:UME)?|MASS)|NETT\\s*WT|WEIGHT|WT|QTY)[^\\d]{0,25}?(\\d+(?:\\.\\d+)?)\\s*' + UNIT_SRC + '(?![A-Z])', 'g')
      : new RegExp('(?:^|[^A-Z0-9.])(\\d+(?:\\.\\d+)?)\\s*' + UNIT_SRC + '(?![A-Z])', 'g');
    var out = [], m;
    while ((m = re.exec(t))) {
      var u = unit(m[2]);
      if (u) out.push({ v: parseFloat(m[1]) * u.f, d: u.d, s: m[1] + ' ' + m[2] });
    }
    return out;
  }
  /* carton: "1 KG X 25", "25 X 1 KG", "(500 G X 40)" -> weight of one unit */
  function extractPacks(T) {
    var t = fixNum(T), out = [], m;
    var a = new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + UNIT_SRC + '\\s*[X×*]\\s*(\\d+)(?![\\d.])', 'g');
    var b = new RegExp('(?:^|[^\\d.])(\\d+)\\s*[X×*]\\s*(\\d+(?:\\.\\d+)?)\\s*' + UNIT_SRC + '(?![A-Z])', 'g');
    while ((m = a.exec(t))) { var u = unit(m[2]); if (u) out.push({ v: parseFloat(m[1]) * u.f, d: u.d, s: m[1] + ' ' + m[2], n: Number(m[3]) }); }
    while ((m = b.exec(t))) { var u2 = unit(m[3]); if (u2) out.push({ v: parseFloat(m[2]) * u2.f, d: u2.d, s: m[2] + ' ' + m[3], n: Number(m[1]) }); }
    return out;
  }
  function checkWeight(l, ctx, o) {
    var raw = trim(l.weight);
    if (!raw) return na();
    var e = parseQty(raw, o.DEFAULT_UNIT);
    if (!e || !e.v) return na();
    var eq = function (q) { return q.d === e.d && Math.abs(q.v - e.v) <= Math.max(1e-6, e.v * o.WEIGHT_TOL_PCT / 100); };
    var cs = Math.floor(Number(l.caseSize) || 0);
    var caseTotal = function (q) { return cs > 1 && q.d === e.d && Math.abs(q.v - e.v * cs) <= Math.max(1e-6, e.v * cs * o.WEIGHT_TOL_PCT / 100); };
    if (ctx.gs1.weight) return eq(ctx.gs1.weight) || caseTotal(ctx.gs1.weight) ? res('MATCH', raw, ctx.gs1.weight.s) : res('MISMATCH', raw, ctx.gs1.weight.s);
    if (ctx.packs.length) {                                    // carton print: per-unit weight decides
      var ph = ctx.packs.filter(eq)[0];
      var parts = [], seen = {};
      ctx.packs.forEach(function (p) { var k = p.d + p.v; if (!seen[k]) { seen[k] = 1; parts.push(p); } });
      if (parts.length > 1 && ctx.combo) {                     // "400 ml + FREE 90 ml": combo / promo pack
        var sum = { v: 0, d: parts[0].d };
        parts.forEach(function (p) { sum.v += p.d === sum.d ? p.v : NaN; });
        var both = parts.map(function (p) { return p.s; }).join(' + ');
        if (eq(sum)) return res('MATCH', raw, both + ' (combo)');
        if (ph && /FREE|\+|COMBO|OFFER|PROMO/i.test(String(l.name))) return res('MATCH', raw, both + ' (combo)');
        return res('MISMATCH', raw, both + ' (combo)');
      }
      if (ph) return res('MATCH', raw, ph.s + ' (carton)');
      var tot = ctx.packs.filter(function (p) { return cs > 1 && p.n === cs && eq({ v: p.v * p.n, d: p.d }); })[0];
      return tot ? res('MATCH', raw, tot.s + ' x ' + tot.n + ' (carton)') : res('MISMATCH', raw, ctx.packs[0].s);
    }
    if (ctx.weights.length) {
      var hit = ctx.weights.filter(eq)[0] || ctx.weights.filter(caseTotal)[0];
      return hit ? res('MATCH', raw, hit.s) : res('MISMATCH', raw, ctx.weights[0].s);
    }
    var any = ctx.allWeights.filter(eq)[0];
    return any ? res('MATCH', raw, any.s) : res('UNCLEAR', raw, '', 'Weight nahi dikha');
  }

  /* ---------------- batch ---------------- */
  function normBatch(s) { return flatNorm(s); }
  function spaced(T) { return ' ' + conf(String(T).toUpperCase().replace(/[^A-Z0-9]+/g, ' ')).trim() + ' '; }
  function extractBatches(T) {
    var re = /(?:^|[^A-Z])(?:BATCH|BTCH|LOT|B\s*[.,]\s*N\s*[O0]|B\s*N\s*[O0])\s*(?:N\s*[O0]|NUMBER|NUM|CODE)?\s*[.:#\-]*\s*([A-Z0-9][A-Z0-9\-\/]{2,19})/g;
    var out = [], m;
    while ((m = re.exec(T))) if (/\d/.test(m[1]) && out.indexOf(m[1]) === -1) out.push(m[1]);
    return out;
  }
  function checkBatch(l, ctx, o) {
    var E = trim(l.batch);
    if (isNABatch(E)) return na();
    var e = normBatch(E);
    if (!e) {
      if (!o.CAPTURE_BATCH) return na();
      var v = ctx.gs1.batch || ctx.batches[0] || '';
      return v ? res('CAPTURE', '', v) : res('UNCLEAR', '(record)', '', 'Batch nahi dikha');
    }
    if (ctx.gs1.batch) return normBatch(ctx.gs1.batch) === e ? res('MATCH', E, ctx.gs1.batch) : res('MISMATCH', E, ctx.gs1.batch);
    var ex = uniq(ctx.batches.map(normBatch));
    if (ex.indexOf(e) !== -1) {
      return ex.length > 1 ? res('UNCLEAR', E, ctx.batches.join(' / '), 'Do alag batch dikh rahe — ek hi box frame me rakho')
        : res('MATCH', E, ctx.batches.filter(function (b) { return normBatch(b) === e; })[0]);
    }
    if (ex.length) return res('MISMATCH', E, ctx.batches[0]);          // a batch was clearly read and it is different
    if (e.length >= o.BATCH_FREE_MIN && new RegExp(' ' + e.split('').join(' ?') + ' ').test(ctx.spaced)) return res('MATCH', E, E);
    if (e.length === 4 && /[A-Z]/i.test(E) && /\d/.test(E) && ctx.spaced.indexOf(' ' + e + ' ') !== -1) return res('MATCH', E, E);  // short batch "A112": whole word only
    return res('UNCLEAR', E, '', 'Batch nahi dikha');
  }

  /* ---------------- keyword / product name ---------------- */
  var STOP = {};
  ('PKT PCS PC NOS BOX CTN CARTON PACK PACKET PKG BAG JAR BTL BOTTLE POUCH TIN CAN GMS GM GRAM GRAMS KG KGS ' +
    'LTR LTRS LITRE LITER ML MRP NET NEW THE AND FOR WITH PER UNIT UNITS SET EACH EA CASE').split(' ')
    .forEach(function (w) { STOP[w] = 1; });
  function nameTokens(name) {
    return String(name == null ? '' : name).toUpperCase().split(/[^A-Z0-9]+/).filter(function (t) {
      return t.length >= 3 && /[A-Z]/.test(t) && !/\d/.test(t) && !STOP[t];
    });
  }
  /* one word: found anywhere ("Elaichi"). Several words: found TOGETHER as a phrase ("NSA ALOE", "PAJ VE IN"), so a carton printed
   * for many variants ("brand name: PAJ VE / PAJ G / NSBA") does not match - only its own coding line does. */
  function checkKeyword(l, ctx) {
    var kw = trim(l.keyword);
    if (!kw) return na();
    var all = kw.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    var toks = all.length > 1 ? all : all.filter(function (t) { return t.length >= 2; });
    if (!toks.length) return na();
    var miss = toks.filter(function (t) { return ctx.flat.indexOf(flatNorm(t)) === -1; });
    if (miss.length) return res('UNCLEAR', kw, toks.filter(function (t) { return miss.indexOf(t) === -1; }).join(' '), 'Keyword nahi dikha: ' + miss.join(' '));
    if (toks.length > 1 && !new RegExp(' ' + toks.map(function (t) { return conf(t); }).join(' ?') + ' ').test(ctx.spaced))
      return res('UNCLEAR', kw, '', 'Keyword ke shabd saath me nahi mile (coding line dikhao)');
    return res('MATCH', kw, kw);
  }
  /* numbers printed as a product code: "(731774)", "# 726771", "ITEM CODE: 100234", "MATERIAL NO 731774" */
  function extractCodes(T) {
    var out = [], m;
    var re1 = /\(\s*(\d[\d ]{3,14}\d)\s*\)/g;
    var re2 = /(#|(?:^|[^A-Z])(?:ITEM|MATERIAL|MAT|ARTICLE|ART|PRODUCT|PROD|SKU|SAP|FG)\s*(?:CODE|NO|NUMBER|NUM)?)\s*[.:#\-]*\s*(\d[\d ]{3,14}\d)(?!\d)/g;
    while ((m = re1.exec(T))) out.push(m[1].replace(/ /g, ''));
    while ((m = re2.exec(T))) {
      if (m[1] === '#' && /(?:BATCH|BTCH|LOT|B\s*[.,]?\s*N\s*[O0]\.?)\s*$/.test(T.substr(Math.max(0, m.index - 12), 12))) continue;
      out.push(m[2].replace(/ /g, '').replace(/^0+/, ''));
    }
    return uniq(out.map(function (x) { return x.replace(/^0+/, ''); }));
  }
  var LOOKALIKE = ['17', '38', '56', '68', '08', '89', '06', '09', '25'];
  function lookAlike(a, b) {                       // differs only in one digit that dot print / camera often confuse
    if (a.length !== b.length) return false;
    var diff = [];
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push([a[i], b[i]].sort().join(''));
    return diff.length === 1 && LOOKALIKE.indexOf(diff[0]) !== -1;
  }
  /* SAP Material / product code printed as TEXT on the box (not only in a barcode). Needs 5+ chars with 4+ digits,
   * found as a separate word, so it never matches inside a longer number (EAN, FSSAI, batch).
   * Found -> proof of identity. A different code in a code place ("(731780)" on a 731774 line) -> wrong product. */
  function checkCode(l, ctx, o) {
    var raw = trim(l.sku), e = flatNorm(raw);
    var num = /^\d+$/.test(e);
    if (num) e = e.replace(/^0+/, '');
    if (e.length < 5 || (e.match(/\d/g) || []).length < 4) return na();
    if (new RegExp(' ' + (num ? '(?:0 ?)*' : '') + e.split('').join(' ?') + ' ').test(ctx.spaced)) return res('MATCH', raw, raw);
    if (!o.CODE_CHECK || !num) return na();
    var c = (ctx.codeCands || []).filter(function (x) { return x.length === e.length; });
    if (!c.length) return na();
    var near = c.filter(function (x) { return lookAlike(x, e); });
    return near.length ? res('UNCLEAR', raw, near[0], 'Product code saaf nahi padha') : res('MISMATCH', raw, c[0]);
  }
  function checkName(l, ctx) {
    var toks = nameTokens(l.name);
    if (!toks.length) return na();
    if (ctx.carton) return res('NA', toks.join(' '), '', 'Wholesale carton: naam se pehchan nahi — code / batch / keyword chahiye');
    var found = toks.filter(function (t) { return ctx.flat.indexOf(flatNorm(t)) !== -1; });
    return found.length === toks.length ? res('MATCH', toks.join(' '), found.join(' ')) : res('UNCLEAR', toks.join(' '), found.join(' '));
  }

  /* ---------------- per line ---------------- */
  var REQ = ['barcode', 'keyword', 'mrp', 'weight', 'batch'];
  /* ItemMaster "Box pe nahi": fields that are simply not printed on this box (e.g. MRP on a shipper carton) */
  function skipSet(v) {
    var o = {};
    String(v == null ? '' : v).toUpperCase().split(/[^A-Z]+/).forEach(function (w) {
      if (w === 'MRP' || w === 'PRICE') o.mrp = 1;
      else if (/^(WEIGHT|WT|WGT|NETWT|QTY)$/.test(w)) o.weight = 1;
      else if (/^(BATCH|LOT)$/.test(w)) o.batch = 1;
    });
    return o;
  }
  function evaluate(l, ctx, o) {
    o = opts(o);
    var sk = skipSet(l.skip);
    return {
      barcode: checkBarcode(l, ctx),
      keyword: checkKeyword(l, ctx),
      name: checkName(l, ctx),
      code: checkCode(l, ctx, o),
      mrp: sk.mrp ? res('NA', '', '', 'box pe nahi') : checkMRP(l, ctx, o),
      weight: sk.weight ? res('NA', '', '', 'box pe nahi') : checkWeight(l, ctx, o),
      batch: sk.batch ? res('NA', '', '', 'box pe nahi') : checkBatch(l, ctx, o)
    };
  }
  function hasIdentity(c) { return c.barcode.s === 'MATCH' || c.batch.s === 'MATCH' || c.keyword.s === 'MATCH' || c.name.s === 'MATCH' || (c.code && c.code.s === 'MATCH'); }
  function hasMismatch(c) { return REQ.some(function (k) { return c[k].s === 'MISMATCH'; }) || (!!c.code && c.code.s === 'MISMATCH'); }
  function codeDoubt(c) { return !!c.code && c.code.s === 'UNCLEAR'; }
  function reqOk(c) { return !codeDoubt(c) && REQ.every(function (k) { var s = c[k].s; return s === 'MATCH' || s === 'NA' || s === 'CAPTURE'; }); }
  function isFit(c, o) {
    o = opts(o);
    if (!reqOk(c)) return false;
    if (o.REQUIRE_IDENTITY && !hasIdentity(c)) return false;
    return REQ.some(function (k) { return c[k].s === 'MATCH'; });
  }
  /* can this sheet line ever be proven? (has batch / barcode / keyword / name words) */
  function lineHasIdentity(l) {
    return (trim(l.batch) && !isNABatch(l.batch)) || splitCodes(l.barcode).length || (flatNorm(l.sku).match(/\d/g) || []).length >= 4 ||
      trim(l.keyword) || nameTokens(l.name).length;
  }
  function prodKey(l) { return normCode(l.sku) || normCode(l.barcode) || flatNorm(l.name) || ('ROW' + l.row); }
  function remaining(l) { return (Number(l.qty) || 0) - (Number(l.done) || 0); }
  function score(c) {
    var s = 0;
    REQ.concat(['name', 'code']).forEach(function (k) {
      if (c[k] && c[k].s === 'MATCH') s += (k === 'barcode' || k === 'batch' || k === 'keyword' || k === 'code') ? 6 : k === 'name' ? 4 : 3;
      else if (!c[k]) return;
      else if (c[k].s === 'MISMATCH') s -= 2;
    });
    return s;
  }

  /* ---------------- one camera frame vs all lines of the document ---------------- */
  function evalFrame(frame, lines, target, o) {
    o = opts(o);
    var ctx = buildCtx(frame && frame.c, frame && frame.t);
    var ev = { empty: !ctx.codes.length && ctx.flat.length < 4, chk: {}, fit: [], chosen: 0, full: false, ambiguous: false,
      bad: false, notInDoc: false, best: 0, cap: {}, capRaw: {}, read: readSummary(ctx) };
    if (ev.empty || !lines.length) return ev;
    var byRow = {};
    lines.forEach(function (l) {
      byRow[l.row] = l;
      var c = evaluate(l, ctx, o);
      ev.chk[l.row] = c;
      if (isFit(c, o)) ev.fit.push(l.row);
      if (c.batch.s === 'CAPTURE') { ev.cap[l.row] = normBatch(c.batch.read); ev.capRaw[l.row] = c.batch.read; }
    });
    var fitLines = ev.fit.map(function (r) { return byRow[r]; });
    var keys = uniq(fitLines.map(prodKey));
    if (keys.length > 1) {                       // two different products fit -> need name/keyword/barcode to decide
      var strong = fitLines.filter(function (l) { return strongId(ev.chk[l.row]); });
      if (uniq(strong.map(prodKey)).length === 1) fitLines = strong;
      else { ev.ambiguous = true; fitLines = []; }
    }
    if (target) {
      var tl = byRow[target];
      var others = fitLines.filter(function (l) { return l.row !== target && (!tl || prodKey(l) !== prodKey(tl)); });
      fitLines = fitLines.filter(function (l) { return l.row === target; });
      if (!fitLines.length && others.length) ev.other = others[0].row;   // box is clearly a different item of this doc
    }
    var open = fitLines.filter(function (l) { return remaining(l) > 0; });
    if (open.length) ev.chosen = open[0].row;
    else if (fitLines.length) { ev.chosen = fitLines[0].row; ev.full = true; }

    var pool = target ? lines.filter(function (l) { return l.row === target; }) : lines;
    var bs = -1e9;
    pool.forEach(function (l) { var s = score(ev.chk[l.row]) + (remaining(l) > 0 ? 1 : 0); if (s > bs) { bs = s; ev.best = l.row; } });
    var bc = ev.chk[ev.best];
    ev.bad = !ev.chosen && !ev.ambiguous && ((!!bc && hasMismatch(bc)) || !!ev.other);
    if (!target && !ev.chosen && ctx.codes.length) {
      ev.notInDoc = lines.every(function (l) { return splitCodes(l.barcode).length > 0 && ev.chk[l.row].barcode.s === 'MISMATCH'; });
    }
    return ev;
  }
  function uniq(a) { var o = [], i; for (i = 0; i < a.length; i++) if (o.indexOf(a[i]) === -1) o.push(a[i]); return o; }

  /* ---------------- decision over recent frames ---------------- */
  function decide(evs, lines, target, o) {
    o = opts(o);
    var recent = (evs || []).filter(function (e) { return !e.empty; }).slice(-o.WIN);
    if (!recent.length) return { state: 'IDLE' };
    var last = recent[recent.length - 1];
    var byRow = {}; lines.forEach(function (l) { byRow[l.row] = l; });
    var cnt = {};
    recent.forEach(function (e) { if (e.chosen) cnt[e.chosen] = (cnt[e.chosen] || 0) + 1; });
    var rows = Object.keys(cnt).map(Number).sort(function (a, b) { return cnt[b] - cnt[a]; });
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], line = byRow[row];
      if (cnt[row] < o.NEED_FIT || !line) continue;
      if (recent.some(function (e) { return e.chk[row] && hasMismatch(e.chk[row]); })) continue;
      var fitEvs = recent.filter(function (e) { return e.chosen === row; });
      var cap = '';
      if (fitEvs.some(function (e) { return e.cap[row] !== undefined; })) {
        var tally = {}, rawOf = {}, top = '', topN = 0;
        fitEvs.forEach(function (e) { var v = e.cap[row]; if (v) { tally[v] = (tally[v] || 0) + 1; rawOf[v] = e.capRaw[row]; } });
        Object.keys(tally).forEach(function (v) { if (tally[v] > topN) { topN = tally[v]; top = v; } });
        if (topN < o.NEED_FIT) continue;
        if (Object.keys(tally).length > 1) continue;        // two different batch readings -> doubt
        cap = rawOf[top];
      }
      var fe = fitEvs[fitEvs.length - 1];
      return { state: 'GREEN', row: row, full: remaining(line) <= 0, checks: fe.chk[row], captured: cap, read: fe.read, progress: cnt[row], need: o.NEED_FIT };
    }
    var mg = mergeFaces(evs, lines, target, o);
    if (mg) return mg;
    var anyFit = recent.some(function (e) { return e.chosen; });
    var nid = recent.filter(function (e) { return e.notInDoc; }).length;
    if (!anyFit && nid >= o.NEED_NOTINDOC) return { state: 'RED', kind: 'NOTINDOC', read: last.read };
    var bad = recent.filter(function (e) { return e.bad; });
    if (!anyFit && bad.length >= o.NEED_BAD) {
      var b = bad[bad.length - 1];
      if (b.other) return { state: 'RED', kind: 'OTHER', row: b.best, other: b.other, checks: b.chk[b.best], read: b.read };
      return { state: 'RED', kind: 'MISMATCH', row: b.best, checks: b.chk[b.best], read: b.read };
    }
    var kind = 'READING', bc = last.best ? last.chk[last.best] : null, missing = [];
    if (recent.filter(function (e) { return e.ambiguous; }).length >= 2) kind = 'AMBIGUOUS';
    else if (bc && !hasIdentity(bc) && !hasMismatch(bc) && (reqOk(bc) || REQ.some(function (k) { return bc[k].s === 'MATCH'; }))) kind = 'NOID';
    else if (last.chosen && cnt[last.chosen]) kind = 'CONFIRMING';
    else if (bc && hasIdentity(bc) && !hasMismatch(bc)) {         // right product, some detail is on another face
      var LB = { mrp: 'MRP', weight: 'Weight', batch: 'Batch', keyword: 'Keyword', barcode: 'Barcode' };
      missing = REQ.filter(function (k) { var st = bc[k].s; return st !== 'MATCH' && st !== 'NA' && st !== 'CAPTURE'; }).map(function (k) { return LB[k]; });
      if (missing.length) kind = 'TURN';
    }
    return { state: 'AMBER', kind: kind, row: last.chosen || last.best, checks: last.chosen ? last.chk[last.chosen] : bc,
      read: last.read, progress: last.chosen ? (cnt[last.chosen] || 0) : 0, need: o.NEED_FIT, missing: missing };
  }

  /* Box details on different faces (front: name + weight, side: MRP + batch).
   * Faces are joined only when EVERY joined frame itself proves this product (batch / barcode / keyword / name),
   * the box in hand right now proves it too, no frame shows a mismatch, and no other product appears in between. */
  function strongId(c) { return c.barcode.s === 'MATCH' || c.keyword.s === 'MATCH' || c.name.s === 'MATCH' || (c.code && c.code.s === 'MATCH'); }
  /* this frame proves THIS product only (a batch shared by two products is not proof) */
  function cleanFor(e, row, pk, lines) {
    var c = e.chk[row];
    if (!c || !hasIdentity(c) || hasMismatch(c) || codeDoubt(c) || e.other || e.ambiguous) return false;
    var others = lines.filter(function (x) { return prodKey(x) !== pk && e.chk[x.row] && hasIdentity(e.chk[x.row]); });
    if (!others.length) return true;
    return strongId(c) && !others.some(function (x) { return strongId(e.chk[x.row]); });
  }
  function mergeFaces(evs, lines, target, o) {
    var win = (evs || []).filter(function (e) { return !e.empty; }).slice(-o.WIN_MULTI);
    if (win.length < o.NEED_FIT || win.some(function (e) { return e.ambiguous || e.other; })) return null;
    var last = win[win.length - 1];
    var pool = target ? lines.filter(function (l) { return l.row === target; }) : lines;
    for (var i = 0; i < pool.length; i++) {
      var l = pool[i], row = l.row, pk = prodKey(l);
      if (!cleanFor(last, row, pk, lines)) continue;                              // box in hand right now = this product
      var lbs = last.chk[row].batch.s;
      if (lbs !== 'NA' && lbs !== 'MATCH' && lbs !== 'CAPTURE') continue;         // ...and its batch is on screen right now
      if (win.some(function (e) { return e.chk[row] && hasMismatch(e.chk[row]); })) continue;
      var foreign = win.some(function (e) {
        if (cleanFor(e, row, pk, lines)) return false;
        return lines.some(function (x) { return prodKey(x) !== pk && e.chk[x.row] && hasIdentity(e.chk[x.row]); }) || !!e.notInDoc;
      });
      if (foreign) continue;
      var idf = win.filter(function (e) { return cleanFor(e, row, pk, lines); });
      if (idf.length < o.NEED_FIT || idf.length < win.length - 1) continue;     // at most one unreadable frame in between
      var merged = {}, ok = true, cap = {}, capRaw = {};
      REQ.concat(['name', 'code']).forEach(function (k) {
        var m = idf.filter(function (e) { var st = e.chk[row][k].s; return st === 'MATCH' || st === 'CAPTURE'; });
        var allNA = idf.every(function (e) { return e.chk[row][k].s === 'NA'; });
        merged[k] = m.length ? m[m.length - 1].chk[row][k] : idf[idf.length - 1].chk[row][k];
        if (k !== 'name' && k !== 'code' && !allNA && m.length < 2) ok = false;
        m.forEach(function (e) { if (e.cap[row]) { cap[e.cap[row]] = (cap[e.cap[row]] || 0) + 1; capRaw[e.cap[row]] = e.capRaw[row]; } });
      });
      if (!ok) continue;
      var capKeys = Object.keys(cap);
      if (capKeys.length > 1 || (capKeys.length && cap[capKeys[0]] < 2)) continue;
      var lineL = lines.filter(function (x) { return x.row === row; })[0];
      return { state: 'GREEN', row: row, full: remaining(lineL) <= 0, checks: merged, captured: capKeys.length ? capRaw[capKeys[0]] : '',
        read: last.read, progress: idf.length, need: o.NEED_FIT, faces: true };
    }
    return null;
  }

  /* convenience: raw frames -> decision (used by server re-check and manual entry) */
  function judge(frames, lines, target, o) {
    var evs = (frames || []).map(function (f) { return evalFrame(f, lines, target, o); });
    return decide(evs, lines, target, o);
  }

  function reasons(chk) {
    var L = { barcode: 'Barcode', keyword: 'Keyword', mrp: 'MRP', weight: 'Weight', batch: 'Batch', code: 'Code' };
    if (!chk) return '';
    return REQ.concat(['code']).filter(function (k) { return chk[k] && chk[k].s === 'MISMATCH'; })
      .map(function (k) { return L[k] + ': slip ' + chk[k].exp + ' / box ' + (chk[k].read || '?'); }).join('; ');
  }

  return {
    VERSION: VERSION, API: API, DEF: DEF, opts: opts, buildCtx: buildCtx, evaluate: evaluate, isFit: isFit, evalFrame: evalFrame, decide: decide,
    judge: judge, reasons: reasons, lineHasIdentity: lineHasIdentity, remaining: remaining, parseGS1: parseGS1,
    codeMatch: codeMatch, extractBatches: extractBatches, toNum: toNum, normBatch: normBatch, isNABatch: isNABatch, isGTIN: isGTIN
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PVEngine;
