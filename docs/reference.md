# Référence

[README](../README.md) · [Déploiement](deployment.md)

## Configuration

Le service systemd lit `/etc/apt-viewer.env`. En local, `npm start` charge `.env`. Le fichier [`.env.example`](../.env.example) contient les options courantes.

| Variable | Valeur par défaut | Usage |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Adresse d’écoute HTTP |
| `PORT` | `3000` | Port HTTP, de `1` à `65535` |
| `LOG_PATH` | `/var/log/apt-cacher-ng/apt-cacher.log` | Chemin du journal |
| `POLL_MS` | `5000` | Intervalle de lecture en ms, de `1000` à `60000` |
| `MAX_BYTES` | `16777216` | Octets lus en fin de fichier, de `1024` à `67108864` |
| `MAX_EVENTS` | `50000` | Événements conservés en mémoire, de `1` à `200000` |
| `ALLOW_REMOTE` | `false` | Autorise une adresse d’écoute autre que `127.0.0.1`, `::1` ou `localhost` si la valeur est `true` |

Le nom du serveur affiché est son hostname système. Les dates sont affichées en `Europe/Paris` ; les champs de période utilisent UTC.

## Langues

Le français est la langue par défaut. Le sélecteur de langue conserve la préférence dans un cookie et garde la page, les filtres et le tri actuels.

Les fichiers [`languages/fr.lang`](../languages/fr.lang) et [`languages/en.lang`](../languages/en.lang) sont des objets JSON en UTF-8. Chaque clé correspond à un texte de l’interface. Les valeurs peuvent contenir des paramètres comme `{count}` ou `{version}`.

Pour ajouter une langue, copier `fr.lang` vers un fichier portant un code de deux lettres, puis traduire ses valeurs. `_name` est le nom affiché et `_locale` définit le format des nombres et des dates. Les clés absentes utilisent le texte français. Redémarrer le serveur après une modification des fichiers `.lang`.

Les ressources et les motifs issus du journal gardent leur texte d’origine. Les heures restent affichées dans le fuseau `Europe/Paris`.

## Lecture du journal

Le lecteur relit la fin du fichier toutes les 5 secondes : au maximum 16 Mio et 50 000 événements avec les réglages par défaut. Les données restent en mémoire.

Les rotations et les troncatures du journal courant sont prises en compte. Les archives `.1` et `.gz` ne sont pas chargées. En cas d’échec de lecture, les dernières données restent disponibles avec un état d’erreur.

Les périodes 1 h, 24 h et 7 jours filtrent les données chargées. La durée disponible dépend du journal courant et des limites de lecture.

Les noms des clients proviennent du DNS inverse. L’adresse IP reste affichée si la résolution échoue.

## Format du journal

```text
timestamp|direction|octets|IP|ressource
```

Le timestamp est exprimé en secondes Unix. Les lignes incomplètes ou invalides sont ignorées lors de la lecture ; une dernière ligne encore en cours d’écriture est relue au prochain passage.

| Direction | Contenu |
| --- | --- |
| `I` | Données reçues de l’amont |
| `O` | Données envoyées aux clients |
| `E` | Erreur, avec un motif et éventuellement un code HTTP |

```text
1792503600|O|1048576|192.0.2.10|deb.debian.org/debian/pool/package.deb
1792503601|E|640|192.0.2.11|deb.debian.org/debian/dists/stable/InRelease [HTTP error, code: 503]
```

Les codes HTTP sont extraits du motif `HTTP error, code: ...`. Une erreur peut donc apparaître sans code HTTP.

## Mesures et graphiques

| Mesure | Calcul |
| --- | --- |
| Téléchargements amont | Somme des octets des lignes `I` |
| Transferts vers les clients | Somme des octets des lignes `O` |
| Répartition par client ou dépôt | Nombre d’événements `I` et `O` |
| Erreurs | Nombre de lignes `E` |

Les camemberts affichent les sept premiers clients ou dépôts ; les suivants sont regroupés dans « Autres ». La courbe montre les octets entrants et sortants par intervalle, avec une échelle séparée pour le nombre d’erreurs.

Les statistiques et les graphiques couvrent tous les résultats filtrés, y compris ceux des autres pages du tableau. Le journal ne permet pas de calculer un taux exact de hits et de misses.

## API

### Erreurs regroupées et fiches

Un groupe réunit les erreurs ayant le même code HTTP, la même ressource et le même motif, tous clients confondus. Il contient le nombre d’occurrences, les clients concernés, la première et la dernière apparition. Le regroupement est effectué après les filtres et avant la pagination.

`/failures` affiche les groupes par défaut. `view=events` affiche les lignes du journal ; `error` limite cette vue à un groupe précis.

Les pages `/clients/:ip` et `/endpoints/:depot` réunissent les volumes, la courbe d’activité, les erreurs et les transferts de l’identifiant demandé. Les valeurs dans le chemin doivent être encodées dans l’URL. Les fiches acceptent les mêmes filtres de période et de ressource que la page Activité.

### Vérification des mises à jour

