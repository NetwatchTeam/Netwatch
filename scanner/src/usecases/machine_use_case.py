import ipaddress
import logging
from dataclasses import asdict
from typing import List, Optional, Set

from usecases.scan_network import DEFAULT_TARGETS, scan_network
from usecases.check_availability import check_availability
from usecases.check_tcp_service import check_tcp_service
from usecases.check_tls_use_case import check_machine_tls
from usecases.collect_system_metrics import collect_system_metrics


logger = logging.getLogger(__name__)

# Profil de contrôle du lab, pas une liste de services obligatoires.
DEFAULT_TCP_PORTS = {22, 80, 443}
TCP_TIMEOUT = 1.0

TLS_PORTS = (443, 8443)  # Ports standards HTTPS, par ordre de préférence
TLS_VALID_STATUSES = ("ok", "expired", "expiring_soon")


def _detected_ports(machine_data: dict) -> Set[int]:
    """Retourne les ports TCP détectés par Nmap (open_ports + ports)."""
    detected = set()

    for port in machine_data.get("open_ports") or []:
        detected.add(int(port))

    for port_data in machine_data.get("ports") or []:
        if not isinstance(port_data, dict):
            continue
        if port_data.get("protocol", "tcp") != "tcp":
            continue
        if port_data.get("port") is not None:
            detected.add(int(port_data["port"]))

    return detected


def _tls_port(machine_data: dict) -> Optional[int]:
    """Retourne le port TLS à contrôler (443 en priorité), sinon None."""
    detected = _detected_ports(machine_data)

    for port in TLS_PORTS:
        if port in detected:
            return port

    return None


def _collect_certificates(ip: str, machine_data: dict) -> List[dict]:
    """Lit le certificat TLS uniquement si un port HTTPS est ouvert."""
    port = _tls_port(machine_data)
    if port is None:
        return []

    tls_info = check_machine_tls(ip, port=port)

    # Le certificat n'a pas pu être lu.
    if not tls_info or tls_info.get("status") not in TLS_VALID_STATUSES:
        return []

    return [
        {
            "port": port,
            "subject": tls_info["sujet"],
            "issuer": tls_info["emetteur"],
            "validFrom": tls_info["date_debut_validite"],
            "expiresAt": tls_info["date_expiration"],
            "valid": tls_info["est_valide"],
            "validationError": tls_info["erreur_validation"],
        }
    ]


def scan(targets: Optional[List[str]] = None) -> List[dict]:
    """Collecte les résultats Nmap, ICMP, TCP, métriques système et TLS.

    Les IP explicitement demandées sont contrôlées même si Nmap
    ne les découvre pas.

    Les CIDR et noms DNS restent pris en charge par Nmap :
    seules leurs IP découvertes sont ensuite contrôlées.

    Args:
        targets: adresses IP, noms DNS ou plages CIDR à scanner. Si omis,
            DEFAULT_TARGETS est utilisé.

    Returns:
        Une liste de dictionnaires, un par machine, avec notamment les clés :
        ip, id, mac, first_seen, last_seen, ports, open_ports, latencyMs,
        packetLossPercent, cpuPercent, memory, disks, tcpChecks
        et certificates.

    Raises:
        RuntimeError: si le scan réseau sous-jacent échoue.
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
        # Une erreur ICMP ne doit pas empêcher les contrôles suivants.
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

        # Métriques système (CPU, RAM, disques) : idem, non bloquant.
        try:
            system_metrics = collect_system_metrics(ip)
        except RuntimeError as exc:
            logger.warning(
                "Collecte des métriques impossible pour %s : %s",
                ip,
                exc,
            )
            system_metrics = {
                "cpuPercent": None,
                "memory": None,
                "disks": [],
                "metricsError": str(exc),
            }

        machine_data.update(system_metrics)

        # Essayer les ports du profil, même sans découverte Nmap,
        # en y ajoutant les ports TCP découverts (sans doublons).
        tcp_ports = set(DEFAULT_TCP_PORTS) | _detected_ports(machine_data)

        machine_data["tcpChecks"] = [
            check_tcp_service(
                ip=ip,
                port=port,
                timeout=TCP_TIMEOUT,
            )
            for port in sorted(tcp_ports)
        ]

        # Certificat TLS, uniquement si un port HTTPS est ouvert.
        machine_data["certificates"] = _collect_certificates(ip, machine_data)

        machines.append(machine_data)

    return machines