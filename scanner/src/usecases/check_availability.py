"""Mesure la réponse ICMP sans décider d'une panne ni créer d'alerte."""

import logging

from ping3 import ping


logger = logging.getLogger(__name__)


def check_availability(
    ip: str, # L'adresse IP de la machine à sonder.
    attempts: int = 3, # Les tentatives de ping à effectuer pour mesurer la disponibilité.
    timeout: float = 1.0, # Le délai d'attente en secondes pour chaque tentative de ping.
) -> dict:
    """Retourne la latence moyenne en ms et la perte des sondes ICMP.

    Les absences de réponse comptent comme des sondes sans réponse.
    Une erreur d'exécution invalide la mesure et remonte au collecteur.
    """
    if attempts < 1:
        raise ValueError("attempts doit être supérieur ou égal à 1.")

    if timeout <= 0:
        raise ValueError("timeout doit être strictement positif.")

    delays = []
    for _ in range(attempts):
        try:
            delay = ping(ip, timeout=timeout, unit="ms")
        except OSError as exc:
            logger.exception("Impossible d'exécuter la mesure ICMP pour %s", ip)
            raise RuntimeError(
                f"Erreur d'exécution ICMP pour {ip} : {exc}"
            ) from exc

        # False est une erreur, pas une latence de 0 ms.
        if delay is False:
            logger.error("ping3 a retourné une erreur pour %s", ip)
            raise RuntimeError(f"Échec de la mesure ICMP pour {ip}.")

        if delay is not None:
            delays.append(delay)
            
    # Compter le nombre de réponses reçues.
    received = len(delays)

    # Calculer la latence moyenne et le pourcentage de perte de paquets.
    return {
        "latencyMs": sum(delays) / received if received else None,
        "packetLossPercent": 100.0 * (attempts - received) / attempts,
    }