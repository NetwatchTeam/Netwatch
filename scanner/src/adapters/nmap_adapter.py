"""Adaptateur : exécute nmap via libnmap et traduit ses objets en données de port.

C'est le seul module qui connaît la terminologie et les structures de données
propres à nmap. Il dépend du port ``NetworkScanner``, jamais des entités du
domaine.
"""

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from libnmap.parser import NmapParser
from libnmap.process import NmapProcess

from usecases.ports.network_scanner import NetworkScanner, ScannedHost, ScannedService


def _first_hostname(host: Any) -> str | None:
    """Extrait le premier nom d'hôte disponible d'un objet hôte nmap.

    Args:
        host: L'objet hôte libnmap.

    Returns:
        Le premier nom d'hôte non vide, ou None s'il n'y en a aucun.
    """
    for h in getattr(host, "hostnames", None) or []:
        name = h.get("name") if isinstance(h, dict) else h
        if isinstance(name, str) and name:
            return name
    return None


def _extract_mac(host: Any) -> str | None:
    """Extrait l'adresse MAC d'un hôte, si elle est disponible.

    Args:
        host: L'objet hôte libnmap.

    Returns:
        L'adresse MAC, ou None.
    """
    mac = getattr(host, "mac", None)
    return mac if mac else None


def _extract_vendor(host: Any) -> str | None:
    """Extrait le fabricant du matériel d'un hôte, s'il est disponible.

    Args:
        host: L'objet hôte libnmap.

    Returns:
        Le nom du fabricant, ou None.
    """
    vendor = getattr(host, "vendor", None)
    return vendor if isinstance(vendor, str) and vendor else None


def _open_services(host: Any) -> list[Any]:
    """Retourne les services libnmap d'un hôte dont le port est ouvert.

    Args:
        host: L'objet hôte libnmap.

    Returns:
        La liste des services dont l'état est « open ».
    """
    return [s for s in getattr(host, "services", None) or [] if s.state == "open"]


def _scanned_service(svc: Any) -> ScannedService:
    """Convertit un objet service libnmap en ScannedService.

    nmap décrit https comme du http dans un tunnel ssl : cela est traduit en
    indicateur ``tls``, afin que le cas d'usage ne voie jamais la librairie
    de nmap.

    Args:
        svc: L'objet service libnmap.

    Returns:
        Le ScannedService correspondant.
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
    """NetworkScanner implémenté avec nmap."""

    def scan_hosts(self, targets: list[str]) -> list[ScannedHost]:
        """Scanne chaque cible (IP, nom d'hôte ou plage) dans son propre pipeline nmap.

        Chaque cible est traitée indépendamment : découverte d'hôtes (-sn, qui
        fournit aussi la MAC et le nom d'hôte), puis scan des ports et services
        sur les hôtes trouvés actifs. Avec plusieurs cibles, les pipelines
        s'exécutent en parallèle, si bien qu'une plage inactive ou lente ne
        retarde pas les autres.
        Les cibles doivent être validées par le cas d'usage avant l'appel.

        Args:
            targets: Adresses IP, noms d'hôte ou plages CIDR à scanner.

        Returns:
            Un ScannedHost par hôte actif, regroupé par cible dans l'ordre
            fourni, sans doublon quand des plages se chevauchent.

        Raises:
            RuntimeError: Si l'une des exécutions de nmap échoue.
        """
        unique_targets = list(dict.fromkeys(targets))
        if len(unique_targets) <= 1:
            results = [self._scan_target(t) for t in unique_targets]
        else:
            with ThreadPoolExecutor(max_workers=len(unique_targets)) as pool:
                # map() conserve l'ordre et relève la première erreur.
                results = list(pool.map(self._scan_target, unique_targets))

        seen: set[str] = set()
        hosts: list[ScannedHost] = []
        for target_hosts in results:
            for host in target_hosts:
                if host.ip not in seen:
                    seen.add(host.ip)
                    hosts.append(host)
        return hosts

    @staticmethod
    def _scan_target(target: str) -> list[ScannedHost]:
        """Exécute la découverte puis le scan des ports et services d'une seule cible.

        Args:
            target: Adresse IP, nom d'hôte ou plage CIDR.

        Returns:
            Les hôtes actifs trouvés pour cette cible.

        Raises:
            RuntimeError: Si l'une des exécutions de nmap échoue.
        """
        # "-sn" : découverte d'hôtes seulement, pas de scan de ports.
        # Une liste (et non une chaîne) : libnmap supprime les espaces d'une chaîne.
        scan = NmapProcess([target], "-sn")
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
                    mac=_extract_mac(discovery_host),  # None hors du réseau local ou sans les droits root
                    vendor=_extract_vendor(discovery_host),
                    services=tuple(_scanned_service(s) for s in _open_services(host)),
                )
            )
        return hosts