// Génère le rapport PBIR « Insécurité alimentaire au Sahel central » (Cadre Harmonisé).
// Direction hybride : titres-phrases et page Burkina de la direction « Lignes de faim » (éditoriale),
// carte, piliers et fiche zone de la direction « Bulletin de terrain » (humanitaire).
// Usage : node generer_rapport.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = path.resolve(__dirname, '..');
const NOM = 'Prix Sahel Terre';
const PBIP = path.join(BASE, 'pbip_terre');
const REPORT = path.join(PBIP, `${NOM}.Report`);
const DEF = path.join(REPORT, 'definition');
const VISUAL_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json';
const PAGE_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json';
const W = 1280, H = 720, M = 24;

// ---------- Palette : papier, encre, un accent ; l'échelle CH réservée aux phases ----------
const C = {
  page: '#F7F2E8', card: '#FFFFFF', ink: '#2B2118', muted: '#6E6254', rule: '#E3D8C4', np: '#EFE8DA',
  accent: '#6B4416', accentSoft: '#F1E4C8',
};
const TERRE = ['#6B4416', '#D4A12A', '#C8571F', '#1F6670'];
const TERRE_TEXTE = ['#FFFFFF', '#2B2118', '#FFFFFF', '#FFFFFF'];
const BRUN = '#4A2E10', OR = '#D9A21B';
const PHASES = [['1 Minimale', '#CDFACD'], ['2 Sous pression', '#FAE61E'], ['3 Crise', '#E67800'], ['4 Urgence', '#C80000'], ['5 Famine', '#640000']];
const SERIF = 'Segoe UI Semibold', SANS = 'Segoe UI', LIGHT = 'Segoe UI Light', NUM = 'DIN';
const SOURCE = 'Source : PAM, WFP Food Prices (Burkina Faso, Mali, Niger, Tchad), via HDX, licence CC BY-IGO. Prix de détail au kilo en francs CFA (XOF et XAF à parité). Moyenne simple des marchés suivis.';

// ---------- Encodage PBIR ----------
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const str = (s) => lit(`'${String(s).replace(/'/g, "''")}'`);
const num = (n) => lit(`${n}D`);
const int = (n) => lit(`${n}L`);
const bool = (b) => lit(b ? 'true' : 'false');
const color = (hex) => ({ solid: { color: str(hex) } });
const measure = (t, m) => ({ Measure: { Expression: { SourceRef: { Entity: t } }, Property: m } });
const column = (t, c) => ({ Column: { Expression: { SourceRef: { Entity: t } }, Property: c } });
const colorFromMeasure = (m) => ({ solid: { color: { expr: measure('Prix', m) } } });
const proj = (field, t, p) => ({ field, queryRef: `${t}.${p}`, nativeQueryRef: p });
const pm = (m) => proj(measure('Prix', m), 'Prix', m);
const pc = (t, c) => proj(column(t, c), t, c);
const hexId = (seed, n = 20) => crypto.createHash('sha1').update('sahel:' + seed).digest('hex').slice(0, n);
const A = 'Prix';

// ---------- Filtres ----------
const srcCol = (t, c) => ({ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: c } });
const srcMeasure = (m) => ({ Measure: { Expression: { SourceRef: { Source: 'f' } }, Property: m } });
function inFilter(seed, t, c, values, { not = false, how = 'User' } = {}) {
  const cond = { In: { Expressions: [srcCol(t, c)], Values: values.map((v) => [{ Literal: { Value: typeof v === 'number' ? `${v}L` : `'${v}'` } }]) } };
  return {
    name: 'Filter' + hexId('f' + seed, 20), field: column(t, c), type: 'Categorical',
    filter: { Version: 2, From: [{ Name: 'f', Entity: t, Type: 0 }], Where: [{ Condition: not ? { Not: { Expression: cond } } : cond }] },
    howCreated: how,
  };
}
function measureFilter(seed, m, kind, value) {
  return {
    name: 'Filter' + hexId('m' + seed, 20), field: measure(A, m), type: 'Advanced',
    filter: { Version: 2, From: [{ Name: 'f', Entity: A, Type: 0 }], Where: [{ Condition: { Comparison: {
      ComparisonKind: kind, Left: srcMeasure(m), Right: { Literal: { Value: `${value}L` } },
    } } }] },
    howCreated: 'User',
  };
}
function betweenFilter(seed, t, c, lo, hi) {
  const cmp = (k, v) => ({ Comparison: { ComparisonKind: k, Left: srcCol(t, c), Right: { Literal: { Value: `${v}L` } } } });
  return {
    name: 'Filter' + hexId('b' + seed, 20), field: column(t, c), type: 'Advanced',
    filter: { Version: 2, From: [{ Name: 'f', Entity: t, Type: 0 }], Where: [{ Condition: { And: { Left: cmp(2, lo), Right: cmp(4, hi) } } }] },
    howCreated: 'User',
  };
}

// ---------- Habillage ----------
const noFrame = () => ({
  background: [{ properties: { show: bool(false) } }],
  border: [{ properties: { show: bool(false) } }],
  title: [{ properties: { show: bool(false) } }],
  padding: [{ properties: { top: num(0), bottom: num(0), left: num(0), right: num(0) } }],
  visualHeader: [{ properties: { show: bool(false) } }],
  dropShadow: [{ properties: { show: bool(false) } }],
});
function frame({ title, subtitle, subtitleMeasure, alt, card = true }) {
  const v = {
    padding: [{ properties: { top: num(10), bottom: num(10), left: num(12), right: num(12) } }],
    background: [{ properties: { show: bool(card), color: color(C.card), transparency: num(0) } }],
    border: [{ properties: { show: bool(card), color: color(C.rule), radius: num(4), width: num(1) } }],
    dropShadow: [{ properties: { show: bool(false) } }],
    visualHeader: [{ properties: { show: bool(false) } }],
    title: title
      ? [{ properties: { show: bool(true), text: str(title), fontFamily: str('Segoe UI Semibold'), fontSize: num(11), fontColor: color(C.ink), bold: bool(false) } }]
      : [{ properties: { show: bool(false) } }],
  };
  if (subtitle || subtitleMeasure) {
    v.subTitle = [{ properties: {
      show: bool(true), text: subtitleMeasure ? { expr: measure(A, subtitleMeasure) } : str(subtitle),
      fontFamily: str(SANS), fontSize: num(9), fontColor: color(C.muted),
    } }];
  }
  if (alt) v.general = [{ properties: { altText: str(alt) } }];
  return v;
}

