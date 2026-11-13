"""Network scanning based on nmap."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from libnmap.process import NmapProcess
from libnmap.parser import NmapParser

from entities.machine import Machine

DEFAULT_TARGETS = ["127.0.0.1"]


def _now_iso() -> str:
    """Returns the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _extract_mac(host) -> Optional[str]:
    """Extracts the MAC address of a host, if available.

    Args:
        host: A host object returned by the libnmap parser.

    Returns:
        The MAC address, or None if nmap did not report one.
    """
    if host.mac:
        return host.mac
    return None


def scan_network(targets: Optional[List[str]] = None) -> List[Machine]:
    """Scans the given targets and returns the machines that are up.

    The returned entities are not persisted (``id`` is None).

    Args:
        targets: IP addresses, hostnames or CIDR ranges to scan. Defaults to
            ``DEFAULT_TARGETS`` (localhost).

    Returns:
        A list of Machine entities, one per host reported as up. All of them
        share the same ``first_seen`` and ``last_seen`` timestamp.

    Raises:
        RuntimeError: If the nmap process exits with a non-zero return code.
    """
    targets = targets or DEFAULT_TARGETS

    # -sV: probe open ports to determine service versions.
    # -Pn: treat every host as up and skip ICMP host discovery, which is
    # required to scan localhost reliably.
    scan = NmapProcess(" ".join(targets), "-sV -Pn")
    return_code = scan.run()

    if return_code != 0:
        raise RuntimeError(f"Le scan nmap a échoué : {scan.stderr}")

    report = NmapParser.parse(scan.stdout)
    # A single timestamp is shared by every machine found in this scan.
    timestamp = _now_iso()
    machines: List[Machine] = []

    for host in report.hosts:
        if not host.is_up():
            continue

        mac = _extract_mac(host)

        machines.append(
            Machine(
                ip=host.address,
                mac=mac,
                first_seen=timestamp,
                last_seen=timestamp,
            )
        )

    return machines
