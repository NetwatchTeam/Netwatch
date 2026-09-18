import sqlite3
from contextlib import closing

def migrate():

    with open("script.sql", "r", encoding="utf-8") as f:
        sql_content = f.read()


    with closing(sqlite3.connect("netwatch.db")) as conn, conn:
        conn.executescript(sql_content)

migrate()