# Docker

[← README](../README.md)

Le conteneur utilise Node.js 24 et le compte `node` (UID/GID 1000). Le journal est monté en lecture seule. Par défaut, le port est publié sur `127.0.0.1:3000`.

## Démarrer

Depuis le répertoire du projet, avec Docker et le plugin Compose installés :

```sh
docker compose pull
docker compose up -d --no-build
```

Ouvrir [localhost:3000](http://127.0.0.1:3000).

L’image [`ghcr.io/sorway/apt-viewer:latest`](https://github.com/Sorway/apt-viewer/pkgs/container/apt-viewer) est publiée pour `linux/amd64` et `linux/arm64`. Le tag `latest` suit la branche `master` ; les tags Git `v*` publient aussi la version correspondante et chaque publication reçoit un tag `sha-…`.

Le répertoire `/var/log/apt-cacher-ng` doit exister sur la machine qui exécute Docker. Le dossier entier est monté pour que le lecteur retrouve le nouveau fichier après une rotation du journal.

## Configuration

Les variables suivantes peuvent être renseignées dans un fichier `.env` à la racine du projet :

```dotenv
APT_LOG_DIR=/var/log/apt-cacher-ng
APT_LOG_FILE=apt-cacher.log
APT_LOG_GID=1000
APT_VIEWER_PORT=3000
APT_VIEWER_HOSTNAME=apt-cache
```

| Variable | Rôle |
| :--- | :--- |
| `APT_LOG_DIR` | Répertoire des journaux sur l’hôte Docker |
| `APT_LOG_FILE` | Nom du fichier dans ce répertoire |
| `APT_LOG_GID` | Groupe supplémentaire autorisé à lire le journal |
| `APT_VIEWER_PORT` | Port publié sur la boucle locale de l’hôte |
| `APT_VIEWER_HOSTNAME` | Nom affiché dans la barre de navigation |

`POLL_MS`, `MAX_BYTES` et `MAX_EVENTS` sont également transmis au conteneur ; leurs valeurs sont décrites dans la [référence](reference.md#configuration).

Le conteneur écoute sur `0.0.0.0:3000` dans son réseau Docker, avec `ALLOW_REMOTE=true`. Le port publié reste limité à la boucle locale de l’hôte. Pour un accès réseau, placer un reverse proxy devant `127.0.0.1:3000`, comme dans le [guide Nginx](deployment.md#configurer-nginx).

## Permissions du journal

Le compte du conteneur doit pouvoir traverser le répertoire et lire le fichier. Sur Linux, relever le groupe et les permissions :

```sh
stat -c 'groupe=%g droits=%a %n' /var/log/apt-cacher-ng /var/log/apt-cacher-ng/apt-cacher.log
```

Si le groupe du journal dispose du droit de lecture, renseigner son GID dans `APT_LOG_GID`, puis recréer le conteneur :

```sh
docker compose up -d
docker compose exec apt-viewer sh -c 'id; test -r "$LOG_PATH" && echo "Journal lisible"'
```

Si le fichier reste illisible, accorder les droits de lecture au groupe choisi, y compris sur les nouveaux fichiers créés après rotation. Le [guide des permissions](deployment.md#autoriser-la-lecture-du-journal) détaille les ACL utilisables sur l’hôte.

## Démonstration

Cette variante monte le dossier `sample/` du projet. Elle fonctionne sans journal apt-cacher-ng local :

```sh
docker compose -f compose.yaml -f compose.demo.yaml up -d --no-build
```

Utiliser les mêmes fichiers Compose pour arrêter la démonstration :

```sh
docker compose -f compose.yaml -f compose.demo.yaml down
```

## Exploitation

```sh
docker compose ps
docker compose logs -f apt-viewer
docker compose down
```

Pour installer la dernière image publiée :

```sh
docker compose pull
docker compose up -d --no-build
```

Pour construire l’image à partir du code local :

```sh
docker compose build --pull
docker compose up -d
```

Le contrôle de santé appelle `/healthz`. Un conteneur `unhealthy` signale une erreur de lecture du journal ou un serveur qui ne répond pas ; consulter les logs et vérifier le montage et les permissions.

La CI vérifie le code, le démarrage Docker et l’installation Linux avant de publier l’image sur GHCR. La publication utilise le `GITHUB_TOKEN` du workflow, sans secret supplémentaire.

Documentation Docker : [montages de répertoires](https://docs.docker.com/engine/storage/bind-mounts/) et [configuration des services Compose](https://docs.docker.com/reference/compose-file/services/).
