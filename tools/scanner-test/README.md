# Faux scanner de test

Simule le scanner réseau avec des fichiers JSON conformes à [docs/scanner-contract.md](../../docs/scanner-contract.md),
pour vérifier le tableau de bord sans réseau réel.

## Lancer

```bash
# Repartir d'une base vide (efface les données de démonstration)
docker compose down -v

# NetWatch branché sur le faux scanner
SCANNER_MODE=http SCANNER_URL=http://scanner-test:8080 docker compose --profile test up -d --build
```

Sous PowerShell :

```powershell
$env:SCANNER_MODE="http"; $env:SCANNER_URL="http://scanner-test:8080"; docker compose --profile test up -d --build
```

Tableau de bord : http://localhost:3001 — faux scanner : http://localhost:8090

## Scénarios

À jouer dans l'ordre. Pour changer de scénario, ouvrir `http://localhost:8090/use/<nom>`, puis
cliquer sur « Lancer un scan maintenant » dans la page Scans.

| Scénario | Ce qu'il faut constater |
| --- | --- |
| `1-reseau-normal` | 17 équipements « à identifier » ; signalements TLS : `srv-erp` (~20 j, avertissement), `nas-sauvegarde` (~4 j, critique), `srv-mail` port 443 (expiré) ; ports surveillés ouverts (1433, 3389 sur `srv-erp`, 445 sur le NAS). Débits enregistrés comme référence. |
| `2-incidents` | Pannes : `sw-etage1` et les 4 postes derrière lui ; deux nouvelles machines (`DESKTOP-8F3K2QX`, un Raspberry Pi sans nom avec VNC 5900 ouvert) ; débit ERP → NAS en baisse (313 au lieu de 938 Mbit/s) ; lien Internet sous le plancher (6,2 Mbit/s). |
| `3-retour-normal` | Les pannes et les alertes de débit se referment ; l'alerte TLS du NAS se referme (certificat renouvelé) ; le port VNC du Raspberry Pi n'est plus signalé. |

Classer une machine depuis la page « À identifier » doit refermer son événement de découverte.

## Modifier ou ajouter un scénario

Les fichiers de `scenarios/` sont relus à chaque scan : on peut les modifier sans rien redémarrer.
Un nouveau fichier `scenarios/mon-test.json` devient disponible via `/use/mon-test`.
`scannedAt` est toujours remplacé par l'heure actuelle ; les dates d'expiration des certificats,
elles, sont fixes : ajustez-les si vous rejouez les tests plus tard.
