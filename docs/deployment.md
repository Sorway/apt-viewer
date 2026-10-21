# Déployer apt-viewer

Installation sur Debian ou Ubuntu avec systemd, pour les architectures x86_64 et arm64. Le journal apt-cacher-ng doit déjà exister sur la machine.

## Installer l’application

```sh
curl -fL https://raw.githubusercontent.com/Sorway/apt-viewer/master/install.sh -o install.sh
sudo bash install.sh
```

Depuis un clone du dépôt, utiliser directement `sudo bash install.sh`.

Le script installe les dépendances système, une copie de Node.js 24 dans `/opt/apt-viewer/runtime`, le compte `apt-viewer` et le service systemd. L’archive Node.js est vérifiée avec la somme SHA-256 publiée par Node.js.

Il configure les droits de lecture du journal, démarre le service et vérifie `/healthz`. Ouvrir [localhost:3000](http://127.0.0.1:3000) depuis le serveur, ou utiliser le tunnel SSH décrit plus bas.

## Configuration

Le fichier `/etc/apt-viewer.env` est créé à la première installation. Pour modifier le port ou le journal :

```sh
sudoedit /etc/apt-viewer.env
sudo systemctl restart apt-viewer
```

Si le journal n’existe pas au chemin par défaut, le script s’arrête après avoir créé la configuration. Adapter `LOG_PATH`, puis relancer l’installation pour appliquer les permissions.

Les fichiers sous `/opt/apt-viewer` appartiennent à `root`. Le compte applicatif peut lire la configuration et le journal ; le service ne peut pas modifier l’application. Le durcissement systemd interdit l’accès aux répertoires personnels : conserver le journal hors de `/home`.

## Autoriser la lecture du journal

Le script applique ces droits automatiquement. Pour les rétablir manuellement :

```sh
sudo setfacl -m u:apt-viewer:--x /var/log/apt-cacher-ng
sudo setfacl -m u:apt-viewer:r-- /var/log/apt-cacher-ng/apt-cacher.log
sudo setfacl -m d:u:apt-viewer:r-- /var/log/apt-cacher-ng
sudo -u apt-viewer test -r /var/log/apt-cacher-ng/apt-cacher.log
```

L’ACL par défaut concerne les nouveaux fichiers du répertoire. Vérifier les droits après une rotation : les directives `create` ou `chmod` de logrotate peuvent modifier le masque ACL. Une copie du journal dans un répertoire dédié est aussi possible.

## Gérer le service

L’unité [`deploy/apt-viewer.service`](../deploy/apt-viewer.service) est installée et activée par le script.

```sh
sudo systemctl status apt-viewer
curl -f http://127.0.0.1:3000/healthz
```

Pour consulter les logs et redémarrer après une mise à jour :

```sh
sudo journalctl -u apt-viewer -n 50
sudo systemctl restart apt-viewer
```

## Mettre à jour

Télécharger à nouveau `install.sh`, puis le relancer. Depuis un clone, récupérer le code à jour avant de lancer le script.

La configuration existante est conservée. La version précédente reste dans `/opt/apt-viewer.backup.*`. Si le nouveau service ne passe pas le contrôle de santé, le script restaure l’application et le service précédents.

Pour installer une référence Git précise avec le script téléchargé seul :

```sh
sudo env APT_VIEWER_REF=v1.0.0 bash install.sh
```

Remplacer `v1.0.0` par un tag ou un commit existant. Depuis un clone, le script utilise le code local.

## Configurer Nginx

Adapter [`deploy/nginx.conf`](../deploy/nginx.conf) avec le nom DNS et les chemins des certificats. Le fichier prévoit TLS et une authentification HTTP Basic.

```sh
sudo apt-get install nginx apache2-utils
sudo htpasswd -c /etc/nginx/apt-viewer.htpasswd administrateur
sudo chown root:www-data /etc/nginx/apt-viewer.htpasswd
sudo chmod 640 /etc/nginx/apt-viewer.htpasswd
```

Pour ajouter un autre compte, utiliser `htpasswd` sans `-c` afin de conserver le fichier existant.

Installer le vhost, puis vérifier sa configuration avant de recharger Nginx :

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Conserver `HOST=127.0.0.1` derrière le proxy. L’authentification doit couvrir les pages et les routes `/api/*`.

Pour un accès ponctuel sans reverse proxy :

```sh
ssh -L 3000:127.0.0.1:3000 utilisateur@serveur
```

Ouvrir ensuite `http://127.0.0.1:3000` sur le poste local.

## Vérifications courantes

| Symptôme | Vérification |
| --- | --- |
| `ENOENT` | Le fichier indiqué par `LOG_PATH` existe. |
| `EACCES` ou `EPERM` | Le compte `apt-viewer` peut traverser le répertoire et lire le journal. |
| Journal inaccessible après rotation | Le nouveau fichier possède les ACL attendues. |
| Noms DNS absents | Le résolveur du serveur connaît les zones inverses des clients. |
| Fenêtre partielle | Les limites `MAX_BYTES` ou `MAX_EVENTS` ont été atteintes. |
| Service qui ne démarre pas | Version et chemin de Node, fichier d’environnement et sortie de `journalctl`. |

[Retour au README](../README.md)
