const { useState, useEffect, useRef } = React;

const MoodIcons = {
    happy: 'ph-fill ph-smiley',
    sad: 'ph-fill ph-sad',
    surprised: 'ph-fill ph-smiley-blank',
    neutral: 'ph-fill ph-smiley-meh',
};

const MoodLabels = {
    happy: 'Happy / Upbeat',
    sad: 'Sad / Reflective',
    surprised: 'Surprised / Energetic',
    neutral: 'Neutral / Chill',
};

const THEMES = {
    happy: 'bg-gradient-happy',
    sad: 'bg-gradient-sad',
    surprised: 'bg-gradient-surprised',
    neutral: 'bg-gradient-neutral',
};

const defaultSongs = {
    'happy': ['/static/music/groovy-vibe-427121.mp3'],
    'sad': ['/static/music/mixkit-hip-hop-02-738.mp3'],
    'surprised': ['/static/music/slowlife.mp3'],
    'neutral': ['/static/music/slowlife.mp3']
};

const App = () => {
    const [currentMood, setCurrentMood] = useState('neutral');
    const [detectedEmotion, setDetectedEmotion] = useState('none');
    const [songs, setSongs] = useState({});
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSongUrl, setCurrentSongUrl] = useState('');
    const [volume, setVolume] = useState(1);
    const [activeTab, setActiveTab] = useState('all');
    const [progress, setProgress] = useState(0);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const audioRef = useRef(null);
    const emotionHistory = useRef([]);
    const WINDOW_SIZE = 12;

    const currentMoodRef = useRef('neutral');

    // --- Camera and Detection Logic ---
    useEffect(() => {
        let stream = null;
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(s => {
                stream = s;
                if (videoRef.current) videoRef.current.srcObject = s;
            })
            .catch(e => console.error("Camera error:", e));

        const interval = setInterval(captureAndDetect, 2000);

        return () => {
            clearInterval(interval);
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, []);

    const captureAndDetect = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        if (canvas.width === 0 || canvas.height === 0) return;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');

        fetch('/detect_emotion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        })
        .then(res => res.json())
        .then(data => {
            // Note: success key indicates good detection in app.py
            if (data.success) {
                const em = data.emotion;
                setDetectedEmotion(em);
                
                emotionHistory.current.push(em);
                if (emotionHistory.current.length > WINDOW_SIZE) {
                    emotionHistory.current.shift();
                }
                
                const avgMood = getMode(emotionHistory.current);
                
                // Using ref to bypass setInterval stale closure
                if (avgMood !== currentMoodRef.current) {
                    currentMoodRef.current = avgMood;
                    setCurrentMood(avgMood);
                    setActiveTab(avgMood);
                }
            } else if (data.emotion !== 'neutral') {
                // In case app.py fallback passes something we still should log
                 setDetectedEmotion(data.emotion);
            }
        })
        .catch(err => console.error(err));
    };

    const getMode = (arr) => {
        if (arr.length === 0) return 'neutral';
        const freq = {};
        arr.forEach(e => freq[e] = (freq[e] || 0) + 1);
        return Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
    };

    // --- Song Management Logic ---
    useEffect(() => {
        fetchSongs();
    }, []);

    const fetchSongs = () => {
        fetch('/get_songs?mood=all')
            .then(res => res.json())
            .then(data => {
                Promise.all(['happy', 'sad', 'surprised', 'neutral'].map(m => 
                    fetch(`/get_songs?mood=${m}`).then(r => r.json()).then(d => ({ mood: m, data: d }))
                )).then(results => {
                    const newSongs = {};
                    results.forEach(res => {
                        let sData = res.data.songs ? res.data.songs.map(s => s.url) : [];
                        if (sData.length === 0) sData = defaultSongs[res.mood];
                        newSongs[res.mood] = sData;
                    });
                    setSongs(newSongs);
                });
            })
            .catch(err => console.error(err));
    };

    // --- Player Logic ---
    useEffect(() => {
        if(songs[currentMood] && songs[currentMood].length > 0) {
            playRandomFromList(songs[currentMood]);
        }
    }, [currentMood, songs]);

    const playRandomFromList = (list) => {
        if (!list || list.length === 0) return;
        const url = list[Math.floor(Math.random() * list.length)];
        setCurrentSongUrl(url);
        // Only auto-play if we intentionally clicked or are skipping
        // Initial auto-play without gesture is blocked by browser
        setTimeout(() => {
            if (audioRef.current && audioRef.current.paused) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => setIsPlaying(true)).catch(e => {
                        console.log("Autoplay prevented:", e.message);
                        setIsPlaying(false);
                    });
                }
            }
        }, 100);
    };

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
            if (isPlaying) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.error("Autoplay prevented:", e);
                        setIsPlaying(false);
                    });
                }
            } else {
                audioRef.current.pause();
            }
        }
    }, [isPlaying, volume]);

    const handlePlayPause = () => {
        if (!currentSongUrl) {
            handleSkip();
            return;
        }
        setIsPlaying(!isPlaying);
    };

    const handleSkip = () => {
        const list = activeTab === 'all' ? getCombinedSongs() : songs[activeTab] || [];
        if (!list || list.length === 0) return;
        const url = list[Math.floor(Math.random() * list.length)];
        setCurrentSongUrl(url);
        setIsPlaying(true);
    };

    const getCombinedSongs = () => {
        let all = [];
        Object.values(songs).forEach(list => all = [...all, ...list]);
        return all;
    };

    const handleAudioEnded = () => handleSkip();
    
    const handleTimeUpdate = () => {
        if (!audioRef.current) return;
        const p = (audioRef.current.currentTime / audioRef.current.duration) * 100;
        setProgress(p || 0);
    };

    // --- Handlers ---
    const uploadSong = (e) => {
        e.preventDefault();
        const form = e.target;
        const file = form.elements.file.files[0];
        const mood = form.elements.mood.value;
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('mood', mood);

        fetch('/upload_song', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                fetchSongs();
                form.reset();
            } else {
                alert(data.error);
            }
        });
    };

    const deleteSong = (url) => {
        const filename = url.split('/').pop();
        fetch('/delete_song', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        }).then(res => res.json()).then(data => {
            if (data.success) fetchSongs();
        });
    };

    const activeColor = {
        happy: 'text-amber-400',
        sad: 'text-blue-400',
        surprised: 'text-purple-400',
        neutral: 'text-slate-400'
    }[currentMood];

    const displaySongs = activeTab === 'all' ? getCombinedSongs() : (songs[activeTab] || []);

    return (
        <div className={`h-full w-full relative flex flex-col p-6 transition-colors duration-1000 ${THEMES[currentMood]} overflow-hidden`}>
            
            <div className="absolute top-0 -left-64 w-96 h-96 bg-white/10 rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob"></div>
            <div className="absolute top-0 -right-64 w-96 h-96 bg-black/10 rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob" style={{animationDelay: '2s'}}></div>
            <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-white/5 rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob" style={{animationDelay: '4s'}}></div>

            <audio 
                ref={audioRef} 
                src={currentSongUrl || undefined} 
                onEnded={handleAudioEnded} 
                onTimeUpdate={handleTimeUpdate}
            />
            <canvas ref={canvasRef} className="hidden" />

            <header className="mb-8 z-10 flex items-center justify-between">
                <div>
                    <h1 className="font-display font-bold text-4xl tracking-tight animated-gradient-text">MoodFlow</h1>
                    <p className="text-white/60 text-sm mt-1">AI-Powered Reactive Audio Experience</p>
                </div>
                <div className="glass-panel px-6 py-3 flex items-center gap-4 animate-float">
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-white/50 uppercase tracking-widest">Detected Vibe</span>
                        <span className={`font-semibold text-lg capitalize ${activeColor}`}>
                            {currentMood} 
                            <span className="text-xs text-white/40 ml-2 font-normal">(Last frame: {detectedEmotion})</span>
                        </span>
                    </div>
                    <i className={`${MoodIcons[currentMood]} ${activeColor} text-4xl drop-shadow-lg transition-all duration-500`}></i>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0 z-10">
                
                <div className="col-span-1 lg:col-span-7 flex flex-col gap-8">
                    
                    <div className="glass-panel p-2 rounded-3xl relative overflow-hidden flex-shrink-0 group">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none rounded-3xl" />
                        <video 
                            ref={videoRef} 
                            autoPlay playsInline muted 
                            className="w-full h-80 object-cover rounded-2xl transform scale-x-[-1]"
                        />
                        <div className="absolute top-6 left-6 z-20 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                            <span className="text-white/70 text-xs font-semibold tracking-widest uppercase shadow-sm">AI Analysis Active</span>
                        </div>
                        <div className="absolute top-0 left-0 right-0 h-1 bg-white/30 z-20 shadow-[0_0_15px_rgba(255,255,255,0.5)] animate-[slide_3s_ease-in-out_infinite]" style={{ animationName: 'slide' }}></div>
                        <style dangerouslySetInnerHTML={{__html: `
                            @keyframes slide {
                                0% { top: 0; opacity: 0; }
                                10% { opacity: 1; }
                                90% { opacity: 1; }
                                100% { top: 100%; opacity: 0; }
                            }
                        `}} />
                    </div>

                    <div className="glass-panel p-8 rounded-3xl flex-1 flex flex-col justify-between backdrop-blur-2xl bg-white/5 relative overflow-hidden">
                        
                        <div className={`absolute -inset-1/2 blur-[80px] rounded-full opacity-30 animate-pulse-slow ${
                            currentMood === 'happy' ? 'bg-amber-500/50' : 
                            currentMood === 'sad' ? 'bg-blue-500/50' : 
                            currentMood === 'surprised' ? 'bg-purple-500/50' : 'bg-slate-500/50'
                        } pointer-events-none`}></div>

                        <div className="flex flex-col items-center justify-center h-full z-10 w-full">
                            <h2 className="text-white/40 font-semibold tracking-widest uppercase text-sm mb-4">Now Playing</h2>
                            <h3 className="font-display text-2xl lg:text-3xl font-semibold mb-2 text-center text-white line-clamp-1">
                                {currentSongUrl ? currentSongUrl.split('/').pop().replace('.mp3', '') : "Silence..."}
                            </h3>
                            <p className="text-white/60 mb-10 text-sm">Playing {activeTab} vibes</p>

                            <div className="w-full max-w-md bg-black/20 rounded-full h-1.5 mb-8 relative overflow-hidden cursor-pointer" onClick={(e) => {
                                if(audioRef.current) {
                                    const rect = e.target.getBoundingClientRect();
                                    const clickX = e.clientX - rect.left;
                                    const newTime = (clickX / rect.width) * audioRef.current.duration;
                                    audioRef.current.currentTime = newTime;
                                }
                            }}>
                                <div 
                                    className={`absolute left-0 top-0 bottom-0 rounded-full transition-all duration-300 ${
                                        currentMood === 'happy' ? 'bg-amber-400' : 
                                        currentMood === 'sad' ? 'bg-blue-400' : 
                                        currentMood === 'surprised' ? 'bg-purple-400' : 'bg-white'
                                    }`}
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>

                            <div className="flex items-center gap-8 text-white relative w-full justify-center">
                                
                                <div className="absolute left-0 hidden sm:flex items-center gap-3 w-32 group">
                                    <i className="ph ph-speaker-high text-xl opacity-60"></i>
                                    <input 
                                        type="range" min="0" max="1" step="0.01" 
                                        value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
                                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer outline-none slider-thumb"
                                    />
                                </div>

                                <button className="p-3 bg-white/5 rounded-full hover:bg-white/10 hover:scale-110 transition-all text-xl" onClick={() => handleSkip()}>
                                    <i className="ph-fill ph-skip-back"></i>
                                </button>
                                
                                <button 
                                    className="w-16 h-16 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)] text-3xl"
                                    onClick={handlePlayPause}
                                >
                                    <i className={isPlaying ? "ph-fill ph-pause" : "ph-fill ph-play"}></i>
                                </button>
                                
                                <button className="p-3 bg-white/5 rounded-full hover:bg-white/10 hover:scale-110 transition-all text-xl" onClick={handleSkip}>
                                    <i className="ph-fill ph-skip-forward"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-span-1 lg:col-span-5 glass-panel rounded-3xl flex flex-col overflow-hidden z-10 shadow-2xl bg-black/20">
                    
                    <div className="flex justify-between items-center p-6 border-b border-white/10">
                        <h3 className="font-display font-semibold text-xl">Sound Library</h3>
                    </div>
                    <div className="flex px-6 pt-4 gap-2 overflow-x-auto no-scrollbar">
                        {['all', 'happy', 'sad', 'surprised', 'neutral'].map(tab => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all whitespace-nowrap ${
                                    activeTab === tab ? 'bg-white text-black shadow-lg' : 'bg-white/5 hover:bg-white/10 text-white/70'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                        {displaySongs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-white/30">
                                <i className="ph ph-music-notes text-4xl mb-2"></i>
                                <p>No songs found for this mood.</p>
                            </div>
                        ) : (
                            displaySongs.map((url, i) => {
                                const name = url.split('/').pop().replace('.mp3', '');
                                const isCurrent = url === currentSongUrl;
                                return (
                                    <div 
                                        key={i} 
                                        className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${
                                            isCurrent ? 'bg-white/15 border border-white/20' : 'hover:bg-white/5 border border-transparent'
                                        }`}
                                        onClick={() => {
                                            setCurrentSongUrl(url);
                                            setIsPlaying(true);
                                        }}
                                    >
                                        <div className="flex items-center gap-4 filter drop-shadow-md">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCurrent ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'bg-black/30'}`}>
                                                {isCurrent && isPlaying ? <i className="ph-fill ph-waves"></i> : <i className="ph-fill ph-music-note"></i>}
                                            </div>
                                            <span className={`font-medium ${isCurrent ? 'text-white' : 'text-white/80'} group-hover:text-white transition-colors truncate max-w-[180px]`}>{name}</span>
                                        </div>
                                        {url.includes('user_songs') && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); deleteSong(url); }}
                                                className="text-white/30 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-full transition-all"
                                                title="Delete Song"
                                            >
                                                <i className="ph-bold ph-trash text-lg"></i>
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="p-6 bg-white/5 border-t border-white/5">
                        <form onSubmit={uploadSong} className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                    <input type="file" name="file" accept=".mp3" required className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                    <div className="bg-black/30 border border-white/10 hover:border-white/30 transition-all rounded-xl p-3 flex items-center justify-center gap-2 text-white/60 text-sm h-12">
                                        <i className="ph-bold ph-upload-simple"></i> Drop MP3 or Click
                                    </div>
                                </div>
                                <select name="mood" className="bg-black/30 border border-white/10 text-white text-sm rounded-xl px-3 outline-none focus:border-white/50 transition-all h-12">
                                    <option value="happy">Happy</option>
                                    <option value="sad">Sad / Angry</option>
                                    <option value="surprised">Surprised</option>
                                    <option value="neutral">Neutral</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full bg-white text-black font-semibold rounded-xl h-12 hover:bg-gray-200 transition-colors shadow-lg">
                                Add to Library
                            </button>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
