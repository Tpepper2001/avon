import React, { useState, useRef the `files` array (and a title). By omitting the `url` field, mobile OSs treat this as a direct, useEffect } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone
} from 'lucide-react';

// ------------------ Mock Auth & DB ------------------
const mockAuth = {
  currentUser: null,
  signIn: (email, password) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const user = users[email];
    if (!user || user.password !== password) throw new Error('Invalid credentials');
    mockAuth.currentUser = { email: user.email, username: user.username, file transfer to WhatsApp/TikTok rather than a link share.

```jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone
} from 'lucide-react';

// ------------------ Mock Auth & DB ------------------
const mockAuth = {
  currentUser: null,
  signIn: (email, password) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const user = users[email];
    if (!user || user.password !== password) throw new Error uid: user.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signUp: (email, password, username) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[email]) throw new Error('Email already exists');
    if (Object.values(users).some(u => u.username === username)) throw new Error('Username taken');
    const newUser = { email, password, username, uid: Date.now().toString() };
    users[email] = newUser;
    ('Invalid credentials');
    mockAuth.currentUser = { email: user.email, username: user.username, uid: user.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signUp: (email, password, username) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[email]) throw new Error('Email already exists');
    if (Object.values(users).some(u => u.username === username)) throw new Error('Username taken');
    const newUser = { email, password, username, uid: Date.now().toString() };
    users[email] = newUser;
    localStorage.setItem('users', JSON.stringify(users));
    mockAuth.currentUser = { email, username: newUser.username, uid: newUser.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signOut: () => { mockAuth.currentUser = null; localStorage.removeItem('user'); },
  init: () => { const u = localStorage.getItem('user');
    if (u) mockAuth.currentUser = JSON.parse(u); }
};

const mockDB = {
  saveMessage: (username, msg) => {
    const key = `messages_${username}`;
    const msgs = JSON.parse(localStorage.getItem(key) || '[]');
    msgs.push(msg);
    localStorage.setItem(key, JSON.stringify(msgs));localStorage.setItem('users', JSON.stringify(users));
    mockAuth.currentUser = { email, username: newUser.username, uid: newUser.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signOut: () => { mockAuth.currentUser = null; localStorage.removeItem('user'); },
  init: () => { const u = localStorage.getItem('user');
    if (u) mockAuth.currentUser = JSON.parse(u); }
};

const mockDB = {
  saveMessage: (username, msg) => {
    const key = `messages_${username}`;
    const msgs = JSON.parse(localStorage.getItem(key) || '[]');
    msgs.push(msg);
    localStorage.setItem(key, JSON.stringify(msgs));
  },
  getMessages: (username) => JSON.parse(localStorage.getItem(`messages_${username}`) || '[]')
};

// ----------------------------- Helper utilities -----------------------------
const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2,
  },
  getMessages: (username) => JSON.parse(localStorage.getItem(`messages_${username}`) || '[]')
};

// ----------------------------- Helper utilities -----------------------------
const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

function wrapTextByWords(text, maxCharsPerLine = 16) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
 '0')}`;

function wrapTextByWords(text, maxCharsPerLine = 16) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      if (w.length > maxCharsPer  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      if (w.length > maxCharsPerLine) {
        for (let i = 0; i < w.length; i += maxCharsPerLine) {
          lines.push(w.slice(i, i + maxCharsPerLine));
        }
        current = '';
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ------------------------------ Main App ------------------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useStateLine) {
        for (let i = 0; i < w.length; i += maxCharsPerLine) {
          lines.push(w.slice(i, i + maxCharsPerLine));
        }
        current = '';
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Helper to detect MP4 support
const getSupportedMimeType = () => {
  const types = [
    'video/mp4',
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm'; // Fallback
};

// ------------------------------ Main App ------------------------------------
export default function App() {
  const [user, setUser](0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState('');
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useState(null);
  const [view, setView] = useState('landing');
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Store blob AND mimeType
  const [previewVideo, setPreviewVideo] = useState({ url: '', mimeType: '' });
  
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  
  const [authEmail, setAuthEmail] = useState('');
  const [auth = useRef([]);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioUrlRef = useRef(null);
  const videoUrlRef = useRef(null);
  const audioElementRef = useRef(null);

  useEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(mockDB.getMessages(mockAuth.currentUser.username));
      setView('dashboardPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioUrlRef = useRef(null);
  const audioElementRef = useRef(null);

  ');
    }
    return () => {
      clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/u/')) {
      const username = path.split('/u/')[1]?.split('/')[0];
      if (username) {
        setTargetUsername(username);
        setView('record');
      }
    }
  }, []);

  // ----------------- Recording -----------------
  const startRecording = async () => {
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];// Initialize
  useEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(mockDB.getMessages(mockAuth.currentUser.username));
      setView('dashboard');
    }
    return () => {
      clearInterval(timerRef.current);
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) {} }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (previewVideo.url) URL.revokeObjectURL(previewVideo.url);
    };
  }, []);

  // Route Handling
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/u/')) {
      const username = path.split('/u/')[1]?.split('/')[0];
      if (username) {
        setTargetUsername(username);
        setView('record');
      }
    }
  }, []);

  // ----------------- Recording Logic -----------------
  const startRecording = async () => {
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    if (previewVideo.url)
      setTranscript('');

      // Prefer MP4 for audio recording if available (rare in browsers, usually webm/mp3), but this is just input
      const options = MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { { URL.revokeObjectURL(previewVideo.url); setPreviewVideo({ url: '', mimeType: '' }); }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript('');

      // We only need audio recording for the "input", output is purely robotic TTS
      const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type type: options?.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        audioUrlRef.current = URL.createObjectURL(blob);
      };
      recorder.start();

      // Speech Recognition
      try {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
          const recognition = new SR();
          recognition.lang = 'en-US';: options?.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        audioUrlRef.current = URL.createObjectURL(blob);
      };
      recorder.start();

      // Live
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalTranscript = '';
          recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const t = event Transcript
      try {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
          const recognition = new SR();
          recognition.lang = 'en-US';
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalTranscript = '';
          recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const t = event.results[i][0].transcript;
              if (event.results[i].isFinal) finalTranscript += t + ' ';
              else interim += t;
            }
            setTranscript((finalTranscript + interim).trim.results[i][0].transcript;
              if (event.results[i].isFinal) finalTranscript += t + ' ';
              else interim += t;
            }
            setTranscript((finalTranscript + interim).trim());
          };
          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch (err) { console.warn('No SR'); }

      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('Microphone());
          };
          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch (err) { console.warn('SpeechRecognition unavailable'); }

      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('Microphone denied denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  .');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.// ----------------- Generate Robotic Video (MP4 Priority) -----------------
  const generatePreview = async () => {
    if (!transcript && !audioBlob) {
      alert('Record message first.');
      return;
    }
    setProcessing(true);
    setPreviewVideoUrl('');
    
    const canvas = canvasRef.current;
    canvas.width = 1080;
    canvas.height = 192current) mediaRecorderRef.current.stop();
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  // ----------------- Generate MP4/Video -----------------
  const generatePreview = async () => {
    if (!transcript && !audioBlob) {
      alert('No audio recorded.');
      return;
    }
    setProcessing(true);
    setPreviewVideo({ url: '', mimeType: '' });
    
    const canvas = canvasRef.current;
    // Set typical mobile vertical resolution
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('0;
    const ctx = canvas.getContext('2d');

    // 1. Fetch Robotic TTS Audio
    const textToSpeak = transcript || "Audio message received.";
    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(textToSpeak)}`;
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.removeAttribute('src');
    } else {
      audioElementRef.current = document.createElement('audio');
    }
    
    audioElementRef.current.crossOrigin = 'anonymous';
    audioElementRef.current.src = ttsUrl;

    let audioStream2d');

    // 1. Fetch Robotic TTS Audio (StreamElements API)
    const textToSpeak = transcript || = null;
    try {
      await new Promise((resolve) => {
        audioElementRef.current.onloadeddata = resolve;
        audioElementRef.current.onerror = resolve; 
      });
      await audioElementRef.current.play();
      
      // Capture audio stream
      if (audioElementRef "Audio message received.";
    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(textToSpeak)}`;
    
    // Setup Audio Element
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.removeAttribute('src');
    } else {
      audioElementRef.current =.current.captureStream) audioStream = audioElementRef.current.captureStream();
      else if (audioElementRef.current.mozCaptureStream) audioStream = audioElementRef.current.mozCaptureStream();
    } catch (e) { console.warn('TTS Error', e); }

    // 2. Record Canvas + Audio -> Prioritize MP4
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...(audioStream ? audioStream.getAudioTracks() : [])]);
 document.createElement('audio');
    }
    
    audioElementRef.current.crossOrigin = 'anonymous';
    audioElementRef.current.src = ttsUrl;

    let audioStream = null;
    try {
      await new Promise((resolve) => {
        audioElementRef.current.onloadeddata = resolve;
        audioElementRef.current.onerror = () => { console.warn('TTS fetch error'); resolve(); }; 
      });
      await audioElementRef.current.play();
      
      // Capture audio stream
      if (audioElementRef.current.captureStream) audioStream = audioElementRef.current.captureStream();
      else if (audioElementRef.current.mozCaptureStream) audioStream = audioElementRef.current.mozCaptureStream();
    } catch (e) { console.warn('Audio capture error', e); }

    // 2. Determine MIME Type (Prefer MP4)
    const mimeType = getSupportedMimeType();
    
    // 3. Record Canvas + Audio
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream    
    // Check for MP4 support (Safari, Mobile Chrome often support this)
    // Fallback to WebM if browser (Desktop Chrome/Firefox) doesn't support native MP4 recording
    let mimeType = 'video/webm'; // default
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video([
      ...canvasStream.getVideoTracks(), 
      ...(audioStream ? audioStream.getAudioTracks() : [])
/mp4';
    } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264')) {
      mimeType = 'video/mp4;codecs=h26    ]);
    
    let recorder;
    try {
      recorder = new MediaRecorder(combined, { mimeType });
    } catch (e) {
      // Fallback if browser lied about support
      recorder = new MediaRecorder(combined);
    }

    const videoChunks = [];
    recorder.ondataavailable = e => { if (e.data.size) videoChunks.push(e.data); };
    recorder.onstop = () => {
      const videoBlob = new Blob(videoChunks, { type: mimeType });
      const url = URL.createObjectURL(videoBlob);
      setPreviewVideo({ url, mimeType });
      setProcessing(false);
      audioElementRef.current.pause();
    };

    recorder.start();

    // 4';
    } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
      mimeType = 'video/mp4;codecs=avc1';
    }
    
    // Alert user if strictly MP4 was requested but not supported
    if (!mimeType.includes('mp4')) {
      console.warn("Browser doesn't support native MP4 recording. Falling back to WebM.");
    }

    const videoOptions = { mimeType };
    let recorder;
    try {
      recorder = new MediaRecorder(combined, videoOptions);
    } catch(e) {
      // Fallback if options failed
      recorder = new MediaRecorder(combined);
    }

    const videoChunks = [];
