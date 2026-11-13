"""Combine l'inventaire Nmap, les mesures ICMP et les contrôles TCP."""

import ipaddress
import logging
from dataclasses import asdict
from typing import List, Optional

from usecases.scan_network import DEFAULT_TARGETS, scan_network
from usecases.check_availability import check_availability
from usecases.check_tcp_service import check_tcp_service


logger = logging.getLogger(__name__)

# Profil de contrôle du lab, pas une liste de services obligatoires.
DEFAULT_TCP_PORTS = {22, 80, 443}
TCP_TIMEOUT = 1.0


def scan(targets: Optional[List[str]] = None) -> List[dict]:
    """Collecte les résultats Nmap, ICMP et TCP.

    Les IP explicitement demandées sont contrôlées même si Nmap
    ne les découvre pas.

    Les CIDR et noms DNS restent pris en charge par Nmap :
    seules leurs IP découvertes sont ensuite contrôlées.
    """
    requested_targets = targets or DEFAULT_TARGETS
    discovered = scan_network(requested_targets)

    machines_by_ip = {}

    # Récupérer les machines et services découverts par Nmap.
    for machine in discovered:
        machine_data = asdict(machine)
        ip = str(ipaddress.ip_address(machine_data["ip"]))
        machine_data["ip"] = ip
        machines_by_ip[ip] = machine_data

    # Conserver aussi les IP demandées mais non découvertes par Nmap.
    for target in requested_targets:
        try:
            ip = str(ipaddress.ip_address(target))
        except ValueError:
            # Ne pas développer un CIDR ou résoudre un nom DNS ici.
            continue

        machines_by_ip.setdefault(
            ip,
            {
                "ip": ip,
                "mac": None,
                "ports": [],
            },
        )

    machines = []

    for ip, machine_data in machines_by_ip.items():
        # Une erreur ICMP ne doit pas empêcher les contrôles TCP.
        try:
            measurements = check_availability(ip)
        except RuntimeError as exc:
            logger.warning(
                "Mesure ICMP impossible pour %s : %s",
                ip,
                exc,
            )
            measurements = {
                "latencyMs": None,
                "packetLossPercent": None,
                "icmpError": str(exc),
            }

        machine_data.update(measurements)

        # Essayer les ports du profil, même sans découverte Nmap.
        tcp_ports = set(DEFAULT_TCP_PORTS)

        # Ajouter les ports TCP découverts, sans doublons.
        for port_data in machine_data.get("ports", []):
            if port_data.get("protocol") == "tcp":
                tcp_ports.add(int(port_data["port"]))

        machine_data["tcpChecks"] = [
            check_tcp_service(
                ip=ip,
                port=port,
                timeout=TCP_TIMEOUT,
            )
            for port in sorted(tcp_ports)
        ]

        machines.append(machine_data)

    return machines