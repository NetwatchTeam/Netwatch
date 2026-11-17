from dataclasses import dataclass


@dataclass
class Throughput:
    """Represents network throughput measurement between two endpoints.

    Attributes:
        source_ip: The source IP address.
        target_ip: The target IP address.
        mbps: Throughput speed in megabits per second.
    """

    source_ip: str
    target_ip: str
    mbps: float
