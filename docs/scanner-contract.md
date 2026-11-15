# Contrat entre l'API NetWatch et le collecteur — version 1.1.0

Ce document décrit ce que l'API attend du collecteur réseau (le « scanner »). Il s'adresse à l'équipe qui
développe le collecteur. Le contrat entre l'API et le dashboard, les conventions communes et le
versionnement sont dans [api-contract.md](api-contract.md).

## Principe

L'API **appelle** le scanner à intervalle régulier (5 minutes par défaut, réglable depuis l'interface).
Le scanner n'a rien à pousser, rien à planifier et ne connaît ni la base de données ni l'interface :
il répond à une requête par une photographie de l'état du réseau.

```
API NetWatch  ──GET /scan──►  Scanner  ──ping / ports / services / TLS / ressources / débit──►  Parc (10 à 100 machines)
              ◄──JSON────────
```

## Requête

```
GET {SCANNER_URL}/scan
Accept: application/json
X-NetWatch-Contract: 1.1.0              (version du contrat attendue par l'API)
Authorization: Bearer {SCANNER_TOKEN}   (seulement si SCANNER_TOKEN est configuré)
```

- Délai d'attente maximal : 15 s par défaut (`SCANNER_TIMEOUT_MS`).
- Un code différent de 200, un JSON invalide ou un dépassement de délai est enregistré comme un
  scan en échec et affiché dans la page « Scans » ; l'état connu des équipements n'est pas modifié.
- L'appel doit être sans effet de bord : l'API peut le rejouer (bouton « Lancer un scan maintenant »).

### Équipements à sonder en plus (`targets`, depuis 1.1.0)

```
GET {SCANNER_URL}/scan?targets=192.168.1.20,10.20.0.250
```