function write(page, id, pos, z, visual, filters) {
  const v = { $schema: VISUAL_SCHEMA, name: id, position: { ...pos, z, tabOrder: z }, visual };
  if (filters && filters.length) v.filterConfig = { filters };
  const dir = path.join(DEF, 'pages', page, 'visuals', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'visual.json'), JSON.stringify(v, null, 2));
  return id;
}

// ---------- Fabriques ----------
function textbox(page, seed, pos, z, runs, align = 'left') {
  return write(page, hexId(page + seed), pos, z, {
    visualType: 'textbox',
    objects: { general: [{ properties: { paragraphs: runs.map((r) => ({
      textRuns: [{ value: r.text, textStyle: {
        fontFamily: r.font || SANS, fontSize: `${r.size}pt`, color: r.color || C.ink,
        ...(r.bold ? { fontWeight: 'bold' } : {}), ...(r.italic ? { fontStyle: 'italic' } : {}),
      } }],
      horizontalTextAlignment: r.align || align,
    })) } }] },
    visualContainerObjects: noFrame(),
  });
}

function rect(page, seed, pos, z, fill, line) {
  return write(page, hexId(page + seed), pos, z, {
    visualType: 'shape',
    objects: {
      shape: [{ properties: { tileShape: str('rectangle') }, selector: { id: 'default' } }],
      fill: [{ properties: { show: bool(true), fillColor: color(fill), transparency: num(0) }, selector: { id: 'default' } }],
      outline: [{ properties: { show: bool(!!line), ...(line ? { lineColor: color(line), weight: num(1) } : {}) }, selector: { id: 'default' } }],
    },
    visualContainerObjects: noFrame(),
  });
}

// Carte d'un chiffre : valeur DIN, libellé discret, contexte en sous-titre
function card(page, seed, pos, z, { value, label, title, context, units, fill, valueColor, alt, filters, valueFont = NUM, size = 26 }) {
  return write(page, hexId(page + seed), pos, z, {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [pm(value)] } } },
    objects: {
      value: [{ properties: {
        fontSize: num(size), fontFamily: str(valueFont), fontColor: valueColor ? colorFromMeasure(valueColor) : color(C.ink),
        ...(units ? { labelDisplayUnits: num(units), labelPrecision: int(units === 1000000 ? 1 : 0) } : {}), horizontalAlignment: str('left'),
      }, selector: { id: 'default' } }],
      fillCustom: [{ properties: { show: bool(true), fillColor: fill ? colorFromMeasure(fill) : color(C.card), transparency: num(0) }, selector: { id: 'default' } }],
      label: [{ properties: { show: bool(!!label), ...(label ? { text: str(label) } : {}), fontSize: num(9), fontColor: color(C.muted), position: str('belowValue') }, selector: { id: 'default' } }],
      outline: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      accentBar: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      padding: [{ properties: { paddingUniform: num(4) }, selector: { id: 'default' } }],
      layout: [{ properties: { paddingUniform: num(0) }, selector: { id: 'default' } }],
    },
    visualContainerObjects: frame({ title, subtitleMeasure: context, alt }),
  }, filters);
}

// Titre-phrase dynamique (mesure texte) en Georgia, sans cadre
function titleMeasure(page, seed, pos, z, m, size = 19) {
  return write(page, hexId(page + seed), pos, z, {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [pm(m)] } } },
    objects: {
      value: [{ properties: { fontSize: num(size), fontFamily: str(SERIF), fontColor: color(C.ink), horizontalAlignment: str('left'), textWrap: bool(true) }, selector: { id: 'default' } }],
      label: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      outline: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      fillCustom: [{ properties: { show: bool(true), fillColor: color(C.page), transparency: num(0) }, selector: { id: 'default' } }],
      padding: [{ properties: { paddingUniform: num(0) }, selector: { id: 'default' } }],
      layout: [{ properties: { paddingUniform: num(0) }, selector: { id: 'default' } }],
    },
    visualContainerObjects: noFrame(),
  });
}

// En-tête commun : surtitre, titre (fixe ou mesure), chapô, navigation
function header(page, { kicker, title, titleM, lede }) {
  textbox(page, 'kicker', { x: M, y: 14, width: 860, height: 18 }, 1000, [{ text: kicker, size: 8, color: C.muted, font: 'Segoe UI Semibold' }]);
  if (titleM) titleMeasure(page, 'titre', { x: M - 14, y: 30, width: 874, height: 36 }, 1001, titleM, 17);
  else textbox(page, 'titre', { x: M, y: 30, width: 860, height: 36 }, 1001, [{ text: title, size: 17, font: SERIF }]);
  if (lede) textbox(page, 'chapo', { x: M, y: 68, width: 860, height: 22 }, 1002, [{ text: lede, size: 9, font: LIGHT }]);
  navigator(page, { x: 900, y: 12, width: 356, height: 26 }, 1003);
  textbox(page, 'source', { x: M, y: 692, width: W - 2 * M, height: 18 }, 1004, [{ text: SOURCE, size: 7, color: C.muted }]);
}

function navigator(page, pos, z) {
  return write(page, hexId(page + 'nav'), pos, z, {
    visualType: 'pageNavigator',
    objects: {
      fill: [
        { properties: { show: bool(true), fillColor: color(C.page), transparency: num(0) }, selector: { id: 'default' } },
        { properties: { fillColor: color(C.accent) }, selector: { id: 'selected' } },
      ],
      text: [
        { properties: { fontFamily: str(SANS), fontSize: num(9), fontColor: color(C.muted) }, selector: { id: 'default' } },
        { properties: { fontColor: color('#FFFFFF') }, selector: { id: 'selected' } },
      ],
      outline: [{ properties: { show: bool(true), lineColor: color(C.rule), weight: num(1) }, selector: { id: 'default' } }],
      pages: [{ properties: { showHiddenPages: bool(false), showTooltipPages: bool(false) } }],
    },
    visualContainerObjects: noFrame(),
  });
}

