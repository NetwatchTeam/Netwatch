from dataclasses import dataclass, field

from entities.certificate import TLSCertificate
from entities.disk import Disk
from entities.memory import Memory
from entities.service import Service


@dataclass
class Machine:
    """Represents a scanned machine or network device.

    Attributes:
        ip: The IP address of the machine.
        hostname: The hostname of the machine.
        mac: Optional MAC address.
        vendor: Optional hardware vendor name.
        gateway: Optional gateway IP address.
        latency: Optional network latency in milliseconds.
        packet_loss: Optional packet loss percentage.
        cpu_usage: Optional CPU usage percentage.
        memory: Optional memory usage details.
        disks: List of disk drives attached to the machine.
        services: List of running services discovered on the machine.
        certificates: List of TLS certificates found on the machine.
    """

    ip: str
    hostname: str
    mac: str | None = None
    vendor: str | None = None
    gateway: str | None = None
    latency: float | None = None  # ms
    packet_loss: float | None = None  # %
    cpu_usage: float | None = None  # %
    memory: Memory | None = None
    disks: list[Disk] = field(default_factory=list)
    services: list[Service] = field(default_factory=list)
    certificates: list[TLSCertificate] = field(default_factory=list)
