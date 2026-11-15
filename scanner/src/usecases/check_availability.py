"""Mesure la réponse ICMP sans décider d'une panne ni créer d'alerte."""

from entities.availability import Availability
from usecases.ports.icmp import IcmpProber


class CheckAvailability:
    """Mesure la disponibilité ICMP à travers un port IcmpProber."""

    def __init__(self, prober: IcmpProber) -> None:
        self._prober = prober

    def execute(
        self,
        ip: str,  # L'adresse IP de la machine à sonder.
        attempts: int = 3,  # Les tentatives de ping à effectuer.
        timeout: float = 1.0,  # Le délai d'attente en secondes pour chaque tentative.
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
            # Lève RuntimeError si la sonde n'a pas pu être exécutée.
            delay = self._prober.ping(ip, timeout=timeout)

            if delay is not None:
                delays.append(delay)

        received = len(delays)
        availability = Availability(
            latency_ms=sum(delays) / received if received else None,
            packet_loss_percent=100.0 * (attempts - received) / attempts,
        )

        return {
            "latencyMs": availability.latency_ms,
            "packetLossPercent": availability.packet_loss_percent,
        }
