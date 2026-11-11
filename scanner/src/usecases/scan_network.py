import uuid
from datetime import datetime, timezone
from typing import List, Optional

from libnmap.process import NmapProcess
from libnmap.parser import NmapParser

from entities.machine import Machine

DEFAULT_TARGETS = ["127.0.0.1"]

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_mac(host) -> Optional[str]:
    """Extrait l'adresse MAC d'un hôte si elle existe."""
    if host.mac:
        return host.mac
    return None


def scan_network(targets: Optional[List[str]] = None) -> List[Machine]:
    """Scanne les cibles données (par défaut : localhost) et retourne des entités Machine
    non persistées (id=None). -Pn force nmap à considérer les hôtes comme actifs sans
    dépendre de la découverte ICMP, ce qui est nécessaire pour scanner localhost de façon fiable."""
    targets = targets or DEFAULT_TARGETS

    scan = NmapProcess(" ".join(targets), "-sV -Pn")
    return_code = scan.run()

    if return_code != 0:
        raise RuntimeError(f"Le scan nmap a échoué : {scan.stderr}")

    report = NmapParser.parse(scan.stdout)
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