// Liste déroulante à choix unique, présélectionnée, synchronisée entre pages
function dropdown(page, seed, pos, z, { field, header: head, value, sync }) {
  const [t, c] = field;
  const v = {
    visualType: 'slicer',
    query: { queryState: { Values: { projections: [pc(t, c)] } } },
    objects: {
      data: [{ properties: { mode: str('Dropdown') } }],
      general: [{ properties: { filter: { filter: {
        Version: 2, From: [{ Name: 'f', Entity: t, Type: 0 }],
        Where: [{ Condition: { In: { Expressions: [srcCol(t, c)], Values: [[{ Literal: { Value: `'${value}'` } }]] } } }],
      } } } }],
      selection: [{ properties: { singleSelect: bool(true), strictSingleSelect: bool(true), selectAllCheckboxEnabled: bool(false) } }],
      header: [{ properties: { show: bool(false), text: str(head), fontFamily: str(SANS), textSize: num(8), fontColor: color(C.muted) } }],
      items: [{ properties: { fontFamily: str(SANS), textSize: num(10), fontColor: color(C.ink), background: color(C.card) } }],
    },
    visualContainerObjects: {
      ...noFrame(),
      padding: [{ properties: { top: num(4), bottom: num(4), left: num(8), right: num(8) } }],
      background: [{ properties: { show: bool(true), color: color(C.card), transparency: num(0) } }],
      border: [{ properties: { show: bool(true), color: color(C.rule), radius: num(4), width: num(1) } }],
    },
  };
  if (sync) v.syncGroup = { groupName: sync, fieldChanges: true, filterChanges: true };
  return write(page, hexId(page + seed), pos, z, v);
}

// Tuiles « Courante / Projetée »
function tiles(page, seed, pos, z, { sync }) {
  const v = {
    visualType: 'advancedSlicerVisual',
    query: { queryState: { Values: { projections: [pc('Situation', 'Situation')] } } },
    objects: {
      general: [{ properties: { filter: { filter: {
        Version: 2, From: [{ Name: 'f', Entity: 'Situation', Type: 0 }],
        Where: [{ Condition: { In: { Expressions: [srcCol('Situation', 'Situation')], Values: [[{ Literal: { Value: "'Courante'" } }]] } } }],
      } } } }],
      selection: [{ properties: { singleSelect: bool(true), strictSingleSelect: bool(true), selectAllCheckboxEnabled: bool(false) } }],
      layout: [{ properties: { rowCount: int(1), columnCount: int(2), cellPadding: int(4) } }],
      value: [{ properties: { fontFamily: str(SANS), fontSize: num(10), fontColor: color(C.ink) } }],
      label: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      fillCustom: [
        { properties: { show: bool(true), fillColor: color(C.card), transparency: num(0) }, selector: { id: 'default' } },
        { properties: { fillColor: color(C.accentSoft) }, selector: { id: 'selected' } },
      ],
      outline: [
        { properties: { show: bool(true), lineColor: color(C.rule), weight: num(1) }, selector: { id: 'default' } },
        { properties: { show: bool(true), lineColor: color(C.accent), weight: num(2) }, selector: { id: 'selected' } },
      ],
    },
    visualContainerObjects: noFrame(),
  };
  if (sync) v.syncGroup = { groupName: sync, fieldChanges: true, filterChanges: true };
  return write(page, hexId(page + seed), pos, z, v);
}

const axes = (extra = {}) => ({
  categoryAxis: [{ properties: {
    show: bool(true), axisType: str('Categorical'), fontFamily: str(SANS), fontSize: num(8), labelColor: color(C.muted),
    showAxisTitle: bool(false), gridlineShow: bool(false), ...(extra.cat || {}),
  } }],
  valueAxis: [{ properties: {
    show: bool(extra.valueShow !== false), fontFamily: str(SANS), fontSize: num(8), labelColor: color(C.muted),
    showAxisTitle: bool(false), gridlineShow: bool(!!extra.grid), gridlineColor: color(C.rule), ...(extra.val || {}),
  } }],
});
const legend = (show, pos = 'Top') => [{ properties: { show: bool(show), position: str(pos), fontFamily: str(SANS), fontSize: num(8), labelColor: color(C.muted), showTitle: bool(false) } }];
const phaseColors = () => PHASES.map(([, hex], i) => ({ properties: { fill: color(hex) }, selector: { metadata: `${A}.Personnes en phase ${i + 1}` } }));
const phaseProjections = () => [1, 2, 3, 4, 5].map((p) => ({ ...pm(`Personnes en phase ${p}`), displayName: PHASES[p - 1][0] }));

// Lecture simple d'un CSV (champs entre guillemets possibles)
function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const parse = (l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  };
  const head = parse(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [head[i], v])));
}

// Couleurs de la carte : la carte de formes rattache chaque couleur à une paire (zone, phase).
// On écrit donc une règle par paire présente dans les données, toutes situations et tous cycles confondus.
function mapColors() {
  const zones = Object.fromEntries(readCsv(path.join(BASE, 'donnees', 'zones.csv')).map((z) => [z.code_zone, z.libelle]));
  const paires = new Set();
  for (const r of readCsv(path.join(BASE, 'donnees', 'analyses.csv'))) {
    if (r.phase_zone && zones[r.code_zone]) paires.add(`${zones[r.code_zone]}\u0001${Math.round(Number(r.phase_zone))}`);
  }
  const cmp = (t, c, v) => ({ Comparison: { ComparisonKind: 0, Left: column(t, c), Right: { Literal: { Value: `'${v.replace(/'/g, "''")}'` } } } });
  return [...paires].sort().map((k) => {
    const [zone, ph] = k.split('\u0001');
    const [lab, hex] = PHASES[Number(ph) - 1];
    return { properties: { fill: color(hex) }, selector: { data: [{ scopeId: { And: { Left: cmp('Zone', 'Zone', zone), Right: cmp(A, 'Phase CH', lab) } } }] } };
  });
}

