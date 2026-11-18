"""Port (interface) : sonde de connexion TCP."""

from dataclasses import dataclass
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class TcpProbeResult:
    """Résultat d'une tentative de connexion TCP.

    Attributes:
        status: « open », « refused », « timeout » ou « error ».
        checked_at: Horodatage ISO 8601 UTC de la tentative.
        duration_ms: Durée de la tentative en millisecondes.
        error: Message d'échec, ou None si le port est ouvert.
    """

    status: str
    checked_at: str
    duration_ms: float
    error: str | None = None


class TcpProber(ABC):
    """Tente des connexions TCP."""

    @abstractmethod
    def probe(self, ip: str, port: int, timeout: float) -> TcpProbeResult:
        """Tente une connexion TCP.

        Les échecs réseau sont retournés dans le résultat, pas levés.

        Args:
            ip: Adresse IP cible.
            port: Port TCP cible.
            timeout: Délai d'attente de la connexion, en secondes.

        Returns:
            Le résultat de la tentative.
        """
        ...
