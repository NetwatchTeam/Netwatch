from typing import List


class MachinePresenter:
    """Formate les données brutes pour l'API (ignorant totalement les Entités métier)."""

    @staticmethod
    def to_dict(machine_data: dict) -> dict:
        return machine_data

    @staticmethod
    def to_list(machines_data: List[dict]) -> List[dict]:
        return [MachinePresenter.to_dict(m) for m in machines_data]