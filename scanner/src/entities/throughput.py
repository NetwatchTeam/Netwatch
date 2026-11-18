"""Entité représentant une mesure de débit réseau."""

from dataclasses import dataclass


@dataclass
class Throughput:
    """Représente une mesure de débit réseau entre deux extrémités.

    Attributes:
        source_ip: Adresse IP source.
        target_ip: Adresse IP cible.
        mbps: Débit en mégabits par seconde.
    """

    source_ip: str
    target_ip: str
    mbps: float
