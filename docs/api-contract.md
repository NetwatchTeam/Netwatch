# Contrat d'échange NetWatch — version 1.1.0

Ce document définit les échanges entre les trois modules de NetWatch. Il sert de référence pour
développer chaque module en parallèle : tant que chacun respecte ce contrat, il peut être développé,
testé et livré séparément.

```
┌──────────────────────┐   GET /scan (JSON)   ┌──────────────┐   REST /api/v1 (JSON)   ┌─────────────┐
│ Collecteur (Python)  │ ◄─────────────────── │  API (Node)  │ ◄────────────────────── │  Dashboard  │
│ ping, ports, TLS,    │ ───────────────────► │ règles,      │ ──────────────────────► │  (React)    │
│ ressources, débit    │   photographie       │ historique   │                         │             │
└──────────────────────┘                      └──────┬───────┘                         └─────────────┘
                                                     │ PostgreSQL
```

| Interface | Qui appelle | Description |
| --- | --- | --- |
| Collecteur → API | l'API interroge le collecteur | [scanner-contract.md](scanner-contract.md) : requête, format de la photographie réseau, règles de détection |
| API → Dashboard | le dashboard interroge l'API | ce document : routes `/api/v1`, formats, erreurs |

Les types de référence sont dans [packages/contracts/src](../packages/contracts/src) (partagés par
l'API et le dashboard : une rupture est détectée à la compilation). Le format d'entrée du collecteur
est validé par [snapshot-schema.ts](../apps/api/src/infrastructure/scanner/snapshot-schema.ts).
Les exemples de [docs/examples](examples) sont produits par le code et vérifiés par les tests.

## 1. Versionnement

| Élément | Valeur |
| --- | --- |
| Version du contrat | `1.1.0` (`CONTRACT_VERSION` dans `packages/contracts`) |
| Base des routes | `/api/v1` — la version majeure fait partie de l'URL |
| En-tête de réponse | `X-NetWatch-Contract: 1.1.0` sur toutes les réponses `/api/v1` |
| Requête au collecteur | l'API envoie `X-NetWatch-Contract: 1.1.0` à chaque `GET /scan`, et `?targets=` quand des équipements ont été ajoutés à la main |
| Réponse du collecteur | champ facultatif `contractVersion` (« 1.1.0 », « 1.0.0 » ou « 1 ») ; une autre version majeure est **refusée** et le scan enregistré en échec avec la raison |
| Santé | `GET /healthz` → `{ "status": "ok", "contractVersion": "1.1.0" }` |

Règles d'évolution (versionnement sémantique) :

- **Correctif** (1.0.x) : documentation, exemples, aucun changement de format.
- **Mineure** (1.x.0) : ajout rétrocompatible : nouveau champ **facultatif**, nouvelle route, nouvelle
  valeur d'énumération côté réponse. Un client doit **ignorer les champs inconnus**.
- **Majeure** (x.0.0) : rupture (champ retiré, renommé ou rendu obligatoire, sens modifié). Elle donne une
  nouvelle base `/api/v2` ; `/api/v1` reste servie le temps que les autres modules migrent.

Toute modification du contrat se fait dans la même demande de fusion que : ce document, les types de
`packages/contracts`, les exemples régénérés (`npm run contract:examples -w @netwatch/api`) et
`CONTRACT_VERSION`.

Historique :

| Version | Changements |
| --- | --- |
| 1.1.0 | Jeux de données fictifs (#21) : `POST /scans/import`, erreur 403 `forbidden`. « Tout valider » : `POST /devices/validate-pending`. Cycle de validation humaine (#31) et ajout manuel (#32) : `lifecycle` gagne `excluded` ; `DeviceDto` gagne `origin` ; `lastSeenAt` peut être `null` (équipement ajouté à la main, jamais vu) ; `GET /devices/:id` renvoie `decisions[]` ; nouvelle route `POST /devices` et erreur 409 `duplicate_device` ; le collecteur reçoit `?targets=`. **`author` devient obligatoire dans `PATCH /devices/:id`** : c'est une rupture au sens des règles ci-dessus, acceptée sans passer en `/api/v2` parce que le seul client (le dashboard) est livré dans la même version. Un autre client de `PATCH /devices/:id` doit ajouter `author`. |
| 1.0.0 | Première version |

## 2. Conventions

| Sujet | Règle |
| --- | --- |
| Format | JSON UTF-8, `Content-Type: application/json` (sauf l'export PDF) |
| Dates | ISO 8601 avec fuseau, renvoyées en UTC (`2026-11-06T12:59:00.000Z`) |
| Pourcentages | nombres de 0 à 100 (`cpuPercent: 37.5`), jamais de 0 à 1 — **sauf** les champs `availability…`, ratios de 0 à 1 |
| Durées | `durationSeconds` en secondes, `…Minutes` en minutes |
| Débits | `mbps`, mégabits par seconde |
| Valeur inconnue | `null` (le champ est toujours présent dans les réponses de l'API) |
| Identifiants | chaînes opaques (UUID) ; ne pas en déduire d'information |
| Listes | renvoyées en entier (parc de 10 à 100 machines) ; `limit` sur les événements (200 par défaut, 500 au plus) |
| Authentification | aucune en v1 : l'API doit rester sur un réseau de confiance (voir README) |

## 3. Identifiant stable des équipements

Chaque équipement reçoit à sa découverte un **`id` (UUID) attribué par l'API**, qui ne change plus et
n'est jamais réutilisé. Événements, mesures et dépendances le référencent.

À chaque scan, l'API rapproche une machine observée d'un équipement connu **par l'adresse MAC d'abord,
puis par l'IP**. Une machine dont l'IP change garde donc son `id`, à condition que le collecteur envoie sa
MAC. Sans MAC, un changement d'IP crée un nouvel équipement, que le gestionnaire devra valider.

Ce rapprochement a deux conséquences voulues :

- une machine **ignorée ou exclue** reste connue : elle n'est jamais reproposée comme nouvelle ;
- une machine **ajoutée à la main** (§ 4.7) est reconnue le jour où le collecteur la voit (même IP ou même
  MAC) : elle n'est pas dédoublée en une seconde machine « découverte ».

Le collecteur, lui, n'a pas d'identifiant à gérer : l'IP et la MAC suffisent.

## 4. Formats de données

Chaque format renvoie à son type TypeScript (la référence) et à un exemple réel.

### 4.1 Équipement — `DeviceDto`

[device.ts](../packages/contracts/src/device.ts) · exemples : [devices.response.json](examples/api/devices.response.json),
[device-unreachable.response.json](examples/api/device-unreachable.response.json)

| Champ | Type | Description |
| --- | --- | --- |
| `id` | string | Identifiant stable (§ 3) |
| `ip`, `mac`, `hostname`, `vendor` | string \| null | Identification réseau (`ip` toujours renseignée) |
| `kind` | `server`, `workstation`, `printer`, `switch`, `router`, `access_point`, `firewall`, `nas`, `camera`, `phone`, `iot`, `other`, `unknown` | Nature, déclarée par un utilisateur |
| `label` | string \| null | Nom métier (« Serveur ERP ») |
| `critical` | boolean | Équipement critique : pannes en sévérité critique, en tête des rapports |
| `lifecycle` | `pending_classification`, `active`, `ignored`, `excluded` | Cycle de validation (§ 4.7) : seul `active` fait partie du référentiel et est supervisé |
| `origin` | `discovered`, `manual` | Découvert par le collecteur, ou ajouté à la main |
| `reachability` | `up`, `down`, `unreachable`, `unknown` | `down` : en panne ; `unreachable` : coupé par la panne de l'équipement dont il dépend (§ 4.6) |
| `gatewayIp` | string \| null | Passerelle vue par le collecteur (donnée brute) |
| `gateway` | `{ id, name, reachability }` \| null | Passerelle selon les dépendances **validées** |
| `latencyMs`, `packetLossPercent` | number \| null | Qualité de la liaison au dernier scan (`null` si la machine ne répond plus) |
| `cpuPercent`, `memory` | number \| null, `{ usedPercent, totalMb }` \| null | Ressources au dernier scan |
| `disks[]` | `{ name, usedPercent, totalGb }` | Dernier état connu des disques |
| `ports[]` | `{ port, protocol, services[] }` | Ports ouverts ; `services[]` : `{ name, product, version }` |
| `certificates[]` | voir ci-dessous | Certificats TLS présentés |
| `firstSeenAt`, `lastSeenAt`, `lastChangeAt` | date (`lastSeenAt` : date \| null) | Première détection (ou date de l'ajout manuel), dernière réponse (`null` : jamais vu par le collecteur), dernier changement d'état |
| `openEvents` | number | Événements non résolus sur cet équipement |

Certificat (`TlsCertificateDto`) : `port`, `subject`, `issuer`, `validFrom`, `expiresAt`,
`daysBeforeExpiry`, `valid` (résultat de la vérification par le collecteur, `null` si non vérifié),
`validationError`, `status` ∈ `valid`, `invalid`, `expired`, `unverified`.

### 4.2 Résultat de scan

Deux formats, selon le côté :

- **Photographie envoyée par le collecteur** : liste des machines qui ont répondu, avec leurs mesures.
  Format complet dans [scanner-contract.md](scanner-contract.md) ; exemple :
  [collecteur/scan.response.json](examples/collecteur/scan.response.json).
- **Exécution de scan vue par l'API** (`ScanRunDto`, [report.ts](../packages/contracts/src/report.ts)) :
  `id`, `startedAt`, `finishedAt`, `status` ∈ `running`, `succeeded`, `failed`, `devicesSeen`,
  `eventsRaised`, `error` (raison en clair d'un échec). Exemple : [scans.response.json](examples/api/scans.response.json).

### 4.3 Mesure

- **Mesures par équipement** : `latencyMs`, `packetLossPercent`, `cpuPercent`, `memory`, `disks`
  portées par `DeviceDto` (dernière valeur ; pas d'historique en v1).
- **Débit** (`ThroughputPointDto`) : `measuredAt`, `mbps`, `sourceDeviceId`, `targetDeviceId`
  (`null` : débit d'une seule machine). Historique conservé. Exemple :
  [throughput.response.json](examples/api/throughput.response.json).

### 4.4 Anomalie et incident — `EventDto`

[event.ts](../packages/contracts/src/event.ts). Tout ce que l'API détecte est un **événement** ; sa
`category` dit de quoi il s'agit :

| `category` | Sens | `type` possibles |
| --- | --- | --- |
| `incident` | **Incident** : un service est interrompu | `device_unreachable` (machine en panne ou coupée par sa passerelle), `downstream_outage` (passerelle qui répond, toutes ses machines en panne) |
| `observation` | **Anomalie** de performance | `throughput_degraded`, `packet_loss`, `resource_saturation` |
| `signalement` | **Anomalie** de sécurité | `exposed_port`, `tls_expiring`, `tls_invalid` |
| `configuration` | Action humaine attendue | `device_discovered` |

| Champ | Type | Description |
| --- | --- | --- |
| `id` | string | Identifiant de l'événement |
| `deviceId`, `deviceName` | string | Équipement concerné |
| `peerDeviceId`, `peerDeviceName` | string \| null | Deuxième équipement : autre extrémité d'un débit, ou **passerelle en cause** d'une machine injoignable |
| `type`, `category` | voir ci-dessus | |
| `severity` | `info`, `warning`, `critical` | |
| `status` | `open`, `acknowledged`, `resolved` | `resolved` est posé par l'API quand la cause disparaît, jamais à la main |
| `summary` | string | Phrase lisible par un non-technicien |
| `details` | objet de valeurs simples | Valeurs mesurées pour le technicien (port, seuil, débit…) ; clés propres à chaque `type`, à ne pas présumer exhaustives |
| `startedAt`, `resolvedAt`, `acknowledgedAt` | date \| null | |
| `durationSeconds` | number | Durée écoulée, ou totale si résolu |

Un seul événement est ouvert par équipement et par cause : il est mis à jour à chaque scan, puis
refermé. Exemples : [events-incidents.response.json](examples/api/events-incidents.response.json),
[events-anomalies.response.json](examples/api/events-anomalies.response.json),
[events-security.response.json](examples/api/events-security.response.json).

### 4.5 Synthèse et rapport

`NetworkSummaryDto` ([summary.response.json](examples/api/summary.response.json)) et `WeeklyReportDto`
([weekly-report.response.json](examples/api/weekly-report.response.json)), dans
[report.ts](../packages/contracts/src/report.ts).

### 4.6 Dépendance — `DependencyDto`

[dependency.ts](../packages/contracts/src/dependency.ts) · exemple :
[dependencies.response.json](examples/api/dependencies.response.json)

« La machine `device` est jointe via l'équipement `dependsOn` ». C'est le graphe qu'utilise la
**corrélation** : si `dependsOn` est hors service, `device` est `unreachable` et son incident désigne
`dependsOn` comme cause.

| Champ | Type | Description |
| --- | --- | --- |
| `id` | string | |
| `device`, `dependsOn` | `{ id, name, reachability }` | |
| `source` | `discovered`, `manual` | Déduite par le collecteur (`gatewayIp`), ou créée / corrigée par un utilisateur |
| `status` | `suggested`, `validated`, `rejected` | **Seules les dépendances `validated` sont utilisées par la corrélation** |
| `usedByCorrelation` | boolean | `status === "validated"` |
| `createdAt`, `updatedAt`, `observedAt` | date (\| null) | `observedAt` : dernière fois que le collecteur a constaté ce lien |

`GET /dependencies` renvoie aussi `issues[]` (`{ kind, severity, message, dependencyIds }`), les
incohérences à corriger : `cycle`, `conflict` (le collecteur voit une autre passerelle que celle
validée), `ignored_upstream`, `multiple_upstreams`.

### 4.7 Validation humaine et ajout manuel

Le scan propose, l'humain décide : **aucun équipement n'entre au référentiel sans validation**.

| `lifecycle` | Signification | Supervisé (incidents, alertes, rapports) | Visible dans le parc |
| --- | --- | --- | --- |
| `pending_classification` | « À valider » : découvert par le collecteur, aucune décision | non (seul l'événement « à identifier » est ouvert) | page « À valider » |
| `active` | Validé : fait partie du référentiel | oui | oui (vue par défaut) |
| `ignored` | Connu mais non supervisé | non | oui (filtre « Ignoré ») |
| `excluded` | Ne fait pas partie du parc (appareil de passage, autre réseau) | non | masqué (filtre « Exclu ») |

Une décision (`PATCH /devices/:id`) porte un **`author`** obligatoire. Chaque action est tracée dans
`decisions[]` (`DeviceDecisionDto`) : `action` ∈ `created`, `merged`, `validated`, `ignored`,
`excluded`, `updated`, `author`, `decidedAt`, état avant et après, rôle, nom et criticité retenus.
NetWatch n'ayant pas de connexion, l'auteur est **déclaré** par la personne (le dashboard le mémorise
dans le navigateur) : c'est une trace, pas une preuve d'identité.

**Ajout manuel** (`POST /devices`, [exemple](examples/api/device-create.request.json)) : pour un
équipement que le collecteur ne trouve pas seul. Champs obligatoires, validés par l'API : `ip` (IPv4),
`label`, `kind` (hors `unknown`), `critical` (booléen), `author` ; `mac` facultative. L'équipement est
créé `active`, `origin: "manual"`, `reachability: "unknown"`, `lastSeenAt: null`
([réponse](examples/api/device-create.response.json)). Son IP est ensuite transmise au collecteur à chaque
scan (`?targets=`, voir [scanner-contract.md](scanner-contract.md)) : il est supervisé comme les autres,
et passe en panne s'il ne répond pas.

**Doublons** : si un équipement connu a la même IP ou la même MAC, l'ajout est refusé en 409
`duplicate_device` et `details` le désigne ([exemple](examples/api/error-409-duplicate.response.json)) :

```json
{ "existing": { "id": "…", "name": "Serveur ERP", "reachability": "up", "ip": "10.20.0.20", "mac": "02:20:00:00:00:14", "lifecycle": "active", "origin": "discovered" }, "matchedOn": ["ip"] }
```

Pour **fusionner**, renvoyer le même corps avec `mergeInto: existing.id` : l'équipement existant reçoit le
nom, le rôle et la criticité saisis et passe `active` ; ce que le collecteur a observé est conservé ; la
fusion est tracée (`merged`). Une fusion vers un équipement qui n'a ni cette IP ni cette MAC est refusée (400).

## 5. Routes

Préfixe `/api/v1` sauf `/healthz`. Les corps de requête sont validés : un champ inconnu est ignoré,
un champ invalide donne une erreur 400 détaillée.

| Verbe | Route | Paramètres / corps | Réponse | Erreurs |
| --- | --- | --- | --- | --- |
| GET | `/healthz` | — | `{ status, contractVersion }` | — |
| GET | `/summary` | — | `NetworkSummaryDto` | — |
| GET | `/devices` | `q` (recherche IP, nom, MAC, fabricant), `kind`, `lifecycle`, `reachability` | `DeviceDto[]`, critiques d'abord | 400 |
| GET | `/devices/:id` | — | `{ device: DeviceDto, dependents: DeviceLinkDto[], events: EventDto[], decisions: DeviceDecisionDto[] }` (décisions les plus récentes d'abord) | 404 |
| POST | `/devices` | `{ ip, label, kind, critical, mac?, author, mergeInto? }` ([exemple](examples/api/device-create.request.json)) — ajout manuel (§ 4.7) | 201 `DeviceDto` ; 200 si fusionné (`mergeInto`) | 400, 404 (`mergeInto` inconnu), 409 `duplicate_device` |
| POST | `/devices/validate-pending` | `{ author }` — « Tout valider » : valide chaque machine à valider, avec le rôle et le nom qu'elle a déjà | `{ validated, devices: DeviceLinkDto[] }` ; une décision `validated` tracée par machine | 400 (`author` absent) |
| PATCH | `/devices/:id` | `{ kind, label?, critical?, lifecycle?: "active" \| "ignored" \| "excluded", author }` ([exemple](examples/api/device-classify.request.json)) — valider (par défaut), ignorer, exclure, ou corriger la fiche | `DeviceDto` ; referme l'événement « à identifier » ; décision tracée | 400 (dont `author` absent), 404 |
| GET | `/dependencies` | `status`, `deviceId` (filtrent la liste ; `counts` et `issues` portent sur tout le graphe) | `DependencyGraphDto` | 400 |
| POST | `/dependencies` | `{ deviceId, dependsOnId }` ([exemple](examples/api/dependency-create.request.json)) — créée `manual`, `validated` | 201 `DependencyDto` | 400 (lui-même), 404, 409 (cycle) |
| PATCH | `/dependencies/:id` | `{ status? }` pour valider / rejeter / restaurer, `{ dependsOnId? }` pour corriger (devient `manual`, `validated`) ([exemple](examples/api/dependency-update.request.json)) | `DependencyDto` | 400, 404, 409 (cycle, doublon) |
| DELETE | `/dependencies/:id` | — | `{ outcome: "deleted" \| "rejected", dependency }` : une suggestion est rejetée (elle ne reviendra pas), une dépendance manuelle est supprimée | 404 |
| POST | `/dependencies/validate-suggestions` | — | `{ validated, skipped }` : valide les suggestions sauf celles qui créeraient un cycle ou contredisent une dépendance validée | — |
| GET | `/events` | `category`, `status`, `deviceId` (équipement ou passerelle en cause), `since` (date), `limit` (≤ 500) | `EventDto[]`, plus récents d'abord | 400 |
| POST | `/events/:id/acknowledge` | — | `EventDto` (`acknowledged`) | 400 (déjà résolu), 404 |
| DELETE | `/events/:id/acknowledge` | — | `EventDto` (`open`) | 400 (pas pris en charge), 404 |
| GET | `/metrics/throughput` | `from`, `to` (dates, défaut : 7 derniers jours), `deviceId` | `ThroughputPointDto[]` | 400 |
| GET | `/reports/weekly` | `week` (une date de la semaine voulue, défaut : semaine en cours) | `WeeklyReportDto` | 400 |
| GET | `/reports/weekly.pdf` | `week` | `application/pdf` en pièce jointe | 400 |
| GET | `/scans` | — | `ScanRunDto[]` (20 derniers) | — |
| POST | `/scans/run` | — | 202 `ScanRunDto` ; un collecteur injoignable donne `status: "failed"` et `error`, pas une erreur HTTP | — |
| POST | `/scans/import` | une photographie au format du collecteur ([scanner-contract.md](scanner-contract.md)), validée **strictement** (champ inconnu refusé) — injection d'un jeu de données fictif (`npm run scan:inject`) | 201 `ScanRunDto` ; ingérée comme un vrai scan | 400 (non conforme, `details[]`), 403 `forbidden` (désactivée : production sans `SCAN_IMPORT=enabled`) |
| GET | `/settings` | — | `MonitoringSettingsDto` | — |
| PUT | `/settings` | sous-ensemble de `MonitoringSettingsDto` ([exemple](examples/api/settings-update.request.json)) | `MonitoringSettingsDto` complet | 400 |

## 6. Erreurs

Toute réponse 4xx/5xx a la forme `ApiErrorDto` ([index.ts](../packages/contracts/src/index.ts)) :

```json
{ "error": { "code": "conflict", "message": "Cette dépendance créerait un cycle : Passerelle atelier → pc-atelier-01 → Passerelle atelier" } }
```

| HTTP | `code` | Quand | Exemple |
| --- | --- | --- | --- |
| 400 | `bad_request` | Paramètre ou corps invalide (`details[]` : `{ path, message }`), ou action impossible dans l'état actuel | [error-400-validation](examples/api/error-400-validation.response.json) |
| 403 | `forbidden` | Action désactivée sur cette instance (injection de scans en production) | — |
| 404 | `not_found` | Équipement, événement ou dépendance inconnu | [error-404](examples/api/error-404.response.json) |
| 409 | `conflict` | L'opération contredit le graphe existant (cycle, doublon) | [error-409-cycle](examples/api/error-409-cycle.response.json) |
| 409 | `duplicate_device` | Ajout manuel d'un équipement déjà connu à la même IP ou MAC (`details` : l'équipement existant, § 4.7) | [error-409-duplicate](examples/api/error-409-duplicate.response.json) |
| 502 | `scanner_unavailable` | Réservé : en v1 un échec du collecteur est rapporté dans `ScanRunDto`, pas en erreur HTTP | — |
| 500 | `internal_error` | Erreur inattendue (détail dans le journal de l'API, jamais dans la réponse) | — |

`message` est en français et peut être affiché tel quel ; un client décide sur `code`, pas sur `message`.

## 7. Travailler sur des données simulées

Toutes ces sources produisent des données conformes au contrat (elles passent par la même validation
que le vrai collecteur) :

| Besoin | Commande |
| --- | --- |
| Développer le dashboard **sans base ni collecteur** | `npm run dev:demo` (API en mémoire avec un réseau fictif + dashboard sur http://localhost:5173) |
| Développer sur un **jeu de données précis**, sans collecteur ni base | `npm run dev:injection` (API sans aucun scan automatique), puis `npm run scan:inject -- <scénario ou fichier>` ; détail : [tools/scanner-test](../tools/scanner-test/README.md) |
| Tester les **cas limites** (équipement inconnu, services disparus, valeurs aux bornes) | `npm run scan:inject -- 5-cas-limites-1-reference 5-cas-limites-2-inconnu-et-services-disparus 5-cas-limites-3-valeurs-limites` |
| Développer le dashboard sans API | lire les réponses de [docs/examples/api](examples/api) |
| Développer le collecteur | valider sa réponse contre [collecteur/scan.response.json](examples/collecteur/scan.response.json) et [scanner-contract.md](scanner-contract.md) ; le faux collecteur [tools/scanner-test](../tools/scanner-test) sert de modèle |
| Toute la chaîne avec un réseau qui tombe en panne régulièrement | `docker compose up` (voir README) |

## 8. Exemples

[docs/examples](examples) contient des réponses réelles de l'API, produites sur le réseau de test
`4-reseau-passerelles` au moment où la passerelle de l'atelier est en panne. Après toute évolution :

```bash
npm run contract:examples -w @netwatch/api
```

Le test `apps/api/tests/contract/examples.test.ts` échoue si un exemple ne correspond plus au code.
