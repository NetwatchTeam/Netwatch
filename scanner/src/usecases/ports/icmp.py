"""Port (interface) : sonde d'écho ICMP."""

from abc import ABC, abstractmethod


class IcmpProber(ABC):
    """Envoie des requêtes d'écho ICMP."""

    @abstractmethod
    def ping(self, ip: str, timeout: float) -> float | None:
        """Envoie une requête d'écho.

        Args:
            ip: Adresse IP à sonder.
            timeout: Délai d'attente de la réponse, en secondes.

        Returns:
            Le temps d'aller-retour en millisecondes, ou None s'il n'y a pas
            eu de réponse.

        Raises:
            RuntimeError: Si la sonde n'a pas pu être exécutée.
        """
        ...
