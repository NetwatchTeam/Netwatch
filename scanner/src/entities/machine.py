from dataclasses import dataclass, field

from entities.certificate import TLSCertificate
from entities.service import Service


@dataclass
class Machine:
    """Represents a scanned machine or network device.

    Attributes:
        ip: The IP address of the machine.
        hostname: Optional hostname (falls back to the IP when nmap finds none).
        id: Database identifier, or None if the machine is not persisted.
        mac: MAC address, or None if it could not be determined (for example
            when scanning localhost or a remote subnet).
        vendor: Optional hardware vendor name.
        gateway: Optional gateway IP address.
        ports: List of port service details discovered on the machine.
        open_ports: List of open port numbers.
        services: List of running services discovered on the machine.
        certificates: List of TLS certificates discovered on the machine.
        cpuPercent: CPU usage percentage (0-100), or None if unavailable.
        memory: Dictionary with usedPercent and totalMb, or None if unavailable.
        disks: List of disk usage dictionaries (name, usedPercent, totalGb).
    """

    ip: str
    hostname: str | None = None
    id: int | None = None
    mac: str | None = None
    vendor: str | None = None
    gateway: str | None = None
    ports: list[dict] = field(default_factory=list)
    open_ports: list[int] = field(default_factory=list)
    services: list[Service] = field(default_factory=list)
    certificates: list[TLSCertificate | dict] = field(default_factory=list)
    cpuPercent: float | None = None
    memory: dict | None = None
    disks: list[dict] = field(default_factory=list)
