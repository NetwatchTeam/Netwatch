"""Entité représentant l'utilisation d'un disque."""

from dataclasses import dataclass


@dataclass
class Disk:
    """Représente l'utilisation d'un disque de stockage.

    Attributes:
        name: Nom ou identifiant du disque.
        percentage_used: Pourcentage d'espace disque utilisé.
        total_gb: Capacité totale du disque en gigaoctets.
    """

    name: str
    percentage_used: float
    total_gb: float
