# apt-viewer

<p align="center">
  <a href="#démarrage">Démarrage</a> &nbsp;·&nbsp;
  <a href="#configuration">Configuration</a> &nbsp;·&nbsp;
  <a href="docs/deployment.md">Déploiement</a> &nbsp;·&nbsp;
  <a href="docs/reference.md">Référence</a>
</p>

**apt-viewer** affiche l’activité d’**apt-cacher-ng** : clients, dépôts, volumes transférés et erreurs HTTP.

![Vue d’ensemble d’apt-viewer en thème sombre](docs/images/overview.png)

<details>
<summary>Voir la page des échecs</summary>

![Page des échecs avec codes HTTP et motifs](docs/images/failures.png)

</details>

## Dans l’interface

- **Vue d’ensemble** — volumes et répartition de l’activité par client et destination.
- **Clients et dépôts** — volumes entrants et sortants, noms DNS et dernière activité.
- **Activité** — transferts et ressources, avec recherche et filtres.
- **Échecs** — codes HTTP, motifs et ressources concernées.

Recherche par IP ou nom DNS, filtres par période, thèmes clair et sombre, actualisation automatique toutes les 15 secondes.

## Démarrage

```sh
git clone https://github.com/Sorway/apt-viewer.git
cd apt-viewer
```

### Docker

L’image est publiée sur [GitHub Container Registry](https://github.com/Sorway/apt-viewer/pkgs/container/apt-viewer) pour **amd64** et **arm64**.

```sh
docker compose pull
docker compose up -d --no-build
```

Ouvrir **[localhost:3000](http://127.0.0.1:3000)**. Le répertoire `/var/log/apt-cacher-ng` du serveur est monté en lecture seule.

Pour essayer avec les données de démonstration :

```sh
docker compose -f compose.yaml -f compose.demo.yaml up -d --no-build
```

[Configuration Docker, permissions et commandes →](docs/docker.md)

### Linux — Debian / Ubuntu

Sur la machine qui héberge apt-cacher-ng :

```sh
sudo bash install.sh
```

Ou sans cloner le dépôt :

```sh
curl -fL https://raw.githubusercontent.com/Sorway/apt-viewer/master/install.sh -o install.sh
sudo bash install.sh
```

Le script installe **Node.js 24**, le compte `apt-viewer`, les droits de lecture du journal et le service **systemd**. L’application est installée dans `/opt/apt-viewer` et écoute sur **[localhost:3000](http://127.0.0.1:3000)**.

La configuration se trouve dans `/etc/apt-viewer.env`. Pour mettre à jour, relancer le script : la configuration est conservée et la version précédente sauvegardée.

[Configuration du service et Nginx →](docs/deployment.md)

## Configuration

| Variable | Par défaut |
| :--- | :--- |
| `HOST` | `127.0.0.1` |
| `PORT` | `3000` |
| `LOG_PATH` | `/var/log/apt-cacher-ng/apt-cacher.log` |

L’application lit directement le journal et conserve les données en mémoire. Aucune base de données à configurer.

Les limites de lecture, le rafraîchissement et les autres options sont détaillés dans la [référence](docs/reference.md#configuration).

## Déploiement

Le guide [**Docker Compose**](docs/docker.md) couvre le montage des journaux, les permissions et les mises à jour de l’image.

Le guide [**Debian / Ubuntu**](docs/deployment.md) couvre l’installation, les permissions du journal, systemd et Nginx avec TLS et authentification.

## API

| Route | Contenu |
| :--- | :--- |
| `GET /api/dashboard` | Statistiques et transferts paginés |
| `GET /api/failures` | Échecs et codes HTTP |
| `GET /api/client-names` | Noms DNS des clients |
| `GET /healthz` | État de lecture du journal |

[Filtres, exemples et format des journaux →](docs/reference.md)

## Développement

Avec Node.js 24 et npm :

```sh
npm ci
npm run demo
```

La démonstration utilise les journaux de [`sample/`](sample/). Pour utiliser un autre journal, copier `.env.example` vers `.env`, adapter `LOG_PATH`, puis lancer `npm start`.

## Licence

[MIT](LICENSE).
