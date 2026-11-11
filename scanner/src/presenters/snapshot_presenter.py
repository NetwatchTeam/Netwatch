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
            }

            if machine.get("hostname"):
                device["hostname"] = machine["hostname"]

            devices.append(device)

        return {
            "contractVersion": "1.0.0",
            "scannedAt": datetime.now(timezone.utc).isoformat(),
            "devices": devices,
        }