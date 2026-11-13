"""Use case: discover machines and expose them as plain data."""

from typing import List, Optional
from dataclasses import asdict

from usecases.scan_network import scan_network
from usecases.check_availability import check_availability


def scan(targets: Optional[List[str]] = None) -> List[dict]:
    """Runs a network scan and returns simple data structures.

    Args:
        targets: IP addresses, hostnames or CIDR ranges to scan. If omitted,
            the scanner default (localhost) is used.

    Returns:
        A list of dictionaries, one per discovered machine, with the keys
        ``ip``, ``id``, ``mac``, ``first_seen`` and ``last_seen``.

    Raises:
        RuntimeError: If the underlying network scan fails.
    """
    discovered = scan_network(targets)
    machines = []

    for machine in discovered:
        machine_data = asdict(machine)

        measurements = check_availability(machine.ip)
        machine_data.update(measurements)

        machines.append(machine_data)

    return machines
