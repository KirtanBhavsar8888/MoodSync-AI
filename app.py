from flask import Flask, render_template, request, jsonify
import sqlite3
import json
import cv2
import numpy as np
from datetime import datetime
import io
import base64
import os
import tempfile
import speech_recognition as sr
from werkzeug.utils import secure_filename

# Import AI libraries
try:
    from deepface import DeepFace
except ImportError:
    print("DeepFace not installed. Video analysis will be limited.")
    DeepFace = None

try:
    import nltk
    from nltk.sentiment import SentimentIntensityAnalyzer
    # Download required NLTK data
    try:
        nltk.data.find('vader_lexicon')
    except LookupError:
        nltk.download('vader_lexicon')
except ImportError:
    print("NLTK not installed. Text analysis will be limited.")
    nltk = None

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Initialize sentiment analyzer
if nltk:
    sia = SentimentIntensityAnalyzer()

# Database setup
def init_db():
    conn = sqlite3.connect('mood_data.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mood_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            mood_type TEXT NOT NULL,
            sentiment_score REAL,
            analysis_method TEXT,
            text_content TEXT,
            confidence REAL
        )
    ''')
    
    conn.commit()
    conn.close()

# Travel recommendations data
travel_data = {
    'happy': [
        {
            'name': 'Barcelona, Spain',
            'description': 'Vibrant city with stunning architecture and lively atmosphere',
            'activities': ['Beach relaxation', 'Gaudi architecture tours', 'Nightlife exploration', 'Food markets'],
            'season': 'Spring to Fall',
            'mood_match': 'Perfect for celebrating good vibes'
        },
        {
            'name': 'Bali, Indonesia', 
            'description': 'Tropical paradise with rich culture and beautiful beaches',
            'activities': ['Surfing', 'Temple visits', 'Yoga retreats', 'Rice terraces'],
            'season': 'April to October',
            'mood_match': 'Ideal for joyful exploration and adventure'
        },
        {
            'name': 'Tokyo, Japan',
            'description': 'Dynamic metropolis blending tradition and modernity',
            'activities': ['City exploration', 'Food tours', 'Shopping', 'Cultural experiences'],
            'season': 'Spring and Fall',
            'mood_match': 'Great for energetic urban adventures'
        }
    ],
    'sad': [
        {
            'name': 'Kyoto, Japan',
            'description': 'Peaceful city with serene temples and gardens',
            'activities': ['Temple meditation', 'Garden walks', 'Tea ceremonies', 'Bamboo forest'],
            'season': 'Fall and Winter',
            'mood_match': 'Perfect for quiet reflection and healing'
        },
        {
            'name': 'Swiss Alps, Switzerland',
            'description': 'Majestic mountains offering tranquility and natural beauty',
            'activities': ['Mountain hiking', 'Scenic cable cars', 'Alpine retreats', 'Lake meditation'],
            'season': 'Summer',
            'mood_match': 'Ideal for finding peace in nature'
        },
        {
            'name': 'Santorini, Greece',
            'description': 'Stunning island with breathtaking sunsets and peaceful vibes',
            'activities': ['Sunset viewing', 'Wine tasting', 'Peaceful walks', 'Art galleries'],
            'season': 'Spring to Fall',
            'mood_match': 'Great for romantic and contemplative moments'
        }
    ],
    'anxious': [
        {
            'name': 'Costa Rica',
            'description': 'Natural paradise promoting wellness and eco-therapy',
            'activities': ['Nature therapy', 'Wildlife watching', 'Eco-tours', 'Beach relaxation'],
            'season': 'December to April',
            'mood_match': 'Perfect for stress relief in nature'
        },
        {
            'name': 'Iceland',
            'description': 'Unique landscape with therapeutic hot springs',
            'activities': ['Hot springs', 'Northern lights', 'Scenic drives', 'Geological wonders'],
            'season': 'September to March (Aurora), Summer (Hiking)',
            'mood_match': 'Ideal for finding calm and wonder'
        }
    ],
    'angry': [
        {
            'name': 'New Zealand',
            'description': 'Adventure destination for channeling energy positively',
            'activities': ['Adventure sports', 'Hiking', 'Bungee jumping', 'Scenic beauty'],
            'season': 'October to April',
            'mood_match': 'Great for releasing energy through adventure'
        }
    ],
    'neutral': [
        {
            'name': 'Paris, France',
            'description': 'Classic destination with art, culture, and romance',
            'activities': ['Museum visits', 'Café culture', 'Architecture tours', 'River cruises'],
            'season': 'Spring and Fall',
            'mood_match': 'Perfect for balanced cultural exploration'
        }
    ]
}

# Wellness recommendations
def generate_wellness_recommendations(mood, sentiment_score):
    recommendations = {
        'sad': {
            'immediate': [
                'Take a 10-minute walk outside to get natural light and fresh air',
                'Practice deep breathing: inhale for 4 counts, hold for 4, exhale for 6',
                'Listen to uplifting music or your favorite songs',
                'Reach out to a friend or family member for a brief chat',
                'Do 5 minutes of gentle stretching or yoga poses'
            ],
            'activities': [
                'Engage in light physical exercise like walking or dancing',
                'Try a creative activity like drawing, writing, or crafting',
                'Watch a comedy show or funny videos to lift your spirits',
                'Practice gratitude by writing down 3 things you\'re thankful for',
                'Take a warm bath or shower to relax your body'
            ],
            'nutrition': [
                'Eat a piece of dark chocolate (releases endorphins)',
                'Have a cup of green tea or chamomile tea',
                'Include omega-3 rich foods like walnuts or salmon',
                'Stay hydrated with plenty of water',
                'Avoid excessive alcohol or caffeine'
            ]
        },
        'angry': [
            'Try progressive muscle relaxation: tense and release each muscle group',
            'Count to 10 slowly while taking deep breaths',
            'Go for a vigorous walk or run to release physical tension',
            'Write down your feelings in a journal without censoring',
            'Try the 5-4-3-2-1 grounding technique (5 things you see, 4 you hear, etc.)'
        ],
        'anxious': [
            'Practice the 4-7-8 breathing technique (inhale 4, hold 7, exhale 8)',
            'Try grounding: feel your feet on the ground and notice your surroundings',
            'Do a 5-minute mindfulness meditation using a guided app',
            'Engage in gentle physical activity like tai chi or yoga',
            'Listen to calming nature sounds or white noise'
        ],
        'happy': [
            'Share your positive energy with others - call someone you care about',
            'Engage in a creative project or hobby you enjoy',
            'Exercise to maintain and boost your good mood',
            'Practice gratitude and reflect on what\'s going well',
            'Plan something fun for the future to extend the positive feeling'
        ],
        'neutral': [
            'Try something new to spark interest and engagement',
            'Go for a nature walk to connect with the environment',
            'Practice mindfulness to become more aware of the present moment',
            'Engage in moderate physical activity to boost energy',
            'Connect with friends or family for social interaction'
        ]
    }
    
    return recommendations.get(mood, recommendations['neutral'])

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze_text', methods=['POST'])
def analyze_text():
    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        if not nltk:
            return jsonify({'error': 'NLTK not available for text analysis'}), 500
            
        # Perform sentiment analysis
        scores = sia.polarity_scores(text)
        
        # Determine mood based on compound score
        compound = scores['compound']
        if compound >= 0.05:
            mood = 'happy'
        elif compound <= -0.05:
            if scores['neg'] > 0.3:
                mood = 'angry' if 'angry' in text.lower() or 'mad' in text.lower() else 'sad'
            else:
                mood = 'sad'
        else:
            mood = 'neutral'
        
        # Store in database
        conn = sqlite3.connect('mood_data.db')
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO mood_history (mood_type, sentiment_score, analysis_method, text_content, confidence)
            VALUES (?, ?, ?, ?, ?)
        ''', (mood, compound, 'text', text, abs(compound)))
        conn.commit()
        conn.close()
        
        # Get wellness recommendations
        wellness = generate_wellness_recommendations(mood, compound)
        
        return jsonify({
            'mood': mood,
            'sentiment_score': compound,
            'confidence': abs(compound),
            'detailed_scores': scores,
            'wellness_recommendations': wellness,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze_voice', methods=['POST'])
def analyze_voice():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No audio file selected'}), 400
        
        # Save temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            audio_file.save(tmp_file.name)
            
            # Initialize recognizer
            r = sr.Recognizer()
            
            try:
                # Convert audio to text
                with sr.AudioFile(tmp_file.name) as source:
                    audio_data = r.record(source)
                    text = r.recognize_google(audio_data)
                
                # Clean up temp file
                os.unlink(tmp_file.name)
                
                # Analyze sentiment of transcribed text
                if not nltk:
                    return jsonify({'error': 'NLTK not available for sentiment analysis'}), 500
                
                scores = sia.polarity_scores(text)
                compound = scores['compound']
                
                # Determine mood
                if compound >= 0.05:
                    mood = 'happy'
                elif compound <= -0.05:
                    mood = 'sad'
                else:
                    mood = 'neutral'
                
                # Store in database
                conn = sqlite3.connect('mood_data.db')
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO mood_history (mood_type, sentiment_score, analysis_method, text_content, confidence)
                    VALUES (?, ?, ?, ?, ?)
                ''', (mood, compound, 'voice', text, abs(compound)))
                conn.commit()
                conn.close()
                
                wellness = generate_wellness_recommendations(mood, compound)
                
                return jsonify({
                    'transcription': text,
                    'mood': mood,
                    'sentiment_score': compound,
                    'confidence': abs(compound),
                    'detailed_scores': scores,
                    'wellness_recommendations': wellness,
                    'timestamp': datetime.now().isoformat()
                })
                
            except sr.UnknownValueError:
                os.unlink(tmp_file.name)
                return jsonify({'error': 'Could not understand audio'}), 400
            except sr.RequestError as e:
                os.unlink(tmp_file.name)
                return jsonify({'error': f'Speech recognition error: {str(e)}'}), 500
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze_video', methods=['POST'])
def analyze_video():
    try:
        data = request.get_json()
        image_data = data.get('image_data')
        
        if not image_data:
            return jsonify({'error': 'No image data provided'}), 400
        
        if not DeepFace:
            return jsonify({'error': 'DeepFace not available for video analysis'}), 500
        
        # Decode base64 image
        image_data = image_data.split(',')[1]  # Remove data:image/jpeg;base64, prefix
        image_bytes = base64.b64decode(image_data)
        
        # Convert to OpenCV image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        try:
            # Analyze emotions using DeepFace
            result = DeepFace.analyze(img, actions=['emotion'], enforce_detection=False)
            
            # Handle different DeepFace return formats
            if isinstance(result, list):
                emotions = result[0]['emotion']
            else:
                emotions = result['emotion']
            
            # Find dominant emotion
            dominant_emotion = max(emotions, key=emotions.get)
            confidence = emotions[dominant_emotion] / 100.0
            
            # Map DeepFace emotions to our mood categories
            emotion_mapping = {
                'happy': 'happy',
                'sad': 'sad', 
                'angry': 'angry',
                'fear': 'anxious',
                'surprise': 'surprised',
                'disgust': 'angry',
                'neutral': 'neutral'
            }
            
            mood = emotion_mapping.get(dominant_emotion, 'neutral')
            
            # Store in database
            conn = sqlite3.connect('mood_data.db')
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO mood_history (mood_type, sentiment_score, analysis_method, confidence)
                VALUES (?, ?, ?, ?)
            ''', (mood, confidence, 'video', confidence))
            conn.commit()
            conn.close()
            
            wellness = generate_wellness_recommendations(mood, confidence)
            
            return jsonify({
                'mood': mood,
                'dominant_emotion': dominant_emotion,
                'confidence': confidence,
                'all_emotions': emotions,
                'wellness_recommendations': wellness,
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            return jsonify({'error': f'Face analysis failed: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_travel_recommendations', methods=['POST'])
def get_travel_recommendations():
    try:
        data = request.get_json()
        mood = data.get('mood', 'neutral')
        
        # Get recommendations for the mood
        recommendations = travel_data.get(mood, travel_data['neutral'])
        
        return jsonify({
            'mood': mood,
            'destinations': recommendations,
            'total_count': len(recommendations)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_mood_history', methods=['GET'])
def get_mood_history():
    try:
        conn = sqlite3.connect('mood_data.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT mood_type, sentiment_score, analysis_method, timestamp, confidence
            FROM mood_history 
            ORDER BY timestamp DESC 
            LIMIT 50
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        history = []
        for row in rows:
            history.append({
                'mood': row[0],
                'sentiment_score': row[1],
                'method': row[2],
                'timestamp': row[3],
                'confidence': row[4]
            })
        
        return jsonify({'history': history})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500



if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