// Matrice dont chaque valeur porte ses couleurs (fond et texte) issues de mesures
function matrix(page, seed, pos, z, { rows, columns, values, title, subtitle, alt, filters, fontSize = 8, colWidth, rowPadding = 3, headerSize }) {
  const v = values.map(([m]) => m);
  return write(page, hexId(page + seed), pos, z, {
    visualType: 'pivotTable',
    query: { queryState: {
      Rows: { projections: [pc(...rows)] },
      ...(columns ? { Columns: { projections: [pc(...columns)] } } : {}),
      Values: { projections: v.map(pm) },
    } },
    objects: {
      columnHeaders: [{ properties: {
        fontFamily: str(SANS), fontSize: num(headerSize || fontSize), fontColor: color(C.muted), backColor: color(C.card), bold: bool(false), alignment: str('Center'),
        wordWrap: bool(true), ...(colWidth ? {} : { autoSizeColumnWidth: bool(true), columnAdjustment: str('growToFit') }),
      } }],
      rowHeaders: [{ properties: { fontFamily: str(SANS), fontSize: num(fontSize + 1), fontColor: color(C.ink), backColor: color(C.card), wordWrap: bool(false) } }],
      values: [
        { properties: { fontFamily: str(SANS), fontSize: num(fontSize), backColorPrimary: color(C.card), backColorSecondary: color(C.card), wordWrap: bool(false) } },
        ...values.map(([m, back, fore]) => ({
          properties: { backColor: colorFromMeasure(back), fontColor: colorFromMeasure(fore) },
          selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: `${A}.${m}` },
        })),
      ],
      grid: [{ properties: {
        gridVertical: bool(true), gridVerticalColor: color(C.card), gridVerticalWeight: num(2),
        gridHorizontal: bool(true), gridHorizontalColor: color(C.card), gridHorizontalWeight: num(2),
        rowPadding: num(rowPadding), outlineColor: color(C.card),
      } }],
      subTotals: [{ properties: { rowSubtotals: bool(false), columnSubtotals: bool(false) } }],
      ...(colWidth ? { columnWidth: v.map((m) => ({ properties: { value: num(colWidth) }, selector: { metadata: `${A}.${m}` } })) } : {}),
    },
    visualContainerObjects: { ...frame({ title, subtitle, alt }), stylePreset: [{ properties: { name: str('None') } }] },
  }, filters);
}

function pageJson(name, displayName, extra = {}) {
  const dir = path.join(DEF, 'pages', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({
    $schema: PAGE_SCHEMA, name, displayName, displayOption: 'FitToPage', height: H, width: W, ...extra,
    objects: {
      background: [{ properties: { color: color(C.page), transparency: num(0) } }],
      outspace: [{ properties: { color: color(C.page), transparency: num(0) } }],
      outspacePane: [{ properties: {
        backgroundColor: color(C.card), foregroundColor: color(C.ink), borderColor: color(C.rule), border: bool(true),
        checkboxAndApplyColor: color(C.accent), inputBoxColor: color(C.card), fontFamily: str(SANS),
      } }],
    },
  }, null, 2));
}

// ---------- Pages : Synthèse, Marchés, Saisonnalité, Produits (style sobre papier et encre) ----------
const P = { synthese: hexId('p-synthese'), marches: hexId('p-marches'), saison: hexId('p-saison'), produits: hexId('p-produits') };
const MOIS_DEFAUT = 'Juin 2026';
const KICKER = 'PRIX DES CÉRÉALES AU SAHEL CENTRAL · BURKINA FASO, MALI, NIGER, TCHAD · PAM, 2010 À 2026';
const PAYS_FILL = [['Burkina Faso', '#2B2118'], ['Mali', '#C8571F'], ['Niger', '#D9A21B'], ['Tchad', '#1F6670']];
const paysFills = () => PAYS_FILL.map(([p, hex]) => ({
  properties: { fill: color(hex) },
  selector: { data: [{ scopeId: { Comparison: { ComparisonKind: 0, Left: column('Pays', 'Pays'), Right: { Literal: { Value: `'${p}'` } } } } }] },
}));
const ligneStyle = [{ properties: { strokeWidth: num(2), lineChartType: str('linear'), showMarker: bool(false) } }];

function chapo(page, m) {
  write(page, hexId(page + 'chapo'), { x: M - 6, y: 66, width: 870, height: 30 }, 1002, {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [pm(m)] } } },
    objects: {
      value: [{ properties: { fontSize: num(9), fontFamily: str(LIGHT), fontColor: color(C.ink), horizontalAlignment: str('left'), textWrap: bool(true) }, selector: { id: 'default' } }],
      label: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      outline: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      fillCustom: [{ properties: { show: bool(true), fillColor: color(C.page), transparency: num(0) }, selector: { id: 'default' } }],
      padding: [{ properties: { paddingUniform: num(0) }, selector: { id: 'default' } }],
      layout: [{ properties: { paddingUniform: num(0) }, selector: { id: 'default' } }],
    },
    visualContainerObjects: noFrame(),
  });
}
function entete(page, { titleM, title, chapoM, lede, withMois = true, withProduit = true }) {
  motif(page);
  textbox(page, 'kicker', { x: M, y: 22, width: 860, height: 18 }, 1000, [{ text: KICKER, size: 8, color: '#8A5A1E', font: 'Segoe UI Semibold' }]);
  if (titleM) titleMeasure(page, 'titre', { x: M - 6, y: 38, width: 874, height: 32 }, 1001, titleM, 16);
  else textbox(page, 'titre', { x: M, y: 38, width: 860, height: 32 }, 1001, [{ text: title, size: 16, font: SERIF }]);
  if (chapoM) chapo(page, chapoM);
  else if (lede) textbox(page, 'chapo', { x: M, y: 68, width: 860, height: 24 }, 1002, [{ text: lede, size: 9, font: LIGHT }]);
  navigator(page, { x: 900, y: 22, width: 356, height: 26 }, 1003);
  if (withProduit) dropdown(page, 'produit', { x: 900, y: 52, width: 150, height: 48 }, 1100, { field: ['Produit', 'Produit'], header: 'Produit', value: 'Mil', sync: 'produit' });
  if (withMois) dropdown(page, 'mois', { x: 1058, y: 52, width: 198, height: 48 }, 1101, { field: ['Mois', 'Libellé'], header: 'Mois', value: MOIS_DEFAUT, sync: 'mois' });
  rect(page, 'bande-or', { x: 0, y: 692, width: W, height: 4 }, 1800, OR);
  rect(page, 'bande-brun', { x: 0, y: 696, width: W, height: 24 }, 1801, BRUN);
  textbox(page, 'source', { x: M, y: 699, width: W - 2 * M, height: 18 }, 1804, [{ text: SOURCE, size: 8, color: '#F3E7CF' }]);
}
const KPI_LAYOUT = (i) => ({ x: Math.round(M + i * ((W - 2 * M - 3 * 12) / 4 + 12)), y: 100, width: Math.round((W - 2 * M - 3 * 12) / 4), height: 84 });

