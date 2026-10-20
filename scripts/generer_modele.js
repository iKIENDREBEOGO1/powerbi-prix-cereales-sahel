// Génère le modèle sémantique TMDL du rapport « Prix des céréales au Sahel central » (PAM, HDX).
// Usage : node generer_modele.js   (écrit pbip/Prix Sahel.SemanticModel)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = path.resolve(__dirname, '..');
// TERRE=1 écrit le même modèle dans le projet « Prix Sahel Terre » (pbip_terre), avec la palette de terre
const TERRE = !!process.env.TERRE;
const NOM = TERRE ? 'Prix Sahel Terre' : 'Prix Sahel';
const SM = path.join(BASE, TERRE ? 'pbip_terre' : 'pbip', `${NOM}.SemanticModel`);
const DEF = path.join(SM, 'definition');
const DONNEES = path.join(BASE, 'donnees') + '\\';

const uuid = (seed) => {
  const h = crypto.createHash('sha1').update('prix-sahel:' + seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (n) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);
const indent = (s, n) => s.split('\n').map((l) => '\t'.repeat(n) + l).join('\n');

// Échelle de couleur des écarts de prix : encre pour les prix élevés (tension), bleu pour les prix bas
const PAL = TERRE
  ? { np: '#B5A68A', haut: '#B5651D', hautMoy: '#E39B5A', neutre: '#E6DCC6', basMoy: '#8CC2C6', bas: '#4F9AA3' }
  : { np: '#EDE8DF', haut: '#1A1A1A', hautMoy: '#6B6558', neutre: '#D9D4CA', basMoy: '#8DA2C2', bas: '#1F3A5F' };
const couleurEcart = (m) => `VAR _e = ${m}
RETURN
    SWITCH(
        TRUE(),
        ISBLANK(_e), "${PAL.np}",
        _e > 0.25, "${PAL.haut}",
        _e > 0.1, "${PAL.hautMoy}",
        _e >= -0.1, "${PAL.neutre}",
        _e >= -0.25, "${PAL.basMoy}",
        "${PAL.bas}"
    )`;
const texteEcart = (m) => `VAR _e = ${m}
RETURN
    IF(NOT ISBLANK(_e) && (_e > 0.1 || _e < -0.25), "#FFFFFF", "#1A1A1A")`;
const signe = (m) => `IF(ISBLANK(${m}), "n.d.", IF(${m} >= 0, "+", "") & FORMAT(${m} * 100, "0") & " %")`;

// [nom, expression, format, dossier, description]
const MESURES = [
  ['Prix moyen', 'AVERAGE(Prix[prix_kg])', '#,0', 'Prix', 'Prix moyen au kilo (franc CFA) sur les marchés et les mois sélectionnés. Moyenne simple des marchés, sans pondération.'],
  ['Marchés observés', 'DISTINCTCOUNT(Prix[cle_marche]) + 0', '0', 'Prix', 'Nombre de marchés qui ont un relevé pour la sélection.'],
  ['Variation sur un an', 'AVERAGE(Prix[var_an])', '+0 %;-0 %;0 %', 'Prix', "Variation moyenne des marchés par rapport au même mois un an plus tôt."],
  ['Écart à la moyenne 5 ans', 'AVERAGE(Prix[var_5ans])', '+0 %;-0 %;0 %', 'Prix', "Écart moyen des marchés par rapport à la moyenne du même mois sur les 5 années précédentes."],
  ['Marchés en alerte', 'COUNTROWS(FILTER(VALUES(\'Marché\'[Marché]), [Écart à la moyenne 5 ans] > 0.25)) + 0', '0', 'Alertes',
    'Marchés dont le prix dépasse de plus de 25 % la moyenne des 5 années précédentes (même mois).'],
  ['Marchés avec écart connu', 'COUNTROWS(FILTER(VALUES(\'Marché\'[Marché]), NOT ISBLANK([Écart à la moyenne 5 ans]))) + 0', '0', 'Alertes',
    'Marchés pour lesquels on peut calculer un écart (au moins 3 années de référence).'],
  ['Part des marchés en alerte', 'DIVIDE([Marchés en alerte], [Marchés avec écart connu])', '0 %', 'Alertes', 'Part des marchés en alerte parmi ceux qui ont un écart connu.'],
  ['Rang du marché', 'IF(ISBLANK([Écart à la moyenne 5 ans]), BLANK(), RANKX(ALLSELECTED(\'Marché\'[Marché]), [Écart à la moyenne 5 ans], , DESC, Dense))', '0', 'Alertes', 'Rang du marché selon l’écart à la moyenne des 5 ans (1 = le plus au-dessus de sa normale).'],
  ['Longitude', 'AVERAGE(\'Marché\'[longitude])', '0.00', 'Carte', 'Longitude du marché (axe de la carte des marchés).'],
  ['Latitude', 'AVERAGE(\'Marché\'[latitude])', '0.00', 'Carte', 'Latitude du marché (axe de la carte des marchés).'],
  ['Produit choisi', 'SELECTEDVALUE(Produit[Produit], "Mil")', null, 'Textes', 'Produit analysé (mil par défaut).'],
  ['Mois choisi', 'SELECTEDVALUE(Mois[Libellé], "Plusieurs mois")', null, 'Textes', 'Mois analysé.'],
  ['Prix moyen (texte)', 'IF(ISBLANK([Prix moyen]), "n.d.", FORMAT([Prix moyen], "#,0") & " FCFA/kg")', null, 'Textes', 'Prix moyen écrit avec son unité.'],
  ['Variation sur un an (texte)', signe('[Variation sur un an]'), null, 'Textes', 'Variation sur un an, avec signe.'],
  ['Écart à la moyenne 5 ans (texte)', signe('[Écart à la moyenne 5 ans]'), null, 'Textes', 'Écart à la moyenne 5 ans, avec signe.'],
  ['Marchés en alerte (texte)', '[Marchés en alerte] & " sur " & [Marchés avec écart connu]', null, 'Textes', 'Marchés en alerte, sur ceux qui ont un écart connu.'],
  ['Pays sans relevé', 'CONCATENATEX(FILTER(VALUES(Pays[Pays]), ISBLANK([Prix moyen])), Pays[Pays], ", ", Pays[Pays], ASC)', null, 'Couverture', 'Pays sans aucun relevé pour la sélection.'],
  ['Note de couverture', `VAR _l = [Pays sans relevé]
RETURN
    IF(_l = "", "Les 4 pays ont des relevés pour cette sélection.", "Aucun relevé pour " & _l & " : ce n'est pas un prix nul, simplement pas de relevé.")`, null, 'Couverture', 'Phrase de couverture : pays sans relevé.'],
  ['Titre prix', `VAR _e = [Écart à la moyenne 5 ans]
RETURN
    [Produit choisi] & ", " & LOWER([Mois choisi]) & " : " & [Prix moyen (texte)]
        & IF(ISBLANK(_e), "", ", " & FORMAT(ABS(_e) * 100, "0") & " % " & IF(_e < 0, "sous", "au-dessus de") & " la moyenne des 5 ans")`, null, 'Textes', 'Titre-phrase de la page Synthèse.'],
  ['Note courte', `VAR _l = [Pays sans relevé]
RETURN
    IF(_l = "", "", " Pas de relevé pour " & _l & " ce mois-là.")`, null, 'Couverture', 'Pays sans relevé, en quelques mots.'],
  ['Chapô prix', `"Variation sur un an : " & [Variation sur un an (texte)] & ". Marchés au moins 25 % au-dessus de la moyenne des 5 ans : " & [Marchés en alerte (texte)] & "." & [Note courte]`, null, 'Textes', 'Chapô de la page Synthèse.'],
  ['Titre marchés', `[Produit choisi] & ", " & LOWER([Mois choisi]) & " : " & [Marchés en alerte] & " marchés sur " & [Marchés avec écart connu] & " à +25 % ou plus de leur normale"`, null, 'Textes', 'Titre-phrase de la page Marchés.'],
  ['Couleur écart 5 ans', couleurEcart('[Écart à la moyenne 5 ans]'), null, 'Mise en forme', 'Couleur du marché ou de la case selon l’écart à la moyenne 5 ans.'],
  ['Couleur texte écart 5 ans', texteEcart('[Écart à la moyenne 5 ans]'), null, 'Mise en forme', 'Texte lisible sur chaque classe.'],
  ['Couleur variation un an', couleurEcart('[Variation sur un an]'), null, 'Mise en forme', 'Couleur de la case selon la variation sur un an.'],
  ['Couleur texte variation un an', texteEcart('[Variation sur un an]'), null, 'Mise en forme', 'Texte lisible sur chaque classe.'],
  ['Étiquette écart 5 ans', 'IF(ISBLANK([Écart à la moyenne 5 ans]), "n.d.", FORMAT([Écart à la moyenne 5 ans] * 100, "+0;-0;0"))', null, 'Mise en forme', 'Valeur affichée dans les cases : écart en %, « n.d. » sans donnée.'],
  ['Étiquette variation un an', 'IF(ISBLANK([Variation sur un an]), "n.d.", FORMAT([Variation sur un an] * 100, "+0;-0;0"))', null, 'Mise en forme', 'Valeur affichée dans les cases : variation en %, « n.d. » sans donnée.'],
];

function colonne(table, nom, src, type, { hidden, format, sortBy, desc, key, summarize = 'none', dataCategory } = {}) {
  return [`/// ${desc || nom}`, `column ${q(nom)}`,
    `\tdataType: ${type}`,
    key ? '\tisKey' : null,
    hidden ? '\tisHidden' : null,
    format ? `\tformatString: ${format}` : null,
    `\tlineageTag: ${uuid(table + '.' + nom)}`,
    dataCategory ? `\tdataCategory: ${dataCategory}` : null,
    `\tsummarizeBy: ${summarize}`,
    `\tsourceColumn: ${src}`,
    sortBy ? `\tsortByColumn: ${q(sortBy)}` : null,
    '', '\tannotation SummarizationSetBy = Automatic', '',
  ].filter((l) => l !== null).join('\n');
}
function mesure(table, [nom, expr, format, dossier, desc]) {
  const multi = expr.includes('\n');
  return [`/// ${desc}`,
    multi ? `measure ${q(nom)} =\n${indent(expr, 2)}` : `measure ${q(nom)} = ${expr}`,
    format ? `\tformatString: ${format}` : null,
    dossier ? `\tdisplayFolder: ${dossier}` : null,
    `\tlineageTag: ${uuid(table + '.m.' + nom)}`, '',
  ].filter((l) => l !== null).join('\n');
}
function table(nom, desc, colonnes, partition, mesures = []) {
  const corps = [...mesures.map((m) => mesure(nom, m)), ...colonnes,
    `partition ${q(nom)} = m\n\tmode: import\n\tsource =\n${indent(partition, 3)}\n`].join('\n');
  return `/// ${desc}\ntable ${q(nom)}\n\tlineageTag: ${uuid('table.' + nom)}\n\n${indent(corps, 1)}\n`;
}
const csv = (fichier, types, extra = '') => `let
    // Lecture du CSV produit par scripts/preparer_donnees.py
    Source = Csv.Document(File.Contents(#"Dossier données" & "${fichier}"), [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    #"Promoted headers" = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
    #"Changed types" = Table.TransformColumnTypes(#"Promoted headers", {${types}}, "en-US")${extra}
in
    #"Changed types"`;

const tables = {
  Prix: table('Prix', 'Prix de détail au kilo (franc CFA) par marché, produit et mois. Source : PAM, HDX. Un mois sans relevé reste absent, il n’est jamais rempli.', [
    colonne('Prix', 'cle_marche', 'cle_marche', 'string', { hidden: true }),
    colonne('Prix', 'produit', 'produit', 'string', { hidden: true }),
    colonne('Prix', 'mois', 'mois', 'dateTime', { hidden: true, format: 'yyyy-mm-dd' }),
    colonne('Prix', 'prix_kg', 'prix_kg', 'double', { hidden: true, format: '#,0.0' }),
    colonne('Prix', 'usd_kg', 'usd_kg', 'double', { hidden: true, format: '0.000' }),
    colonne('Prix', 'var_an', 'var_an', 'double', { hidden: true, format: '0.0 %' }),
    colonne('Prix', 'var_5ans', 'var_5ans', 'double', { hidden: true, format: '0.0 %' }),
  ], csv('prix.csv', '{"mois", type date}, {"prix_kg", type number}, {"usd_kg", type number}, {"var_an", type number}, {"var_5ans", type number}'), MESURES),
  Marché: table('Marché', 'Marchés suivis par le PAM, avec leur région, leur pays et leurs coordonnées.', [
    colonne('Marché', 'Marché', 'cle_marche', 'string', { key: true, desc: 'Marché et pays' }),
    colonne('Marché', 'Région', 'region', 'string'),
    colonne('Marché', 'code_pays', 'code_pays', 'string', { hidden: true }),
    colonne('Marché', 'latitude', 'latitude', 'double', { hidden: true, format: '0.00' }),
    colonne('Marché', 'longitude', 'longitude', 'double', { hidden: true, format: '0.00' }),
  ], csv('marches.csv', '{"latitude", type number}, {"longitude", type number}')),
  Mois: table('Mois', 'Un mois par ligne, de janvier 2010 au dernier mois publié.', [
    colonne('Mois', 'Libellé', 'libelle', 'string', { sortBy: 'Ordre', desc: 'Mois et année' }),
    colonne('Mois', 'Date du mois', 'mois', 'dateTime', { key: true, format: 'mmm yyyy', desc: 'Premier jour du mois (clé et axe continu des courbes)' }),
    colonne('Mois', 'Année', 'annee', 'int64', { format: '0' }),
    colonne('Mois', 'Mois', 'mois_nom', 'string', { sortBy: 'Numéro du mois' }),
    colonne('Mois', 'Numéro du mois', 'mois_num', 'int64', { hidden: true, format: '0' }),
    colonne('Mois', 'Ordre', 'ordre', 'int64', { hidden: true, format: '0' }),
  ], csv('mois.csv', '{"mois", type date}, {"annee", Int64.Type}, {"mois_num", Int64.Type}, {"ordre", Int64.Type}')),
  Produit: table('Produit', 'Cinq céréales suivies : mil, sorgho, maïs, riz importé, riz local.', [
    colonne('Produit', 'Produit', 'produit', 'string', { key: true, sortBy: 'Ordre produit' }),
    colonne('Produit', 'Ordre produit', 'ordre_produit', 'int64', { hidden: true, format: '0' }),
  ], csv('produits.csv', '{"ordre_produit", Int64.Type}')),
  Pays: table('Pays', 'Les 4 pays suivis.', [
    colonne('Pays', 'Code pays', 'code_pays', 'string', { key: true, hidden: true }),
    colonne('Pays', 'Pays', 'pays', 'string', { sortBy: 'Ordre pays', dataCategory: 'Country' }),
    colonne('Pays', 'Ordre pays', 'ordre_pays', 'int64', { hidden: true, format: '0' }),
  ], csv('pays.csv', '{"ordre_pays", Int64.Type}')),
};
const relations = [
  ['Prix', 'cle_marche', 'Marché', 'Marché'],
  ['Prix', 'mois', 'Mois', 'Date du mois'],
  ['Prix', 'produit', 'Produit', 'Produit'],
  ['Marché', 'code_pays', 'Pays', 'Code pays'],
];

fs.rmSync(path.join(DEF, 'tables'), { recursive: true, force: true });
fs.mkdirSync(path.join(DEF, 'tables'), { recursive: true });
for (const [nom, contenu] of Object.entries(tables)) fs.writeFileSync(path.join(DEF, 'tables', `${nom}.tmdl`), contenu);
fs.writeFileSync(path.join(DEF, 'relationships.tmdl'), relations.map(([ft, fc, tt, tc]) =>
  `relationship ${uuid(`rel.${ft}.${fc}`)}\n\tfromColumn: ${q(ft)}.${q(fc)}\n\ttoColumn: ${q(tt)}.${q(tc)}\n`).join('\n'));
fs.writeFileSync(path.join(DEF, 'expressions.tmdl'),
  `/// Dossier qui contient les CSV produits par scripts/preparer_donnees.py (terminé par une barre oblique inverse)\nexpression 'Dossier données' = "${DONNEES}" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]\n\tlineageTag: ${uuid('param.dossier')}\n\n\tannotation PBI_ResultType = Text\n`);
fs.writeFileSync(path.join(DEF, 'database.tmdl'), 'database\n\tcompatibilityLevel: 1702\n');
fs.writeFileSync(path.join(DEF, 'model.tmdl'), `model Model
	culture: fr-FR
	defaultPowerBIDataSourceVersion: powerBI_V3
	discourageImplicitMeasures
	sourceQueryCulture: fr-FR
	dataAccessOptions
		legacyRedirects
		returnErrorValuesAsNull

annotation PBI_QueryOrder = ["Dossier données","Prix","Marché","Mois","Produit","Pays"]

annotation PBI_ProTooling = ["DevMode"]

${Object.keys(tables).map((t) => `ref table ${q(t)}`).join('\n')}
`);
fs.writeFileSync(path.join(SM, 'definition.pbism'), JSON.stringify({
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
  version: '4.2', settings: { qnaEnabled: false },
}, null, 2));
fs.writeFileSync(path.join(SM, '.platform'), JSON.stringify({
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
  metadata: { type: 'SemanticModel', displayName: NOM }, config: { version: '2.0', logicalId: uuid('logical.model') },
}, null, 2));
console.log(JSON.stringify({ tables: Object.keys(tables), mesures: MESURES.length }));
