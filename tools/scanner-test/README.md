# Collecteur simulé

Simule le collecteur réseau avec des réponses conformes à [docs/scanner-contract.md](../../docs/scanner-contract.md),
pour faire tourner NetWatch sans réseau réel. C'est le service `collector` de `docker-compose.yml` :
il démarre avec `docker compose up`, tant que le collecteur Python n'est pas branché.

## Lancer

```bash
# Repartir d'une base vide (efface toutes les données)
docker compose down -v

# Toute la stack, branchée sur le collecteur simulé (configuration par défaut)
docker compose up -d --build --wait
```

En développement (`npm run dev`, API sur la machine), démarrer seulement le collecteur :
`docker compose up -d --no-deps collector`, avec `SCANNER_URL=http://localhost:8090` dans `apps/api/.env`.

Tableau de bord : http://localhost:3001 — faux scanner : http://localhost:8090

Le conteneur redémarre automatiquement (`restart: unless-stopped`) : s'il est arrêté, tous les scans
échouent en « connexion refusée — le scanner n'est pas démarré », visible dans la page « Scans ».

## Scénario par défaut : `4-reseau-passerelles`

Réseau de 38 équipements, qui évolue d'un scan à l'autre :

| Équipements | Défaut attendu dans NetWatch |
| --- | --- |
| **Serveurs** : `srv-fichiers`, `srv-erp`, `srv-messagerie` | Disque D: de `srv-fichiers` à 96 % ; certificat **auto-signé** sur `srv-erp` (+ SQL Server 1433 et RDP 3389 exposés) ; processeur de `srv-messagerie` à 94 % et certificat expirant dans 12 jours |
| **Caméras** : `cam-entree`, `cam-parking`, `cam-quai`, `cam-atelier`, `cam-accueil` | `cam-entree` perd 12 % des paquets ; Telnet (23) ouvert sur `cam-parking` ; certificat de `cam-quai` expirant dans 5 jours (critique) |
| **Passerelles** : `gw-direction` (3 PC), `gw-atelier` (8 PC), `gw-compta` (5 PC), `gw-commercial` (10 PC) | `gw-atelier` **tombe régulièrement** (voir le cycle) ; `gw-commercial` : processeur à 95 % et 6 % de perte de paquets |
| **PC** (26) | VNC (5900) ouvert sur `pc-direction-02` ; mémoire de `pc-compta-03` à 95 % ; disque C: de `pc-commercial-07` à 97 % |

Les dates des certificats sont calculées à partir de l'heure du scan : le scénario ne vieillit pas.

### Cycle de 10 scans (50 min au rythme par défaut de 5 min)

| Scans | Phase | Ce qu'il faut constater |
| --- | --- | --- |
| 0 à 2 | normal | 38 machines en ligne, défauts permanents ci-dessus |
| 3 et 4 | **passerelle en panne** — `gw-atelier` et ses 8 PC ne répondent plus | Panne **critique** « Passerelle gw-atelier en panne : 8 machine(s) sur 8 derrière elle sont injoignables » ; les 8 PC sont **Injoignables** (pas « Hors ligne »), panne en simple information avec `gw-atelier` pour cause |
| 5 et 6 | normal | Les 9 pannes se referment |
| 7 et 8 | **PC en panne** — `gw-atelier` répond, aucun de ses PC | Les 8 PC sont **Hors ligne** (« ne répond plus (sa passerelle gw-atelier répond) ») ; incident critique « panne en aval » sur `gw-atelier` |
| 9 | normal | Tout se referme |

Le cycle recommence ensuite. Pour voir une phase sans attendre :
`http://localhost:8090/use/4-reseau-passerelles?scan=3` (ou `?scan=7`), puis « Lancer un scan maintenant »
dans la page Scans. `http://localhost:8090/` indique le numéro et la phase du prochain scan.

## Anciens scénarios (fixes)

À jouer dans l'ordre via `http://localhost:8090/use/<nom>`. Ils utilisent un autre réseau (192.168.10.x) :
repartir d'une base vide avant de les jouer, pour ne pas mélanger les deux parcs.

| Scénario | Ce qu'il faut constater |
| --- | --- |
| `1-reseau-normal` | 17 équipements « à identifier » ; signalements TLS : `srv-erp` (~20 j, avertissement), `nas-sauvegarde` (~4 j, critique), `srv-mail` port 443 (expiré), `srv-mail` port 993 **invalide** (nom d'hôte différent) ; ports surveillés ouverts (1433, 3389 sur `srv-erp`, 445 sur le NAS, 25 sur `srv-mail`). |
| `2-incidents` | Pannes : `sw-etage1` et les 4 postes derrière lui ; deux nouvelles machines ; débit ERP → NAS en baisse ; lien Internet sous le plancher. Perte de paquets sur `srv-erp` et `cam-parking`, saturations sur `srv-erp`, le NAS et `srv-mail`. |
| `3-retour-normal` | Les pannes et alertes se referment ; certificats du NAS et de `srv-mail` corrigés ; le port VNC du Raspberry Pi n'est plus signalé. |

Leurs dates de certificats sont fixes (septembre–octobre 2026) : ajustez-les si vous les rejouez plus tard.

## Modifier ou ajouter un scénario

Les fichiers de `scenarios/` sont relus à chaque scan : on peut les modifier sans rien redémarrer.

- `scenarios/mon-test.json` : photographie fixe ; `scannedAt` est remplacé par l'heure actuelle.
- `scenarios/mon-test.mjs` : scénario qui évolue ; il exporte `default({ scanNumber, now })` qui renvoie
  la photographie, et éventuellement `phase(scanNumber)` pour nommer l'étape (voir `4-reseau-passerelles.mjs`).

Le scénario devient disponible via `/use/mon-test`.