4. Animation Loop
    const words = textToSpeak.split(/\s+/);
    const startTime = Date.now();
    const duration = (audioElementRef.current.duration && isFinite(audioElementRef.current.duration)) 
      ? audioElementRef.current.duration + 0.5 
      : (words.length * 0.5) + 2;

    const drawFrame = () => {
      const    recorder.ondataavailable = e => { if (e.data.size) videoChunks.push(e. elapsed = (Date.now() - startTime) / 1000;
      const index = Math.min(Math.floor(elapsed * 2.5), words.length);

      // Cyberpunk BG
      data); };
    recorder.onstop = () => {
      // Use the actual mime type used by the recorder
      const blob = new Blob(videoChunks, { type: recorder.mimeType || mimeType });
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setPreviewVideoUrl(url);
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(1, '#0f2027');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Robot Visual
      ctx.shadowColor = 'rgba(0, 255, 127, 0.4)';
      ctx.shadowBlur = 50;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 600, 200, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      const pulse = 60 + MathsetProcessing(false);
      audioElementRef.current.pause();
    };

    recorder.start();

    // 3. Animation
    const words = textToSpeak.split(/\s+/);
    const startTime = Date.now();
    const duration = audioElementRef.current.duration && isFinite(audioElementRef.current.duration) 
      ? audioElementRef.current.duration + 0.5 
      : (words.length * 0.5) + 2;

    const drawFrame = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const index = Math.min(Math.floor(elapsed * 2.5), words.length);

      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#000');
      grad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Robot Head
      ctx.shadowColor = 'rgba(0, 255, 0, 0.4)';
      ctx.shadowBlur = 40;
      ctx.fillStyle.sin(elapsed * 12) * 15;
      ctx.shadowBlur = 25;
      ctx.fillStyle = '#00ff7f';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 80, 580, pulse, 0, Math.PI * 2);
      ctx.arc(canvas.width / 2 + 80, 580, pulse, 0, Math.PI * 2);
      ctx.fill();
      
      // Subtitles
      ctx.shadowBlur = 0;
      ctx.font = 'bold 70px Courier New';
      ctx.fillStyle = '#00ff7f';
      ctx.textAlign = 'center';
      
      const displayed = words.slice(0, index).join(' ') + (index < words.length ? '_' : '');
      const lines = wrapTextByWords(displayed, 14);
       = '#111';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 500, 200, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      const pulse = 60 + Math.sin(elapsed * 10) * 10;
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#0f0';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 80, 480, pulse, 0, Math.PI * 2);
      ctx.arc(canvas.width / 2 + 80, 480, pulse, 0, Math.PI * 2);
      ctx.fill();
      
      // Subtitles
      ctx.shadowBlur = 0;
      ctx.font = 'bold 70px Courier New';
lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 1100 + i * 90));

      // Footer
      ctx.font = '40px Courier      ctx.fillStyle = '#0f0';
      ctx.textAlign = 'center';
      
      const displayed = words.slice(0, index).join(' ') + (index < words.length ? '_' : '');
      const lines = wrapTextByWords(displayed, 14);
      lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 1000 + i * New';
      ctx.fillStyle = 'rgba(0, 255, 127, 0.5)';
      ctx.fillText('ENCRYPTED MESSAGE', canvas.width / 2, 1700);

      if (elapsed < duration) requestAnimationFrame(drawFrame);
      else setTimeout(() => { try{ recorder.stop(); }catch(e){} }, 200);
    };
    requestAnimationFrame(drawFrame);
  };

  // ----------------- STRICT FILE SHARING -----------------
  const shareVideoFile = async (videoUrl, type) => {
    if (!videoUrl) return;
    
    try {
      // 1. Get Blob
      const blob = await fetch(videoUrl).then(r => r.blob 90));

      if (elapsed < duration) requestAnimationFrame(drawFrame);
      else setTimeout(() => recorder.stop(), 200);
    };
    requestAnimationFrame(drawFrame);
  };

  // ----------------- STRICT FILE SHARING -----------------
  const shareVideoFile = async () => {
    ());
      
      // 2. Determine Extension (mp4 or webm)
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const filename = `voiceanon_${Date.now()}.${ext}`;
      
      // 3. Create File Object
      const file = new File([blobif (!videoUrlRef.current) return;
    
    try {
      const blob = await fetch(videoUrlRef.current).then(r => r.blob());
      
      // Determine extension based on actual blob type to avoid corruption
      const isMp4 = blob.type.includes('mp4');
      const ext = isMp], filename, { type: type || blob.type });

      // 4. Share Intent (Files Only)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          // Leaving title/text empty often forces "File Share" mode on iOS/Android
        });
      } else {
        throw new Error('Native sharing not supported');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert('Sharing failed or not supported. Downloading file instead.');
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = `voiceanon_${Date.now()}.mp4`; // Try force mp4 name on download fallback
        a.click();
      }
    }
  };4 ? 'mp4' : 'webm';
      
      // Create file object
      const file = new File([blob], `anon_message.${ext}`, { type: blob.type });
      
      // Direct File Share (System Drawer)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Anonymous Message

  // ----------------- Sending -----------------
  const sendMessage = () => {
    if (!previewVideo.url) return;
    const message = {
      id: Date.now().toString(),
      text'
          // NO text or url field here -> forces OS to treat as File Share
        });
      } else {
        throw new Error('System share not supported');
      }
    } catch (err) {
: transcript || '[No transcript]',
      timestamp: new Date().toISOString(),
      duration: recordingTime,
      videoUrl: previewVideo.url,
      mimeType: previewVideo.mimeType
    };
    mockDB.saveMessage(targetUsername, message);
    setView('success');
  };

  const copyLink = () => {
    const link = `${window.location.origin}/u/${user.username}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // ------------------- VIEWS -------------------
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono">
        <div className="container mx-auto px-4 py-8">
          <nav className="flex justify-between items-center mb-16">
            <div className="text-2xl font-bold flex items      if (err.name !== 'AbortError') {
        alert('Direct sharing failed. Downloading file instead.');
        const a = document.createElement('a');
        a.href = videoUrlRef.current;
        // Try to name it mp4 if possible, but webm if that's what we got
        a.download = `anon_message.mp4`; 
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  };

  // ------------------- VIEWS -------------------
  
  // LANDING
  if (view === 'landing') {
    return (
      <-center gap-2">
              <Mic className="w-8 h-8" /> VoiceAnon
            div className="min-h-screen bg-black text-green-500 font-mono">
        <div className="container mx-auto px-4 py-8">
          <nav className="flex justify-between items-center mb-16">
            <div className="text-2xl font-bold flex items-center gap-2">
              <Mic className="w-8 h-8" /> VoiceAnon
            </div>
            <div className="space-x-4">
              <button onClick={() => setView('signin')} className="px-6 py-2 border border-green-500 hover:bg-green-500 hover:text-black transition">Sign In</button>
              <button onClick={() => setView('</div>
            <div className="space-x-4">
              <button onClick={() => setView('signin')} className="px-6 py-2 border border-green-500 hover:bg-green-500 hover:text-black transition">Sign In</button>
              <button onClick={() => setView('signup')} className="px-6 py-2 bg-green-500 text-black font-bold hover:bg-green-400 transition">Get Started</button>
            </div>
          </nav>
          <div className="text-center max-w-4xl mx-auto mt-20">
            <h1 className="text-5xl font-bold mb-6 text-white">
              Mask Your Voicesignup')} className="px-6 py-2 bg-green-500 text-black font-bold hover:bg-green-400 transition">Get Started</button>
            </div>
          </nav>
          <div className="text-center max-w-4xl mx-auto mt-20">
            . <br/>Speak Truth.
            </h1>
            <p className="text-xl mb-12 text-gray-400">
              Record audio. We convert it to a robotic video (MP4). Share directly<h1 className="text-5xl font-bold mb-6 text-white glitch-effect">Mask Your Voice.<br/>Speak Truth.</h1>
            <p className="text-xl mb-12 text-gray-400">Record audio. We convert it to a robotic MP4 video. Share directly to WhatsApp/TikTok.</p>
            <button onClick={() => setView('signup')} className="px-12 py-4 text-xl bg-.
            </p>
            <button onClick={() => setView('signup')} className="px-12 py-4 text-xl bg-green-500 text-black font-bold hover:scale-105 transition">
              Create Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'signin' || view === 'signup') {
    const isIn = view === 'signin';
    const handleSubmit = (e) => {
      e.preventDefault();
      const p = isIn ? mockAuth.signIn(authEmail, authPassword) : mockAuth.signUp(authEmail, authPassword, authUsername);
      p.then(u => { setUser(u); setView('dashboard'); setMessages(mockDB.getMessages(u.username)); })
       .catch(e => alert(e.messagegreen-500 text-black font-bold hover:scale-105 transition">Create Link</button>
          </div>
        </div>
      </div>
    );
  }

  // AUTH
  if (view === 'signin' || view === 'signup') {
    const isIn = view === 'signin';
    const handleSubmit = (e) => {
      e.preventDefault();
      const p = isIn ? mockAuth.signIn(authEmail, authPassword) : mockAuth.signUp(authEmail, authPassword, authUsername);
      p.then(u => { setUser(u); setView('dashboard'); setMessages(mockDB.get));
    };
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 font-mono">
        <div className="border border-green-500 p-8 max-w-md w-full rounded-lg bg-gray-900">
Messages(u.username)); })
       .catch(e => alert(e.message));
    };
    return (
      <div className="min-h-screen bg-black flex items-center justify-center          <h2 className="text-3xl text-green-500 mb-6 text-center">{isIn ? 'Access Terminal' : 'New Identity'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isIn && <input type="text" placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className="w-full p-3 bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />}
            <input type="email" placeholder="Email" value={authEmail} p-4">
        <div className="border border-green-500 p-8 max-w-md w-full rounded-lg bg-gray-900">
          <h2 className="text-3xl text-green-500 mb-6 text-center">{isIn ? 'Access Terminal' : 'New Identity'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isIn && <input type="text" placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className="w-full p-3 bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />}
            <input type="email" placeholder="Email" value={authEmail} onChange={e => set onChange={e => setAuthEmail(e.target.value)} className="w-full p-3 bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full p-3AuthEmail(e.target.value)} className="w-full p-3 bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full p-3 bg-black border border bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />
            <button type="submit" className="w-full py-3 bg-green-500 text-black font-bold hover:bg-green-400">{isIn ? 'Login' : 'Initialize'}</button>
          </form>
          <button onClick={() => setView(isIn ? 'signup' : 'signin')} className="w-full mt-4 text--green-800 text-green-500 focus:outline-none focus:border-green-500" required />
            <button type="submit" className="w-full py-3 bg-green-500 text-black font-bold hover:bg-green-400">{isIn ? 'Login' : 'Initialize'}</button>
          </form>
          <button onClick={() => setView(gray-500 hover:text-green-500 text-sm">Switch Mode</button>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-mono">
        <nav className="border-b border-gray-800 p-4 flex justify-between">
          <span className="text-xl font-bold text-green-500">VoiceAnon // {user?.username}</span>
          <div className="flex gap-4">
             <button onClick={()isIn ? 'signup' : 'signin')} className="w-full mt-4 text-gray-500 hover:text-green-500 text-sm">Switch Mode</button>
        </div>
      </div>
    );
  }

  // DASHBOARD
  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-mono">
        <nav className="border-b border-gray-800 p-4 flex justify-between">
          <span className="text-xl font-bold text-green-500">VoiceAnon => { setMessages(mockDB.getMessages(user.username)); setView('inbox'); }} className="flex items-center gap-2 hover:text-green-500"><Inbox size={18} /> Inbox</button>
             <button onClick={() => { mockAuth.signOut(); setView('landing'); }}><LogOut size={18} /></button>
          </div>
        </nav>
        <div className=" // {user?.username}</span>
          <div className="flex gap-4">
             <button onClick={()container mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl mb-8">Your Anonymous Link</h1>
          <div className="bg-black border border-green-500 p-6 rounded-lg inline-block max-w-full">
            <code className=" => { setMessages(mockDB.getMessages(user.username)); setView('inbox'); }} className="flex items-center gap-2 hover:text-green-500"><Inbox size={18} /> Inbox</button>
             <button onClick={() => { mockAuth.signOut(); setView('landing'); }}><LogOut size={18} /></button>
          </div>
        </nav>
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl mb-8">Your Anonymous Link</h1>
          <div className="bg-black border border-green-500 p-6 rounded-lg inline-block max-w-full">
            <code className="block mb-4 text-green-400 break-all">{window.location.origin}/u/{user?.username}</code>
            <button onClick={() => {
              const link = `${window.location.origin}/u/${user.username}`;
              navigator.clipboard.writeText(link).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); });
            }} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-500 flexblock mb-4 text-green-400 break-all">{window.location.origin}/u/{user?.username}</code>
            <button onClick={copyLink} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-500 flex items-center justify-center gap-2 mx-auto">
              {linkCopied ? <CheckCircle size={16} /> : <Copy size={16} />} {linkCopied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'record') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-mono">
        <canvas ref={canvasRef} className="hidden" />
        <div className="max-w-md w-full bg-black border border-gray-800 p-6 rounded-xl shadow-2xl">
          <h2 className="text-center text-green-500 text-2xl mb-2">@{targetUsername}</h2>
          <p className="text-center text-gray-500 text-sm mb-6">Will receive an encrypted video</p>
          
          {previewVideo.url ? (
            <div className="space-y-4">
              <video src={previewVideo.url} controls className="w-full rounded border border-gray-700" />
              <div className="flex gap-2">
 items-center justify-center gap-2 mx-auto">
              {linkCopied ? <CheckCircle size={16} /> : <Copy size={16} />} {linkCopied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RECORD
  if (view === 'record') {
    const sendMessage = () => {
      if (!previewVideoUrl) return;
      mockDB.saveMessage(targetUsername, {
        id: Date.now                <button onClick={sendMessage} className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded">Send Now</button>
                <button onClick={() => { setPreviewVideo({url:'', mimeType:''}); setAudioBlob(null); setTranscript(''); }} className="px-4 py-3 bg-gray-800 text-white rounded">Retry</button>
              </div>
            </div>
          ) : processing ? (
             <div className="text-center py-12 text-green-500 animate-pulse">
               Generating {getSupportedMimeType().includes('mp4') ? 'MP4' : 'Video'}...
             </div>
          ) : (
            <div className="text-center">
              <button 
                onClick={isRecording ? stopRecording : startRecording}
().toString(),
        text: transcript || '[No transcript]',
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoUrl: previewVideoUrl,
        audioUrl: null
      });
      setView('success');
    };

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-mono">
        <canvas ref={canvasRef} className="hidden" />
        <div className="max-w-md w-full bg-black border border-gray-800 p-6 rounded-xl shadow-2xl">
          <h2 className="text-center text-green-500 text-2xl mb-2                className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto">@{targetUsername}</h2>
          <p className="text-center text-gray-500 text- mb-6 transition-all ${isRecording ? 'bg-red-600 scale-110 shadow-[0_0_20px_red]' : 'bg-gray-800 hover:bg-gray-700 border border-green-500'}`}
              >
                {isRecording ? <Square className="text-white fill-current" /> : <Mic className="text-green-500 w-10 h-10" />}
              </button>
              <div className="text-green-500 text-xl font-bold mb-4">{formatTime(recordingTime)}</div>
              <p className="text-gray-400 text-sm italic min-h-[3rem] px-4">"{transcript || 'Waiting for speech...'}"</p>
              
              {!isRecording && audioBlob && (
                <button onClick={generatePreview} className="w-full mt-6 py-4 bg-greensm mb-6">Will receive a robotic MP4 video</p>
          
          {previewVideoUrl ? (
            <div className="space-y-4">
              <video src={previewVideoUrl} controls className="w-full rounded border border-gray-700" />
              <div className="flex gap-2">
                <button onClick={sendMessage} className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded">Send Now</button>
                <button onClick={() => { setPreviewVideoUrl(''); setAudioBlob(null); setTranscript(''); }} className="px-4 py-3 bg-gray-800 text-white rounded">Retry</button>
              </div>
            </div>
          ) : processing ? (
             <div className="text-center py-1-600 text-white font-bold rounded hover:bg-green-500 uppercase tracking-wid2 text-green-500 animate-pulse">Processing MP4...</div>
          ) : (
            <div className="text-center">
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 transition-all ${isRecording ? 'bg-red-600 scale-110 shadow-[0_0_20px_red]' : 'bg-gray-800 hover:bgest">
                  Generate Preview
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'inbox' || view === 'success') {
    return (
      <div className="min-h-screen bg-gray-900 p-4 font-mono">
         {view === 'success' && (
           <div className="text-center mb-12 mt-8">
             <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
             <h2 className="text-3xl text-white">Sent Successfully</h2>
             <button onClick={() => setView('record')} className="mt-6 text-green-500 underline">Send Another</button>
           </div>
         )}
         
         {view === 'inbox' && (
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl text-white">Encrypted Inbox</h2>
                <button onClick={() => setView('dashboard')} className="text-gray-400 hover:text-white">Back</button>
              </div>
              {messages.map(m => (
                <div key={m.id} className="bg-black-gray-700 border border-green-500'}`}
              >
                {isRecording ? <Square className="text-white fill-current" /> : <Mic className="text-green-500 w-10 h-10" />}
              </button>
              <div className="text-green-500 text-xl font-bold mb-4">{formatTime(recordingTime)}</div>
              <p className="text-gray-400 text-sm italic min-h-[3rem] px-4">"{transcript || 'Waiting for speech...'}"</p>
              
              {!isRecording && audioBlob border border-gray-800 p-4 rounded-lg mb-6">
                   <video controls src={m.videoUrl} className="w-full rounded mb-4 bg-gray-900" />
                   <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => shareVideoFile(m.videoUrl, m.mimeType)} className="py-2 bg-green-600 hover:bg-green-500 text-white rounded flex items-center justify-center gap-2">
                        <MessageSquare size={18} /> WhatsApp
                      </button>
                      <button onClick={() => shareVideoFile(m.videoUrl, m.mimeType)} className="py-2 bg-black border && (
                <button onClick={generatePreview} className="w-full mt-6 py-4 bg-green-600 text-white font-bold rounded hover:bg-green-500 uppercase tracking-widest">
                  Generate Video
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // INBOX / SUCCESS
  if (view === 'inbox' || border-gray-600 hover:bg-gray-800 text-white rounded flex items-center justify-center gap-2">
                        <Smartphone size={18} /> TikTok
                      </button>
                   </div>
                   <p className="text-center text-xs text-gray-500 mt-2">
                     Format: {m.mimeType?.includes('mp4') ? 'MP4' : 'WebM'}
                   </p>
                </div>
              ))}
            </div>
         )}
      </div>
    );
  }
}
``` view === 'success') {
    return (
      <div className="min-h-screen bg-gray-900 p-4 font-mono">
         {view === 'success' && (
           <div className="text-center mb-12 mt-8">
             <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
             <h2 className="text-3xl text-white">Sent Successfully</h2>
             <button onClick={() => setView('record')} className="mt-6 text-green-500 underline">Send Another</button>
           </div>
         )}
         
         {view === 'inbox' && (border-gray-600 hover:bg-gray-800 text-white rounded flex items-center justify-center gap-2">
                        <Smartphone size={18} /> TikTok
                      </button>
                   </div>
                   <p className="text-center text-xs text-gray-500 mt-2">
                     Format: {m.mimeType?.includes('mp4') ? 'MP4' : 'WebM'}
                   </p>
                </div>
              ))}
            </div>
         )}
      </div>
    );
  }
}
            <div className="max-
