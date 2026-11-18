"""Contrôle l'accessibilité TCP, sans diagnostic de panne ni alerte."""

import ipaddress
import math

from entities.tcp_check import TcpCheck
from usecases.ports.tcp import TcpProber


class CheckTcpService:
    """Contrôle une connexion TCP à travers un port TcpProber."""

    def __init__(self, prober: TcpProber) -> None:
        """Initialise le cas d'usage.

        Args:
            prober: Sonde TCP utilisée pour tenter les connexions.
        """
        self._prober = prober

    def execute(
            self,
            ip: str,
            port: int,
            timeout: float = 3.0,
    ) -> dict:
        """Teste une connexion TCP vers une adresse IP et un port.

        Une connexion réussie ne valide pas le protocole applicatif.
        Les erreurs de configuration lèvent ValueError.
        Les échecs réseau sont retournés dans le résultat.

        Args:
            ip: Adresse IP cible (IPv4 ou IPv6).
            port: Port TCP cible, entre 1 et 65535.
            timeout: Délai d'attente de la connexion, en secondes.

        Returns:
            Un dictionnaire avec les clés ``ip``, ``port``, ``checkedAt``,
            ``reachable``, ``status``, ``durationMs`` et ``error``.

        Raises:
            ValueError: Si l'adresse IP, le port ou le délai d'attente est
                invalide.
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

        result = self._prober.probe(ip, port, timeout)

        check = TcpCheck(
            ip=ip,
            port=port,
            status=result.status,  # "open", "refused", "timeout" ou "error".
            checked_at=result.checked_at,
            duration_ms=result.duration_ms,
            error=result.error,
        )

        return {
            "ip": check.ip,
            "port": check.port,
            "checkedAt": check.checked_at,
            "reachable": check.reachable,  # True si le port est ouvert, False sinon.
            "status": check.status,
            "durationMs": check.duration_ms,
            "error": check.error,
        }
