"""Small DB-API adapter: SQLite locally; PostgreSQL for hosted instances."""
import sqlite3
import psycopg
from psycopg.rows import dict_row


class Postgres:
    def __init__(self, url, local_test=False):
        options = {} if local_test else {'sslmode':'verify-full', 'sslrootcert':'system'}
        self.connection = psycopg.connect(url, row_factory=dict_row, connect_timeout=10, **options)

    def execute(self, sql, parameters=()):
        sql = sql.replace('?', '%s')
        returning = sql.lstrip().upper().startswith('INSERT INTO USERS(')
        if returning:
            sql += ' RETURNING id'
        try:
            cursor = self.connection.execute(sql, parameters)
        except psycopg.errors.UniqueViolation as exc:
            raise sqlite3.IntegrityError('Duplicate value') from exc
        if returning:
            return InsertResult(cursor.fetchone()['id'])
        return cursor

    def executescript(self, script):
        for statement in script.split(';'):
            if statement.strip():
                self.connection.execute(statement.replace('id INTEGER PRIMARY KEY,', 'id BIGSERIAL PRIMARY KEY,'))

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


class InsertResult:
    def __init__(self, row_id):
        self.lastrowid = row_id
