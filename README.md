# DTI+ CIEL - Générateur de déclarations douanières

Génération automatique des fichiers DTI+ au format CIEL pour les petites brasseries françaises.

## Structure

```
├── output/          # Fichiers XML générés (DTI+ CIEL)
├── schema/          # Schéma XSD officiel des douanes
├── src/             # Scripts de génération
└── README.md
```

## Utilisation

### Générer les déclarations

```bash
cd src
node generate-final.js
```

Le script :
1. Récupère les données depuis l'API EasyBeer
2. Applique la réconciliation avec les stocks CIEL
3. Génère les fichiers XML au format DTI+ CIEL officiel

### Format de sortie

Les fichiers XML respectent le schéma `ciel-dti-plus_v1.0.24.xsd` des douanes françaises :
- Namespace : `http://douane.finances.gouv.fr/app/ciel/dtiplus/v1`
- 15 produits CIEL déclarés
- Régularisations en `autres-sorties` (sans taxe)
- Ventes en `sorties-avec-paiement-annee-courante`

## Configuration

1. Copier le fichier d'environnement :
```bash
cp .env.example .env
```

2. Renseigner les credentials dans `.env` :
```
EASYBEER_API_USER=votre_user
EASYBEER_API_PASS=votre_password
AGREMENT=FRXXXXXXXXXX
```

3. Optionnel : modifier le mapping des produits CIEL dans `src/generate-final.js`

## Fichiers générés

- `output/YYYY-MM.xml` : DTI+ mensuelle

## Dépendances

- Node.js 18+
- Accès API EasyBeer

## Licence

Usage privé - BroBrew
