"""Output data of the scan use cases.

These models are defined by the use case layer and consumed by the presenters.
They carry plain data only: the presenters never see the domain entities.
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class ThroughputResponse:
    """A throughput measurement between two endpoints.

    Attributes:
        source_ip: The source IP address.
        target_ip: The target IP address.
        mbps: Throughput speed in megabits per second.
    """

    source_ip: str
    target_ip: str
    mbps: float


@dataclass(frozen=True)
class ScanResponse:
    """The result of a network scan, as handed over to the presenter.

    Attributes:
        scanned_at: The timestamp when the scan was performed.
        machines: The scanned machines, as raw data dictionaries.
        throughput: The throughput measurements between nodes.
    """

    scanned_at: datetime
    machines: list[dict] = field(default_factory=list)
    throughput: list[ThroughputResponse] = field(default_factory=list)
