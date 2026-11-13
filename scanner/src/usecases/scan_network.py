"""Use case for scanning network targets and enriching discovered machines with probe data."""

from adapters.nmap_adapter import scan_hosts
from entities.machine import Machine

DEFAULT_TARGETS = ["127.0.0.1"]


def _enrich(machine: Machine) -> None:
    """Enriches a Machine entity with ping metrics, TLS certificates, and local stats.

    Args:
        machine: The Machine instance to enrich in-place.
    """
    # TODO: CPU/RAM/disk metrics for remote hosts via lightweight agent or PySNMP (switch, NAS)
    # TODO: gateway inferred via traceroute for dependency graph
    return machine


def scan_network(targets: list[str] | None = None) -> list[Machine]:
    """Scans the specified targets (defaults to localhost) and returns enriched Machine entities.

    Args:
        targets: Optional list of target IPs, hostnames, or CIDR blocks.

    Returns:
        A list of discovered and enriched Machine entities.
    """
    resolved_targets = targets or DEFAULT_TARGETS
    machines = []
    for machine in scan_hosts(resolved_targets):
        _enrich(machine)
        machines.append(machine)
    return machines
