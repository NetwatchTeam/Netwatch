from dataclasses import dataclass


@dataclass(frozen=True)
class Port:
    """Represents a network port.

    Attributes:
        number: The port number.
        protocol: The network protocol (e.g., "tcp", "udp").
    """

    number: int
    protocol: str = "tcp"
