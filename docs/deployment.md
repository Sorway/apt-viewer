# Déploiement

[README](../README.md) · [Référence](reference.md)

## Prérequis

- Debian ou Ubuntu avec systemd actif.
- Architecture x86_64 ou arm64.
- Journal apt-cacher-ng présent sur la machine.
- Accès sudo et commande `curl` disponible.

## Installation

```sh
curl -fL https://raw.githubusercontent.com/Sorway/apt-viewer/master/install.sh -o install.sh
sudo bash install.sh
```

Depuis un clone du dépôt, lancer directement `sudo bash install.sh`.

Le script installe les dépendances système, Node.js 24 et les dépendances npm. Il crée le compte `apt-viewer`, applique les droits de lecture du journal, puis active le service systemd et vérifie `/healthz`.

| Emplacement | Usage |
| --- | --- |
| `/opt/apt-viewer` | Application et script de mise à jour |
| `/opt/apt-viewer/runtime` | Installation de Node.js 24 |
| `/etc/apt-viewer.env` | Configuration |
| `/etc/systemd/system/apt-viewer.service` | Unité systemd |

### Choisir le journal

Le chemin par défaut est `/var/log/apt-cacher-ng/apt-cacher.log`. Si ce fichier est absent, l’installation s’arrête après avoir créé la configuration.

Modifier `LOG_PATH`, puis relancer le script pour appliquer les permissions :

```sh
sudoedit /etc/apt-viewer.env
sudo bash install.sh
```

Utiliser un chemin absolu. Le service n’a pas accès aux répertoires personnels sous `/home`.

## Accès à l’interface

Par défaut, l’application écoute sur `127.0.0.1:3000`. Depuis le serveur, ouvrir [l’interface](http://127.0.0.1:3000). Depuis un autre poste :

```sh
ssh -L 3000:127.0.0.1:3000 utilisateur@serveur
```

Ouvrir ensuite `http://127.0.0.1:3000` sur le poste local. Remplacer `utilisateur@serveur` par le compte et l’adresse du serveur.

## Configuration et service

Pour modifier une option :

```sh
sudoedit /etc/apt-viewer.env
sudo systemctl restart apt-viewer
```

Après un changement de `LOG_PATH`, relancer aussi `install.sh` pour configurer les droits sur le nouveau journal.

| Action | Commande |
| --- | --- |
| État du service | `sudo systemctl status apt-viewer` |
| Derniers messages | `sudo journalctl -u apt-viewer -n 50 --no-pager` |
| Suivre les messages | `sudo journalctl -u apt-viewer -f` |
| Redémarrer | `sudo systemctl restart apt-viewer` |
| Vérifier la lecture du journal | `curl -f http://127.0.0.1:3000/healthz` |

Adapter le port des commandes si `PORT` a été modifié. Toutes les variables figurent dans la [référence](reference.md#configuration).

## Mise à jour

```sh
curl -fsSL https://raw.githubusercontent.com/Sorway/apt-viewer/master/update.sh | sudo bash -s
```

La commande télécharge le script depuis GitHub et l’exécute avec sudo. Elle fonctionne aussi si `/opt/apt-viewer/update.sh` est absent ou ancien. Le script met à jour l’application, Node.js 24, les dépendances et le service.

La configuration `/etc/apt-viewer.env` est conservée. L’ancienne installation reste dans `/opt/apt-viewer.backup.*`. Si le démarrage ou le contrôle de santé échoue, le script restaure l’installation et l’état du service précédents.

### Choisir une version

Le script accepte une branche, un tag ou un commit en argument. Sans argument, il utilise `APT_VIEWER_REF` si cette variable est définie, puis `master` par défaut.

```sh
curl -fsSL https://raw.githubusercontent.com/Sorway/apt-viewer/master/update.sh | sudo bash -s -- master
```

Remplacer `master` par la référence à installer.

## Nginx

L’exemple [deploy/nginx.conf](../deploy/nginx.conf) utilise HTTPS. Préparer le nom DNS et les fichiers du certificat avant d’activer le site.

```sh
sudo apt-get install nginx
sudo curl -fL https://raw.githubusercontent.com/Sorway/apt-viewer/master/deploy/nginx.conf -o /etc/nginx/sites-available/apt-viewer
sudoedit /etc/nginx/sites-available/apt-viewer
```

Adapter `server_name`, `ssl_certificate` et `ssl_certificate_key`, puis activer le site :

```sh
sudo ln -s /etc/nginx/sites-available/apt-viewer /etc/nginx/sites-enabled/apt-viewer
sudo nginx -t
sudo systemctl reload nginx
```

Conserver `HOST=127.0.0.1`. Si le port de l’application a changé, adapter aussi `proxy_pass`.

## Dépannage

Commencer par les messages du service :

```sh
sudo journalctl -u apt-viewer -n 50 --no-pager
```

| Problème | À vérifier |
| --- | --- |
| `ENOENT` | Le fichier indiqué par `LOG_PATH` existe. |
| `EACCES` ou `EPERM` | Le compte `apt-viewer` peut traverser les répertoires parents et lire le journal. Relancer `install.sh` pour appliquer les ACL. |
| Lecture interrompue après une rotation | Les permissions et le masque ACL du nouveau fichier. La configuration de logrotate peut les modifier. |
| Noms DNS absents | La résolution DNS inverse sur le serveur. |
| « Fenêtre partielle » dans l’interface | Les limites `MAX_BYTES` ou `MAX_EVENTS` sont atteintes. |
| `/healthz` répond `503` | La lecture du journal a échoué. L’interface conserve les dernières données lues. |

Pour contrôler les droits avec le compte applicatif :

```sh
sudo -u apt-viewer test -r /var/log/apt-cacher-ng/apt-cacher.log
```

Adapter le chemin à `LOG_PATH`. Une sortie sans message avec le code `0` confirme que le fichier est lisible.
