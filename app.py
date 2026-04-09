from flask import Flask, render_template, request, jsonify
import cv2
import numpy as np
import base64
import traceback
from fer.fer import FER
import os
import tensorflow as tf
import json

os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
tf.config.set_visible_devices([], 'GPU')

app = Flask(__name__)

USER_MUSIC_DIR = os.path.join('static', 'music', 'user_songs')
os.makedirs(USER_MUSIC_DIR, exist_ok=True)

MOOD_MAPPING_FILE = os.path.join(USER_MUSIC_DIR, 'mood_mappings.json')
if not os.path.exists(MOOD_MAPPING_FILE):
    with open(MOOD_MAPPING_FILE, 'w') as f:
        json.dump({}, f)

fer_detector = None

def init_emotion_model():
    global fer_detector
    try:
        print("Initializing FER detector with Haar Cascade...")
        fer_detector = FER(mtcnn=False)
        print("FER loaded successfully!")
        return True
    except Exception as e:
        print("Failed to load FER:", e)
        traceback.print_exc()
        return False

model_loaded = init_emotion_model()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/detect_emotion', methods=['POST'])
def detect_emotion():
    if fer_detector is None:
        return jsonify({'emotion': 'neutral', 'error': 'FER failed to initialize'}), 503

    try:
        data = request.json.get('image')
        if not data or not isinstance(data, str) or not data.startswith('data:image'):
            return jsonify({'error': 'Invalid image data'}), 400

        img_data = base64.b64decode(data.split(',')[1])
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'error': 'Could not decode image'}), 400

        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        result = fer_detector.detect_emotions(rgb_img)

        if not result:
            return jsonify({'emotion': 'neutral'})

        emotions = result[0]['emotions']
        top_emotion = max(emotions, key=emotions.get)

        mapping = {
            'happy': 'happy',
            'sad': 'sad',
            'angry': 'sad',
            'surprise': 'surprised',
            'fear': 'sad',
            'disgust': 'neutral',
            'neutral': 'neutral'
        }
        emotion = mapping.get(top_emotion.lower(), 'neutral')

        return jsonify({
            'emotion': emotion,
            'success': True,
            'scores': emotions
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'emotion': 'neutral', 'error': str(e)}), 500

@app.route('/upload_song', methods=['POST'])
def upload_song():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    mood = request.form.get('mood', 'neutral')

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if not file.filename.lower().endswith('.mp3'):
        return jsonify({'error': 'Only MP3 files allowed'}), 400

    filename = file.filename
    file_path = os.path.join(USER_MUSIC_DIR, filename)
    file.save(file_path)

    with open(MOOD_MAPPING_FILE, 'r+') as f:
        mappings = json.load(f)
        mappings[filename] = mood
        f.seek(0)
        json.dump(mappings, f)
        f.truncate()

    return jsonify({'success': True, 'message': f'Song "{filename}" added to {mood} mood!'})

@app.route('/delete_song', methods=['POST'])
def delete_song():
    filename = request.json.get('filename')
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400

    file_path = os.path.join(USER_MUSIC_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        with open(MOOD_MAPPING_FILE, 'r+') as f:
            mappings = json.load(f)
            if filename in mappings:
                del mappings[filename]
            f.seek(0)
            json.dump(mappings, f)
            f.truncate()
        return jsonify({'success': True, 'message': f'Song "{filename}" deleted'})
    return jsonify({'error': 'Song not found'}), 404

@app.route('/get_songs', methods=['GET'])
def get_songs():
    mood = request.args.get('mood', 'all')
    songs = []
    with open(MOOD_MAPPING_FILE, 'r') as f:
        mappings = json.load(f)

    for filename in os.listdir(USER_MUSIC_DIR):
        if filename.lower().endswith('.mp3'):
            song_mood = mappings.get(filename, 'neutral')
            if mood == 'all' or song_mood == mood:
                songs.append({
                    'name': filename,
                    'url': f'/static/music/user_songs/{filename}'
                })
    return jsonify({'songs': songs})

if __name__ == '__main__':
    print("Starting Mood Music Player...")
    if model_loaded:
        print("Emotion detection ready!")
    else:
        print("WARNING: Using 'neutral' fallback.")
    
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)