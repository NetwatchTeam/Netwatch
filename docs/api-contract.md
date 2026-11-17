# Contrat d'échange NetWatch — version 1.0.0

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
| Version du contrat | `1.0.0` (`CONTRACT_VERSION` dans `packages/contracts`) |
| Base des routes | `/api/v1` — la version majeure fait partie de l'URL |
| En-tête de réponse | `X-NetWatch-Contract: 1.0.0` sur toutes les réponses `/api/v1` |
| Requête au collecteur | l'API envoie `X-NetWatch-Contract: 1.0.0` à chaque `GET /scan` |
| Réponse du collecteur | champ facultatif `contractVersion` (« 1.0.0 » ou « 1 ») ; une autre version majeure est **refusée** et le scan enregistré en échec avec la raison |
| Santé | `GET /healthz` → `{ "status": "ok", "contractVersion": "1.0.0" }` |

Règles d'évolution (versionnement sémantique) :

- **Correctif** (1.0.x) : documentation, exemples, aucun changement de format.
- **Mineure** (1.x.0) : ajout rétrocompatible : nouveau champ **facultatif**, nouvelle route, nouvelle
  valeur d'énumération côté réponse. Un client doit **ignorer les champs inconnus**.
- **Majeure** (x.0.0) : rupture (champ retiré, renommé ou rendu obligatoire, sens modifié). Elle donne une
  nouvelle base `/api/v2` ; `/api/v1` reste servie le temps que les autres modules migrent.

Toute modification du contrat se fait dans la même demande de fusion que : ce document, les types de
`packages/contracts`, les exemples régénérés (`npm run contract:examples -w @netwatch/api`) et
`CONTRACT_VERSION`.

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
MAC. Sans MAC, un changement d'IP crée un nouvel équipement, que le gestionnaire devra classer.

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
| `lifecycle` | `pending_classification`, `active`, `ignored` | `pending_classification` tant qu'un humain ne l'a pas identifié |
| `reachability` | `up`, `down`, `unreachable`, `unknown` | `down` : en panne ; `unreachable` : coupé par la panne de l'équipement dont il dépend (§ 4.6) |
| `gatewayIp` | string \| null | Passerelle vue par le collecteur (donnée brute) |
| `gateway` | `{ id, name, reachability }` \| null | Passerelle selon les dépendances **validées** |
| `latencyMs`, `packetLossPercent` | number \| null | Qualité de la liaison au dernier scan (`null` si la machine ne répond plus) |
| `cpuPercent`, `memory` | number \| null, `{ usedPercent, totalMb }` \| null | Ressources au dernier scan |
| `disks[]` | `{ name, usedPercent, totalGb }` | Dernier état connu des disques |
| `ports[]` | `{ port, protocol, services[] }` | Ports ouverts ; `services[]` : `{ name, product, version }` |
| `certificates[]` | voir ci-dessous | Certificats TLS présentés |
| `firstSeenAt`, `lastSeenAt`, `lastChangeAt` | date | Première détection, dernière réponse, dernier changement d'état |
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

## 5. Routes

Préfixe `/api/v1` sauf `/healthz`. Les corps de requête sont validés : un champ inconnu est ignoré,
un champ invalide donne une erreur 400 détaillée.

| Verbe | Route | Paramètres / corps | Réponse | Erreurs |
| --- | --- | --- | --- | --- |
| GET | `/healthz` | — | `{ status, contractVersion }` | — |
| GET | `/summary` | — | `NetworkSummaryDto` | — |
| GET | `/devices` | `q` (recherche IP, nom, MAC, fabricant), `kind`, `lifecycle`, `reachability` | `DeviceDto[]`, critiques d'abord | 400 |
| GET | `/devices/:id` | — | `{ device: DeviceDto, dependents: DeviceLinkDto[], events: EventDto[] }` | 404 |
| PATCH | `/devices/:id` | `{ kind, label?, critical?, lifecycle?: "active" \| "ignored" }` ([exemple](examples/api/device-classify.request.json)) | `DeviceDto` ; referme l'événement « à identifier » | 400, 404 |
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
| 404 | `not_found` | Équipement, événement ou dépendance inconnu | [error-404](examples/api/error-404.response.json) |
| 409 | `conflict` | L'opération contredit le graphe existant (cycle, doublon) | [error-409-cycle](examples/api/error-409-cycle.response.json) |
| 502 | `scanner_unavailable` | Réservé : en v1 un échec du collecteur est rapporté dans `ScanRunDto`, pas en erreur HTTP | — |
| 500 | `internal_error` | Erreur inattendue (détail dans le journal de l'API, jamais dans la réponse) | — |

`message` est en français et peut être affiché tel quel ; un client décide sur `code`, pas sur `message`.

## 7. Travailler sur des données simulées

Toutes ces sources produisent des données conformes au contrat (elles passent par la même validation
que le vrai collecteur) :

| Besoin | Commande |
| --- | --- |
| Développer le dashboard **sans base ni collecteur** | `npm run dev:demo` (API en mémoire avec un réseau fictif + dashboard sur http://localhost:5173) |
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
