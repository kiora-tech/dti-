# DTI+ CIEL - EasyBeer → Douanes

Interface web pour generer automatiquement les fichiers DTI+ au format CIEL a partir des donnees EasyBeer, pour les petites brasseries francaises.

## Fonctionnalites

- Connexion a l'API EasyBeer avec vos identifiants
- Configuration des produits CIEL (nom, TAV, stock initial, libelle fiscal)
- Generation des declarations DTI+ mensuelles au format XML
- Telechargement en ZIP
- **Aucun stockage des identifiants** : vos credentials sont utilises uniquement en memoire le temps de la generation

## Demarrage rapide (Docker)

```bash
docker compose up -d
```

Ouvrir http://localhost:3000 dans votre navigateur.

1. Entrer vos identifiants API EasyBeer
2. Configurer vos produits CIEL (ou utiliser les produits par defaut)
3. Selectionner la periode de generation
4. Cliquer sur "Generer les fichiers DTI+"
5. Le ZIP contenant les fichiers XML se telecharge automatiquement

### Sans Docker

```bash
npm install
npm start
```

### Ligne de commande (legacy)

```bash
cp .env.example .env
# Editer .env avec vos credentials
npm run generate
```

## Securite

- Les identifiants API ne sont **jamais stockes** sur le serveur
- Ils transitent uniquement en memoire durant la requete HTTP
- La configuration des produits peut etre sauvegardee localement dans le navigateur (sans les identifiants)
- Communication avec EasyBeer en HTTPS

## Structure

```
├── public/           # Interface web (HTML/CSS/JS)
├── src/
│   ├── server.js     # Serveur Express
│   ├── generator.js  # Logique de generation (module reutilisable)
│   └── generate-final.js  # Script CLI (legacy)
├── schema/           # Schema XSD officiel des douanes
└── output/           # Fichiers generes (CLI uniquement, git-ignored)
```

## Licence

MIT - [Kiora Tech](https://github.com/kiora-tech)
