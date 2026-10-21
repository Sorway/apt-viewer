# Déploiement

[README](../README.md) · [Référence](reference.md)

## Prérequis

- Debian ou Ubuntu avec systemd actif.
- Architecture x86_64 ou arm64.
- Journal apt-cacher-ng présent sur la machine.
- Accès sudo et commande `curl` disponible.

## Installation

```sh
curl -fL https://github.com/Sorway/apt-viewer/releases/latest/download/install.sh -o install.sh
sudo bash install.sh
```

Depuis un clone du dépôt, `sudo bash install.sh` installe le code du checkout local.

Le script vérifie le SHA-256 de l’archive téléchargée, puis installe les dépendances système, Node.js 24 et les dépendances npm. Il crée le compte `apt-viewer`, applique les droits de lecture du journal, puis active le service systemd et vérifie `/healthz`. Une installation depuis un clone utilise directement les fichiers locaux.

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
curl -fsSL https://github.com/Sorway/apt-viewer/releases/latest/download/update.sh | sudo bash -s
```

La commande télécharge le script joint à la dernière release stable et l’exécute avec sudo. Elle fonctionne aussi si `/opt/apt-viewer/update.sh` est absent ou ancien. Le script affiche `version installée → version cible` et s’arrête si la version est déjà installée. Sinon, il vérifie le SHA-256 de l’archive avant de lancer l’installation. En l’absence de release stable, il s’arrête.

La configuration `/etc/apt-viewer.env` est conservée. L’ancienne installation reste dans `/opt/apt-viewer.backup.*`. Si le démarrage ou le contrôle de santé échoue, le script restaure l’installation et l’état du service précédents.

### Choisir une version

Le script accepte le tag exact d’une release stable : `vX.Y.Z` ou `X.Y.Z`. Sans argument, il utilise `APT_VIEWER_REF` si cette variable est définie, puis la dernière release stable. La valeur `latest` sélectionne explicitement cette release.

```sh
curl -fsSL https://github.com/Sorway/apt-viewer/releases/latest/download/update.sh | sudo bash -s -- 1.0.1
```

Remplacer `1.0.1` par le tag exact à installer. Pour revenir à une version antérieure, ajouter `--allow-downgrade` :

```sh
curl -fsSL https://github.com/Sorway/apt-viewer/releases/latest/download/update.sh | sudo bash -s -- --allow-downgrade v1.0.1
```

L’option `--force` réinstalle une version identique. Elle n’autorise pas une rétrogradation.

Chaque release utilisée doit contenir `apt-viewer-X.Y.Z.tar.gz` et `SHA256SUMS`. Les anciennes releases dépourvues de ces fichiers ne sont pas prises en charge par ce script. Les branches et les commits ne sont plus acceptés pour une mise à jour ; pour travailler sur le code, utiliser un clone local.

### Publier une release

Mettre la même version dans `package.json` et `package-lock.json`, puis pousser le commit et son tag :

```sh
git tag v1.0.2
git push origin master v1.0.2
```

Remplacer `v1.0.2` par la version choisie. Le workflow `Release` exécute d’abord la CI complète sur le commit du tag : vérifications JavaScript et ShellCheck, installation Linux, mise à jour via `latest`, absence de réinstallation à version identique, refus d’une archive altérée et contrôle des rétrogradations.

La CI simule les téléchargements GitHub avec l’archive candidate sur un runner Ubuntu. Elle démarre le vrai service systemd et contrôle `/healthz` ainsi que la conservation de la configuration. Elle ne télécharge pas la candidate depuis une release publique, puisqu’elle n’est pas encore publiée.

Après réussite de tous les contrôles, la publication récupère les mêmes fichiers validés par la CI et vérifie leurs empreintes. Elle crée une release en brouillon, joint les fichiers suivants, puis la publie :

- `apt-viewer-X.Y.Z.tar.gz` : code du commit du tag ;
- `install.sh` et `update.sh` ;
- `SHA256SUMS` : empreintes SHA-256 de ces trois fichiers.

Les releases immuables sont activées sur le dépôt GitHub. Les prochaines publications verrouillent leurs tags et fichiers ; les releases antérieures à l’activation restent inchangées. Voir la [documentation GitHub](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes).

Un tag seul, sans release publiée, ne déclenche pas la bannière. Le SHA-256 vérifie que l’archive correspond au manifeste téléchargé ; la confiance dans la publication et ses scripts repose sur le dépôt GitHub et HTTPS.

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
