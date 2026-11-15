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
    if hasattr(host, "mac") and host.mac:
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

    # "-sn" : découverte d'hôtes seulement, pas de scan de ports.
    scan = NmapProcess(targets, "-sn")

    return_code = scan.run()

    if return_code != 0:
        raise RuntimeError(
            f"Le scan nmap a échoué : {scan.stderr}"
        )

    # Lire les résultats de la découverte réalisée avec -sn.
    discovery_report = NmapParser.parse(scan.stdout)

    # Conserver les hôtes découverts, notamment pour récupérer leur MAC.
    discovered_hosts = {
        host.address: host
        for host in discovery_report.hosts
        if host.is_up()
    }

    active_ips = list(discovered_hosts)

    if not active_ips:
        return []

    # Scanner les ports et services des machines découvertes.
    service_scan = NmapProcess(
        active_ips,
        "-sT -sV --version-light -Pn -F",
    )

    return_code = service_scan.run()

    if return_code != 0:
        raise RuntimeError(
            f"Le scan des ports et services a échoué : {service_scan.stderr}"
        )

    service_report = NmapParser.parse(service_scan.stdout)

    # Construire les machines avec les résultats des deux étapes.
    timestamp = _now_iso()
    machines: List[Machine] = []

    for host in service_report.hosts:
        if not host.is_up():
            continue

        if host.address not in discovered_hosts:
            continue

        discovery_host = discovered_hosts.get(host.address, host)

        machines.append(
            Machine(
                ip=host.address,
                mac=_extract_mac(discovery_host),
                first_seen=timestamp,
                last_seen=timestamp,
                ports=_extract_open_ports(host),
            )
        )

    return machines

def _extract_open_ports(host) -> list[dict]:
    """Normalise les ports ouverts et les informations fournies par Nmap."""
    ports = []

    if not hasattr(host, "services") or not host.services:
        return ports

    for service in host.services:
        if service.state != "open":
            continue

        details = getattr(service, "service_dict", None) or {}

        services = []

        # Certains champs peuvent manquer, d'où les "or None"
        if getattr(service, "service", None):
            services.append({
                "name": service.service,
                "product": details.get("product") or None,
                "version": details.get("version") or None,
            })

        ports.append({
            "port": service.port,
            "protocol": service.protocol,
            "services": services,
        })

    return ports
