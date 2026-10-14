import sqlite3
import tempfile
import unittest
import os
import re
import json
from unittest.mock import patch
import psycopg
from pathlib import Path
from datetime import date
from werkzeug.security import generate_password_hash
from app import create_app


class AppTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'test.sqlite3'
        self.pg_url = os.environ.get('TEST_POSTGRES_URL')
        if self.pg_url:
            os.environ['DATABASE_URL'] = self.pg_url
            with psycopg.connect(self.pg_url) as db:
                db.execute('DROP SCHEMA public CASCADE')
                db.execute('CREATE SCHEMA public')
        self.database = None if self.pg_url else self.path
        self.app = create_app(self.database, testing=True)
        self.admin = self.app.test_client()
        with self.connection() as db:
            sql = "INSERT INTO users(name,email,password,role,must_change,created_at) VALUES (?,?,?,?,0,'test')"
            db.execute(sql.replace('?', '%s') if self.pg_url else sql, ('Admin', 'admin@example.test', generate_password_hash('Admin-test-password-2026'), 'admin'))
        self.admin_csrf = self.login(self.admin, 'admin@example.test', 'Admin-test-password-2026')['csrf']

    def tearDown(self):
        self.tmp.cleanup()

    def connection(self):
        return psycopg.connect(self.pg_url) if self.pg_url else sqlite3.connect(self.path)

    def login(self, client, email, password):
        response = client.post('/api/login', json={'email': email, 'password': password}, headers={'X-Sistema-Request': '1'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('HttpOnly', response.headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', response.headers['Set-Cookie'])
        return response.json

    def mutate(self, client, csrf, path, data, method='PUT'):
        return client.open(path, method=method, json=data, headers={'X-Sistema-Request':'1', 'X-CSRF-Token':csrf})

    def student(self, email):
        response = self.mutate(self.admin, self.admin_csrf, '/api/students', {'name': 'Aluno', 'email': email, 'password':'Student-initial-2026'}, 'POST')
        self.assertEqual(response.status_code, 201)
        return response.json['id']

    def activate_student(self, email):
        client = self.app.test_client()
        csrf = self.login(client, email, 'Student-initial-2026')['csrf']
        response = self.mutate(client, csrf, '/api/password', {'current':'Student-initial-2026','new':'Student-private-2026'}, 'POST')
        self.assertEqual(response.status_code, 200)
        return client, csrf

    def test_plan_progress_and_persistence(self):
        sid = self.student('one@example.test')
        response = self.mutate(self.admin, self.admin_csrf, f'/api/students/{sid}/plan', {'diet':'Refeição personalizada', 'workout':'Treino A', 'notes':'Orientação', 'water_goal':3000})
        self.assertEqual(response.status_code, 200)
        client, csrf = self.activate_student('one@example.test')
        self.assertEqual(client.get(f'/api/students/{sid}').json['plan']['diet'], 'Refeição personalizada')
        response = self.mutate(client, csrf, '/api/progress', {'day':date.today().isoformat(), 'weight':80.5, 'water':2500, 'trained':True,'diet_done':True,'notes':'Concluído'})
        self.assertEqual(response.status_code, 200)
        rows = self.admin.get(f'/api/students/{sid}').json['progress']
        self.assertEqual(rows[0]['weight'], 80.5)
        # Another save updates the same day rather than creating duplicate progress.
        self.mutate(client, csrf, '/api/progress', {'day':date.today().isoformat(),'water':3000})
        rows = self.admin.get(f'/api/students/{sid}').json['progress']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['water'], 3000)
        # Restart the app against the same database: plans and progress survive.
        restarted = create_app(self.database, testing=True).test_client()
        self.login(restarted,'one@example.test','Student-private-2026')
        self.assertEqual(restarted.get(f'/api/students/{sid}').json['progress'][0]['water'],3000)

    def test_accounts_isolated_and_role_restricted(self):
        one=self.student('one@example.test'); two=self.student('two@example.test')
        client, csrf=self.activate_student('one@example.test')
        self.assertEqual(client.get(f'/api/students/{two}').status_code,404)
        self.assertEqual(client.get('/api/students').status_code,403)
        self.assertEqual(self.mutate(client,csrf,f'/api/students/{one}/plan',{}).status_code,403)
        self.assertEqual(self.app.test_client().get(f'/api/students/{one}').status_code,401)

    def test_initial_password_and_access_revocation(self):
        sid=self.student('one@example.test')
        client=self.app.test_client(); csrf=self.login(client,'one@example.test','Student-initial-2026')['csrf']
        self.assertEqual(client.get(f'/api/students/{sid}').status_code,403)
        self.mutate(client,csrf,'/api/password',{'current':'Student-initial-2026','new':'Student-private-2026'},'POST')
        self.assertEqual(self.mutate(self.admin,self.admin_csrf,f'/api/students/{sid}/access',{'active':False}).status_code,200)
        self.assertEqual(client.get('/api/me').status_code,401)

    def test_reset_and_csrf(self):
        sid=self.student('one@example.test'); client,csrf=self.activate_student('one@example.test')
        self.assertEqual(client.put('/api/progress',json={'day':date.today().isoformat()}).status_code,403)
        self.assertEqual(client.put('/api/progress',json={},headers={'X-Sistema-Request':'1','X-CSRF-Token':csrf,'Origin':'https://other.example'}).status_code,403)
        self.assertEqual(self.mutate(self.admin,self.admin_csrf,f'/api/students/{sid}/access',{'active':True,'password':'Reset-initial-2026'}).status_code,200)
        self.assertEqual(client.get('/api/me').status_code,401)
        self.assertEqual(self.login(client,'one@example.test','Reset-initial-2026')['user']['must_change'],1)

    def test_validation_and_private_files(self):
        sid=self.student('one@example.test');client,csrf=self.activate_student('one@example.test')
        for data in [{'day':'bad'},{'day':date.today().isoformat(),'water':-1},{'day':date.today().isoformat(),'weight':float('nan')},{'day':date.today().isoformat(),'trained':'true'}]:
            self.assertEqual(self.mutate(client,csrf,'/api/progress',data).status_code,400)
        for path in ['/app.py','/original.html','/instance/sistema.sqlite3','/.env']:
            self.assertEqual(client.get(path).status_code,404)
        for path in ['/','/app.js','/style.css','/sw.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png']:
            with client.get(path) as response:
                self.assertEqual(response.status_code,200)
        self.assertEqual(client.get('/api/me').headers['Cache-Control'],'no-store')

    def test_login_throttled(self):
        client=self.app.test_client()
        for _ in range(8):
            self.assertEqual(client.post('/api/login',json={'email':'missing@example.test','password':'incorrect'},headers={'X-Sistema-Request':'1'}).status_code,401)
        self.assertEqual(client.post('/api/login',json={'email':'missing@example.test','password':'incorrect'},headers={'X-Sistema-Request':'1'}).status_code,429)

    def test_original_app_state_isolated_and_visible_to_admin(self):
        one=self.student('one@example.test');two=self.student('two@example.test')
        client,csrf=self.activate_student('one@example.test')
        day=date.today().isoformat()
        payload={'state':{'water':500,'calData':{day:{'water':500,'peso':80.5,'treino':True}},'exChecks':{'checks_'+day.replace('-','_'):{'A':{'0':True}}}},'pro':{'sugarDone':{day:True},'dailyGoals':{}},'version':0,'user_id':two}
        response=self.mutate(client,csrf,'/api/student-state',payload)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['version'],1)
        self.assertEqual(client.get('/api/student-state').json['state']['water'],500)
        other,other_csrf=self.activate_student('two@example.test')
        self.assertEqual(other.get('/api/student-state').json['state'],{})
        self.assertEqual(self.mutate(client,csrf,'/api/student-state',payload).status_code,409)
        payload['version']=1;payload['state']['water']=750
        self.assertEqual(self.mutate(client,csrf,'/api/student-state',payload).json['version'],2)
        record=self.admin.get(f'/api/students/{one}').json['progress'][0]
        self.assertTrue(record['sugar_done'])
        self.assertEqual(record['exercises_done'],1)
        self.assertEqual(record['water'],500)
        restarted=create_app(self.database,testing=True).test_client()
        self.login(restarted,'one@example.test','Student-private-2026')
        self.assertEqual(restarted.get('/api/student-state').json['state']['water'],750)
        self.assertEqual(self.app.test_client().get('/aluno').status_code,302)
        with client.get('/aluno') as response:
            self.assertEqual(response.status_code,200)
            self.assertIn('120 dias sem açúcar',response.text)
            self.assertIn('blackfit-data',response.text)
            self.assertEqual(response.headers['Cache-Control'],'no-store')

    def test_original_state_rejects_invalid_shapes_and_photo_urls(self):
        self.student('one@example.test');client,csrf=self.activate_student('one@example.test')
        for data in [{'state':{'calData':[]},'pro':{},'version':0},{'state':{},'pro':{'sugarDone':[]},'version':0},{'state':{'photos':[{'src':'javascript:alert(1)'}]},'pro':{},'version':0}]:
            self.assertEqual(self.mutate(client,csrf,'/api/student-state',data).status_code,400)
        for path in ['/student-bridge.js','/student-core.js','/student-pro.js','/vendor/chart.umd.js']:
            with client.get(path) as response:self.assertEqual(response.status_code,200)

    def test_existing_progress_imported_into_original_screen(self):
        self.student('one@example.test');client,csrf=self.activate_student('one@example.test')
        day=date.today().isoformat()
        self.mutate(client,csrf,'/api/progress',{'day':day,'weight':80.5,'water':750,'trained':True})
        with client.get('/aluno') as response:
            boot=json.loads(re.search(r'<script id="blackfit-data" type="application/json">(.*?)</script>',response.text).group(1))
        self.assertEqual(boot['state']['calData'][day]['water'],750)
        self.assertEqual(boot['state']['weights'][0]['kg'],80.5)
        self.assertTrue(boot['state']['legacyTrainingDays'][day])

    def test_opening_uses_each_authenticated_student_name(self):
        one=self.student('one@example.test');two=self.student('two@example.test')
        with self.connection() as db:
            sql='UPDATE users SET name=? WHERE id=?'
            sql=sql.replace('?','%s') if self.pg_url else sql
            db.execute(sql,('Douglas   Silva Santos',one))
            db.execute(sql,('Maria <Teste> Souza',two))
        for email,expected,unexpected in [('one@example.test','Douglas Silva','Santos'),('two@example.test','Maria &lt;Teste&gt;','Souza')]:
            client,_=self.activate_student(email)
            with client.get('/aluno') as response:
                self.assertEqual(response.status_code,200)
                welcome=re.search(r'id="welcome-user-name"><span>(.*?)</span>',response.text).group(1)
                splash=re.search(r'id="splash-user-name">(.*?)</div>',response.text).group(1)
                self.assertEqual(welcome,expected)
                self.assertTrue(splash.startswith(expected+' ·'))
                self.assertNotIn(unexpected,welcome)
                self.assertNotIn('WEN<span>DEL',response.text)

    def test_bootstrap_only_once_and_secure_cookie(self):
        with self.connection() as db:
            db.execute('DELETE FROM sessions')
            db.execute('DELETE FROM users')
        client=self.app.test_client()
        token='test-bootstrap-only-not-production-2026'
        data={'name':'Central','email':'owner@example.test','password':'Owner-private-password','token':token}
        with patch.dict(os.environ,{'BOOTSTRAP_TOKEN':token,'COOKIE_SECURE':'1'}):
            self.assertEqual(client.post('/api/setup',json={**data,'token':'incorrect'},headers={'X-Sistema-Request':'1'}).status_code,403)
            self.assertEqual(client.post('/api/setup',json=data,headers={'X-Sistema-Request':'1'}).status_code,201)
            self.assertEqual(client.post('/api/setup',json=data,headers={'X-Sistema-Request':'1'}).status_code,409)
            response=client.post('/api/login',json={'email':data['email'],'password':data['password']},headers={'X-Sistema-Request':'1'})
            self.assertIn('Secure;', response.headers['Set-Cookie'])


if __name__ == '__main__':
    unittest.main()
