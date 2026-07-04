from flask import Flask, jsonify, request, session, render_template, g
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from datetime import date
import sqlite3
import os
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'change-this-secret')

DB_PATH = os.path.join(os.path.dirname(__file__), 'rangoon_kitchen.db')

# ── Database connection ─────────────────────────────────
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# ── Create tables + seed data on first run ──────────────
def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS categories (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT UNIQUE NOT NULL,
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS menu_items (
            id             TEXT PRIMARY KEY,
            name_en        TEXT NOT NULL,
            name_my        TEXT NOT NULL,
            description    TEXT,
            price          INTEGER NOT NULL,
            original_price INTEGER,
            category       TEXT,
            image_url      TEXT,
            is_popular     INTEGER DEFAULT 0,
            is_special     INTEGER DEFAULT 0,
            is_active      INTEGER DEFAULT 1,
            sort_order     INTEGER DEFAULT 0,
            created_at     TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS opening_hours (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            day_name   TEXT UNIQUE NOT NULL,
            open_time  TEXT NOT NULL DEFAULT '08:00',
            close_time TEXT NOT NULL DEFAULT '20:00',
            is_closed  INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS holidays (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            date   TEXT NOT NULL UNIQUE,
            reason TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
            key_name TEXT PRIMARY KEY,
            value    TEXT
        );
    """)

    # Seed opening hours if empty
    if db.execute("SELECT COUNT(*) FROM opening_hours").fetchone()[0] == 0:
        db.executescript("""
            INSERT INTO opening_hours (day_name, open_time, close_time, is_closed) VALUES
                ('monday','08:00','20:00',0),
                ('tuesday','08:00','20:00',0),
                ('wednesday','08:00','20:00',0),
                ('thursday','08:00','20:00',0),
                ('friday','08:00','20:00',0),
                ('saturday','09:00','21:00',0),
                ('sunday','09:00','18:00',0);
        """)

    # Seed settings if empty
    if db.execute("SELECT COUNT(*) FROM settings").fetchone()[0] == 0:
        db.executescript("""
            INSERT INTO settings (key_name, value) VALUES
                ('siteName','The Rangoon Kitchen'),
                ('messengerUrl','https://m.me/YourPageUsername'),
                ('phoneNumber','+959XXXXXXXX'),
                ('deliveryZone','Thaketa Township'),
                ('deliveryTime','45-60 Min'),
                ('is_open','true');
        """)

    # Seed categories if empty
    if db.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
        db.executescript("""
            INSERT INTO categories (name, sort_order) VALUES
                ('noodles',1),('curry',2),('salad',3),('drinks',4),('desserts',5);
        """)

    db.commit()
    db.close()

init_db()

# ── Auth guard ──────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

# ── Pages ───────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/rangoon-backdoor-2026')
def admin():
    return render_template('admin.html')

# ── Admin login / logout ────────────────────────────────
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    db = get_db()
    row = db.execute("SELECT password FROM admin_users WHERE username=?", (data['username'],)).fetchone()
    if row and check_password_hash(row[0], data['password']):
        session['admin_logged_in'] = True
        return jsonify({'ok': True})
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'ok': True})

# ── PUBLIC API ──────────────────────────────────────────
@app.route('/api/menu')
def get_menu():
    db = get_db()
    rows = db.execute("SELECT * FROM menu_items WHERE is_active=1 ORDER BY sort_order, created_at").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/status')
def get_status():
    db = get_db()
    settings = {r[0]: r[1] for r in db.execute("SELECT key_name, value FROM settings").fetchall()}
    day = date.today().strftime('%A').lower()
    hours = db.execute("SELECT open_time, close_time, is_closed FROM opening_hours WHERE day_name=?", (day,)).fetchone()
    today_str = date.today().isoformat()
    holiday = db.execute("SELECT reason FROM holidays WHERE date=?", (today_str,)).fetchone()
    return jsonify({
        'settings': settings,
        'today_hours': {'open': hours[0], 'close': hours[1], 'closed': bool(hours[2])} if hours else None,
        'holiday': holiday[0] if holiday else None,
        'is_open': settings.get('is_open') == 'true'
    })

@app.route('/api/categories')
def get_categories():
    db = get_db()
    rows = db.execute("SELECT name FROM categories ORDER BY sort_order").fetchall()
    return jsonify([r[0] for r in rows])

# ── ADMIN API (protected) ───────────────────────────────

# Menu CRUD
@app.route('/api/admin/menu', methods=['GET'])
@login_required
def admin_get_menu():
    db = get_db()
    rows = db.execute("SELECT * FROM menu_items ORDER BY sort_order, created_at").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/admin/menu', methods=['POST'])
@login_required
def add_menu_item():
    d = request.json
    db = get_db()
    db.execute("""
        INSERT INTO menu_items
          (id,name_en,name_my,description,price,original_price,category,image_url,is_popular,is_special,is_active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    """, (d['id'],d['nameEn'],d['nameMy'],d.get('description'),d['price'],
          d.get('originalPrice'),d.get('category'),d.get('imageUrl'),
          d.get('popular',False),d.get('isSpecial',False),d.get('active',True)))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/admin/menu/<item_id>', methods=['PUT'])
@login_required
def update_menu_item(item_id):
    d = request.json
    db = get_db()
    db.execute("""
        UPDATE menu_items SET
          name_en=?,name_my=?,description=?,price=?,original_price=?,
          category=?,image_url=?,is_popular=?,is_special=?,is_active=?
        WHERE id=?
    """, (d['nameEn'],d['nameMy'],d.get('description'),d['price'],d.get('originalPrice'),
          d.get('category'),d.get('imageUrl'),d.get('popular'),d.get('isSpecial'),d.get('active'),item_id))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/admin/menu/<item_id>', methods=['DELETE'])
@login_required
def delete_menu_item(item_id):
    db = get_db()
    db.execute("DELETE FROM menu_items WHERE id=?", (item_id,))
    db.commit()
    return jsonify({'ok': True})

# Hours
@app.route('/api/admin/hours', methods=['GET'])
@login_required
def get_hours():
    db = get_db()
    rows = db.execute("SELECT * FROM opening_hours").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/admin/hours', methods=['PUT'])
@login_required
def update_hours():
    days = request.json
    db = get_db()
    for d in days:
        db.execute("""
            UPDATE opening_hours SET open_time=?, close_time=?, is_closed=?
            WHERE day_name=?
        """, (d['open_time'], d['close_time'], d['is_closed'], d['day_name']))
    db.commit()
    return jsonify({'ok': True})

# Holidays
@app.route('/api/admin/holidays', methods=['GET'])
@login_required
def get_holidays():
    db = get_db()
    rows = db.execute("SELECT id, date, reason FROM holidays ORDER BY date").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/admin/holidays', methods=['POST'])
@login_required
def add_holiday():
    d = request.json
    db = get_db()
    db.execute("INSERT INTO holidays (date, reason) VALUES (?,?)", (d['date'], d.get('reason','')))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/admin/holidays/<int:hid>', methods=['DELETE'])
@login_required
def delete_holiday(hid):
    db = get_db()
    db.execute("DELETE FROM holidays WHERE id=?", (hid,))
    db.commit()
    return jsonify({'ok': True})

# Settings
@app.route('/api/admin/settings', methods=['GET'])
@login_required
def get_settings():
    db = get_db()
    rows = db.execute("SELECT key_name, value FROM settings").fetchall()
    return jsonify({r[0]: r[1] for r in rows})

@app.route('/api/admin/settings', methods=['PUT'])
@login_required
def update_settings():
    d = request.json
    db = get_db()
    for k, v in d.items():
        db.execute("INSERT INTO settings (key_name,value) VALUES (?,?) ON CONFLICT(key_name) DO UPDATE SET value=?", (k,v,v))
    db.commit()
    return jsonify({'ok': True})

# Categories
@app.route('/api/admin/categories', methods=['POST'])
@login_required
def add_category():
    name = request.json.get('name','').strip().lower()
    db = get_db()
    db.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (name,))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/admin/categories/<name>', methods=['DELETE'])
@login_required
def delete_category(name):
    db = get_db()
    db.execute("DELETE FROM categories WHERE name=?", (name,))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/admin/password', methods=['POST'])
@login_required
def change_password():
    new_pw = request.json.get('password', '').strip()
    if not new_pw or len(new_pw) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    db = get_db()
    db.execute("UPDATE admin_users SET password=? WHERE id=(SELECT MIN(id) FROM admin_users)",
               (generate_password_hash(new_pw),))
    db.commit()
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(debug=True)
