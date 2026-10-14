import os
import unittest
from unittest.mock import patch

import certifi
import psycopg
from database import Postgres


class TrustConfigurationTests(unittest.TestCase):
    def test_production_uses_bundled_roots_and_full_verification(self):
        with patch.dict(os.environ, {}, clear=True), patch('database.psycopg.connect') as connect:
            Postgres('postgresql://example.test/db?sslmode=disable')
        self.assertEqual(connect.call_args.kwargs['sslmode'], 'verify-full')
        self.assertEqual(connect.call_args.kwargs['sslrootcert'], certifi.where())
        self.assertTrue(os.path.isfile(certifi.where()))

    def test_custom_trust_bundle_preserves_verification(self):
        with patch.dict(os.environ, {'PGSSLROOTCERT': '/test/trusted-ca.pem'}), patch('database.psycopg.connect') as connect:
            Postgres('postgresql://example.test/db')
        self.assertEqual(connect.call_args.kwargs['sslmode'], 'verify-full')
        self.assertEqual(connect.call_args.kwargs['sslrootcert'], '/test/trusted-ca.pem')


@unittest.skipUnless(os.environ.get('TEST_TLS_POSTGRES_URL'), 'Requires a disposable TLS PostgreSQL fixture')
class TLSConnectionTests(unittest.TestCase):
    def test_trusted_server_connects(self):
        db = Postgres(os.environ['TEST_TLS_POSTGRES_URL'])
        try:
            self.assertEqual(db.execute('SELECT 1 AS n').fetchone()['n'], 1)
        finally:
            db.close()

    def test_untrusted_server_rejected(self):
        with patch.dict(os.environ, {'PGSSLROOTCERT': certifi.where()}):
            with self.assertRaises(psycopg.OperationalError):
                Postgres(os.environ['TEST_TLS_POSTGRES_URL'])

    def test_wrong_hostname_rejected(self):
        # Fixture certificate is valid for localhost, not 127.0.0.1.
        url = os.environ['TEST_TLS_POSTGRES_URL'].replace('localhost', '127.0.0.1')
        with self.assertRaises(psycopg.OperationalError):
            Postgres(url)
