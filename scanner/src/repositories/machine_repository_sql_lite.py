import sqlite3
from typing import List, Optional

from entities.machine import Machine
from usecases.interfaces.repository_interface import RepositoryInterface


class SQLiteMachineRepository(RepositoryInterface):
    def __init__(self, db_path: str = "netwatch.db"):
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_all(self) -> List[Machine]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, ip, mac, first_seen, last_seen FROM machine ORDER BY ip"
            ).fetchall()
            return [self._to_entity(row) for row in rows]

    def get_by_ip(self, ip: str) -> Optional[Machine]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, ip, mac, first_seen, last_seen FROM machine WHERE ip = ?",
                (ip,),
            ).fetchone()
            return self._to_entity(row) if row else None

    def save(self, machine: Machine) -> Machine:
        with self._connect() as conn:
            row = conn.execute(
                """
                INSERT INTO machine (ip, mac, first_seen, last_seen)
                VALUES (:ip, :mac, :first_seen, :last_seen)
                ON CONFLICT(ip) DO UPDATE SET
                    mac = COALESCE(excluded.mac, machine.mac),
                    last_seen = excluded.last_seen
                RETURNING id, ip, mac, first_seen, last_seen
                """,
                {
                    "ip": machine.ip,
                    "mac": machine.mac,
                    "first_seen": machine.first_seen,
                    "last_seen": machine.last_seen,
                },
            ).fetchone()
            conn.commit()
            return self._to_entity(row)

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> Machine:
        return Machine(
            id=row["id"],
            ip=row["ip"],
            mac=row["mac"],
            first_seen=row["first_seen"],
            last_seen=row["last_seen"],
        )