from dataclasses import dataclass


@dataclass
class Availability:
    """Represents the result of a series of ICMP echo requests.

    Attributes:
        latency_ms: Mean round-trip time in milliseconds, or None if no
            probe received a reply.
        packet_loss_percent: Percentage of probes without reply (0-100).
    """

    latency_ms: float | None
    packet_loss_percent: float
