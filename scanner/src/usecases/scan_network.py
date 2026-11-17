"""Use case for scanning network targets and returning the discovered machines."""

from entities.machine import Machine
from entities.port import Port
from entities.service import Service
from usecases.ports.network_scanner import NetworkScanner, ScannedHost, ScannedService

DEFAULT_TARGETS = ["127.0.0.1"]


def _to_service(scanned: ScannedService) -> Service:
    """Builds a Service entity from a scanned service."""
    name = scanned.name or "unknown"
    if scanned.tls and name == "http":
        name = "https"  # http over TLS is https
    return Service(
        name=name,
        port=Port(number=scanned.port, protocol=scanned.protocol),
        product=scanned.product,
        version=scanned.version,
        tls=scanned.tls or name == "https",
    )


def _to_port_details(scanned: ScannedService) -> dict:
    """Builds the port detail dictionary stored in ``Machine.ports``."""
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
    """Builds a Machine entity from a scanned host."""
    return Machine(
        ip=host.ip,
        # fallback: IP if no reverse DNS
        hostname=host.hostname or host.ip,
        mac=host.mac,
        vendor=host.vendor,
        ports=[_to_port_details(s) for s in host.services],
        services=[_to_service(s) for s in host.services],
    )


class ScanNetwork:
    """Scans network targets through a NetworkScanner port."""

    def __init__(self, scanner: NetworkScanner) -> None:
        self._scanner = scanner

    def execute(self, targets: list[str] | None = None) -> list[Machine]:
        """Scans the given targets and returns the machines that are up.

        The returned entities are not persisted (``id`` is None).

        Args:
            targets: IP addresses, hostnames or CIDR ranges to scan. Defaults
                to ``DEFAULT_TARGETS`` (localhost).

        Returns:
            A list of Machine entities, one per host reported as up.

        Raises:
            RuntimeError: If the scanner fails.
        """
        hosts = self._scanner.scan_hosts(targets or DEFAULT_TARGETS)
        return [_to_machine(host) for host in hosts]
