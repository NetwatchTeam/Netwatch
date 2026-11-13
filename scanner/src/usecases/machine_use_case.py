"""Use case entry point for executing a complete network scan."""

from datetime import UTC, datetime

from entities.scan_result import ScanResult
from usecases.scan_network import scan_network


def scan(targets: list[str] | None = None) -> ScanResult:
    """Executes a network scan and wraps the results in a timestamped ScanResult entity.

    Args:
        targets: Optional list of target IPs, hostnames, or CIDR ranges.

    Returns:
        A ScanResult instance containing the scan timestamp, machines, and throughput data.
    """
    machines = scan_network(targets)
    return ScanResult(
        scanned_at=datetime.now(UTC),
        machines=machines,
        throughput=[],
    )
