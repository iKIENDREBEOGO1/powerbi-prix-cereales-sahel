"""Prépare les données du rapport « Prix des céréales au Sahel central » (PAM, HDX).

Source : WFP Food Prices (Burkina Faso, Mali, Niger, Tchad) sur HDX, licence CC BY-IGO.
Sorties dans donnees/ : prix.csv (marché x produit x mois), marches.csv, mois.csv, produits.csv, pays.csv.

Règles :
- Prix de détail seulement (Retail), unités KG ou 100 KG ramenées au kg ; XOF et XAF sont à parité (franc CFA).
- 5 produits : mil, sorgho (blanc, rouge, sans précision), maïs (blanc, sans précision), riz importé, riz local.
- Depuis janvier 2010. Un marché-produit-mois = moyenne des relevés du mois.
- var_an = prix / prix du même mois un an plus tôt - 1 ; var_5ans = prix / moyenne du même mois des 5 années
  précédentes (au moins 3 années disponibles) - 1. Jamais d'interpolation : un mois sans relevé reste absent.
- Contrôles : aucun prix nul ou négatif ; pas de doublon marché-produit-mois.
"""
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
BRUT = BASE / 'brut'
OUT = BASE / 'donnees'
OUT.mkdir(exist_ok=True)

PAYS = {'burkina-faso': ('BF', 'Burkina Faso'), 'mali': ('ML', 'Mali'), 'niger': ('NE', 'Niger'), 'chad': ('TD', 'Tchad')}
PRODUITS = {
    'Millet': 'Mil', 'Sorghum': 'Sorgho', 'Sorghum (white)': 'Sorgho', 'Sorghum (red)': 'Sorgho',
    'Maize': 'Maïs', 'Maize (white)': 'Maïs', 'Rice (imported)': 'Riz importé', 'Rice (local)': 'Riz local',
}
ORDRE = ['Mil', 'Sorgho', 'Maïs', 'Riz importé', 'Riz local']
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

frames = []
marches = []
for slug, (code, nom) in PAYS.items():
    d = pd.read_csv(BRUT / f'{slug}_prix.csv', encoding='utf-8', skiprows=[1])
    d['code_pays'] = code
    frames.append(d)
d = pd.concat(frames, ignore_index=True)
d['date'] = pd.to_datetime(d['date'], errors='coerce')
d = d[(d.pricetype == 'Retail') & d.commodity.isin(PRODUITS) & d.unit.isin(['KG', '100 KG']) & (d.date >= '2010-01-01')].copy()
d['prix_kg'] = np.where(d.unit == '100 KG', d.price / 100, d.price)
d['usd_kg'] = np.where(d.unit == '100 KG', d.usdprice / 100, d.usdprice)
d['produit'] = d.commodity.map(PRODUITS)
assert (d.prix_kg > 0).all(), 'prix nul ou négatif'
d['mois'] = d.date.dt.to_period('M').dt.to_timestamp()
d['cle_marche'] = d.market.str.strip() + ' (' + d.code_pays + ')'

# Un marché-produit-mois = moyenne des relevés
g = d.groupby(['cle_marche', 'code_pays', 'produit', 'mois'], as_index=False).agg(prix_kg=('prix_kg', 'mean'), usd_kg=('usd_kg', 'mean'))
assert not g.duplicated(['cle_marche', 'produit', 'mois']).any()

# Variations : sur un an et par rapport à la moyenne des 5 années précédentes (même mois)
g = g.sort_values(['cle_marche', 'produit', 'mois']).reset_index(drop=True)
import warnings; warnings.filterwarnings('ignore', category=RuntimeWarning)
g['annee'] = g.mois.dt.year
g['m'] = g.mois.dt.month
key = g.set_index(['cle_marche', 'produit', 'annee', 'm']).prix_kg
idx = pd.MultiIndex.from_arrays([g.cle_marche, g.produit, g.annee - 1, g.m])
g['prix_an_avant'] = key.reindex(idx).to_numpy()
prev = []
for k in range(1, 6):
    idx = pd.MultiIndex.from_arrays([g.cle_marche, g.produit, g.annee - k, g.m])
    prev.append(key.reindex(idx).to_numpy())
