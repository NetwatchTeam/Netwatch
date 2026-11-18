"""Cas d'usage : scanner les machines et enrichir chacune de ses contrôles (ICMP, TCP, système, TLS)."""

import ipaddress
import logging
from dataclasses import asdict
from typing import List, Optional, Set

from usecases.check_availability import CheckAvailability
from usecases.check_tcp_service import CheckTcpService
from usecases.check_tls_use_case import CheckMachineTls
from usecases.collect_system_metrics import CollectSystemMetrics
from usecases.scan_network import DEFAULT_TARGETS, ScanNetwork


logger = logging.getLogger(__name__)

# Profil de contrôle du lab, pas une liste de services obligatoires.
DEFAULT_TCP_PORTS = {22, 80, 443}
TCP_TIMEOUT = 1.0

TLS_PORTS = (443, 8443)  # Ports standards HTTPS, par ordre de préférence
TLS_VALID_STATUSES = ("ok", "expired", "expiring_soon")


def _detected_ports(machine_data: dict) -> Set[int]:
    """Retourne les ports TCP détectés par Nmap (open_ports + ports).

    Args:
        machine_data: Dictionnaire de données brutes d'une machine.

    Returns:
        L'ensemble des numéros de ports TCP détectés.
    """
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
    """Retourne le port TLS à contrôler (443 en priorité), sinon None.

    Args:
        machine_data: Dictionnaire de données brutes d'une machine.

    Returns:
        Le port TLS à contrôler, ou None si aucun port HTTPS n'est détecté.
    """
    detected = _detected_ports(machine_data)

    for port in TLS_PORTS:
        if port in detected:
            return port

    return None


class ScanMachines:
    """Orchestre Nmap, ICMP, TCP, métriques système et TLS pour chaque machine."""

    def __init__(
        self,
        scan_network: ScanNetwork,
        check_availability: CheckAvailability,
        check_tcp_service: CheckTcpService,
        check_tls: CheckMachineTls,
        collect_system_metrics: CollectSystemMetrics,
    ) -> None:
        """Initialise le cas d'usage.

        Args:
            scan_network: Cas d'usage de découverte réseau (Nmap).
            check_availability: Cas d'usage de mesure ICMP.
            check_tcp_service: Cas d'usage de contrôle TCP.
            check_tls: Cas d'usage de lecture du certificat TLS.
            collect_system_metrics: Cas d'usage de collecte des métriques
                système.
        """
        self._scan_network = scan_network
        self._check_availability = check_availability
        self._check_tcp_service = check_tcp_service
        self._check_tls = check_tls
        self._collect_system_metrics = collect_system_metrics

    def _collect_certificates(self, ip: str, machine_data: dict) -> List[dict]:
        """Lit le certificat TLS uniquement si un port HTTPS est ouvert.

        Args:
            ip: Adresse IP de la machine.
            machine_data: Dictionnaire de données brutes de la machine.

        Returns:
            Une liste contenant le certificat lu, ou une liste vide si aucun
            port HTTPS n'est ouvert ou si le certificat est illisible.
        """
        port = _tls_port(machine_data)
        if port is None:
            return []

        tls_info = self._check_tls.execute(ip, port=port)

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

    def execute(self, targets: Optional[List[str]] = None) -> List[dict]:
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
            ip, id, mac, ports, open_ports, latencyMs,
            packetLossPercent, cpuPercent, memory, disks, tcpChecks
            et certificates.

        Raises:
            RuntimeError: si le scan réseau sous-jacent échoue.
        """
        requested_targets = targets or DEFAULT_TARGETS
        discovered = self._scan_network.execute(requested_targets)

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
                measurements = self._check_availability.execute(ip)
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
                system_metrics = self._collect_system_metrics.execute(ip)
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
                self._check_tcp_service.execute(
                    ip=ip,
                    port=port,
                    timeout=TCP_TIMEOUT,
                )
                for port in sorted(tcp_ports)
            ]

            # Certificat TLS, uniquement si un port HTTPS est ouvert.
            machine_data["certificates"] = self._collect_certificates(ip, machine_data)

            machines.append(machine_data)

        return machines