function motif(page) {
  write(page, hexId(page + 'motif'), { x: 0, y: 0, width: W, height: 16 }, 1500, {
    visualType: 'image',
    objects: {
      image: [{ properties: {
        sourceType: str('image'),
        sourceFile: { image: { name: str('motif_bande.png'), scaling: str('Fill'),
          url: { expr: { ResourcePackageItem: { PackageName: 'RegisteredResources', PackageType: 1, ItemName: 'motif_bande.png' } } } } },
        altText: str('Frise géométrique décorative, inspirée des tissus bogolan'),
      } }],
      imageScaling: [{ properties: { imageScalingType: str('Fill') } }],
    },
    visualContainerObjects: noFrame(),
  });
}
function roundedRect(page, seed, pos, z, fill, radius = 10) {
  return write(page, hexId(page + seed), pos, z, {
    visualType: 'shape',
    objects: {
      shape: [{ properties: { tileShape: str('rectangleRoundedByPixel'), rectangleRoundedCurve: num(radius) }, selector: { id: 'default' } }],
      fill: [{ properties: { show: bool(true), fillColor: color(fill), transparency: num(0) }, selector: { id: 'default' } }],
      outline: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
    },
    visualContainerObjects: noFrame(),
  });
}
function cardPlain(page, seed, pos, z, m, { size, font = 'Segoe UI Semibold', hex = '#FFFFFF', fill }) {
  return write(page, hexId(page + seed), pos, z, {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [pm(m)] } } },
    objects: {
      value: [{ properties: { fontSize: num(size), fontFamily: str(font), fontColor: color(hex), horizontalAlignment: str('left') }, selector: { id: 'default' } }],
      fillCustom: [{ properties: { show: bool(true), fillColor: color(fill), transparency: num(0) }, selector: { id: 'default' } }],
      label: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      outline: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      accentBar: [{ properties: { show: bool(false) }, selector: { id: 'default' } }],
      padding: [{ properties: { paddingUniform: num(0) }, selector: { id: 'default' } }],
      layout: [{ properties: { paddingUniform: num(0) }, selector: { id: 'default' } }],
    },
    visualContainerObjects: { ...noFrame(), general: [{ properties: {} }] },
  });
}
function kpis(page, list) {
  list.forEach((k, i) => {
    const pos = KPI_LAYOUT(i);
    roundedRect(page, 'tuile-fond' + i, pos, 1900 + i, TERRE[i], 10);
    textbox(page, 'tuile-titre' + i, { x: pos.x + 14, y: pos.y + 8, width: pos.width - 28, height: 22 }, 2000 + i, [{ text: k.title, size: 11, color: TERRE_TEXTE[i], font: 'Segoe UI Semibold' }]);
    cardPlain(page, 'tuile-val' + i, { x: pos.x + 14, y: pos.y + 32, width: pos.width - 28, height: 44 }, 2100 + i, k.value, { size: 22, fill: TERRE[i], hex: TERRE_TEXTE[i] });
  });
}
const legendeEcart = 'Écart à la moyenne des 5 ans. Brun foncé : +25 % et plus ; orange : +10 à +25 % ; sable : entre -10 et +10 % ; turquoise clair : -10 à -25 % ; turquoise foncé : -25 % et moins ; crème : écart non calculable (moins de 3 années de référence).';


// Légende de l'échelle des écarts : pastilles carrées et libellés lisibles
function legendePastilles(page, x0, y, largeur, z, court = false) {
  const items = [
    ['#B5651D', court ? '+25 % et plus' : 'au moins +25 %'], ['#E39B5A', court ? '+10 à +25 %' : '+10 à +25 %'],
    ['#E6DCC6', court ? '-10 à +10 %' : 'entre -10 et +10 %'], ['#8CC2C6', court ? '-10 à -25 %' : '-10 à -25 %'],
    ['#4F9AA3', court ? '-25 % et moins' : '-25 % et moins'], ['#B5A68A', court ? 'non calculable' : 'écart non calculable (moins de 3 ans de référence)'],
  ];
  const w = largeur / items.length;
  items.forEach(([hex, lib], i) => {
    const x = Math.round(x0 + i * w);
    roundedRect(page, 'pastille' + i + z, { x, y: y + 3, width: 12, height: 12 }, z + i, hex, 2);
    textbox(page, 'pastille-lib' + i + z, { x: x + 17, y, width: Math.round(w - 20), height: 20 }, z + 20 + i, [{ text: lib, size: 9, color: C.ink }]);
  });
}

function synthese() {
  const p = P.synthese;
  pageJson(p, 'Synthèse', { visualInteractions: [{ source: hexId(p + 'mois'), target: hexId(p + 'courbes'), type: 'NoFilter' }] });
  entete(p, { titleM: 'Titre prix', chapoM: 'Chapô prix' });
  kpis(p, [
    { value: 'Prix moyen (texte)', title: 'Prix moyen au kilo', alt: 'Prix moyen au kilo du produit choisi pour le mois choisi, en francs CFA.' },
    { value: 'Variation sur un an (texte)', title: 'Sur un an', alt: 'Variation moyenne des prix des marchés par rapport au même mois un an plus tôt.' },
    { value: 'Écart à la moyenne 5 ans (texte)', title: 'Par rapport à la moyenne des 5 ans', alt: 'Écart moyen des marchés par rapport à la moyenne du même mois sur les cinq années précédentes.' },
    { value: 'Marchés en alerte (texte)', title: 'Marchés à +25 % de leur normale', alt: 'Nombre de marchés dont le prix dépasse de plus de 25 % la moyenne des cinq années précédentes.' },
  ]);
  write(p, hexId(p + 'courbes'), { x: M, y: 196, width: 868, height: 488 }, 2100, {
    visualType: 'lineChart',
    query: { queryState: {
      Category: { projections: [pc('Mois', 'Date du mois')] },
      Series: { projections: [pc('Pays', 'Pays')] },
      Y: { projections: [pm('Prix moyen')] },
    } },
    objects: {
      ...axes({ grid: true, cat: { axisType: str('Scalar') } }),
      dataPoint: paysFills(),
      lineStyles: ligneStyle,
      labels: [{ properties: { show: bool(false) } }],
      legend: legend(true),
    },
    visualContainerObjects: frame({
      title: 'Prix moyen au kilo par pays depuis 2010 (FCFA)',
      subtitle: "Moyenne simple des marchés qui ont un relevé ce mois-là, en FCFA courants (sans correction de l'inflation). Le Tchad n'a pas de relevé après juin 2026.",
      alt: 'Courbes du prix moyen au kilo du produit choisi dans les quatre pays depuis 2010 ; pic en 2022 puis baisse jusqu’en 2026.',
    }),
  }, [betweenFilter(p + 'annees', 'Mois', 'Année', 2010, 2026)]);
  write(p, hexId(p + 'pays'), { x: 916, y: 196, width: W - M - 916, height: 308 }, 2101, {
    visualType: 'barChart',
    query: { queryState: { Category: { projections: [pc('Pays', 'Pays')] }, Y: { projections: [pm('Écart à la moyenne 5 ans')] } } },
    objects: {
      ...axes({ valueShow: false }),
      dataPoint: [{ properties: { fill: colorFromMeasure('Couleur écart 5 ans') }, selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }] } }],
      labels: [{ properties: { show: bool(true), fontFamily: str(SANS), fontSize: num(10), color: color(C.ink), labelPrecision: int(0) } }],
      legend: legend(false),
    },
    visualContainerObjects: frame({
      title: 'Écart à la moyenne des 5 ans, par pays',
      subtitle: 'Mois choisi. Moyenne des marchés du pays.',
      alt: 'Barres de l’écart du prix à la moyenne des cinq années précédentes, par pays, pour le mois choisi.',
    }),
  });
  rect(p, 'fond-note', { x: 916, y: 516, width: W - M - 916, height: 168 }, 1500, C.card, C.rule);
  textbox(p, 'note', { x: 932, y: 528, width: W - M - 948, height: 148 }, 3000, [
    { text: 'COMMENT LIRE', size: 7, font: 'Segoe UI Semibold', color: C.accent },
    { text: "Moyennes simples de marchés suivis par le PAM, en FCFA courants au kilo : un pays qui a plus de marchés pèse plus. Un écart compare le prix au même mois des 5 années précédentes, années de prix élevés comprises.", size: 10, font: SANS },
    { text: ' ', size: 5 },
    { text: 'Mois par défaut : juin 2026, dernier mois avec les 4 pays.', size: 9, color: C.muted },
  ]);
}

