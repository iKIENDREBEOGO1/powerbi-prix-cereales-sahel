"""Télécharge les prix de détail du PAM (WFP Food Prices) dans brut/ (HDX, licence CC BY-IGO).

Jeux de données : Burkina Faso, Mali, Niger, Tchad (https://data.humdata.org/dataset/wfp-food-prices-for-<pays>).
Usage : python scripts/telecharger_donnees.py
"""
import json
import urllib.request
from pathlib import Path

BRUT = Path(__file__).resolve().parent.parent / 'brut'
BRUT.mkdir(exist_ok=True)

for slug in ['burkina-faso', 'mali', 'niger', 'chad']:
    api = f'https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-{slug}'
    with urllib.request.urlopen(api) as r:
        ressources = json.load(r)['result']['resources']
    prix = [x for x in ressources if x['name'].endswith('Food Prices') and x['format'].upper() == 'CSV']
    assert prix, f'fichier de prix introuvable pour {slug}'
    print('téléchargement', slug)
    urllib.request.urlretrieve(prix[0]['url'], BRUT / f'{slug}_prix.csv')
