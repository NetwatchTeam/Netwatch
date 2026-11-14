from datetime import datetime, timezone


class SnapshotPresenter:
    """Transforme les résultats du collecteur au format du contrat API."""

    @staticmethod
    def to_snapshot(machines: list[dict]) -> dict:
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
