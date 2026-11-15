# NetWatch

Supervision réseau pour TPE et PME (10 à 100 machines), pensée pour être installée rapidement chez un client.

Le **collecteur** (scanner Python, développé dans les branches `scanner`) observe le réseau. L'**API Node.js** l'interroge toutes les 5 minutes,
applique les règles métier et conserve l'historique. Le **dashboard React** présente le résultat à deux publics :
un gestionnaire qui veut savoir si tout va bien, un technicien qui doit diagnostiquer.

![Architecture de NetWatch](docs/architecture.png)

Les écrans du dashboard, leur disposition et leurs données sont décrits dans le
[squelette de l'application](docs/squelette-application.md).

## Ce que le produit détecte

| Constat | Famille | Comportement |
| --- | --- | --- |
| Un équipement ne répond plus | **Panne** (incident) | Ouverte après le nombre de scans manqués configuré, refermée automatiquement au retour |
| Une passerelle ne répond plus | **Panne** (incident) | Critique ; les machines derrière elle sont marquées « Injoignables » et non « En panne » : la cause est la passerelle |
| Une passerelle répond, mais plus aucune machine derrière elle | **Panne** (incident) | « Panne en aval » signalée sur la passerelle (switch, câblage, alimentation de la zone) |
| Débit entre deux machines nettement dégradé | **Observation** | Comparaison à la médiane des 7 derniers jours pour le même trajet |
| Perte de paquets | **Observation** | À partir de 5 % par défaut, critique à partir de 50 % |
| Processeur, mémoire ou disque saturé | **Observation** | À partir de 90 % par défaut (une alerte par disque), critique à partir de 98 % |
| Port sensible ouvert | **Signalement** | Liste des ports surveillés configurable ; le service détecté derrière le port est indiqué |
| Certificat TLS proche de l'expiration | **Signalement** | Préavis de 30 jours par défaut, critique à moins de 7 jours |
| Certificat TLS refusé par la vérification | **Signalement** | Auto-signé, nom d'hôte différent, chaîne incomplète… la raison donnée par le scanner est affichée |
| Nouvelle machine sur le réseau | **À configurer** | Reste « à valider » tant qu'un utilisateur ne l'a pas validée, ignorée ou exclue ; elle n'est supervisée qu'une fois validée |

Un événement déjà ouvert n'est jamais dupliqué : une contrainte en base garantit un seul événement
ouvert par (équipement, cause).

Le **rapport hebdomadaire** s'exporte en PDF (bouton « Exporter en PDF », ou
`GET /api/v1/reports/weekly.pdf?week=<date>`) pour la réunion de direction : synthèse, chiffres clés,
puis les incidents les plus conséquents en tête — machines restées le plus longtemps hors service et
coupures ayant touché le plus de machines à la fois — suivis des points de sécurité à traiter.

