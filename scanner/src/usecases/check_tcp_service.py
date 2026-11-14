"""Contrôle l'accessibilité TCP, sans diagnostic de panne ni alerte."""

import ipaddress
import math
import socket
from datetime import datetime, timezone
from time import perf_counter

def check_tcp_service(
    ip: str,
    port: int,
    timeout: float = 3.0,
) -> dict:
    """Teste une connexion TCP vers une adresse IP et un port.

    Une connexion réussie ne valide pas le protocole applicatif.
    Les erreurs de configuration lèvent ValueError.
    Les échecs réseau sont retournés dans le résultat.
    """
    ip = str(ipaddress.ip_address(ip))
    
    if isinstance(port, bool) or not isinstance(port, int):
        raise ValueError("port doit être un entier.")

    if not 1 <= port <= 65535:
        raise ValueError("port doit être compris entre 1 et 65535.")
    
    # Le timeout doit être un nombre fini positif.
    if (
        isinstance(timeout, bool)
        or not isinstance(timeout, (int, float))
        or not math.isfinite(timeout)
        or timeout <= 0
    ):
        raise ValueError("timeout doit être un nombre fini positif.")

    # Le timeout de socket est en secondes, pas en millisecondes.
    checked_at = datetime.now(timezone.utc).isoformat()
    started_at = perf_counter()

    status = "open"
    error = None

    try:
        # On utilise create_connection pour gérer les adresses IPv4 et IPv6.
        with socket.create_connection((ip, port), timeout=timeout):
            pass
    except TimeoutError as exc:
        status = "timeout"
        error = str(exc)
    except ConnectionRefusedError as exc:
        status = "refused"
        error = str(exc)
    except OSError as exc:
        status = "error"
        error = str(exc)

    # Calculer la durée de la tentative en millisecondes avec trois décimales.
    duration_ms = round((perf_counter() - started_at) * 1000, 3)

    return {
        "ip": ip,
        "port": port,
        "checkedAt": checked_at,
        "reachable": status == "open", # True si le port est ouvert, False sinon.
        "status": status, # "open", "refused", "timeout" ou "error".
        "durationMs": duration_ms,
        "error": error,
    }