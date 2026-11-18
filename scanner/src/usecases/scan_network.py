"""Cas d'usage : scanner des cibles réseau et retourner les machines découvertes."""

from entities.machine import Machine
from entities.port import Port
from entities.service import Service
from usecases.ports.network_scanner import NetworkScanner, ScannedHost, ScannedService

DEFAULT_TARGETS = ["127.0.0.1"]


def _to_service(scanned: ScannedService) -> Service:
    """Construit une entité Service à partir d'un service scanné.

    Args:
        scanned: Le service détecté par le scanner.

    Returns:
        L'entité Service correspondante.
    """
    name = scanned.name or "unknown"
    if scanned.tls and name == "http":
        name = "https"  # http sur TLS, c'est https
    return Service(
        name=name,
        port=Port(number=scanned.port, protocol=scanned.protocol),
        product=scanned.product,
        version=scanned.version,
        tls=scanned.tls or name == "https",
    )


def _to_port_details(scanned: ScannedService) -> dict:
    """Construit le dictionnaire de détails de port stocké dans ``Machine.ports``.

    Args:
        scanned: Le service détecté par le scanner.

    Returns:
        Un dictionnaire avec ``port``, ``protocol`` et ``services``.
    """
    services = []
    if scanned.name:
        services.append(
            {
                "name": scanned.name,
                "product": scanned.product,
                "version": scanned.version,
            }
        )
    return {"port": scanned.port, "protocol": scanned.protocol, "services": services}


def _to_machine(host: ScannedHost) -> Machine:
    """Construit une entité Machine à partir d'un hôte scanné.

    Args:
        host: L'hôte actif signalé par le scanner.

    Returns:
        L'entité Machine correspondante.
    """
    return Machine(
        ip=host.ip,
        # Repli sur l'IP en l'absence de DNS inverse.
        hostname=host.hostname or host.ip,
        mac=host.mac,
        vendor=host.vendor,
        ports=[_to_port_details(s) for s in host.services],
        services=[_to_service(s) for s in host.services],
    )


class ScanNetwork:
    """Scanne des cibles réseau à travers un port NetworkScanner."""

    def __init__(self, scanner: NetworkScanner) -> None:
        """Initialise le cas d'usage.

        Args:
            scanner: Scanner réseau utilisé pour découvrir les hôtes.
        """
        self._scanner = scanner

    def execute(self, targets: list[str] | None = None) -> list[Machine]:
        """Scanne les cibles données et retourne les machines actives.

        Les entités retournées ne sont pas persistées (``id`` vaut None).

        Args:
            targets: Adresses IP, noms d'hôte ou plages CIDR à scanner. Par
                défaut, ``DEFAULT_TARGETS`` (localhost).

        Returns:
            Une liste d'entités Machine, une par hôte signalé comme actif.

        Raises:
            RuntimeError: Si le scanner échoue.
        """
        hosts = self._scanner.scan_hosts(targets or DEFAULT_TARGETS)
        return [_to_machine(host) for host in hosts]