**Le scan propose, l'humain décide** : aucun équipement n'entre au référentiel (supervision, rapports) sans
validation. Chaque décision (valider, ignorer, exclure) est enregistrée avec son auteur, et un équipement
écarté n'est jamais reproposé. Un équipement que le collecteur ne voit pas peut être **ajouté à la main** :
un doublon avec un équipement découvert (même IP ou même MAC) est signalé, avec la possibilité de fusionner.
Détail : [docs/api-contract.md § 4.7](docs/api-contract.md#47-validation-humaine-et-ajout-manuel).

Pour chaque machine, la fiche détaillée affiche aussi : les ports ouverts et le ou les services
associés, la latence et la perte de paquets, la charge processeur, l'occupation mémoire et disques,
et les certificats TLS avec leurs dates de validité et le résultat de leur vérification.

## Installer et lancer le projet

Trois façons de lancer NetWatch, selon ce que vous voulez faire :

| Je veux… | Méthode | Il me faut |
| --- | --- | --- |
| **voir le dashboard** et tester le produit | [A. Docker](#a-voir-le-dashboard-avec-docker) | Docker Desktop |
| **développer le dashboard** (rechargement à chaque modification) | [B. Mode démo](#b-développer-le-dashboard-sans-base-de-données) | Node.js |
| **développer l'API** ou tester avec une vraie base | [C. Développement complet](#c-développement-complet-api--base--collecteur) | Node.js et Docker Desktop |

### Prérequis

- **Git**.
- **Docker Desktop** (méthodes A et C), **démarré** : l'icône de la baleine doit être immobile. Docker Compose
  v2.24 ou plus récent (`docker compose version`).
- **Node.js 22.12 ou plus récent** (méthodes B et C) : `node --version`. La version LTS de nodejs.org convient.

### Récupérer le projet

```bash
git clone -b dashboard-et-api https://github.com/NetwatchTeam/Netwatch.git netwatch
cd netwatch
```

`-b dashboard-et-api` sélectionne la branche du dashboard et de l'API. Une fois cette branche fusionnée dans
`main`, l'option n'est plus nécessaire.

### A. Voir le dashboard avec Docker

```bash
cp .env.example .env
```

Ouvrez `.env` et remplacez la valeur de `POSTGRES_PASSWORD` par le mot de passe de votre choix (gardez-le :
il est fixé au premier démarrage, voir « Problèmes fréquents »). Puis :

```bash
docker compose up -d --build --wait
```

La première fois, comptez quelques minutes (téléchargement des images et compilation). La commande rend la
main quand tout est prêt ; ouvrez alors **http://localhost:3001**.

| Service | Rôle | Accès |
| --- | --- | --- |
| `db` | PostgreSQL ; données dans le volume `netwatch-db` (conservées à l'arrêt et au redémarrage) | interne |
| `collector` | Collecteur réseau — par défaut le **collecteur simulé** (38 équipements, une passerelle qui tombe régulièrement) | http://localhost:8090 |
| `app` | API + dashboard (l'interface compilée est servie par l'API) | http://localhost:3001 |

```bash
docker compose ps                 # état des services
docker compose logs -f app        # journal de l'API (scans, erreurs)
docker compose down               # arrêt, données conservées
docker compose down -v            # arrêt et suppression des données (repartir de zéro)
docker compose up -d --build --wait   # après un `git pull`, pour reconstruire avec le nouveau code
```

Variables du fichier `.env` (voir [.env.example](.env.example)) : `POSTGRES_PASSWORD` est **obligatoire** ;
`APP_PORT`, `COLLECTOR_PORT`, `COLLECTOR_SCENARIO`, `SCANNER_MODE`, `SCANNER_TOKEN` et `REPORT_TIME_ZONE`
sont facultatives. Aucun secret n'est écrit dans `docker-compose.yml`, et `.env` n'est pas versionné.

### B. Développer le dashboard sans base de données

```bash
npm install
npm run dev:demo
```

Ouvrez **http://localhost:5173** : chaque modification de `apps/web/src` s'affiche immédiatement. L'API tourne
sur le port 3001 avec un réseau fictif généré par elle-même, **en mémoire** : les données repartent de zéro à
chaque redémarrage. Ni Docker ni `.env` ne sont nécessaires (configuration : [apps/api/.env.demo](apps/api/.env.demo)).

Les formats de toutes les réponses de l'API sont décrits dans [docs/api-contract.md](docs/api-contract.md), avec
des exemples réels dans [docs/examples/api](docs/examples/api).

### C. Développement complet (API + base + collecteur)

```bash
npm install
cp .env.example .env                     # puis choisir POSTGRES_PASSWORD (comme en A)
cp apps/api/.env.example apps/api/.env   # puis y reporter le même mot de passe dans DATABASE_URL
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-deps db collector
npm run dev
```

PostgreSQL est alors accessible sur le port 5433 et le collecteur simulé sur le port 8090 ; l'API (port 3001)
et le dashboard (http://localhost:5173) tournent sur votre machine, avec rechargement. Si la stack de la
méthode A tourne aussi, arrêtez d'abord son API : `docker compose stop app` (elle occupe le port 3001).

### Mettre à jour après un `git pull`

**Les migrations de la base s'appliquent toutes seules** au démarrage de l'API : aucune commande à lancer, et
les données sont conservées. Il suffit de relancer avec la bonne commande :

| Méthode | Après un `git pull` |
| --- | --- |
| A. Docker | `docker compose up -d --build --wait` (`--build` reconstruit l'image avec le nouveau code et les nouvelles migrations) |
| B. Mode démo | `npm install` puis `npm run dev:demo` |
| C. Développement complet | `npm install`, puis arrêter et relancer `npm run dev` (le rechargement automatique ne rejoue pas les migrations) |

Les fichiers `.env` ne sont pas versionnés : un `git pull` ne les met pas à jour. Comparez-les à `.env.example`
et `apps/api/.env.example` si un réglage semble manquer.

**Pour faire évoluer la base**, ajoutez une nouvelle migration (`apps/api/migrations/007_….sql`) et ne modifiez
jamais une migration déjà poussée : une migration déjà appliquée n'est pas rejouée, et les bases de l'équipe
divergeraient. Mettez à jour le MCD ([docs/mcd.png](docs/mcd.png)) et [docs/modele-donnees.md](docs/modele-donnees.md)
dans le même commit.

### Premiers pas dans le dashboard

Ce parcours vaut pour les méthodes A et C (réseau de test de 38 équipements). En mode démo (méthode B), le réseau
fictif compte environ 18 machines sans passerelle : les étapes 3 et 4 ne s'appliquent pas.

1. **Vue d'ensemble** : état général du parc. Le premier scan a lieu au démarrage, puis toutes les 5 minutes.
2. **À valider** : les 38 équipements découverts attendent une décision. Tant qu'ils ne sont pas validés, aucun
   n'est supervisé : sans cette étape, la panne de l'étape 4 n'apparaît pas. Indiquez votre nom (il est
   enregistré avec chaque décision), puis **Tout valider**, ou décidez machine par machine
   (**Valider**, **Ignorer**, **Exclure**).
3. **Dépendances** → **Valider toutes les suggestions** : le collecteur a deviné quelle passerelle dessert chaque
   PC, mais tant que ce n'est pas validé, une panne de passerelle apparaît comme 9 pannes séparées.
4. La passerelle `gw-atelier` tombe toutes les 50 minutes (méthodes A et C). Pour ne pas attendre, ouvrez
   http://localhost:8090/use/4-reseau-passerelles?scan=3 puis **Scans** → **Lancer un scan maintenant**
   (`?scan=7` : la passerelle répond mais ses PC sont en panne). Détail : [tools/scanner-test/README.md](tools/scanner-test/README.md).
5. **Rapport hebdomadaire** → **Exporter en PDF**.

### Problèmes fréquents

| Symptôme | Cause et solution |
| --- | --- |
| « NetWatch ne peut pas démarrer. DATABASE_URL est absente » après `npm run dev` | `npm run dev` attend une base (méthode C) et le fichier `apps/api/.env` n'existe pas. Pour essayer sans base : `npm run dev:demo`. Sinon, suivre la méthode C (copier `apps/api/.env.example`, démarrer la base), puis relancer `npm run dev` |
| « PostgreSQL ne répond pas à localhost:5433 » | La base de développement n'est pas démarrée : `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-deps db collector` (Docker Desktop doit tourner) |
| `Cannot connect to the Docker daemon` / `open //./pipe/dockerDesktopLinuxEngine` | Docker Desktop n'est pas démarré : lancez-le et attendez qu'il soit prêt |
| `required variable POSTGRES_PASSWORD is missing a value` | Le fichier `.env` manque ou `POSTGRES_PASSWORD` est vide : `cp .env.example .env` puis renseigner le mot de passe |
| `Bind for 0.0.0.0:3001 failed: port is already allocated` (ou 8090, 5173) | Le port est déjà pris (autre stack NetWatch, `npm run dev` lancé ailleurs) : arrêtez-la, ou changez `APP_PORT` / `COLLECTOR_PORT` dans `.env` |
| « PostgreSQL refuse le mot de passe » / `password authentication failed for user "netwatch"` | Le mot de passe a changé après le premier démarrage : la base garde l'ancien. Remettez l'ancien dans `.env`, ou repartez de zéro avec `docker compose down -v` |
| Page « Scans » : « connexion refusée — le scanner n'est pas démarré » | Le collecteur ne tourne pas : `docker compose up -d collector` (méthode A ou C) |
| Le dashboard affiche « Impossible de joindre l'API NetWatch » | L'API n'est pas démarrée ou a planté : regardez le terminal de `npm run dev`, ou `docker compose logs app` |
| `'cp' n'est pas reconnu` (invite de commandes Windows, cmd) | Utilisez PowerShell ou Git Bash, ou `copy .env.example .env` |
| `npm error engine Unsupported engine` / erreurs de syntaxe au démarrage | Node.js trop ancien : installez Node 22.12 ou plus récent |
| Après un `git pull`, le dashboard Docker n'a pas changé | Reconstruire l'image : `docker compose up -d --build --wait` |
| `Cannot find package 'pdfkit'` (ou un autre paquet) après un `git pull` | De nouvelles dépendances sont arrivées : `npm install` |
| Environ 18 machines en 192.168.1.x au lieu des 38 du réseau de test | Le fichier `.env` (copié d'une ancienne version) contient `SCANNER_MODE=demo` : mettre `SCANNER_MODE=http` et `SCANNER_URL=http://collector:8080`, puis `docker compose down -v` et relancer (efface les données) |

### Commandes de développement

| Commande | Rôle |
| --- | --- |
| `npm run dev:demo` | API (en mémoire, réseau fictif) et dashboard, sans base ni Docker |
| `npm run dev:injection` | API (en mémoire, **sans aucun scan**) et dashboard : seules les données injectées l'alimentent |
| `npm run scan:inject -- <scénario ou fichier.json>...` | Injecte des photographies fictives dans l'API en marche, validées strictement contre le contrat ([tools/scanner-test](tools/scanner-test/README.md)) |
| `npm run dev` | API et dashboard avec la base et le collecteur de la méthode C |
| `npm test` | Tests (règles métier, ingestion, API HTTP, conformité des exemples du contrat) |
| `npm run typecheck` | Vérification des types sur tout le dépôt |
| `npm run build` | Compile contrats, API et dashboard |
| `npm run migrate` | Applique les migrations SQL (l'API le fait aussi au démarrage) |
| `npm run contract:examples -w @netwatch/api` | Régénère les exemples JSON de `docs/examples` après une évolution du contrat |

### Brancher le collecteur Python

Le collecteur simulé tient la place du collecteur Python tant que celui-ci n'est pas intégré. Pour l'équipe du
collecteur : le format attendu est dans [docs/scanner-contract.md](docs/scanner-contract.md), avec un exemple
réel dans [docs/examples/collecteur/scan.response.json](docs/examples/collecteur/scan.response.json) ; un JSON non
conforme apparaît dans la page « Scans » avec le détail de l'écart. Une fois l'image du collecteur publiée :

```bash
# dans .env : COLLECTOR_IMAGE=registre/netwatch-collector:1.0 (et SCANNER_TOKEN si le collecteur en exige un)
docker compose -f docker-compose.yml -f docker-compose.collector-python.yml up -d --wait
```

Sans aucun collecteur (démonstration commerciale) : `SCANNER_MODE=demo` dans `.env`, l'API génère alors un
réseau fictif.

## Organisation du dépôt

```
apps/
├── api/                    # API Node.js (Express, TypeScript), architecture en couches
│   ├── migrations/         # SQL appliqué au démarrage, dans l'ordre des noms de fichiers
│   ├── src/
│   │   ├── domain/         # entités, règles de détection, rapport — aucune dépendance technique
│   │   ├── application/    # cas d'usage + ports (interfaces des dépendances)
│   │   ├── infrastructure/ # PostgreSQL, passerelle scanner, planificateur, configuration
│   │   ├── interfaces/http # routes, gestion des erreurs, présentation (DTO)
│   │   ├── container.ts    # racine de composition : où le concret rencontre l'abstrait
│   │   └── main.ts
│   └── tests/              # tests du domaine, de l'ingestion et de l'API HTTP
└── web/                    # Dashboard React + Vite
    └── src/
        ├── api/            # appels HTTP typés
        ├── components/     # tableaux, badges, jauges, graphique de débit
        └── pages/          # espace Direction et espace Technique
packages/
└── contracts/              # types partagés API ↔ interface (le contrat HTTP)
docs/
├── architecture.svg/png    # schéma ci-dessus
├── squelette-application.md  # plan du site, maquette et rôle de chaque écran, structure du code du dashboard
├── squelette/              # maquettes fil de fer (générées par tools/squelette/generer-maquettes.mjs)
├── mcd.svg/png             # MCD de référence : à mettre à jour avec chaque évolution du schéma
├── modele-donnees.md       # correspondance MCD ↔ tables PostgreSQL, fonctionnalité de réparation à brancher
├── api-contract.md         # contrat REST/JSON : routes, formats, erreurs, versionnement
├── scanner-contract.md     # ce que l'API attend du collecteur
└── examples/               # réponses JSON réelles (générées par le code, vérifiées par les tests)
tools/
├── scanner-test/           # collecteur simulé (service `collector` de docker compose)
└── squelette/              # générateur des maquettes de docs/squelette
scripts/
└── ensure-contracts.mjs    # compile packages/contracts si besoin, avant dev et test
```

### Pourquoi ce découpage

Les dépendances pointent toujours vers l'intérieur : `interfaces/http` → `application` → `domain`,
et `infrastructure` implémente les ports déclarés par `application`. Conséquences concrètes :

- Les règles métier se testent sans base de données ni scanner (voir `tests/domain`).
- Changer PostgreSQL pour autre chose, ou le protocole du scanner, ne touche que `infrastructure/`.
- Le contrat HTTP est figé dans `packages/contracts` : une rupture est détectée à la compilation,
  côté API comme côté interface.

## Configuration

Variables de l'API ([apps/api/.env.example](apps/api/.env.example)), validées au démarrage —
une valeur manquante ou invalide arrête le service avec un message explicite.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `STORAGE` | `postgres` | `memory` : sans base, données perdues à l'arrêt (développement du dashboard) |
| `DATABASE_URL` | — | Connexion PostgreSQL (obligatoire si `STORAGE=postgres`) |
| `PORT` | `3001` | Port d'écoute |
| `SCANNER_MODE` | `demo` | `http` pour interroger le vrai scanner ; `none` : aucun scan automatique, données injectées seulement |
| `SCANNER_URL` | — | Obligatoire si `SCANNER_MODE=http` |
| `SCANNER_TOKEN` | — | Envoyé en `Authorization: Bearer` au scanner |
| `SCAN_IMPORT` | activée hors production | `enabled` / `disabled` : autorise `POST /api/v1/scans/import` (`npm run scan:inject`) ; désactivée par défaut en production |
| `REPORT_TIME_ZONE` | `Europe/Paris` | Fuseau des heures affichées dans le rapport PDF |
| `WEB_DIST_PATH` | — | Dossier de l'interface compilée, servie par l'API en production |

Les **seuils métier** (intervalle de scan, préavis TLS, ports surveillés, seuils de débit, de perte de
paquets, de charge processeur, mémoire et disque, rétention)
ne sont pas dans le `.env` : ils sont en base et se modifient depuis la page « Réglages », sans redéploiement.
C'est ce qui permet d'adapter le produit à chaque client.

## Accès au tableau de bord

Le tableau de bord est **en accès libre** : il n'y a ni page de connexion ni mot de passe. Toute
personne qui peut joindre le port de l'application (3001 par défaut) voit l'état du réseau et peut
modifier les réglages, classer les machines et lancer un scan.

Il doit donc être installé sur un réseau de confiance (réseau d'administration, VPN), ou derrière un
reverse proxy qui ajoute l'authentification et le HTTPS (Nginx, Traefik, Caddy…).

La base PostgreSQL n'a jamais servi à l'authentification : elle conserve le parc, les événements,
les mesures de débit, l'historique des scans et les réglages. Elle reste indispensable.

## Ce qui reste à faire

- Déclarer à l'avance qu'un équipement part en réparation, pour un avertissement plutôt qu'une panne : les tables
  sont prêtes, la logique reste à coder (étapes dans [docs/modele-donnees.md](docs/modele-donnees.md))
- Faire écrire l'application dans les tables du MCD, encore vides (même document)
- Brancher le collecteur Python (dossier `scanner/` des branches du collecteur) dans `docker compose`
- Alertes sortantes : e-mail ou Teams sur ouverture d'incident, et envoi automatique du rapport hebdomadaire
  (le PDF est déjà produit par `renderWeeklyReportPdf`, réutilisable tel quel en pièce jointe)
- Comptes utilisateurs et rôles, si l'accès libre ne suffit plus (voir plus haut)
- Historique de disponibilité par machine sur plusieurs mois, avec graphiques
- Historique des mesures (processeur, mémoire, disques, perte de paquets) : seule la dernière valeur est conservée aujourd'hui
- Sauvegarde et restauration de la base documentées pour l'installateur
- Tests de bout en bout de l'interface (Playwright)
