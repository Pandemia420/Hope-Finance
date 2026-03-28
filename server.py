from flask import Flask, jsonify, request, send_from_directory, make_response
from flask_cors import CORS
import sqlite3, json, os
from datetime import datetime

app = Flask(__name__, static_folder='static')
CORS(app)

@app.after_request
def add_headers(resp):
    resp.headers['Bypass-Tunnel-Reminder'] = 'true'
    resp.headers['ngrok-skip-browser-warning'] = 'true'
    return resp


DB = os.getenv('DATABASE_URL', '/home/d-s/HopeData/finanzas_prod.db')
if DB.startswith('postgres://'): DB = DB.replace('postgres://', 'postgresql://', 1)

def get_db():
    if DB.startswith("postgres"): import psycopg2; conn = psycopg2.connect(DB, sslmode="require"); conn.autocommit = True
    else: conn = sqlite3.connect(DB)
    if not DB.startswith("postgres"): conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)')
    conn.commit()
    conn.close()
    print("✅ Base de datos lista")

@app.route('/')
def index():
    from flask import make_response
    resp = make_response(send_from_directory('static', 'interfaz.html'))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    return resp

@app.route('/modulo/<nombre>')
def modulo(nombre):
    resp = make_response(send_from_directory('static', nombre+'.html'))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    return resp

@app.route('/api/state', methods=['GET'])
def get_state():
    conn = get_db()
    row = conn.execute("SELECT value FROM app_state WHERE key='main'").fetchone()
    conn.close()
    if row:
        return jsonify(json.loads(row['value']))
    return jsonify({'bolsillos':[], 'modulos':{}, 'config':{'enTeorico':[], 'enInversion':[]}, 'modulosNombres':{}, 'modulosOcultos':[]})

@app.route('/api/state', methods=['POST'])
def save_state():
    conn = get_db()
    conn.execute("DELETE FROM app_state WHERE key=?", (key_val,)); conn.execute("INSERT INTO app_state (key,value,updated_at) VALUES (?,?,?)",
    ('main', json.dumps(request.get_json()), datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/state/<modulo>', methods=['GET'])
def get_modulo(modulo):
    conn = get_db()
    row = conn.execute("SELECT value FROM app_state WHERE key=?", (modulo,)).fetchone()
    conn.close()
    return jsonify(json.loads(row['value']) if row else {})

@app.route('/api/state/<modulo>', methods=['POST'])
def save_modulo(modulo):
    conn = get_db()
    conn.execute("DELETE FROM app_state WHERE key=?", (key_val,)); conn.execute("INSERT INTO app_state (key,value,updated_at) VALUES (?,?,?)",
    (modulo, json.dumps(request.get_json()), datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# Config PINs en memoria
pines = {}

@app.route('/api/config/pin', methods=['POST'])
def config_pin():
    data = request.get_json()
    modulo = data.get('modulo')
    pin = data.get('pin')
    if pin:
        pines[modulo] = pin
    elif modulo in pines:
        del pines[modulo]
    return jsonify({'ok': True})

@app.route('/modulo/hogar-check')
def hogar_check():
    return jsonify({'pin_requerido': 'hogar' in pines})

@app.route('/api/whatsapp', methods=['POST'])
def enviar_whatsapp():
    import urllib.request, json as json_lib
    data = request.json
    payload = json_lib.dumps(data).encode()
    req = urllib.request.Request('http://localhost:3001/send',
        data=payload, headers={'Content-Type':'application/json'}, method='POST')
    try:
        res = urllib.request.urlopen(req, timeout=5)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/whatsapp-image', methods=['POST'])
def enviar_whatsapp_image():
    import urllib.request, json as json_lib
    data = request.json
    payload = json_lib.dumps(data).encode()
    req = urllib.request.Request('http://localhost:3001/send-image',
        data=payload, headers={'Content-Type':'application/json'}, method='POST')
    try:
        res = urllib.request.urlopen(req, timeout=10)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    print("🚀 Corriendo en http://localhost:5000")
    app.run(host='0.0.0.0', port=3010, debug=False)