prev = np.vstack(prev).T
n = np.sum(~np.isnan(prev), axis=1)
moy = np.where(n >= 3, np.nanmean(np.where(np.isnan(prev), np.nan, prev), axis=1), np.nan)
g['prix_moy_5ans'] = moy
g['var_an'] = g.prix_kg / g.prix_an_avant - 1
g['var_5ans'] = g.prix_kg / g.prix_moy_5ans - 1
# Valeurs aberrantes de saisie : écart de plus de 5 fois le prix de référence -> variation laissée vide
for c in ['var_an', 'var_5ans']:
    g.loc[g[c].abs() > 4, c] = np.nan

g['mois'] = g.mois.dt.strftime('%Y-%m-%d')
g[['cle_marche', 'produit', 'mois', 'prix_kg', 'usd_kg', 'var_an', 'var_5ans']].round(4).to_csv(OUT / 'prix.csv', index=False, encoding='utf-8')

# Marchés
m = d.sort_values('date').groupby('cle_marche').agg(
    marche=('market', 'last'), code_pays=('code_pays', 'last'), region=('admin1', 'last'), latitude=('latitude', 'last'), longitude=('longitude', 'last'),
    dernier_mois=('mois', 'max')).reset_index()
m['marche'] = m.marche.str.strip()
m['region'] = m.region.astype(str).str.title()
m['pays'] = m.code_pays.map({v[0]: v[1] for v in PAYS.values()})
m['dernier_mois'] = pd.to_datetime(m.dernier_mois).dt.strftime('%Y-%m-%d')
m.to_csv(OUT / 'marches.csv', index=False, encoding='utf-8')

# Mois
deb, fin = pd.Timestamp('2010-01-01'), pd.to_datetime(g.mois).max()
rng = pd.date_range(deb, fin, freq='MS')
pd.DataFrame({
    'mois': rng.strftime('%Y-%m-%d'), 'annee': rng.year, 'mois_num': rng.month,
    'mois_nom': [MOIS[x - 1] for x in rng.month], 'libelle': [f'{MOIS[x.month - 1].capitalize()} {x.year}' for x in rng],
    'libelle_court': [f'{MOIS[x.month - 1][:4]}. {str(x.year)[2:]}' for x in rng], 'ordre': range(1, len(rng) + 1),
}).to_csv(OUT / 'mois.csv', index=False, encoding='utf-8')

pd.DataFrame({'produit': ORDRE, 'ordre_produit': range(1, 6)}).to_csv(OUT / 'produits.csv', index=False, encoding='utf-8')
pd.DataFrame([{'code_pays': v[0], 'pays': v[1], 'ordre_pays': i + 1} for i, v in enumerate(PAYS.values())]).to_csv(OUT / 'pays.csv', index=False, encoding='utf-8')

# Contrôles et résumé
print('lignes', len(g), 'marchés', g.cle_marche.nunique(), 'période', g.mois.min(), g.mois.max())
print(g.groupby(['produit']).agg(lignes=('prix_kg', 'size'), marches=('cle_marche', 'nunique'), prix_moyen=('prix_kg', 'mean')).round(0))
last = g[g.mois == g.mois.max()]
print('dernier mois', g.mois.max(), 'marchés', last.cle_marche.nunique())
for p, c in [('Mil', None)]:
    x = g[(g.produit == 'Mil') & (g.mois == '2026-08-01')]
    print(x.groupby('code_pays').agg(n=('prix_kg', 'size'), prix=('prix_kg', 'mean'), var_an=('var_an', 'mean'), var5=('var_5ans', 'mean')).round(3))
print('marchés sans coordonnées', m[['latitude', 'longitude']].isna().any(axis=1).sum())