Le serveur interroge `GET https://api.github.com/repos/Sorway/apt-viewer/releases/latest` et compare le tag de la dernière release stable à la version installée. Les tags acceptés sont `vX.Y.Z` et `X.Y.Z` ; les brouillons et préversions sont ignorés. Un commit ou un tag sans release publiée ne déclenche pas la bannière.

Le résultat est mis en cache pendant une heure, avec un délai de réponse maximal de 5 secondes. Une panne réseau ou une limite de l’API conserve la dernière version connue, accompagnée de l’erreur. Une réponse `404` signifie qu’aucune release stable n’est disponible : `latest` et `releaseUrl` valent alors `null`, et `available` vaut `false`.

```json
{
  "current": "1.0.0",
  "latest": "1.1.0",
  "releaseUrl": "https://github.com/Sorway/apt-viewer/releases/tag/v1.1.0",
  "available": true,
  "checkedAt": "2026-10-21T10:00:00.000Z",
  "lastSuccessAt": "2026-10-21T10:00:00.000Z",
  "error": null,
  "httpStatus": 200
}
```

`checkedAt` indique la fin de la dernière tentative, `lastSuccessAt` le dernier contrôle réussi, y compris une réponse `404`. Les deux dates sont au format ISO 8601 et valent `null` avant le premier contrôle. `httpStatus` contient le statut GitHub, ou `null` si aucune réponse n’a été reçue.

`error` vaut `null`, `NETWORK`, `TIMEOUT`, `RATE_LIMIT`, `HTTP_ERROR`, `INVALID_RESPONSE` ou `INVALID_RELEASE`. Le menu **Mise à jour** affiche la date du contrôle et un message traduit correspondant à cette erreur. Ouvrir le menu consulte l’état du serveur sans contourner son cache d’une heure.

### Routes

| Route | Réponse |
| --- | --- |
| `GET /api/dashboard` | Filtres, tri, état du lecteur, statistiques, courbe et transferts paginés |
| `GET /api/failures` | Filtres, tri, état du lecteur, échecs paginés et nombre d’échecs avec un code HTTP |
| `GET /api/failure-groups` | Échecs regroupés et paginés : `id`, `count`, `clients`, `clientCount`, `first`, `last`, code, ressource et motif ; `total` compte les occurrences, `groupTotal` les groupes |
| `GET /api/client-names` | Objet associant les adresses IP aux noms DNS disponibles |
| `GET /api/version` | Versions, notes de release, disponibilité, dates de contrôle et erreur GitHub éventuelle |
| `GET /healthz` | `200` avec `{"ok":true}` si le journal est lisible ; `503` avec `{"ok":false}` sinon |

`/healthz` contrôle la lecture du journal. Il ne vérifie pas le service apt-cacher-ng.

### Filtres et pagination

Ces paramètres s’utilisent sur `/api/dashboard` et `/api/failures`, ainsi que sur les pages de l’interface.

| Paramètre | Valeurs |
| --- | --- |
| `ip` | Adresse IP exacte |
| `endpoint` | Nom exact du dépôt |
| `q` | Recherche dans la ressource et le motif de l’erreur, sans distinction de casse |
| `from`, `to` | Dates inclusives ; les dates au format `YYYY-MM-DDTHH:mm` sont interprétées en UTC |
| `period` | `1h`, `24h` ou `7d`, à partir de l’heure du serveur ; `from` ou `to` prend la priorité |
| `direction` | `I` ou `O`, pour les transferts |
| `code` | Code de `400` à `599`, ou `unknown` pour les erreurs sans code ; réservé aux échecs |
| `error` | Identifiant `id` d’un groupe renvoyé par `/api/failure-groups`, pour filtrer les erreurs |
| `view` | `groups` ou `events`, sur la page `/failures` |
| `page` | Numéro de page à partir de `1`, avec 50 résultats par page |
| `sort` | Colonne selon la page, voir ci-dessous |
| `order` | `asc` ou `desc` |

Les dates et les tris invalides renvoient le statut `400`. Le tri s’applique avant la pagination.

### Colonnes de tri

| Page ou route | Colonnes | Tri par défaut |
| --- | --- | --- |
| Vue d’ensemble, Activité, `/api/dashboard` | `time`, `ip`, `direction`, `bytes`, `resource` | `time`, décroissant |
| Clients et Dépôts | `name`, `in`, `out`, `count`, `last` | `out`, décroissant |
| Événements d’échec, `/api/failures` | `time`, `ip`, `statusCode`, `resource`, `reason` | `time`, décroissant |
| Erreurs regroupées, `/api/failure-groups` | `count`, `clientCount`, `statusCode`, `resource`, `reason`, `first`, `last` | `last`, décroissant |

Les codes HTTP absents restent en fin de liste dans les deux sens de tri.

### Exemples

```sh
curl 'http://127.0.0.1:3000/api/dashboard?ip=192.0.2.10&direction=O'
curl 'http://127.0.0.1:3000/api/dashboard?period=24h&sort=bytes&order=desc'
curl 'http://127.0.0.1:3000/api/failures?code=503'
curl 'http://127.0.0.1:3000/api/failure-groups?code=503&sort=count&order=desc'
curl 'http://127.0.0.1:3000/api/failures?code=unknown&q=timed%20out'
```
