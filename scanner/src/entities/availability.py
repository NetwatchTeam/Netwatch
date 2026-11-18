"""Entité représentant la disponibilité ICMP d'une machine."""

from dataclasses import dataclass


@dataclass
class Availability:
    """Représente le résultat d'une série de requêtes d'écho ICMP.

    Attributes:
        latency_ms: Temps d'aller-retour moyen en millisecondes, ou None si
            aucune sonde n'a reçu de réponse.
        packet_loss_percent: Pourcentage de sondes sans réponse (0-100).
    """

    latency_ms: float | None
    packet_loss_percent: float
