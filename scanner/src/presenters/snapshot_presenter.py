"""Présentateur de l'instantané de scan selon le contrat de l'API."""

from datetime import datetime, timezone


class SnapshotPresenter:
    """Transforme les résultats du collecteur au format du contrat API."""

    @staticmethod
    def to_snapshot(machines: list[dict]) -> dict:
        """Construit l'instantané de l'API à partir des machines collectées.

        Args:
            machines: Dictionnaires bruts des machines, tels que produits par
                le cas d'usage de scan.

        Returns:
            Un dictionnaire contenant la version du contrat, l'horodatage du
            scan et la liste des équipements formatés.
        """
        devices = []

        for machine in machines:
            device = {
                "ip": machine["ip"],
                "mac": machine.get("mac"),
                "ports": machine.get("ports", []),
                "latencyMs": machine.get("latencyMs"),
                "packetLossPercent": machine.get("packetLossPercent"),
                "tcpChecks": machine.get("tcpChecks", []),
                "cpuPercent": machine.get("cpuPercent") if machine.get("cpuPercent") is not None else machine.get("cpu_percent"),
                "memory": machine.get("memory"),
                "disks": machine.get("disks", []),
                "certificates": machine.get("certificates", []),
            }

            if machine.get("hostname"):
                device["hostname"] = machine["hostname"]

            if machine.get("icmpError"):
                device["icmpError"] = machine["icmpError"]

            devices.append(device)

        return {
            "contractVersion": "1.0.0",
            "scannedAt": datetime.now(timezone.utc).isoformat(),
            "devices": devices,
        }