Quand des équipements ont été **ajoutés à la main** dans NetWatch (parce que la découverte ne les trouve
pas : hors du sous-réseau balayé, pas de réponse à l'ARP, filtrage…), l'API envoie leurs IP dans
`targets`, séparées par des virgules. Le paramètre est absent s'il n'y en a aucun.

Le collecteur doit **sonder ces IP en plus de sa découverte habituelle** (ping, puis ports, TLS et
ressources comme pour les autres) :

- un équipement qui répond figure dans `devices`, exactement comme un équipement découvert ;
- un équipement qui ne répond pas est **simplement absent** de `devices` : c'est l'API qui décide de la panne ;
- une IP déjà trouvée par la découverte n'apparaît qu'une fois.

Un collecteur 1.0 qui ignore `targets` reste accepté, mais les équipements ajoutés à la main passeront
en panne faute d'être sondés. Le faux collecteur [tools/scanner-test](../tools/scanner-test) montre le
comportement attendu (les IP en `.250` à `.254` y restent muettes, pour tester une panne).

## Réponse

```json
{
  "contractVersion": "1.1.0",
  "scannedAt": "2026-09-20T08:00:00Z",
  "devices": [
    {
      "ip": "192.168.1.10",
      "mac": "3c:52:82:4a:10:10",
      "hostname": "srv-erp",
      "vendor": "Dell",

      "latencyMs": 3.2,
      "packetLossPercent": 0,

      "cpuPercent": 37.5,
      "memory": { "usedPercent": 68.2, "totalMb": 32768 },
      "disks": [
        { "name": "C:", "usedPercent": 71.4, "totalGb": 476.9 },
        { "name": "E:", "usedPercent": 92.8, "totalGb": 1863 }
      ],

      "ports": [
        {
          "port": 443,
          "protocol": "tcp",
          "services": [{ "name": "https", "product": "Microsoft IIS httpd", "version": "10.0" }]
        },
        {
          "port": 1433,
          "protocol": "tcp",
          "services": [{ "name": "ms-sql-s", "product": "Microsoft SQL Server 2019" }]
        },
        { "port": 3389, "protocol": "tcp", "services": [{ "name": "ms-wbt-server" }] }
      ],

      "certificates": [
        {
          "port": 443,
          "subject": "CN=srv-erp.exemple.local",
          "issuer": "CN=AC interne",
          "validFrom": "2025-10-15T00:00:00Z",
          "expiresAt": "2026-10-15T23:59:59Z",
          "valid": false,
          "validationError": "chaîne de confiance incomplète"
        }
      ]
    },
    {
      "ip": "192.168.20.41",
      "hostname": "pc-atelier-01",
      "gatewayIp": "192.168.1.254",
      "latencyMs": 2.4,
      "packetLossPercent": 0
    },
    {
      "ip": "192.168.1.30",
      "hostname": "imp-compta",
      "latencyMs": 1.1,
      "packetLossPercent": 0,
      "ports": [{ "port": 9100, "protocol": "tcp", "services": [{ "name": "jetdirect" }] }]
    }
  ],
  "throughput": [
    { "sourceIp": "192.168.1.60", "targetIp": "192.168.1.10", "mbps": 912.4 }
  ]
}
```

La seconde machine (une imprimante) illustre un équipement **sans agent** : elle ne remonte ni
processeur, ni mémoire, ni disques. Tous ces champs sont facultatifs.

### Règle la plus importante

**`devices` ne contient que les machines qui ont répondu.** Une machine connue absente de la liste
est considérée comme ne répondant pas ; après `missedScansBeforeIncident` scans consécutifs
(1 par défaut), l'API ouvre une panne. Le scanner n'a donc jamais à dire qu'une machine est en panne.

### Champs

Les pourcentages sont des nombres de **0 à 100** (et non de 0 à 1). Les dates sont au format
ISO 8601 **avec fuseau** (`Z` ou `+02:00`). Un champ facultatif peut être omis ou valoir `null`.

**Identification**

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `contractVersion` | non (recommandé) | Version du contrat que respecte le collecteur (« 1.1.0 », « 1.0.0 » ou « 1 »). Une autre version majeure que celle de l'API est refusée : le scan est enregistré en échec avec la raison |
| `scannedAt` | oui | Moment du scan |
| `devices[].ip` | oui | Adresse IPv4 ou IPv6 |
| `devices[].mac` | non | Adresse MAC. **Fortement recommandée** : c'est elle qui identifie durablement une machine dont l'IP change |
| `devices[].hostname` | non | Nom réseau |
| `devices[].vendor` | non | Fabricant déduit de l'OUI de la MAC |
| `devices[].gatewayIp` | non | Passerelle par laquelle la machine est jointe (dernier saut avant elle, ex. d'après un traceroute), **telle qu'elle figure dans `devices[].ip`**. Absente pour une machine du réseau principal. Voir « Passerelles » ci-dessous |

**Qualité de la liaison**

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `devices[].latencyMs` | non | Temps de réponse moyen, en millisecondes |
| `devices[].packetLossPercent` | non | Part des paquets de test perdus, de 0 à 100 (ex. 1 perdu sur 20 → `5`) |

**Ressources** (machines équipées d'un agent ou interrogeables en SNMP/WMI)

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `devices[].cpuPercent` | non | Charge processeur moyenne, de 0 à 100 |
| `devices[].memory.usedPercent` | oui si `memory` est fourni | Mémoire vive occupée, de 0 à 100 |
| `devices[].memory.totalMb` | non | Mémoire vive totale, en mégaoctets |
| `devices[].disks[].name` | oui | Lecteur ou point de montage (`C:`, `/`, `/var`, `volume1`…) ; doit rester stable d'un scan à l'autre |
| `devices[].disks[].usedPercent` | oui | Occupation du disque, de 0 à 100 |
| `devices[].disks[].totalGb` | non | Capacité, en gigaoctets |

Une liste `disks` vide ou absente signifie « non mesuré à ce scan » : l'API conserve alors le dernier
état connu. Dès qu'elle contient au moins un disque, elle doit les contenir **tous**.

**Ports et services**

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `devices[].ports[].port` | oui | Numéro de port ouvert |
| `devices[].ports[].protocol` | non | `tcp` (défaut) ou `udp` |
| `devices[].ports[].services[]` | non | Services identifiés derrière ce port (défaut : `[]`, service inconnu) |
| `…services[].name` | oui | Nom du service (`https`, `ssh`, `ms-sql-s`…), de préférence au format nmap |
| `…services[].product` | non | Logiciel identifié (`nginx`, `OpenSSH`, `Microsoft IIS httpd`…) |
| `…services[].version` | non | Version du logiciel |

**Certificats TLS**

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `devices[].certificates[].port` | oui | Port sur lequel le certificat est présenté |
| `…subject` | oui | Sujet (`CN=…`) |
| `…issuer` | non | Émetteur |
| `…validFrom` | non | Début de validité (notBefore) |
| `…expiresAt` | oui | Fin de validité (notAfter) |
| `…valid` | non | Résultat de la vérification par le scanner : `true` accepté, `false` refusé, absent = non vérifié |
| `…validationError` | non | Si `valid` vaut `false`, la raison en clair : « certificat auto-signé », « nom d'hôte différent », « chaîne de confiance incomplète », « révoqué »… Elle est affichée telle quelle au technicien |

La vérification attendue est celle d'un client TLS standard : chaîne de confiance jusqu'à une autorité
reconnue (y compris l'AC interne du client si elle est installée sur le scanner), correspondance du nom
d'hôte, période de validité et, si possible, révocation.

**Débit**

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `throughput` | non | Mesures de débit ; `targetIp` nul si la mesure ne concerne qu'une machine |

### Passerelles

Quand une passerelle tombe, les machines derrière elle disparaissent aussi du scan. Sans topologie,
l'API verrait N+1 pannes indépendantes. Avec `gatewayIp`, elle distingue :

| Situation | Ce que montre NetWatch |
| --- | --- |
| La passerelle ne répond plus | Une panne **critique** sur la passerelle (« Passerelle X en panne : 8 machines derrière elle sont injoignables ») ; ses machines passent à l'état **Injoignable** (et non « En panne »), avec la passerelle comme cause |
| La passerelle répond, mais aucune machine derrière elle (au moins 2) | Les machines sont **En panne** ; la passerelle reçoit un incident « panne en aval » (switch, câblage, alimentation de la zone) |
| La passerelle répond, quelques machines derrière elle non | Pannes individuelles des machines concernées |

Il suffit de renvoyer `gatewayIp` quand la machine répond : l'API retient la dernière passerelle connue
et s'en sert quand la machine ne répond plus. Une passerelle derrière une autre passerelle est gérée
(la passerelle la plus proche du cœur porte la panne). Pour que la passerelle soit reconnue, elle doit
elle-même figurer dans `devices` avec cette IP.

### Identification des machines

L'API rapproche une observation d'une machine connue **par l'adresse MAC d'abord, par l'IP ensuite**.
Sans MAC, un changement d'adresse IP crée une machine en double, que le gestionnaire devra classer.

### Mesures de débit

`mbps` est un débit en mégabits par seconde. L'API compare chaque mesure à la médiane des 7 derniers
jours **pour le même trajet** : la même paire `sourceIp`/`targetIp` doit donc revenir d'un scan à
l'autre. Une observation est ouverte si le débit chute de plus de 40 % sous cette référence, ou passe
sous un plancher configurable.

## Ce que l'API en fait

Tous les seuils ci-dessous se règlent dans la page « Réglages » (valeurs par défaut indiquées).

| Constat | Famille d'événement | Détail |
| --- | --- | --- |
| Machine connue absente de `devices` | **Panne** (incident) | Ouverte après le seuil de scans manqués, refermée au retour. Critique pour une passerelle ; simple information pour une machine coupée par sa passerelle |
| Passerelle présente, toutes ses machines absentes | **Panne** (incident) | « Panne en aval » sur la passerelle, refermée dès qu'une machine revient |
| IP/MAC jamais vue | **À configurer** | La machine reste « à identifier » tant qu'un utilisateur n'a pas déclaré ce qu'elle est |
| Port de `ports` figurant dans les ports surveillés | **Signalement** | Le service détecté est repris dans l'alerte ; refermé quand le port n'est plus ouvert |
| Certificat expirant dans moins de 30 jours | **Signalement** | Sévérité critique à moins de 7 jours ; refermé au renouvellement |
| Certificat avec `valid: false` (et pas encore expiré) | **Signalement** | Affiche `validationError` ; refermé quand le certificat redevient valide ou disparaît |
| `packetLossPercent` ≥ 5 % | **Observation** | Critique à partir de 50 % ; refermée sous le seuil |
| `cpuPercent`, `memory.usedPercent` ou un disque ≥ 90 % | **Observation** | Une par ressource (et par disque) ; critique à partir de 98 % ; refermée sous le seuil |
| Débit nettement sous la référence du trajet | **Observation** | Refermée au retour à la normale |

Une mesure absente (`null`, champ omis) ne ferme jamais une alerte en cours : sans mesure, l'API ne
peut pas constater le retour à la normale.

Quand une machine ne répond plus, l'API efface ses mesures instantanées (latence, perte de paquets,
processeur, mémoire) et garde le dernier état connu de ses disques, ports et certificats.

## Version

Ce document correspond à la version **1.1.0** du contrat (règles d'évolution :
[api-contract.md § 1](api-contract.md#1-versionnement)). Un exemple réel et validé par les tests est dans
[docs/examples/collecteur/scan.response.json](examples/collecteur/scan.response.json).

Tout champ ajouté à la réponse du collecteur est ignoré par l'API tant qu'il n'est pas déclaré dans
[apps/api/src/infrastructure/scanner/snapshot-schema.ts](../apps/api/src/infrastructure/scanner/snapshot-schema.ts),
qui est la référence exécutable de ce document.

L'ancien champ `openPorts` (simple liste de numéros) est remplacé par `ports` : il est désormais
**ignoré**. Un scanner qui l'envoie encore verra ses machines apparaître sans aucun port ouvert.
