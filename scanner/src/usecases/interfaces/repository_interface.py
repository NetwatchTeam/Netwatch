from abc import ABC, abstractmethod
from typing import List, Optional

from entities.machine import Machine


class RepositoryInterface(ABC):

    @abstractmethod
    def get_all(self) -> List[Machine]:
        ...

    @abstractmethod
    def get_by_ip(self, ip: str) -> Optional[Machine]:
        ...

    @abstractmethod
    def save(self, machine: Machine) -> Machine:
        """Upsert : crée la machine si son ip est inconnue, sinon met à jour mac/last_seen
        en conservant l'id et le first_seen d'origine. Retourne l'entité persistée (avec id)."""
        ...