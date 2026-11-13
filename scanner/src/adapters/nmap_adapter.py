"""Adapter: converts libnmap objects into domain entities.

This is the only module aware of nmap-specific terminology and data structures.
"""

from typing import Any

from entities.machine import Machine
from entities.port import Port
from entities.service import Service


from libnmap.parser import NmapParser
from libnmap.process import NmapProcess

def _first_hostname(host: Any) -> str | None:
    """Extracts the first available hostname from an nmap host object.

    Args:
        host: The libnmap host object.

    Returns:
        The first hostname string if found, otherwise None.
    """
    for h in getattr(host, "hostnames", None) or []:
        name = h.get("name") if isinstance(h, dict) else h
        if name:
            return name
    return None


def _service_from_nmap(svc: Any) -> Service:
    """Converts a libnmap service object into a Service domain entity.

    Args:
        svc: The libnmap service object.

    Returns:
        A populated Service entity.
    """
    info = getattr(svc, "service_dict", None) or {}
    name = getattr(svc, "service", "") or info.get("name") or "unknown"
    tls = info.get("tunnel") == "ssl"
    if tls and name == "http":
        name = "https"  # nmap describes https as http over an ssl tunnel
    return Service(
        name=name,
        port=Port(number=int(svc.port), protocol=svc.protocol),
        product=info.get("product") or None,
        version=info.get("version") or None,
        tls=tls or name == "https",
    )


def nmap_host_to_machine(host: Any) -> Machine:
    """Converts a libnmap host object into a Machine domain entity.

    Args:
        host: The libnmap host object.

    Returns:
        A populated Machine entity with open services.
    """
    services = [
        _service_from_nmap(s)
        for s in getattr(host, "services", [])
        if getattr(s, "state", "open") == "open"
    ]
    return Machine(
        ip=host.address,
        hostname=_first_hostname(host)
        or host.address,  # fallback: IP if no reverse DNS
        mac=getattr(host, "mac", None) or None,  # None outside LAN or without root
        vendor=getattr(host, "vendor", None) or None,
        services=services,
    )


def scan_hosts(targets: list[str]) -> list[Machine]:
    """Runs nmap (-sV for service/version, --open for open ports) and returns discovered machines.

    Targets must be validated by the caller/use case before invoking this function.

    Args:
        targets: List of target IP addresses, hostnames, or CIDR ranges.

    Returns:
        A list of discovered Machine entities.

    Raises:
        RuntimeError: If python-libnmap is not installed or the nmap execution fails.
    """

    scan = NmapProcess(" ".join(targets), "-sV --open")
    if scan.run() != 0:
        raise RuntimeError(f"Nmap scan failed: {scan.stderr}")

    machines = []
    for host in NmapParser.parse(scan.stdout).hosts:
        if host.is_up():
            machines.append(nmap_host_to_machine(host))
    return machines
