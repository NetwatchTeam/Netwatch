import mariadb
from dotenv import load_dotenv
import os
from typing import List, Optional
from pathlib import Path

from entities.machine import Machine
from usecases.interfaces.repository_interface import RepositoryInterface





class MariaDBMachineRepository(RepositoryInterface):
    def __init__(self):

        chemin = Path("src/includes/.env")

        if chemin.is_file():
            load_dotenv(dotenv_path=chemin)
        else:
            raise FileNotFoundError(f"Fichier de configuration introuvable. Chemin attendu : {chemin.absolute()}")


        self.db_config = {
            'host': os.getenv("DB_HOST"),
            'port': int(os.getenv("DB_PORT")),
            'user': os.getenv("DB_USER"),
            'password': os.getenv("DB_PASSWORD"),
            'database': os.getenv("DB_NAME")
        }

    def _connect(self) -> mariadb.Connection:
        connect=mariadb.connect(**self.db_config, ssl_verify_cert=False)
        return connect
    
    def get_all(self) -> List[Machine]:
        conn = self._connect()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                "SELECT id, ip, mac, first_seen, last_seen FROM machine ORDER BY ip"
            )
            rows = cursor.fetchall()
            return [self._to_entity(row) for row in rows]
        finally:
            cursor.close()
            conn.close()

    def get_by_ip(self, ip: str) -> Optional[Machine]:
        conn = self._connect()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                "SELECT id, ip, mac, first_seen, last_seen FROM machine WHERE ip = ?",
                (ip,)
            )
            row = cursor.fetchone()
            return self._to_entity(row) if row else None
        finally:
            cursor.close()
            conn.close()

    def save(self, machine: Machine) -> Machine:
        conn = self._connect()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                INSERT INTO machine (ip, mac, first_seen, last_seen)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    mac = COALESCE(VALUES(mac), mac),
                    last_seen = VALUES(last_seen)
                RETURNING id, ip, mac, first_seen, last_seen
                """,
                (machine.ip, machine.mac, machine.first_seen, machine.last_seen)
            )
            
            row = cursor.fetchone()
            conn.commit()
            return self._to_entity(row)
        finally:
            cursor.close()
            conn.close()

    @staticmethod
    def _to_entity(row: dict) -> Machine:
        return Machine(
            id=row["id"],
            ip=row["ip"],
            mac=row["mac"],
            first_seen=row["first_seen"],
            last_seen=row["last_seen"],
        )