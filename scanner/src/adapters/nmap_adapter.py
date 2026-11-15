"""Adapter: runs nmap through libnmap and translates its objects into port data.

This is the only module aware of nmap-specific terminology and data structures.
It depends on the ``NetworkScanner`` port, never on the domain entities.
"""

from typing import Any

from libnmap.parser import NmapParser
from libnmap.process import NmapProcess

from usecases.ports.network_scanner import NetworkScanner, ScannedHost, ScannedService


def _first_hostname(host: Any) -> str | None:
    """Extracts the first available hostname from an nmap host object."""
    for h in getattr(host, "hostnames", None) or []:
        name = h.get("name") if isinstance(h, dict) else h
        if isinstance(name, str) and name:
            return name
    return None


def _extract_mac(host: Any) -> str | None:
    """Extracts the MAC address of a host, if available."""
    mac = getattr(host, "mac", None)
    return mac if mac else None


def _extract_vendor(host: Any) -> str | None:
    """Extracts the hardware vendor of a host, if available."""
    vendor = getattr(host, "vendor", None)
    return vendor if isinstance(vendor, str) and vendor else None


def _open_services(host: Any) -> list[Any]:
    """Returns the libnmap services of a host whose port state is open."""
    return [s for s in getattr(host, "services", None) or [] if s.state == "open"]


def _scanned_service(svc: Any) -> ScannedService:
    """Converts a libnmap service object into a ScannedService.

    nmap describes https as http over an ssl tunnel: this is translated into
    the ``tls`` flag, so that the use case never sees the nmap vocabulary.
    """
    info = getattr(svc, "service_dict", None) or {}
    return ScannedService(
        port=int(svc.port),
        protocol=svc.protocol,
        # Certains champs peuvent manquer, d'où les "or None"
        name=getattr(svc, "service", None) or info.get("name") or None,
        product=info.get("product") or None,
        version=info.get("version") or None,
        tls=info.get("tunnel") == "ssl",
    )


class NmapScanner(NetworkScanner):
    """NetworkScanner implemented with nmap."""

    def scan_hosts(self, targets: list[str]) -> list[ScannedHost]:
        """Discovers the live hosts, then scans their ports and services.

        Two nmap runs are chained: host discovery (-sn, which also provides the
        MAC and hostname), then a ports/services scan on the hosts found up.
        Targets must be validated by the use case before invoking this method.

        Args:
            targets: List of target IP addresses, hostnames, or CIDR ranges.

        Returns:
            One ScannedHost per live host.

        Raises:
            RuntimeError: If one of the nmap executions fails.
        """
        # "-sn" : découverte d'hôtes seulement, pas de scan de ports.
        scan = NmapProcess(targets, "-sn")
        if scan.run() != 0:
            raise RuntimeError(f"Le scan nmap a échoué : {scan.stderr}")

        # Conserver les hôtes découverts, notamment pour récupérer leur MAC.
        discovered_hosts = {
            host.address: host
            for host in NmapParser.parse(scan.stdout).hosts
            if host.is_up()
        }

        active_ips = list(discovered_hosts)
        if not active_ips:
            return []

        # Scanner les ports et services des machines découvertes.
        service_scan = NmapProcess(active_ips, "-sT -sV --version-light -Pn -F")
        if service_scan.run() != 0:
            raise RuntimeError(
                f"Le scan des ports et services a échoué : {service_scan.stderr}"
            )

        hosts = []
        for host in NmapParser.parse(service_scan.stdout).hosts:
            if not host.is_up() or host.address not in discovered_hosts:
                continue

            discovery_host = discovered_hosts[host.address]
            hosts.append(
                ScannedHost(
                    ip=host.address,
                    hostname=_first_hostname(discovery_host),
                    mac=_extract_mac(discovery_host),  # None outside LAN or without root
                    vendor=_extract_vendor(discovery_host),
                    services=tuple(_scanned_service(s) for s in _open_services(host)),
                )
            )
        return hosts