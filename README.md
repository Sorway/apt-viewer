<p align="center">
  <img src="public/brand/banner.svg" alt="apt-viewer — Tableau de bord pour apt-cacher-ng" width="840">
</p>

[![CI](https://github.com/Sorway/apt-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/Sorway/apt-viewer/actions/workflows/ci.yml)

<p align="center">
  <a href="#démarrage">Démarrage</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#api">API</a> ·
  <a href="docs/deployment.md">Déploiement</a>
</p>

**apt-viewer** affiche les clients, les dépôts, les transferts et les erreurs à partir des journaux d’**apt-cacher-ng**.

Node.js · Express · EJS · CSS et JavaScript sans framework frontend.

## Les pages

| Page | Contenu |
| --- | --- |
| **Vue d’ensemble** | Volumes transférés, clients observés, camemberts des clients et des destinations. |
| **Clients** | IP, noms DNS, volumes entrants et sortants, dernière activité. |
| **Dépôts** | Volumes et événements par destination. |
| **Activité** | Transferts récents avec date, client, flux, volume et ressource. |
| **Échecs** | Erreurs HTTP et motifs enregistrés dans le journal. |

- Recherche de clients par IP ou nom DNS, filtres par dépôt, flux, ressource et période.
- Pourcentages et valeurs au survol des camemberts ; clic sur un client ou un dépôt pour ouvrir son activité.
- Pagination sans rechargement complet, avec conservation de la position de défilement.
- Thèmes clair et sombre, navigation mobile et actualisation automatique facultative toutes les 15 secondes.

## Démarrage

**Prérequis : Node.js 22.9 ou supérieur et npm.** Aucun build à lancer.

```sh
npm ci
npm test
npm run demo
```

Ouvrir **[localhost:3000](http://127.0.0.1:3000)**.

La démonstration utilise les fichiers de [`sample/`](sample/) et des données synthétiques.

### Utiliser ses journaux

Arrêter la démonstration, puis créer la configuration :

```sh
cp .env.example .env
```

Sous PowerShell : `Copy-Item .env.example .env`.

Renseigner le chemin du fichier dans `.env` :

```dotenv
LOG_PATH=/var/log/apt-cacher-ng/apt-cacher.log
```

Le compte qui lance l’application doit pouvoir lire ce fichier.

```sh
npm start
```

Le nom du serveur affiché dans l’interface est son hostname système.

## Configuration

Les paramètres sont lus depuis `.env`. Le fichier [`.env.example`](.env.example) fournit la configuration de départ.

| Variable | Valeur par défaut | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Adresse d’écoute. |
| `PORT` | `3000` | Port HTTP. |
| `LOG_PATH` | `/var/log/apt-cacher-ng/apt-cacher.log` | Journal local à lire. |
| `POLL_MS` | `5000` | Intervalle de lecture du journal, en millisecondes. |
| `MAX_BYTES` | `16777216` | Taille maximale de la fenêtre lue : 16 Mio. |
| `MAX_EVENTS` | `50000` | Nombre maximal d’événements conservés en mémoire. |
| `DEMO` | `false` | Affiche le bandeau de démonstration. |
| `ALLOW_REMOTE` | `false` | Autorise une écoute hors de la boucle locale. |

Les dates sont affichées en **Europe/Paris**. Les champs de période des filtres utilisent **UTC**.

## Journaux

Le lecteur accepte ce format :

```text
timestamp|direction|octets|IP|ressource
```

| Direction | Signification |
| --- | --- |
| `I` | Données reçues de l’amont. |
| `O` | Données envoyées aux clients. |
| `E` | Erreur, avec son motif et un code HTTP lorsqu’il est présent. |

Exemple d’erreur :

```text
1792503600|E|640|192.0.2.11|archive.ubuntu.com/ubuntu/dists/noble/InRelease [HTTP error, code: 503]
```

Les statistiques comptent les événements du journal. Le format I/O ne fournit pas de taux exact de hits/misses. Les erreurs sont séparées des transferts.

Par défaut, l’application relit les **16 Mio finaux** du fichier courant et conserve jusqu’à **50 000 événements**. Elle gère la rotation et la troncature du fichier ; les archives `.1` et `.gz` ne sont pas chargées. Les données restent en mémoire, sans base de données.

Les noms de clients proviennent du DNS inverse du serveur. Sans résultat DNS, l’adresse IP reste affichée.

## API

| Route | Réponse |
| --- | --- |
| `GET /api/dashboard` | Statistiques et transferts paginés. |
| `GET /api/failures` | Échecs paginés et codes HTTP. |
| `GET /api/client-names` | Correspondances IP → nom DNS. |
| `GET /healthz` | `200` si le journal est lisible, `503` sinon. |

Les filtres acceptés sont `ip`, `endpoint`, `q`, `from`, `to` et `page`, plus `direction=I` ou `direction=O` pour les transferts ou `code=503` / `code=unknown` pour les échecs.

```http
GET /api/dashboard?ip=192.0.2.10&direction=O&page=1
GET /api/failures?code=503
```

La santé concerne le lecteur de journal, pas l’état du service apt-cacher-ng.

## Déploiement

L’application écoute sur la boucle locale par défaut. Pour un accès depuis le réseau, utiliser un reverse proxy avec TLS et authentification : l’application ne possède pas d’écran de connexion.

Le guide [**Déploiement Debian / Ubuntu**](docs/deployment.md) contient les commandes d’installation, les permissions des journaux, l’unité systemd et la configuration Nginx.

## Développement

```sh
npm test
```

Les tests couvrent le parsing, les volumes, les erreurs, les filtres, le DNS, la rotation des journaux, les camemberts et les interactions de l’interface.

La [CI GitHub Actions](https://github.com/Sorway/apt-viewer/actions/workflows/ci.yml) lance ces tests sous Node.js 24 à chaque push et pull request. Elle peut aussi être lancée manuellement depuis l’onglet Actions.

| Dossier | Rôle |
| --- | --- |
| [`src/`](src/) | Serveur HTTP, lecture et analyse des journaux. |
| [`views/`](views/) | Pages EJS et composants partagés. |
| [`public/`](public/) | Styles, scripts et [logo SVG](public/brand/logo.svg). |
| [`test/`](test/) | Tests Node.js. |
| [`deploy/`](deploy/) | Exemples systemd et Nginx. |

## Licence

[MIT](LICENSE).
