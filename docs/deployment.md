# Déployer apt-viewer

Exemple pour Debian ou Ubuntu, avec systemd et Nginx. Installer Node.js 22.9 ou supérieur avant de commencer.

## Installer l’application

```sh
sudo apt-get install acl nginx apache2-utils
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin apt-viewer
sudo install -d -o root -g root -m 755 /opt/apt-viewer
```

Copier le projet dans `/opt/apt-viewer`, sans `.env` ni `node_modules`, puis :

```sh
cd /opt/apt-viewer
sudo npm ci --omit=dev --ignore-scripts
sudo chown -R root:root /opt/apt-viewer
sudo cp .env.example /etc/apt-viewer.env
sudo chown root:apt-viewer /etc/apt-viewer.env
sudo chmod 640 /etc/apt-viewer.env
```

Adapter `LOG_PATH` dans `/etc/apt-viewer.env`. Les exemples supposent que Node est installé dans `/usr/bin/node` ; vérifier avec `command -v node`.

## Autoriser la lecture du journal

Le compte applicatif a besoin de traverser le répertoire et de lire le fichier :

```sh
sudo setfacl -m u:apt-viewer:--x /var/log/apt-cacher-ng
sudo setfacl -m u:apt-viewer:r-- /var/log/apt-cacher-ng/apt-cacher.log
sudo setfacl -m d:u:apt-viewer:r-- /var/log/apt-cacher-ng
sudo -u apt-viewer test -r /var/log/apt-cacher-ng/apt-cacher.log
```

L’ACL par défaut concerne les nouveaux fichiers du répertoire. Vérifier les droits après une rotation : les directives `create` ou `chmod` de logrotate peuvent modifier le masque ACL. Une copie du journal dans un répertoire dédié est aussi possible.

## Démarrer avec systemd

L’unité fournie est [`deploy/apt-viewer.service`](../deploy/apt-viewer.service).

```sh
sudo cp deploy/apt-viewer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now apt-viewer
sudo systemctl status apt-viewer
curl -f http://127.0.0.1:3000/healthz
```

Pour consulter les logs et redémarrer après une mise à jour :

```sh
sudo journalctl -u apt-viewer -n 50
sudo systemctl restart apt-viewer
```

L’unité protège le système de fichiers et interdit l’accès aux répertoires personnels. Installer le projet dans `/opt`, plutôt que dans `/home`.

## Configurer Nginx

Adapter [`deploy/nginx.conf`](../deploy/nginx.conf) avec le nom DNS et les chemins des certificats. Le fichier prévoit TLS et une authentification HTTP Basic.

```sh
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