function marches() {
  const p = P.marches;
  pageJson(p, 'Marchés');
  entete(p, { titleM: 'Titre marchés', lede: 'Chaque point est un marché. Sa couleur dit si son prix est au-dessus ou en dessous de sa normale. Survolez un point pour le détail.' });
  // Quatre cartes de points, une par pays, à la même échelle (largeur proportionnelle à l'étendue en longitude)
  const PAN = [
    { pays: 'Burkina Faso', lon: [-6, 3.2], w: 138 }, { pays: 'Mali', lon: [-13, 5], w: 270 },
    { pays: 'Niger', lon: [-0.5, 16.5], w: 254 }, { pays: 'Tchad', lon: [12.5, 24.5], w: 178 },
  ];
  let px = M;
  PAN.forEach((c, i) => {
    write(p, hexId(p + 'carte' + i), { x: px, y: 100, width: c.w, height: 334 }, 2100 + i, {
      visualType: 'scatterChart',
      query: { queryState: {
        Category: { projections: [pc('Marché', 'Marché')] },
        X: { projections: [pm('Longitude')] },
        Y: { projections: [pm('Latitude')] },
        Tooltips: { projections: [pm('Prix moyen (texte)'), pm('Écart à la moyenne 5 ans (texte)'), pm('Variation sur un an (texte)')] },
      } },
      objects: {
        dataPoint: [{ properties: { fill: colorFromMeasure('Couleur écart 5 ans') }, selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }] } }],
        categoryAxis: [{ properties: { show: bool(false), start: num(c.lon[0]), end: num(c.lon[1]), gridlineShow: bool(false), showAxisTitle: bool(false) } }],
        valueAxis: [{ properties: { show: bool(false), start: num(7.5), end: num(24.5), gridlineShow: bool(false), showAxisTitle: bool(false) } }],
        bubbles: [{ properties: { bubbleSize: num(5) } }],
        categoryLabels: [{ properties: { show: bool(false) } }],
        legend: legend(false),
      },
      visualContainerObjects: frame({
        title: c.pays, subtitle: '1 point = 1 marché',
        alt: 'Carte des marchés de ce pays ; chaque point est coloré selon l’écart du prix à la moyenne des cinq années précédentes.',
      }),
    }, [inFilter(p + 'pays' + i, 'Pays', 'Pays', [c.pays]), measureFilter(p + 'releve' + i, 'Prix moyen', 1, 0)]);
    px += c.w + 8;
  });
  legendePastilles(p, M, 440, 868, 2200, true);
  write(p, hexId(p + 'top'), { x: 916, y: 100, width: W - M - 916, height: 392 }, 2101, {
    visualType: 'barChart',
    query: {
      queryState: { Category: { projections: [pc('Marché', 'Marché')] }, Y: { projections: [pm('Écart à la moyenne 5 ans')] } },
      sortDefinition: { sort: [{ field: measure(A, 'Écart à la moyenne 5 ans'), direction: 'Descending' }], isDefaultSort: false },
    },
    objects: {
      ...axes({ valueShow: false }),
      dataPoint: [{ properties: { fill: colorFromMeasure('Couleur écart 5 ans') }, selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }] } }],
      labels: [{ properties: { show: bool(true), fontFamily: str(SANS), fontSize: num(9), color: color(C.ink), labelPrecision: int(0) } }],
      legend: legend(false),
    },
    visualContainerObjects: frame({
      title: 'Les 10 marchés les plus au-dessus de leur normale',
      subtitle: 'Écart à la moyenne des 5 ans, mois choisi.',
      alt: 'Barres des dix marchés dont le prix est le plus au-dessus de la moyenne des cinq années précédentes.',
    }),
  }, [measureFilter(p + 'rang', 'Rang du marché', 4, 10)]);
  write(p, hexId(p + 'parts'), { x: M, y: 474, width: 868, height: 210 }, 2102, {
    visualType: 'columnChart',
    query: { queryState: { Category: { projections: [pc('Pays', 'Pays')] }, Y: { projections: [pm('Part des marchés en alerte')] } } },
    objects: {
      ...axes({ valueShow: false }),
      dataPoint: [{ properties: { fill: color('#B5651D') } }],
      labels: [{ properties: { show: bool(true), fontFamily: str(SANS), fontSize: num(10), color: color(C.ink), labelPrecision: int(0) } }],
      legend: legend(false),
    },
    visualContainerObjects: frame({
      title: 'Part des marchés au moins 25 % au-dessus de leur normale, par pays',
      subtitle: 'Parmi les marchés qui ont un relevé pour le mois choisi.',
      alt: 'Colonnes de la part des marchés en alerte par pays.',
    }),
  });
  rect(p, 'fond-note', { x: 916, y: 504, width: W - M - 916, height: 180 }, 1500, C.card, C.rule);
  textbox(p, 'note', { x: 932, y: 516, width: W - M - 948, height: 160 }, 3000, [
    { text: 'COMMENT LIRE', size: 7, font: 'Segoe UI Semibold', color: C.accent },
    { text: "Une alerte est un signal à vérifier, pas un constat de crise : le prix est comparé à celui du même mois des cinq années précédentes.", size: 10, font: SANS },
    { text: ' ', size: 5 },
    { text: 'Les marchés sans relevé ce mois-là n’apparaissent pas. Il faut au moins 3 années de référence pour calculer un écart ; trois années restent une base fragile.', size: 9, color: C.muted },
  ]);
}

