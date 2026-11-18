"""Adaptateur : ouvre des connexions TCP via le module socket.

C'est le seul module qui connaît socket et ses exceptions.
Il dépend du port ``TcpProber``, jamais des entités du domaine.
"""

import socket
from datetime import datetime, timezone
from time import perf_counter

from usecases.ports.tcp import TcpProbeResult, TcpProber


class SocketTcpProber(TcpProber):
    """TcpProber implémenté avec le module socket."""

    def probe(self, ip: str, port: int, timeout: float) -> TcpProbeResult:
        """Tente une connexion TCP vers une adresse et un port, et la chronomètre.

        Les échecs réseau sont retournés, pas levés. Les paramètres doivent
        être validés par le cas d'usage avant l'appel.

        Args:
            ip: Adresse IP cible (IPv4 ou IPv6).
            port: Port TCP cible.
            timeout: Délai d'attente du socket en secondes (et non en
                millisecondes).

        Returns:
            Un TcpProbeResult dont le statut est « open », « refused »,
            « timeout » ou « error ».
        """
        checked_at = datetime.now(timezone.utc).isoformat()
        started_at = perf_counter()
        status, error = self._connect(ip, port, timeout)

        # Durée de la tentative en millisecondes, avec trois décimales.
        duration_ms = round((perf_counter() - started_at) * 1000, 3)
        return TcpProbeResult(
            status=status,
            checked_at=checked_at,
            duration_ms=duration_ms,
            error=error,
        )

    @staticmethod
    def _connect(ip: str, port: int, timeout: float) -> tuple[str, str | None]:
        """Traduit le résultat d'une connexion socket en (statut, erreur).

        Args:
            ip: Adresse IP cible.
            port: Port TCP cible.
            timeout: Délai d'attente du socket, en secondes.

        Returns:
            Un couple (statut, message d'erreur), l'erreur valant None si le
            port est ouvert.
        """
        try:
            # create_connection gère les adresses IPv4 et IPv6.
            with socket.create_connection((ip, port), timeout=timeout):
                pass
        except TimeoutError as exc:
            return "timeout", str(exc)
        except ConnectionRefusedError as exc:
            return "refused", str(exc)
        except OSError as exc:
            return "error", str(exc)
        return "open", None
