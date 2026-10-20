# Référence

[← README](../README.md)

## Configuration

Les paramètres sont lus depuis `.env`. Le fichier [`.env.example`](../.env.example) fournit la configuration de départ.

| Variable | Par défaut | Description |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | Adresse d’écoute |
| `PORT` | `3000` | Port HTTP |
| `LOG_PATH` | `/var/log/apt-cacher-ng/apt-cacher.log` | Journal à lire |
| `POLL_MS` | `5000` | Intervalle de lecture, en millisecondes |
| `MAX_BYTES` | `16777216` | Fenêtre de lecture : 16 Mio |
| `MAX_EVENTS` | `50000` | Nombre maximal d’événements en mémoire |
| `DEMO` | `false` | Affiche le bandeau de démonstration |
| `ALLOW_REMOTE` | `false` | Autorise une écoute hors de la boucle locale |

L’accès réseau se configure avec un reverse proxy. Le [guide de déploiement](deployment.md) fournit une configuration Nginx avec TLS et authentification.

Les dates sont affichées en **Europe/Paris**. Les champs de période utilisent **UTC**. Le nom du serveur affiché est son hostname système.

## Lecture du journal

Par défaut, le lecteur relit les **16 Mio finaux** du fichier toutes les **5 secondes** et conserve jusqu’à **50 000 événements** en mémoire.

- Les rotations et les troncatures du fichier courant sont prises en compte.
- Les archives `.1` et `.gz` ne sont pas chargées.
- Si la lecture échoue, le dernier état disponible reste affiché avec l’erreur.
- Les noms de clients viennent du DNS inverse. Sans résultat, l’IP reste affichée.

## Format des lignes

```text
timestamp|direction|octets|IP|ressource
```

| Direction | Signification |
| :--- | :--- |
| `I` | Reçu de l’amont |
| `O` | Envoyé aux clients |
| `E` | Erreur, avec son motif et un éventuel code HTTP |

```text
1792503600|O|1048576|192.0.2.10|deb.debian.org/debian/pool/package.deb
1792503601|E|640|192.0.2.11|deb.debian.org/debian/dists/stable/InRelease [HTTP error, code: 503]
```

Les statistiques comptent les événements du journal. Le format I/O ne fournit pas de taux exact de hits/misses. Les erreurs sont séparées des volumes transférés.

## API

| Route | Réponse |
| :--- | :--- |
| `GET /api/dashboard` | Statistiques et transferts paginés |
| `GET /api/failures` | Échecs paginés et nombre d’erreurs avec un code HTTP |
| `GET /api/client-names` | Correspondances IP → nom DNS |
| `GET /healthz` | `200` si le journal est lisible, `503` sinon |

`/healthz` indique l’état du lecteur de journal, pas celui du service apt-cacher-ng.

### Filtres

| Paramètre | Valeur |
| :--- | :--- |
| `ip` | Adresse IP exacte |
| `endpoint` | Dépôt exact |
| `q` | Recherche dans la ressource et, pour les échecs, dans le motif |
| `from`, `to` | Bornes de période inclusives ; UTC si aucune zone n’est précisée |
| `page` | Numéro de page, à partir de `1` ; 50 résultats par page |
| `direction` | `I` ou `O`, sur `/api/dashboard` |
| `code` | Code HTTP d’erreur, ou `unknown`, sur `/api/failures` |

```http
GET /api/dashboard?ip=192.0.2.10&direction=O&page=1
GET /api/failures?code=503
GET /api/failures?code=unknown&q=timed%20out
```

Les volumes et les graphiques couvrent toute la sélection filtrée, indépendamment de la pagination. Les graphiques regroupent les clients ou destinations après les sept premiers dans « Autres ».