function saison() {
  const p = P.saison;
  pageJson(p, 'Saison');
  entete(p, { title: "Janvier à août : environ +20 % pour les céréales locales, pas chaque année", lede: "Marchés de 2016 à 2025. Pour le mil, l'écart médian janvier à août va de -6 % (2019) à +49 % (2024). Le riz importé varie à peine.", withMois: false });
  write(p, hexId(p + 'saison'), { x: M, y: 100, width: 868, height: 584 }, 2100, {
    visualType: 'lineChart',
    query: { queryState: {
      Category: { projections: [pc('Mois', 'Mois')] },
      Series: { projections: [pc('Mois', 'Année')] },
      Y: { projections: [pm('Prix moyen')] },
    } },
    objects: {
      ...axes({ grid: true, val: { start: num(180) } }),
      dataPoint: [[2022, '#CFC3AA'], [2023, '#A99B7E'], [2024, '#C8571F'], [2025, '#6B4416'], [2026, '#1F6670']].map(([y, hex]) => ({ properties: { fill: color(hex) }, selector: { data: [{ scopeId: { Comparison: { ComparisonKind: 0, Left: column('Mois', 'Année'), Right: { Literal: { Value: `${y}L` } } } } }] } })),
      lineStyles: [{ properties: { strokeWidth: num(2.5), lineChartType: str('linear'), showMarker: bool(true), markerSize: num(4) } }],
      labels: [{ properties: { show: bool(false) } }],
      legend: legend(true),
    },
    visualContainerObjects: frame({
      title: 'Prix moyen au kilo, mois par mois, de 2022 à 2026 (FCFA)',
      subtitle: 'Produit choisi. Moyenne simple des marchés qui ont un relevé ce mois-là : le Tchad n’en a plus après juin 2026, ce qui relève la moyenne de 2026.',
      alt: 'Courbes du prix moyen au kilo mois par mois pour chaque année de 2022 à 2026 ; creux en janvier, pic en août.',
    }),
  }, [betweenFilter(p + 'annees', 'Mois', 'Année', 2022, 2026)]);
  rect(p, 'fond-note', { x: 916, y: 100, width: W - M - 916, height: 584 }, 1500, C.card, C.rule);
  textbox(p, 'note', { x: 932, y: 116, width: W - M - 948, height: 560 }, 3000, [
    { text: 'LA SOUDURE DANS LE PRIX', size: 7, font: 'Segoe UI Semibold', color: C.accent },
    { text: "Avant la récolte, les stocks s'épuisent et les céréales locales se renchérissent : c'est la soudure, de juin à septembre.", size: 10, font: SANS },
    { text: ' ', size: 6 },
    { text: 'Indice du mois, 100 = moyenne de l’année (2016 à 2025)', size: 8, color: C.muted },
    { text: 'Mil : 91,6 en janvier, 108,0 en août', size: 11, font: SANS },
    { text: 'Sorgho : 90,9 en janvier, 108,9 en août', size: 11, font: SANS },
    { text: 'Maïs : 92,2 en janvier, 110,7 en août', size: 11, font: SANS },
    { text: 'Riz importé : 96,8 en janvier, 102,4 en septembre', size: 11, font: SANS },
    { text: ' ', size: 6 },
    { text: "Pour juger un prix, il faut donc le comparer au même mois des années précédentes, comme le fait l'écart à la moyenne des 5 ans.", size: 10, font: SANS },
    { text: ' ', size: 6 },
    { text: 'Indices calculés sur les marchés qui ont au moins 10 mois de relevés dans l’année.', size: 8, color: C.muted },
  ]);
}

