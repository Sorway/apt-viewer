# Déployer apt-viewer

Exemple pour Debian ou Ubuntu, avec systemd et Nginx. Installer Node.js 22.9 ou supérieur avant de commencer.

Les fichiers de déploiement conservent les noms techniques `apt-observer` pour le compte système, les chemins et le service. Le nom de l’application est **apt-viewer**.

## Installer l’application

```sh
sudo apt-get install acl nginx apache2-utils
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin apt-observer
sudo install -d -o root -g root -m 755 /opt/apt-observer
```

Copier le projet dans `/opt/apt-observer`, sans `.env` ni `node_modules`, puis :

```sh
cd /opt/apt-observer
sudo npm ci --omit=dev --ignore-scripts
sudo chown -R root:root /opt/apt-observer
sudo cp .env.example /etc/apt-observer.env
sudo chown root:apt-observer /etc/apt-observer.env
sudo chmod 640 /etc/apt-observer.env
```

Adapter `LOG_PATH` dans `/etc/apt-observer.env`. Les exemples supposent que Node est installé dans `/usr/bin/node` ; vérifier avec `command -v node`.

## Autoriser la lecture du journal

Le compte applicatif a besoin de traverser le répertoire et de lire le fichier :

```sh
sudo setfacl -m u:apt-observer:--x /var/log/apt-cacher-ng
sudo setfacl -m u:apt-observer:r-- /var/log/apt-cacher-ng/apt-cacher.log
sudo setfacl -m d:u:apt-observer:r-- /var/log/apt-cacher-ng
sudo -u apt-observer test -r /var/log/apt-cacher-ng/apt-cacher.log
```

L’ACL par défaut concerne les nouveaux fichiers du répertoire. Vérifier les droits après une rotation : les directives `create` ou `chmod` de logrotate peuvent modifier le masque ACL. Une copie du journal dans un répertoire dédié est aussi possible.

## Démarrer avec systemd

L’unité fournie est [`deploy/apt-observer.service`](../deploy/apt-observer.service).

```sh
sudo cp deploy/apt-observer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now apt-observer
sudo systemctl status apt-observer
curl -f http://127.0.0.1:3000/healthz
```

Pour consulter les logs et redémarrer après une mise à jour :

```sh
sudo journalctl -u apt-observer -n 50
sudo systemctl restart apt-observer
```

L’unité protège le système de fichiers et interdit l’accès aux répertoires personnels. Installer le projet dans `/opt`, plutôt que dans `/home`.

## Configurer Nginx

Adapter [`deploy/nginx.conf`](../deploy/nginx.conf) avec le nom DNS et les chemins des certificats. Le fichier prévoit TLS et une authentification HTTP Basic.

```sh
sudo htpasswd -c /etc/nginx/apt-observer.htpasswd administrateur
sudo chown root:www-data /etc/nginx/apt-observer.htpasswd
sudo chmod 640 /etc/nginx/apt-observer.htpasswd
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
| `EACCES` ou `EPERM` | Le compte `apt-observer` peut traverser le répertoire et lire le journal. |
| Journal inaccessible après rotation | Le nouveau fichier possède les ACL attendues. |
| Noms DNS absents | Le résolveur du serveur connaît les zones inverses des clients. |
| Fenêtre partielle | Les limites `MAX_BYTES` ou `MAX_EVENTS` ont été atteintes. |
| Service qui ne démarre pas | Version et chemin de Node, fichier d’environnement et sortie de `journalctl`. |

[Retour au README](../README.md)
