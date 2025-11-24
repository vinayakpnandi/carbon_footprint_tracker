from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_pymongo import PyMongo
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from bson.objectid import ObjectId
from functools import wraps
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'change-this-to-something-secret-and-random'
app.config['MONGO_URI'] = 'mongodb://localhost:27017/carbon_tracker'

mongo = PyMongo(app)

# --- Emission Factors (kg CO2 per unit) ---
EMISSION_FACTORS = {
    'transport': {
        'car': 0.192,
        'bike': 0.021,
        'public': 0.089,
        'walk': 0
    },
    'energy': {
        'low': 1.5,
        'medium': 3.5,
        'high': 6.0
    },
    'acFan': 0.5,
    'washingMachine': 0.5,   # per hour
    'diet': {
        'redMeat': 6.61,
        'whiteMeat': 1.87,
        'dairy': 1.39,
        'plant': 0.46
    }
}

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if mongo.db.users.find_one({'email': data['email']}):
        return jsonify({'success': False, 'message': 'Email already exists'}), 400
    user = {
        'name': data['name'],
        'email': data['email'],
        'password': generate_password_hash(data['password']),
        'created_at': datetime.utcnow(),
        'streak': 0
    }
    mongo.db.users.insert_one(user)
    return jsonify({'success': True, 'message': 'Account created successfully'})

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = mongo.db.users.find_one({'email': data['email']})
    if user and check_password_hash(user['password'], data['password']):
        session['user_id'] = str(user['_id'])
        session['user_name'] = user['name']
        return jsonify({'success': True, 'message': 'Login successful'})
    return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html', user_name=session.get('user_name'))

@app.route('/api/save-log', methods=['POST'])
@login_required
def save_log():
    data = request.get_json()
    user_id = session['user_id']
    today = datetime.utcnow().date().isoformat()

    # Travel Emissions
    travel = data.get('travel', {})
    travel_co2 = travel.get('distance', 0) * EMISSION_FACTORS['transport'].get(travel.get('mode', 'car'), 0)

    # Energy Emissions
    energy = data.get('energy', {})
    energy_co2 = EMISSION_FACTORS['energy'].get(energy.get('level', 'low'), 0)
    energy_co2 += float(energy.get('acHours', 0)) * EMISSION_FACTORS['acFan']
    energy_co2 += float(energy.get('washingMachine', 0)) * EMISSION_FACTORS['washingMachine']

    # Diet Emissions (sum across all slots)
    diet = data.get('diet', {})
    diet_co2 = 0
    for slot in ['morning', 'afternoon', 'evening', 'night']:
        slot_meal = diet.get(slot, {})
        for kind in ['redMeat', 'whiteMeat', 'dairy', 'plant']:
            diet_co2 += int(slot_meal.get(kind, 0)) * EMISSION_FACTORS['diet'][kind]

    log_entry = {
        'user_id': user_id,
        'date': today,
        'travel': travel,
        'energy': energy,
        'diet': diet,
        'co2': {
            'travel': travel_co2,
            'energy': energy_co2,
            'diet': diet_co2,
            'total': travel_co2 + energy_co2 + diet_co2
        },
        'updated_at': datetime.utcnow()
    }

    mongo.db.logs.update_one(
        {'user_id': user_id, 'date': today},
        {'$set': log_entry},
        upsert=True
    )

    update_streak(user_id)
    return jsonify({'success': True, 'co2': log_entry['co2']})

@app.route('/api/get-today', methods=['GET'])
@login_required
def get_today():
    user_id = session['user_id']
    today = datetime.utcnow().date().isoformat()
    log = mongo.db.logs.find_one({'user_id': user_id, 'date': today})
    if log:
        log['_id'] = str(log['_id'])
        return jsonify({'success': True, 'log': log})
    return jsonify({'success': False, 'message': 'No data for today'})

@app.route('/api/get-weekly', methods=['GET'])
@login_required
def get_weekly():
    user_id = session['user_id']
    seven_days_ago = (datetime.utcnow().date() - timedelta(days=7)).isoformat()
    logs = list(mongo.db.logs.find({
        'user_id': user_id,
        'date': {'$gte': seven_days_ago}
    }).sort('date', 1))
    for log in logs:
        log['_id'] = str(log['_id'])
    return jsonify({'success': True, 'logs': logs})

@app.route('/api/get-stats', methods=['GET'])
@login_required
def get_stats():
    user_id = session['user_id']
    user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
    logs = list(mongo.db.logs.find({'user_id': user_id}))
    total_days = len(logs)
    avg_daily = round(sum(log['co2']['total'] for log in logs) / total_days, 1) if total_days > 0 else 0
    stats = {
        'streak': user.get('streak', 0),
        'total_days': total_days,
        'avg_daily': avg_daily
    }
    return jsonify({'success': True, 'stats': stats})

def update_streak(user_id):
    logs = list(mongo.db.logs.find({'user_id': user_id}).sort('date', -1))
    if not logs:
        mongo.db.users.update_one({'_id': ObjectId(user_id)}, {'$set': {'streak': 0}})
        return
    streak = 1
    for i in range(len(logs) - 1):
        current_date = datetime.fromisoformat(logs[i]['date'])
        prev_date = datetime.fromisoformat(logs[i + 1]['date'])
        diff_days = (current_date - prev_date).days
        if diff_days == 1:
            streak += 1
        else:
            break
    mongo.db.users.update_one({'_id': ObjectId(user_id)}, {'$set': {'streak': streak}})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
