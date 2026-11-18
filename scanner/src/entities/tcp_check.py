"""Entité représentant le résultat d'un contrôle de connexion TCP."""

from dataclasses import dataclass


@dataclass
class TcpCheck:
    """Représente le résultat d'une tentative de connexion TCP.

    Attributes:
        ip: Adresse IP sondée.
        port: Port TCP sondé.
        status: « open », « refused », « timeout » ou « error ».
        checked_at: Horodatage ISO 8601 UTC de la tentative.
        duration_ms: Durée de la tentative en millisecondes.
        error: Message d'échec, ou None si le port est ouvert.
    """

    ip: str
    port: int
    status: str
    checked_at: str
    duration_ms: float
    error: str | None = None

    @property
    def reachable(self) -> bool:
        """Indique si le port a accepté la connexion (True) ou non (False)."""
        return self.status == "open"
