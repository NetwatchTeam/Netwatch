"""Port (interface) : découverte des hôtes et scan de leurs ports et services.

Défini par les cas d'usage, implémenté par un adaptateur (nmap, masscan, ...).
Les données retournées sont de simples structures, jamais des entités du domaine.
"""

from dataclasses import dataclass
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class ScannedService:
    """Un port ouvert et ce qui a été détecté derrière.

    Attributes:
        port: Numéro du port.
        protocol: Protocole de transport (« tcp », « udp »).
        name: Nom du service détecté, ou None s'il est inconnu.
        product: Nom du produit détecté, ou None.
        version: Version du produit détecté, ou None.
        tls: True si le service est encapsulé dans TLS.
    """

    port: int
    protocol: str
    name: str | None = None
    product: str | None = None
    version: str | None = None
    tls: bool = False


@dataclass(frozen=True)
class ScannedHost:
    """Un hôte actif signalé par le scanner.

    Attributes:
        ip: Adresse IP de l'hôte.
        hostname: Nom obtenu par résolution DNS inverse, ou None.
        mac: Adresse MAC, ou None (hors du réseau local ou sans les droits root).
        vendor: Fabricant du matériel, ou None.
        services: Services trouvés sur les ports ouverts.
    """

    ip: str
    hostname: str | None = None
    mac: str | None = None
    vendor: str | None = None
    services: tuple[ScannedService, ...] = ()


class NetworkScanner(ABC):
    """Découvre les hôtes actifs et scanne leurs ports et services."""

    @abstractmethod
    def scan_hosts(self, targets: list[str]) -> list[ScannedHost]:
        """Scanne les cibles.

        Args:
            targets: Adresses IP, noms d'hôte ou plages CIDR.

        Returns:
            Un ScannedHost par hôte actif.

        Raises:
            RuntimeError: Si le scan échoue.
        """
        ...