function produits() {
  const p = P.produits;
  pageJson(p, 'Produits', { visualInteractions: [{ source: hexId(p + 'mois'), target: hexId(p + 'multiples'), type: 'NoFilter' }] });
  entete(p, { title: 'Le riz importé coûte de 1,8 à 2,9 fois le prix du mil, selon le pays', lede: 'Septembre 2025 à septembre 2026, au kilo : riz importé de 507 à 670 FCFA, mil de 235 à 298 FCFA selon le pays.', withProduit: false });
  write(p, hexId(p + 'multiples'), { x: M, y: 100, width: 600, height: 584 }, 2100, {
    visualType: 'lineChart',
    query: { queryState: {
      Category: { projections: [pc('Mois', 'Date du mois')] },
      Series: { projections: [pc('Produit', 'Produit')] },
      Y: { projections: [pm('Prix moyen')] },
      Rows: { projections: [pc('Pays', 'Pays')] },
    } },
    objects: {
      ...axes({ grid: true, cat: { axisType: str('Scalar'), fontSize: num(7) }, val: { start: num(0), end: num(800) } }),
      lineStyles: [{ properties: { strokeWidth: num(1.5), lineChartType: str('linear'), showMarker: bool(false) } }],
      labels: [{ properties: { show: bool(false) } }],
      legend: legend(true),
      smallMultiplesLayout: [{ properties: { rowCount: int(2), columnCount: int(2) } }],
      subheader: [{ properties: { show: bool(true), fontFamily: str('Segoe UI Semibold'), fontSize: num(10), fontColor: color(C.ink) } }],
    },
    visualContainerObjects: frame({
      title: 'Prix moyen au kilo des cinq produits, par pays, depuis 2018 (FCFA, échelle de 0 à 800)',
      subtitle: 'Même échelle pour les quatre pays. Chaque courbe est un produit.',
      alt: 'Quatre petits graphiques, un par pays, avec le prix moyen au kilo des cinq produits depuis 2018.',
    }),
  }, [betweenFilter(p + 'annees', 'Mois', 'Année', 2018, 2026)]);
  matrix(p, 'matrice', { x: 640, y: 100, width: W - M - 640, height: 290 }, 2101, {
    rows: ['Produit', 'Produit'], columns: ['Pays', 'Pays'],
    values: [['Étiquette écart 5 ans', 'Couleur écart 5 ans', 'Couleur texte écart 5 ans']],
    title: 'Écart à la moyenne des 5 ans, par produit et par pays (%)',
    subtitle: 'Mois choisi, en % : brun et orange au-dessus de la normale, turquoise en dessous.',
    alt: 'Matrice de l’écart du prix à la moyenne des cinq années précédentes pour chaque produit et chaque pays, pour le mois choisi.',
    fontSize: 10, rowPadding: 5, colWidth: 100,
  });
  legendePastilles(p, 640, 398, W - M - 640, 2200, true);
  rect(p, 'fond-note', { x: 640, y: 440, width: W - M - 640, height: 244 }, 1500, C.card, C.rule);
  textbox(p, 'note', { x: 656, y: 452, width: W - M - 672, height: 224 }, 3000, [
    { text: 'CE QUE MONTRENT LES COURBES', size: 7, font: 'Segoe UI Semibold', color: C.accent },
    { text: "Le prix du mil a nettement augmenté entre 2021 et 2022 dans les quatre pays, puis a reculé depuis 2025. Le riz importé bouge peu : son prix varie beaucoup moins d'un mois à l'autre.", size: 10, font: SANS },
    { text: ' ', size: 6 },
    { text: "Le riz local est mesuré sur moins de marchés que le mil, et peu au Niger : une case « n.d. », quand elle apparaît, est une absence de relevé, pas un prix nul.", size: 10, font: SANS },
    { text: ' ', size: 6 },
    { text: 'Prix de détail en francs CFA au kilo (XOF et XAF, à parité).', size: 8, color: C.muted },
  ]);
}

// ---------- Squelette, thème et carte ----------
function skeleton() {
  fs.mkdirSync(DEF, { recursive: true });
  fs.writeFileSync(path.join(PBIP, `${NOM}.pbip`), JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
    version: '1.0', artifacts: [{ report: { path: `${NOM}.Report` } }], settings: { enableAutoRecovery: true },
  }, null, 2));
  fs.writeFileSync(path.join(REPORT, '.platform'), JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: { type: 'Report', displayName: NOM }, config: { version: '2.0', logicalId: '4c8d2f60-7a1b-4e39-9d52-3b6f0a8e1c77' },
  }, null, 2));
  fs.writeFileSync(path.join(REPORT, 'definition.pbir'), JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
    version: '4.0', datasetReference: { byPath: { path: `../${NOM}.SemanticModel` } },
  }, null, 2));
  fs.writeFileSync(path.join(DEF, 'version.json'), JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json', version: '2.0.0',
  }, null, 2));
  // Thème de base copié du premier rapport (même version de Desktop)
  const baseSrc = path.join(BASE, 'ressources', 'pbi_base', 'SharedResources');
  fs.cpSync(baseSrc, path.join(REPORT, 'StaticResources', 'SharedResources'), { recursive: true });
  const reg = path.join(REPORT, 'StaticResources', 'RegisteredResources');
  fs.rmSync(reg, { recursive: true, force: true });
  fs.mkdirSync(reg, { recursive: true });
  const themeName = 'TerreSahel.json';
  fs.copyFileSync(path.join(BASE, 'ressources', 'motif_bande.png'), path.join(reg, 'motif_bande.png'));
  fs.writeFileSync(path.join(reg, themeName), JSON.stringify({
    $schema: 'https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.153.json',
    name: themeName,
    dataColors: ['#2B2118', '#C8571F', '#D9A21B', '#1F6670', '#9A6B35', '#8C7A62'],
    foreground: C.ink, foregroundNeutralSecondary: C.muted, foregroundNeutralTertiary: C.muted,
    background: C.card, backgroundLight: C.rule, backgroundNeutral: C.np, tableAccent: C.accent,
    good: '#1F6670', neutral: '#CDBFA6', bad: '#C8571F', maximum: '#4A2E10', center: '#CDBFA6', minimum: '#7FB3B8', null: C.np,
    textClasses: {
      callout: { fontSize: 26, fontFace: NUM, color: C.ink },
      title: { fontSize: 11, fontFace: 'Segoe UI Semibold', color: C.ink },
      header: { fontSize: 11, fontFace: 'Segoe UI Semibold', color: C.ink },
      label: { fontSize: 9, fontFace: SANS, color: C.ink },
    },
    visualStyles: { '*': { '*': {
      background: [{ show: true, color: { solid: { color: C.card } }, transparency: 0 }],
      border: [{ show: true, color: { solid: { color: C.rule } }, radius: 8 }],
      dropShadow: [{ show: false }], visualHeader: [{ show: false }],
    } } },
  }, null, 2));
  const base = JSON.parse(fs.readFileSync(path.join(BASE, 'ressources', 'pbi_base', 'report.json'), 'utf8'));
  const rv = base.themeCollection.baseTheme.reportVersionAtImport;
  fs.writeFileSync(path.join(DEF, 'report.json'), JSON.stringify({
    $schema: base.$schema,
    themeCollection: {
      baseTheme: base.themeCollection.baseTheme,
      customTheme: { name: themeName, reportVersionAtImport: rv, type: 'RegisteredResources' },
    },
    resourcePackages: [
      base.resourcePackages.find((r) => r.name === 'SharedResources'),
      { name: 'RegisteredResources', type: 'RegisteredResources', items: [
        { name: themeName, path: themeName, type: 'CustomTheme' },
        { name: 'motif_bande.png', path: 'motif_bande.png', type: 'Image' },
      ] },
    ],
    settings: { ...base.settings, exportDataMode: 'AllowSummarized' },
  }, null, 2));
}


fs.rmSync(path.join(DEF, 'pages'), { recursive: true, force: true });
skeleton();
synthese();
marches();
saison();
produits();
fs.writeFileSync(path.join(DEF, 'pages', 'pages.json'), JSON.stringify({
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
  pageOrder: [P.synthese, P.marches, P.saison, P.produits], activePageName: P.synthese,
}, null, 2));
console.log(JSON.stringify(P));
