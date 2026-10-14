import os
import sqlite3
import secrets
import time
import hashlib
import json
import base64
import binascii
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from functools import wraps
from urllib.parse import urlsplit

from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from database import Postgres
from markupsafe import escape


def create_app(database=None, testing=False):
    app = Flask(__name__, static_folder=None)
    app.config.update(TESTING=testing, MAX_CONTENT_LENGTH=4_000_000)
    db_url = os.environ.get('DATABASE_URL') if database is None else None
    if os.environ.get('VERCEL') and not db_url:
        raise RuntimeError('Configure DATABASE_URL com um PostgreSQL persistente na Vercel.')
    db_path = Path(database or os.environ.get('DATABASE_PATH', Path(__file__).parent / 'instance' / 'sistema.sqlite3'))
    if not db_url:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    dummy_hash = generate_password_hash(secrets.token_urlsafe(32))

    def db():
        if 'db' not in g:
            if db_url:
                g.db = Postgres(db_url, local_test=testing)
            else:
                g.db = sqlite3.connect(db_path, timeout=15)
                g.db.row_factory = sqlite3.Row
                g.db.execute('PRAGMA foreign_keys=ON')
        return g.db

    @app.teardown_appcontext
    def close_db(error):
        if 'db' in g:
            g.db.close()

    with app.app_context():
        if db_url:
            db().execute('SELECT pg_advisory_xact_lock(8248221)')
        db().executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','student')),
            active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            csrf TEXT NOT NULL, expires TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS plans (
            user_id INTEGER PRIMARY KEY REFERENCES users(id), diet TEXT NOT NULL DEFAULT '',
            workout TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
            water_goal INTEGER NOT NULL DEFAULT 3500, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
            day TEXT NOT NULL, weight REAL, water INTEGER NOT NULL DEFAULT 0,
            trained INTEGER NOT NULL DEFAULT 0, diet_done INTEGER NOT NULL DEFAULT 0,
            notes TEXT NOT NULL DEFAULT '', UNIQUE(user_id, day));
        CREATE UNIQUE INDEX IF NOT EXISTS one_admin ON users(role) WHERE role='admin';
        CREATE TABLE IF NOT EXISTS login_attempts (attempt_key TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL);
        CREATE INDEX IF NOT EXISTS login_attempt_key ON login_attempts(attempt_key,created_at);
        CREATE TABLE IF NOT EXISTS student_state (
            user_id INTEGER PRIMARY KEY REFERENCES users(id), state TEXT NOT NULL,
            pro TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
        ''')
        db().commit()

    def now():
        return datetime.now(timezone.utc).isoformat()

    def public_user(row):
        return {k: row[k] for k in ('id', 'name', 'email', 'role', 'active', 'must_change')}

    def error(message, code=400):
        return jsonify(error=message), code

    @app.before_request
    def authenticate():
        g.user = None
        g.csrf = None
        token = request.cookies.get('sistema_session', '')
        if token:
            row = db().execute('SELECT u.*, s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1', (token, now())).fetchone()
            if row:
                g.user = row
                g.csrf = row['csrf']
        if request.path.startswith('/api/') and request.method in ('POST', 'PUT', 'DELETE'):
            if request.headers.get('X-Sistema-Request') != '1':
                return error('Requisição inválida.', 403)
            origin = request.headers.get('Origin')
            if origin:
                parsed_origin = urlsplit(origin)
                secure_required = os.environ.get('COOKIE_SECURE') == '1' or bool(os.environ.get('VERCEL'))
                if parsed_origin.netloc.lower() != request.host.lower() or parsed_origin.scheme not in ('http', 'https') or (secure_required and parsed_origin.scheme != 'https'):
                    return error('Origem inválida.', 403)
            if request.path not in ('/api/login', '/api/setup') and (not g.csrf or not secrets.compare_digest(request.headers.get('X-CSRF-Token', ''), g.csrf)):
                return error('Sessão expirada. Entre novamente.', 403)

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        if request.path == '/aluno':
            # The supplied UI uses inline styles and onclick handlers.
            response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            response.headers['Cache-Control'] = 'no-store'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        if request.path == '/sw.js':
            response.headers['Cache-Control'] = 'no-cache'
        return response

    def required(role=None, password_change=False):
        def decorate(fn):
            @wraps(fn)
            def wrapped(*args, **kwargs):
                if not g.user:
                    return error('Entre para continuar.', 401)
                if role and g.user['role'] != role:
                    return error('Acesso restrito à administração.', 403)
                if g.user['must_change'] and not password_change:
                    return error('Troque sua senha inicial para continuar.', 403)
                return fn(*args, **kwargs)
            return wrapped
        return decorate

    def body():
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def text(data, key, limit):
        value = data.get(key, '')
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('Campo inválido: ' + key)
        return value.strip()

    @app.errorhandler(ValueError)
    def invalid_value(exc):
        return error(str(exc))

    @app.errorhandler(413)
    def too_large(exc):
        return error('O histórico de fotos excedeu o limite de 4 MB. Remova fotos antigas antes de salvar.',413)

    @app.get('/')
    def index():
        return send_from_directory(app.root_path, 'index.html')

    @app.get('/<filename>')
    def assets(filename):
        if filename not in ('app.js', 'style.css', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'student-bridge.js', 'student-core.js', 'student-pro.js'):
            return error('Não encontrado.', 404)
        return send_from_directory(app.root_path, filename)

    @app.get('/vendor/chart.umd.js')
    def chart_asset():
        return send_from_directory(Path(app.root_path) / 'vendor', 'chart.umd.js')

    def state_for(user_id):
        row = db().execute('SELECT state,pro,version FROM student_state WHERE user_id=?', (user_id,)).fetchone()
        return {'state':json.loads(row['state']), 'pro':json.loads(row['pro']), 'version':row['version']} if row else {'state':{},'pro':{},'version':0}

    @app.get('/aluno')
    def student_app():
        from flask import redirect
        if not g.user or g.user['role'] != 'student' or g.user['must_change']:
            return redirect('/')
        from jinja2.utils import htmlsafe_json_dumps
        payload = state_for(g.user['id'])
        plan = db().execute('SELECT * FROM plans WHERE user_id=?', (g.user['id'],)).fetchone()
        payload.update(user=public_user(g.user),csrf=g.csrf,plan=dict(plan) if plan else {})
        if not payload['state']:
            rows = db().execute('SELECT * FROM progress WHERE user_id=? ORDER BY day DESC', (g.user['id'],)).fetchall()
            payload['state'] = {'calData':{r['day']:{'water':r['water'],'peso':r['weight'] or 0,'treino':bool(r['trained'])} for r in rows},'weights':[{'kg':r['weight'],'date':r['day'],'dayKey':r['day']} for r in rows if r['weight']],'legacyTrainingDays':{r['day']:True for r in rows if r['trained']}}
        page = (Path(app.root_path) / 'student.html').read_text()
        display_name=' '.join(g.user['name'].split()[:2])
        page=page.replace('<!--BLACKFIT_NAME-->',str(escape(display_name)))
        return page.replace('<!--BLACKFIT_BOOTSTRAP-->', '<script id="blackfit-data" type="application/json">'+str(htmlsafe_json_dumps(payload))+'</script>')

    @app.get('/api/student-state')
    @required('student')
    def get_student_state():
        return jsonify(state_for(g.user['id']))

    @app.put('/api/student-state')
    @required('student')
    def put_student_state():
        data = body()
        state, pro, version = data.get('state'), data.get('pro'), data.get('version')
        if not isinstance(state, dict) or not isinstance(pro,dict) or type(version) is not int or version<0:
            return error('Estado de acompanhamento inválido.')
        for key in ('calData','exChecks','loads','offDiet','photosByDay','photosByWeek','collapsed'):
            if key in state and not isinstance(state[key],dict):
                return error('Estado de acompanhamento inválido.')
        for key in ('weights','photos'):
            if key in state and not isinstance(state[key],list):
                return error('Estado de acompanhamento inválido.')
        for key in ('sugarDone','dailyGoals'):
            if key in pro and not isinstance(pro[key],dict):
                return error('Estado de metas inválido.')
        # Do not accept HTML/javascript photo URLs from uploaded state.
        def valid_photos(value):
            if isinstance(value, dict):
                for key,item in value.items():
                    if key=='src' and (not isinstance(item,str) or not item.startswith(('data:image/jpeg;base64,','data:image/png;base64,','data:image/webp;base64,'))):
                        return False
                    if key=='src':
                        try:
                            base64.b64decode(item.split(',',1)[1],validate=True)
                        except (ValueError,binascii.Error):
                            return False
                    if not valid_photos(item): return False
            elif isinstance(value,list):
                return all(valid_photos(item) for item in value)
            return True
        if not valid_photos(state):
            return error('Formato de foto inválido.')
        try:
            cur = db().execute('INSERT INTO student_state(user_id,state,pro,version) VALUES (?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,pro=excluded.pro,version=student_state.version+1 WHERE student_state.version=? RETURNING version', (g.user['id'],json.dumps(state),json.dumps(pro),version))
            row=cur.fetchone()
            if row is None or (version!=0 and row['version']==1):
                db().rollback()
                return error('Seu acompanhamento mudou em outra aba. Recarregue antes de continuar.',409)
            db().commit()
        except sqlite3.IntegrityError:
            db().rollback()
            return error('Não foi possível salvar.',409)
        return jsonify(version=row['version'])

    @app.get('/icons/<filename>')
    def icons(filename):
        if filename not in ('icon-192.png', 'icon-512.png', 'apple-touch-icon.png'):
            return error('Não encontrado.', 404)
        return send_from_directory(Path(app.root_path) / 'icons', filename)

    @app.get('/api/status')
    def status():
        return jsonify(configured=bool(db().execute("SELECT 1 FROM users WHERE role='admin'").fetchone()))

    @app.post('/api/setup')
    def setup():
        token = os.environ.get('BOOTSTRAP_TOKEN', '')
        data = body()
        supplied = text(data, 'token', 256)
        if len(token) < 32 or not secrets.compare_digest(token, supplied):
            return error('Código de ativação inválido.', 403)
        if db().execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
            return error('A central já foi ativada.', 409)
        name, email, password = text(data, 'name', 120), text(data, 'email', 254).lower(), text(data, 'password', 256)
        if not name or '@' not in email or len(password) < 12:
            return error('Informe nome, e-mail e senha com pelo menos 12 caracteres.')
        try:
            db().execute('INSERT INTO users(name,email,password,role,must_change,created_at) VALUES (?,?,?,?,0,?)', (name,email,generate_password_hash(password),'admin',now()))
            db().commit()
        except sqlite3.IntegrityError:
            db().rollback()
            return error('A central já foi ativada ou este e-mail já existe.', 409)
        return jsonify(ok=True), 201

    @app.post('/api/login')
    def login():
        data = body()
        email = text(data, 'email', 254).lower()
        password = text(data, 'password', 256)
        key = hashlib.sha256(email.encode()).hexdigest()
        cutoff = time.time() - 900
        if db_url:
            db().execute('SELECT pg_advisory_xact_lock(?)', (int(key[:15],16),))
        else:
            db().execute('BEGIN IMMEDIATE')
        db().execute('DELETE FROM login_attempts WHERE created_at<?', (cutoff,))
        count = db().execute('SELECT COUNT(*) AS n FROM login_attempts WHERE attempt_key=?', (key,)).fetchone()['n']
        if count >= 8:
            db().commit()
            return error('Muitas tentativas. Tente novamente em 15 minutos.', 429)
        db().execute('INSERT INTO login_attempts VALUES (?,?)', (key,time.time()))
        db().commit()
        row = db().execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        valid = check_password_hash(row['password'] if row else dummy_hash, password)
        if not row or not valid or not row['active']:
            return error('E-mail ou senha inválidos.', 401)
        db().execute('DELETE FROM login_attempts WHERE attempt_key=?', (key,))
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        db().execute('DELETE FROM sessions WHERE expires<?', (now(),))
        db().execute('INSERT INTO sessions VALUES (?,?,?,?)', (token, row['id'], csrf, (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()))
        db().commit()
        response = jsonify(user=public_user(row), csrf=csrf)
        response.set_cookie('sistema_session', token, httponly=True, secure=os.environ.get('COOKIE_SECURE') == '1' or bool(os.environ.get('VERCEL')), samesite='Strict', max_age=43200)
        return response

    @app.get('/api/me')
    @required(password_change=True)
    def me():
        return jsonify(user=public_user(g.user), csrf=g.csrf)

    @app.post('/api/logout')
    @required(password_change=True)
    def logout():
        db().execute('DELETE FROM sessions WHERE token=?', (request.cookies.get('sistema_session'),))
        db().commit()
        response = jsonify(ok=True)
        response.delete_cookie('sistema_session')
        return response

    @app.post('/api/password')
    @required(password_change=True)
    def password():
        data = body()
        old, new = text(data, 'current', 256), text(data, 'new', 256)
        if not check_password_hash(g.user['password'], old):
            return error('Senha atual inválida.', 400)
        if len(new) < 12 or new == old:
            return error('Use uma nova senha com pelo menos 12 caracteres.')
        db().execute('UPDATE users SET password=?,must_change=0 WHERE id=?', (generate_password_hash(new), g.user['id']))
        db().execute('DELETE FROM sessions WHERE user_id=? AND token<>?', (g.user['id'], request.cookies.get('sistema_session')))
        db().commit()
        return jsonify(ok=True)

    @app.get('/api/students')
    @required('admin')
    def students():
        rows = db().execute("SELECT * FROM users WHERE role='student' ORDER BY name").fetchall()
        return jsonify(students=[public_user(r) for r in rows])

    @app.post('/api/students')
    @required('admin')
    def new_student():
        data = body()
        name, email = text(data, 'name', 120), text(data, 'email', 254).lower()
        password = text(data, 'password', 256)
        if not name or '@' not in email or len(password) < 12:
            return error('Informe nome, e-mail e senha inicial com pelo menos 12 caracteres.')
        try:
            cur = db().execute('INSERT INTO users(name,email,password,role,created_at) VALUES (?,?,?,?,?)', (name, email, generate_password_hash(password), 'student', now()))
            db().execute('INSERT INTO plans(user_id,water_goal,updated_at) VALUES (?,3500,?)', (cur.lastrowid, now()))
            db().commit()
        except sqlite3.IntegrityError:
            db().rollback()
            return error('Este e-mail já está cadastrado.', 409)
        return jsonify(id=cur.lastrowid), 201

    def target(user_id):
        if g.user['role'] != 'admin' and g.user['id'] != user_id:
            return None
        return db().execute("SELECT * FROM users WHERE id=? AND role='student'", (user_id,)).fetchone()

    @app.get('/api/students/<int:user_id>')
    @required()
    def student_detail(user_id):
        row = target(user_id)
        if not row:
            return error('Aluno não encontrado.', 404)
        plan = db().execute('SELECT * FROM plans WHERE user_id=?', (user_id,)).fetchone()
        progress = db().execute('SELECT day,weight,water,trained,diet_done,notes FROM progress WHERE user_id=? ORDER BY day DESC LIMIT 365', (user_id,)).fetchall()
        app_state=state_for(user_id)
        records={r['day']:dict(r) for r in progress}
        for day,entry in app_state['state'].get('calData',{}).items():
            if not isinstance(entry,dict): continue
            try:
                date.fromisoformat(day)
            except (ValueError,TypeError):
                continue
            records[day]={**records.get(day,{}),'day':day,'weight':entry.get('peso') or None,'water':entry.get('water',0),'trained':bool(entry.get('treino')),'diet_done':bool(records.get(day,{}).get('diet_done')),'notes':records.get(day,{}).get('notes','')}
        sugar=app_state['pro'].get('sugarDone',{})
        for day,entry in records.items(): entry['sugar_done']=bool(sugar.get(day))
        for day,entry in records.items():
            checks=app_state['state'].get('exChecks',{}).get('checks_'+day.replace('-','_'),{})
            entry['exercises_done']=sum(sum(bool(v) for v in group.values()) for group in checks.values() if isinstance(group,dict)) if isinstance(checks,dict) else 0
        return jsonify(user=public_user(row), plan=dict(plan) if plan else None, progress=[records[k] for k in sorted(records,reverse=True)[:365]], app_state=app_state)

    @app.put('/api/students/<int:user_id>/plan')
    @required('admin')
    def update_plan(user_id):
        if not target(user_id):
            return error('Aluno não encontrado.', 404)
        data = body()
        diet, workout, notes = text(data, 'diet', 20000), text(data, 'workout', 20000), text(data, 'notes', 4000)
        goal = data.get('water_goal', 3500)
        if type(goal) is not int or not 0 <= goal <= 10000:
            return error('Meta de água inválida.')
        db().execute('INSERT INTO plans VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET diet=excluded.diet,workout=excluded.workout,notes=excluded.notes,water_goal=excluded.water_goal,updated_at=excluded.updated_at', (user_id, diet, workout, notes, goal, now()))
        db().commit()
        return jsonify(ok=True)

    @app.put('/api/students/<int:user_id>/access')
    @required('admin')
    def access(user_id):
        if not target(user_id):
            return error('Aluno não encontrado.', 404)
        data = body()
        if type(data.get('active')) is not bool:
            return error('Status inválido.')
        new = text(data, 'password', 256)
        if new and len(new) < 12:
            return error('A senha inicial precisa ter pelo menos 12 caracteres.')
        db().execute('UPDATE users SET active=? WHERE id=?', (int(data['active']), user_id))
        if new:
            db().execute('UPDATE users SET password=?,must_change=1 WHERE id=?', (generate_password_hash(new), user_id))
        if new or not data['active']:
            db().execute('DELETE FROM sessions WHERE user_id=?', (user_id,))
        db().commit()
        return jsonify(ok=True)

    @app.put('/api/progress')
    @required('student')
    def update_progress():
        data = body()
        day = text(data, 'day', 10)
        try:
            parsed = date.fromisoformat(day)
        except ValueError:
            return error('Data inválida.')
        if parsed.isoformat() != day or parsed > date.today() + timedelta(days=1):
            return error('Data inválida.')
        weight, water = data.get('weight'), data.get('water', 0)
        if weight is not None and (type(weight) not in (int, float) or not 1 <= weight <= 500):
            return error('Peso inválido.')
        if type(water) is not int or not 0 <= water <= 15000:
            return error('Quantidade de água inválida.')
        trained, diet_done = data.get('trained', False), data.get('diet_done', False)
        if type(trained) is not bool or type(diet_done) is not bool:
            return error('Registro inválido.')
        notes = text(data, 'notes', 4000)
        db().execute('INSERT INTO progress(user_id,day,weight,water,trained,diet_done,notes) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET weight=excluded.weight,water=excluded.water,trained=excluded.trained,diet_done=excluded.diet_done,notes=excluded.notes', (g.user['id'], day, weight, water, int(trained), int(diet_done), notes))
        db().commit()
        return jsonify(ok=True)

    @app.cli.command('create-admin')
    def create_admin():
        import getpass
        email = input('E-mail do administrador: ').strip().lower()
        name = input('Nome: ').strip()
        password = getpass.getpass('Senha (mínimo 12 caracteres): ')
        confirmation = getpass.getpass('Repita a senha: ')
        if not name or '@' not in email or len(password) < 12 or password != confirmation:
            raise SystemExit('Dados inválidos. Nenhuma conta criada.')
        if db().execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
            raise SystemExit('Já existe um administrador.')
        db().execute('INSERT INTO users(name,email,password,role,must_change,created_at) VALUES (?,?,?,?,0,?)', (name, email, generate_password_hash(password), 'admin', now()))
        db().commit()
        print('Administrador criado. Entre pelo app.')

    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=8001, debug=False)
