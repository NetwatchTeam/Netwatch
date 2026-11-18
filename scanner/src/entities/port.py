"""Entité représentant un port réseau."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Port:
    """Représente un port réseau.

    Attributes:
        number: Numéro du port.
        protocol: Protocole réseau (par exemple « tcp », « udp »).
    """

    number: int
    protocol: str = "tcp"
