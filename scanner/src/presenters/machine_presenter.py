"""Présentateur des machines pour l'API."""


class MachinePresenter:
    """Formate les données brutes des machines pour l'API (sans jamais voir les entités du domaine)."""

    @staticmethod
    def to_dict(machine_data: dict) -> dict:
        """Convertit le dictionnaire brut d'une machine.

        Args:
            machine_data: Dictionnaire de données brutes de la machine.

        Returns:
            Le dictionnaire formaté de la machine.
        """
        return machine_data

    @staticmethod
    def to_list(machines_data: list[dict]) -> list[dict]:
        """Convertit une liste de dictionnaires bruts de machines.

        Args:
            machines_data: Liste de dictionnaires de données brutes de machines.

        Returns:
            La liste des dictionnaires formatés des machines.
        """
        return [MachinePresenter.to_dict(m) for m in machines_data]
