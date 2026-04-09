let playlists = {};
let currentEmotion = null;
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const player = document.getElementById('player');
const status = document.getElementById('status');

function startApp() {
    // Load playlists
    playlists.happy = document.getElementById('happy').value.split(',').map(s => s.trim()).filter(s => s);
    playlists.sad = document.getElementById('sad').value.split(',').map(s => s.trim()).filter(s => s);
    playlists.surprised = document.getElementById('surprised').value.split(',').map(s => s.trim()).filter(s => s);
    playlists.neutral = document.getElementById('neutral').value.split(',').map(s => s.trim()).filter(s => s);

    if (!playlists.happy.length && !playlists.sad.length && !playlists.surprised.length && !playlists.neutral.length) {
        alert("Please enter at least one song URL in any playlist!");
        return;
    }

    // Start camera
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            status.textContent = "Camera started! Detecting mood... 😊";
            // Start checking emotion every 3 seconds
            setInterval(captureAndDetect, 3000);
        })
        .catch(err => {
            status.textContent = "Camera error: " + err.message;
        });
}

function captureAndDetect() {
    if (video.readyState === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg');

    fetch('/detect_emotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
    })
    .then(res => res.json())
    .then(data => {
        const emotion = data.emotion;
        status.textContent = `Detected Mood: ${emotion.toUpperCase()} ${getEmoji(emotion)}`;

        // NEW: Debug logs -- open browser console (F12) to see
        console.log('Detected emotion:', emotion);
        console.log('Current emotion:', currentEmotion);
        console.log('Playlist for this emotion:', playlists[emotion]);

        // Only change if emotion changed and playlist exists
        if (emotion !== currentEmotion && playlists[emotion] && playlists[emotion].length > 0) {
            currentEmotion = emotion;
            const song = playlists[emotion][Math.floor(Math.random() * playlists[emotion].length)];
            
            // NEW: Pause + load to fix playback issues
            player.pause();
            player.src = song;
            player.load();  // Force reload
            player.play().catch(err => console.error('Play error:', err));  // Handle autoplay blocks
            
            status.textContent += ` → Playing ${emotion} song! 🎶`;
            console.log('Playing song:', song);
        }
    })
    .catch(err => console.error(err));
}

function getEmoji(emotion) {
    const emojis = { happy: '😊', sad: '😢', surprised: '😲', neutral: '😐' };
    return emojis[emotion] || '';
}