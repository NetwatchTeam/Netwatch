"""Entité représentant un service réseau."""

from dataclasses import dataclass

from entities.port import Port


@dataclass
class Service:
    """Représente un service réseau exécuté sur un port donné.

    Attributes:
        name: Nom du service.
        port: Port associé au service.
        product: Nom optionnel du produit qui fournit le service.
        version: Version optionnelle du produit.
        tls: Indique si TLS est activé.
    """

    name: str
    port: Port
    product: str | None = None
    version: str | None = None
    tls: bool = False
