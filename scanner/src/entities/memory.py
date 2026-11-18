"""Entité représentant l'utilisation de la mémoire."""

from dataclasses import dataclass


@dataclass
class Memory:
    """Représente les statistiques d'utilisation de la mémoire.

    Attributes:
        percentage_used: Pourcentage de mémoire actuellement utilisé.
        total_mb: Capacité totale de la mémoire en mégaoctets.
    """

    percentage_used: float
    total_mb: float
