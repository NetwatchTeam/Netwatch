"""Port (interface): discovery of hosts and scan of their ports and services.

Defined by the use cases, implemented by an adapter (nmap, masscan, ...).
The data returned is made of plain structures, never of domain entities.
"""

from dataclasses import dataclass
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class ScannedService:
    """An open port and what was detected behind it.

    Attributes:
        port: The port number.
        protocol: The transport protocol ("tcp", "udp").
        name: The detected service name, or None if unknown.
        product: The detected product name, or None.
        version: The detected product version, or None.
        tls: True if the service is wrapped in TLS.
    """

    port: int
    protocol: str
    name: str | None = None
    product: str | None = None
    version: str | None = None
    tls: bool = False


@dataclass(frozen=True)
class ScannedHost:
    """A live host reported by the scanner.

    Attributes:
        ip: The IP address of the host.
        hostname: The reverse DNS name, or None.
        mac: The MAC address, or None (outside the LAN or without root).
        vendor: The hardware vendor, or None.
        services: The services found on the open ports.
    """

    ip: str
    hostname: str | None = None
    mac: str | None = None
    vendor: str | None = None
    services: tuple[ScannedService, ...] = ()


class NetworkScanner(ABC):
    """Discovers live hosts and scans their ports and services."""

    @abstractmethod
    def scan_hosts(self, targets: list[str]) -> list[ScannedHost]:
        """Scans the targets.

        Args:
            targets: IP addresses, hostnames or CIDR ranges.

        Returns:
            One ScannedHost per live host.

        Raises:
            RuntimeError: If the scan fails.
        """
        ...
