import sqlite3
from typing import List
from scanner.src.entities.machine import Machine
from scanner.src.usecases.interfaces.repository_interface import RepositoryInterface


class SQLiteMachineRepository(RepositoryInterface):
    def __init__(self, db_path: str = "netwatch.db"):
        self.db_path = db_path

    def add(self, machine: Machine) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO machine (id, ip, mac, first_seen, last_seen) 
                VALUES (?, ?, ?, ?, ?)
                """,
                (machine.id, machine.ip, machine.mac, machine.first_seen, machine.last_seen)
            )
            conn.commit()

    def get_all(self) -> List[Machine]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT id, ip, mac, first_seen, last_seen FROM machine")
            rows = cursor.fetchall()
            
            return [
                Machine(
                    id=row[0], 
                    ip=row[1], 
                    mac=row[2], 
                    first_seen=row[3], 
                    last_seen=row[4]
                ) 
                for row in rows
            ]

