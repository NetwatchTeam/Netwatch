# Contrat entre l'API NetWatch et le scanner

Ce document décrit ce que l'API attend du scanner réseau. Il s'adresse à l'équipe qui développe le scanner.

## Principe

L'API **appelle** le scanner à intervalle régulier (5 minutes par défaut, réglable depuis l'interface).
Le scanner n'a rien à pousser, rien à planifier et ne connaît ni la base de données ni l'interface :
il répond à une requête par une photographie de l'état du réseau.

```
API NetWatch  ──GET /scan──►  Scanner  ──ping / ports / TLS / débit──►  Parc (10 à 100 machines)
              ◄──JSON────────
```

## Requête

```
GET {SCANNER_URL}/scan
Accept: application/json
Authorization: Bearer {SCANNER_TOKEN}   (seulement si SCANNER_TOKEN est configuré)
```

- Délai d'attente maximal : 15 s par défaut (`SCANNER_TIMEOUT_MS`).
- Un code différent de 200, un JSON invalide ou un dépassement de délai est enregistré comme un
  scan en échec et affiché dans la page « Scans » ; l'état connu des équipements n'est pas modifié.
- L'appel doit être sans effet de bord : l'API peut le rejouer (bouton « Lancer un scan maintenant »).

## Réponse

```json
{
  "scannedAt": "2026-09-20T08:00:00Z",
  "devices": [
    {
      "ip": "192.168.1.10",
      "mac": "3c:52:82:4a:10:10",
      "hostname": "srv-erp",
      "vendor": "Dell",
      "latencyMs": 3.2,
      "openPorts": [443, 1433, 3389],
      "certificates": [
        {
          "port": 443,
          "subject": "CN=srv-erp.exemple.local",
          "issuer": "CN=AC interne",
          "expiresAt": "2026-10-15T23:59:59Z"
        }
      ]
    }
  ],
  "throughput": [
    { "sourceIp": "192.168.1.60", "targetIp": "192.168.1.11", "mbps": 912.4 }
  ]
}
```

### Règle la plus importante

**`devices` ne contient que les machines qui ont répondu.** Une machine connue absente de la liste
est considérée comme ne répondant pas ; après `missedScansBeforeIncident` scans consécutifs
(1 par défaut), l'API ouvre une panne. Le scanner n'a donc jamais à dire qu'une machine est en panne.

### Champs

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `scannedAt` | oui | Date ISO 8601 avec fuseau, moment du scan |
| `devices[].ip` | oui | Adresse IPv4 ou IPv6 |
| `devices[].mac` | non | Adresse MAC. **Fortement recommandée** : c'est elle qui identifie durablement une machine dont l'IP change |
| `devices[].hostname` | non | Nom réseau |
| `devices[].vendor` | non | Fabricant déduit de l'OUI de la MAC |
| `devices[].latencyMs` | non | Temps de réponse en millisecondes |
| `devices[].openPorts` | non | Ports TCP ouverts (défaut : `[]`) |
| `devices[].certificates` | non | Certificats TLS présentés, avec leur date d'expiration |
| `throughput` | non | Mesures de débit ; `targetIp` nul si la mesure ne concerne qu'une machine |

### Identification des machines

L'API rapproche une observation d'une machine connue **par l'adresse MAC d'abord, par l'IP ensuite**.
Sans MAC, un changement d'adresse IP crée une machine en double, que le gestionnaire devra classer.

### Mesures de débit

`mbps` est un débit en mégabits par seconde. L'API compare chaque mesure à la médiane des 7 derniers
jours **pour le même trajet** : la même paire `sourceIp`/`targetIp` doit donc revenir d'un scan à
l'autre. Une observation est ouverte si le débit chute de plus de 40 % sous cette référence, ou passe
sous un plancher configurable.

## Ce que l'API en fait

| Constat | Famille d'événement | Détail |
| --- | --- | --- |
| Machine connue absente de `devices` | **Panne** (incident) | Ouverte après le seuil de scans manqués, refermée au retour |
| IP/MAC jamais vue | **À configurer** | La machine reste « à identifier » tant qu'un utilisateur n'a pas déclaré ce qu'elle est |
| Port de `openPorts` figurant dans les ports surveillés | **Signalement** | Refermé quand le port n'est plus ouvert |
| Certificat expirant dans moins de 30 jours | **Signalement** | Sévérité critique à moins de 7 jours ; refermé au renouvellement |
| Débit nettement sous la référence du trajet | **Observation** | Refermée au retour à la normale |

## Version

Ce contrat correspond à la version 1 de l'API (`/api/v1`). Tout champ ajouté à la réponse du scanner
est ignoré par l'API tant qu'il n'est pas déclaré dans
[apps/api/src/infrastructure/scanner/snapshot-schema.ts](../apps/api/src/infrastructure/scanner/snapshot-schema.ts),
qui est la référence exécutable de ce document.
