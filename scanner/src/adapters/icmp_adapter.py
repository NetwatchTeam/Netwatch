"""Adaptateur : envoie des requêtes d'écho ICMP via ping3.

C'est le seul module qui connaît la bibliothèque ping3 et ses conventions de
retour. Il dépend du port ``IcmpProber``, jamais des entités du domaine.
"""

import logging

from ping3 import ping

from usecases.ports.icmp import IcmpProber

logger = logging.getLogger(__name__)


class Ping3IcmpProber(IcmpProber):
    """IcmpProber implémenté avec ping3."""

    def ping(self, ip: str, timeout: float) -> float | None:
        """Envoie une requête d'écho ICMP.

        Args:
            ip: Adresse IP à sonder.
            timeout: Délai d'attente de la réponse, en secondes.

        Returns:
            Le temps d'aller-retour en millisecondes, ou None s'il n'y a pas
            eu de réponse.

        Raises:
            RuntimeError: Si la sonde n'a pas pu être exécutée (permissions,
                erreur de la pile réseau ou erreur signalée par ping3).
        """
        try:
            delay = ping(ip, timeout=timeout, unit="ms")
        except OSError as exc:
            logger.exception("Impossible d'exécuter la mesure ICMP pour %s", ip)
            raise RuntimeError(f"Erreur d'exécution ICMP pour {ip} : {exc}") from exc

        # False est une erreur, pas une latence de 0 ms.
        if delay is False:
            logger.error("ping3 a retourné une erreur pour %s", ip)
            raise RuntimeError(f"Échec de la mesure ICMP pour {ip}.")

        return delay
