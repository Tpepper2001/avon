import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Send, Download, Share2, Copy, CheckCircle,
  MessageSquare, Users, TrendingUp, LogOut, Home, Inbox
} from 'lucide-react';

// ------------------ Mock Auth & DB (kept simple + safer note) ------------------
// Note: passwords are still plain text in localStorage for this mock.
// Do NOT
// do this in production. This mock mirrors your original behavior but avoids
// unnecessary security holes where possible.
const mockAuth = {
  currentUser: null,
  signIn: (email, password) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const user = users[email];
    if (!user || user.password !== password) throw new Error('Invalid credentials');
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
    // push newest last so inbox shows chronological order;
    // you can change as needed
    msgs.push(msg);
    localStorage.setItem(key, JSON.stringify(msgs));
  },
  getMessages: (username) => JSON.parse(localStorage.getItem(`messages_${username}`) || '[]')
};
// ----------------------------- Helper utilities -----------------------------
const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
// Simple safe text wrapping by words & maxCharsPerLine
function wrapTextByWords(text, maxCharsPerLine = 16) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      // if single word longer than maxCharsPerLine, break it
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
function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  // Recording / transcript state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);          // raw recorded audio
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState('');
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  // Auth fields
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  // refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioUrlRef = useRef(null);
  const videoUrlRef = useRef(null);
  const audioElementRef = useRef(null);
  // init user from localstorage
  useEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(mockDB.getMessages(mockAuth.currentUser.username));
      setView('dashboard');
    }
    // cleanup on unmount
    return () => {
      clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.onresult = null; recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch (e) {}
      }
      
      speechSynthesis.cancel();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);
  // route detection for /u/:username
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
  // ----------------- recording + transcription -----------------
  const startRecording = async () => {
    // reset previous
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null; }
    if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript(''); // reset transcript

      // Setup media recorder for audio only
      const options = MediaRecorder.isTypeSupported('audio/webm') ?
      { mimeType: 'audio/webm' } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: options?.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        // create object URL for playback/capture later
        audioUrlRef.current = URL.createObjectURL(blob);
      };
      recorder.start();
      // Try to start SpeechRecognition in parallel to capture transcript live.
      // Not all browsers support it;
      // if it fails, we silently skip but keep recording audio.
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
            setTranscript((finalTranscript + interim).trim());
          };
          recognition.onerror = (ev) => {
            // gracefully ignore recognition errors (common on unsupported browsers)
            console.warn('SpeechRecognition error', ev);
          };
          recognition.onend = () => {
            // keep last transcript
            recognitionRef.current = null;
          };
          recognition.start();
          recognitionRef.current = recognition;
        } else {
          // browser doesn't support SpeechRecognition;
          // we will still record audio
          console.info('SpeechRecognition not available in this browser — transcript will not be captured live.');
        }
      } catch (err) {
        console.warn('Could not start SpeechRecognition:', err);
      }

      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('Microphone access denied or not available.');
      console.error(err);
    }
  };
  const stopRecording = () => {
    // Stop timers + recorders safely
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop();
      } catch (e) { console.warn(e); }
      mediaRecorderRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { console.warn(e);
      }
      recognitionRef.current = null;
    }

    setIsRecording(false);
    clearInterval(timerRef.current);
  };
  // ----------------- preview generation (canvas animation + recorded audio) -----------------
  const generatePreview = async () => {
    if (!audioBlob && !transcript) {
      alert('Please record a message first (or your browser must support SpeechRecognition for live transcript).');
      return;
    }
    setProcessing(true);
    setPreviewVideoUrl('');
    // ensure canvas exists
    const canvas = canvasRef.current;
    if (!canvas) {
      alert('Canvas not available.');
      setProcessing(false);
      return;
    }
    // Setup canvas dimensions (vertical)
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // We'll create a video whose video track is canvas.captureStream(30)
    // and whose audio track we will obtain by playing the recorded audio blob
    // in an <audio> element and capturing its MediaStream via captureStream()
    // (supported in modern browsers).
    // This avoids trying to capture system audio.

    // Prepare audio element for recorded audio
    let audioStream = null;
    if (audioBlob) {
      // Create (or reuse) an audio element, set src to recorded blob URL
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
      } else {
        audioElementRef.current = document.createElement('audio');
      }
      const audioUrl = URL.createObjectURL(audioBlob);
      audioElementRef.current.src = audioUrl;
      audioElementRef.current.crossOrigin = 'anonymous';
      audioElementRef.current.muted = false;
      // autoplay might be blocked; ensure playback triggered by user gesture (they clicked Generate)
      try {
        await audioElementRef.current.play();
      } catch (e) {
        // If autoplay blocked, try unmuting and play again
        try { audioElementRef.current.muted = false;
          await audioElementRef.current.play(); }
        catch (e2) { console.warn('Playback of recorded audio blocked.', e2);
        }
      }

      // capture audio stream from element
      if (typeof audioElementRef.current.captureStream === 'function') {
        audioStream = audioElementRef.current.captureStream();
      } else {
        // fallback: we cannot capture audio -> generate silent audio track instead
        console.warn('captureStream not supported on audio element; final video will be silent.');
      }
    }

    // Create canvas video stream
    const canvasStream = canvas.captureStream(30);
    // Make combined stream: include canvas video tracks always; include audio if available
    const combined = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => combined.addTrack(t));
    if (audioStream && audioStream.getAudioTracks().length) {
      audioStream.getAudioTracks().forEach(t => combined.addTrack(t));
    }

    // Prepare MediaRecorder for the final video
    const videoChunks = [];
    const videoOptions = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ?
      { mimeType: 'video/webm;codecs=vp9,opus' }
      : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? { mimeType: 'video/webm;codecs=vp8,opus' } : undefined);

    let recorder;
    try {
      recorder = new MediaRecorder(combined, videoOptions);
    } catch (e) {
      // if MediaRecorder can't be created, bail out
      alert('Your browser cannot create an in-browser video from canvas + audio. Try Chrome/Edge desktop.');
      setProcessing(false);
      return;
    }
    recorder.ondataavailable = e => { if (e.data.size) videoChunks.push(e.data); };
    recorder.onstop = () => {
      const videoBlob = new Blob(videoChunks, { type: videoOptions?.mimeType || 'video/webm' });
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      const url = URL.createObjectURL(videoBlob);
      videoUrlRef.current = url;
      setPreviewVideoUrl(url);
      setProcessing(false);
      // stop audio playback for audioElementRef but keep src to allow user download/share
      try { if (audioElementRef.current) { audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0; } } catch (e) {}
    };

    // Start recorder
    recorder.start();
    // Render animation while audio plays (or for a default fallback duration)
    const textToDisplay = transcript?.trim() ||
      "You're amazing! Keep shining!";
    const words = textToDisplay.split(/\s+/);
    const startTime = Date.now();
    const durationSeconds = (audioElementRef.current?.duration && !isNaN(audioElementRef.current.duration) && audioElementRef.current.duration > 0)
      ?
      Math.max(2, audioElementRef.current.duration + 0.5)
      : Math.max(4, words.length / 2.5 + 2);
    // ensure fonts loaded and voices ready
    await ensureVoicesLoaded();
    const drawFrame = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const index = Math.min(Math.floor(elapsed * 2.5), words.length);

      // background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#667eea');
      grad.addColorStop(1, '#764ba2');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // white circle with shadow
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 60;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 400, 180, 0, Math.PI * 2);
      ctx.fill();
      // pulsing eyes
      const pulse = 50 + Math.sin(elapsed * 8) * 25;
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 70, 380, Math.max(20, pulse), 0, Math.PI * 2);
      ctx.arc(canvas.width / 2 + 70, 380, Math.max(20, pulse), 0, Math.PI * 2);
      ctx.fill();
      // draw subtitle-like text
      ctx.shadowBlur = 0;
      ctx.font = 'bold 80px Arial';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';

      const displayed = words.slice(0, index).join(' ') + (index < words.length ? ' █' : '');
      const lines = wrapTextByWords(displayed, 16);
      lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 1000 + i * 100));
      ctx.font = '42px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Sent anonymously via VoiceAnon', canvas.width / 2, 1700);
      if (elapsed < durationSeconds) {
        requestAnimationFrame(drawFrame);
      } else {
        // stop recorder after a small grace time to ensure audio finished
        setTimeout(() => {
          try { recorder.stop(); } catch (e) { console.warn(e); }
        }, 500);
      }
    };

    // Start playback for audioElementRef if exists;
    // else optionally use speechSynthesis as fallback
    if (audioElementRef.current && audioElementRef.current.src) {
      try {
        // ensure playback starts;
        // it should since user initiated record + generate flows
        audioElementRef.current.currentTime = 0;
        await audioElementRef.current.play();
      } catch (e) {
        console.warn('Could not autoplay recorded audio - final video may be silent', e);
      }
    } else {
      // fallback: speak with speechSynthesis into the speakers (not captured as audio in the video)
      // but still produce subtitles in the video.
      const utterance = new SpeechSynthesisUtterance(textToDisplay);
      const v = (speechSynthesis.getVoices() || []).find(x => x.name.includes('Google') || x.name.includes('Daniel')) || speechSynthesis.getVoices()[0];
      if (v) utterance.voice = v;
      utterance.rate = 0.95;
      utterance.pitch = 0.4;
      utterance.onerror = (e) => console.warn('speechSynthesis error', e);
      speechSynthesis.speak(utterance);
    }

    // begin drawing frames
    requestAnimationFrame(drawFrame);
  };
  // Ensure voices are loaded (speechSynthesis.getVoices can be empty initially)
  function ensureVoicesLoaded() {
    return new Promise(resolve => {
      const voices = speechSynthesis.getVoices();
      if (voices && voices.length) return resolve(voices);
      const handler = () => {
        const vs = speechSynthesis.getVoices();
        if (vs && vs.length) {
          speechSynthesis.onvoiceschanged = null;
          return resolve(vs);
  
        }
      };
      speechSynthesis.onvoiceschanged = handler;
      // fallback timeout
      setTimeout(() => resolve(speechSynthesis.getVoices()), 1000);
    });
  }

  // ----------------- sending & saving -----------------
  const sendMessage = () => {
    if (!previewVideoUrl && !audioBlob) {
      alert('Generate preview before sending.');
      return;
    }
    const message = {
      id: Date.now().toString(),
      text: transcript ||
      '[No transcript]',
      timestamp: new Date().toISOString(),
      duration: recordingTime,
      videoUrl: previewVideoUrl,
      audioUrl: audioUrlRef.current ||
      null
    };
    mockDB.saveMessage(targetUsername, message);
    setView('success');
  };

  // copy personal link
  const copyLink = () => {
    if (!user) return;
    const link = `${window.location.origin}/u/${user.username}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      // fallback: prompt
      window.prompt('Copy this link:', link);
    });
  };

  // Download helpers
  const downloadFile = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  // ------------------- VIEWS (unchanged mostly, with fixes) -------------------
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <nav className="flex justify-between items-center mb-16">
            <div className="text-2xl font-bold flex items-center gap-2">
              <Mic className="w-8 h-8" /> VoiceAnon
         
            </div>
            <div className="space-x-4">
              <button onClick={() => setView('signin')} className="px-6 py-2 rounded-full border border-white/30 hover:bg-white/10 transition">
                Sign In
              </button>
              <button onClick={() => setView('signup')} className="px-6 py-2 rounded-full bg-white text-purple-900 font-semibold hover:bg-gray-100 transition">
    
                Get Started
              </button>
            </div>
          </nav>
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent">
              Anonymous Voice Messages, 
              Reimagined
            </h1>
            <p className="text-2xl mb-12 text-gray-300">
              Record → Preview → Send stunning animated videos with robotic voice & subtitles
            </p>
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
 
                <Mic className="w-12 h-12 mb-4 mx-auto text-pink-300" />
                <h3 className="text-xl font-bold mb-3">Speak Freely</h3>
                <p className="text-gray-300">Your message turned into a shareable video</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
    
                <Users className="w-12 h-12 mb-4 mx-auto text-purple-300" />
                <h3 className="text-xl font-bold mb-3">100% Anonymous</h3>
                <p className="text-gray-300">Optionally anonymized before sending</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
          
                <Share2 className="w-12 h-12 mb-4 mx-auto text-indigo-300" />
                <h3 className="text-xl font-bold mb-3">Go Viral</h3>
                <p className="text-gray-300">Share immediately after sending</p>
              </div>
            </div>
            <button onClick={() => setView('signup')} className="px-12 py-4 text-xl rounded-full bg-gradient-to-r from-pink-500 
              to-purple-600 font-bold hover:shadow-2xl hover:scale-105 transition">
              Create Your Link Free
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'signin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">Welcome Back</h2>
          <form onSubmit={e => { e.preventDefault(); mockAuth.signIn(authEmail, authPassword).then(u => { setUser(u); setView('dashboard'); setMessages(mockDB.getMessages(u.username)); }).catch(e => alert(e.message)); }} className="space-y-4">
            <input type="email" placeholder="Email" value={authEmail} onChange={e => 
              setAuthEmail(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-bold text-white hover:shadow-xl transition">
              Sign In
            </button>
      
          </form>
          <p className="text-center text-white/60 mt-4">
            No account?
            <button onClick={() => setView('signup')} className="text-pink-300 hover:underline">Sign Up</button>
          </p>
        </div>
      </div>
    );
  }

  if (view === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">Create Account</h2>
          <form onSubmit={e => { e.preventDefault(); mockAuth.signUp(authEmail, authPassword, authUsername).then(u => { setUser(u); setView('dashboard'); setMessages(mockDB.getMessages(u.username)); }).catch(e => alert(e.message)); }} className="space-y-4">
            <input type="text" placeholder="Username" value={authUsername} onChange={e 
              => setAuthUsername(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-bold text-white hover:shadow-xl transition">
 
              Create Account
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
        <nav className="bg-white/10 backdrop-blur-lg border-b border-white/20">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              <Mic className="w-8 h-8" /> VoiceAnon
            </div>
 
            <div className="flex gap-4">
              <button onClick={() => setView('dashboard')} className="px-4 py-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition flex items-center gap-2">
                <Home className="w-5 h-5" /> Dashboard
              </button>
              <button onClick={() => { setMessages(mockDB.getMessages(user.username)); setView('inbox'); }} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 
              transition flex items-center gap-2">
                <Inbox className="w-5 h-5" /> Inbox ({messages.length})
              </button>
              <button onClick={() => { mockAuth.signOut();
                setUser(null); setView('landing'); }} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-2">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto text-center">
 
            <h1 className="text-4xl font-bold text-white mb-8">Your Personal Link</h1>
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 bg-white/20 rounded-xl px-4 py-3 text-white font-mono break-all">
                  {window.location.origin}/u/{user?.username}
       
                </div>
                <button onClick={copyLink} className="px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold hover:shadow-xl transition flex items-center gap-2">
                  {linkCopied ?
                  <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {linkCopied ?
                  'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'inbox') {
    // FIX: Removed illegal `useEffect` hook. We rely on the button in `dashboard`
    // to call setMessages and refresh the inbox content upon navigation.
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-8">
        <h1 className="text-4xl font-bold text-white text-center mb-12">Your Messages</h1>
        <div className="max-w-4xl mx-auto space-y-8">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <MessageSquare className="w-24 h-24 mx-auto text-white/30 mb-6" />
              
              <p className="text-2xl text-white/60">No messages yet. Share your link!</p>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className="bg-white/10 backdrop-blur-lg rounded-3xl p-6">
                {m.videoUrl ? (
                  
                  <video controls src={m.videoUrl} className="w-full rounded-2xl shadow-2xl" />
                ) : (
                  <div className="w-full aspect-video bg-black/40 rounded-2xl" />
                )}
                <p className="text-xl text-white/90 mt-6 italic text-center">"{m.text}"</p>
                
                <div className="flex gap-4 mt-6">
                  <button onClick={() => {
                    // share fallback: if navigator.share supports files, try, else share URL or download
                    if (navigator.share && navigator.canShare && m.videoUrl) {
                  
                      // Try to fetch blob and share as file - may fail in some browsers
                      fetch(m.videoUrl).then(r => r.blob()).then(blob => {
                        const file = new File([blob], `voiceanon_${m.id}.webm`, { type: blob.type });
                        if (navigator.canShare({ files: [file] })) {
                          navigator.share({ files: [file], title: 'Anonymous Message' }).catch(err => {
                            console.warn('Share failed:', err);
                            downloadFile(m.videoUrl, `voiceanon_${m.id}.webm`);
  
                          });
                        } else {
                          // fallback: open the video URL and let user save manually
                          window.open(m.videoUrl, '_blank');
                        }
                      }).catch(() => {
                        // secondary fallback if fetch fails
                        downloadFile(m.videoUrl, `voiceanon_${m.id}.webm`);
                      });
                    } else if (m.videoUrl) {
                      // simple download fallback for video
                      downloadFile(m.videoUrl, `voiceanon_${m.id}.webm`);
                    } else if (m.audioUrl) {
                      // download audio if no video
                      downloadFile(m.audioUrl, `voiceanon_audio_${m.id}.webm`);
                    }
                  }} 
                  className="flex-1 py-3 bg-white/20 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/30 transition"
                >
                  <Download className="w-5 h-5" /> Download
                </button>
                <button 
                  onClick={() => window.open(`${window.location.origin}/share/${m.id}`, '_blank')}
                  className="flex-1 py-3 bg-white/20 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/30 transition"
                >
                  <Share2 className="w-5 h-5" /> Share
                </button>
              </div>
              <p className="text-sm text-white/50 mt-4 text-center">
                Received: {new Date(m.timestamp).toLocaleString()} ({formatTime(m.duration)})
              </p>
            </div>
          ))
        )}
        </div>
        <div className="text-center mt-12">
          <button 
            onClick={() => setView('dashboard')}
            className="px-8 py-3 rounded-full bg-white text-purple-900 font-semibold hover:bg-gray-100 transition flex items-center gap-2 mx-auto"
          >
            <Home className="w-5 h-5" /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (view === 'record') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex flex-col items-center justify-center p-4">
        {/* Canvas is used for video generation but offscreen: avoids being `display:none` so captureStream works */}
        <canvas ref={canvasRef} style={{ position: 'absolute', left: -9999, width: 1080, height: 1920 }} />
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">Send Anonymous Message</h1>
            <p className="text-xl text-gray-300">to @{targetUsername ||
              '[unknown]'}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8">
            {previewVideoUrl ? (
              <div className="text-center space-y-6">
                <h3 className="text-2xl font-bold text-white">Preview Your Video</h3>
                <video src={previewVideoUrl} controls className="w-full rounded-2xl shadow-2xl" />
                <p className="text-lg text-white italic px-4">"{transcript}"</p>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={sendMessage} className="py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl text-lg">
                    Confirm & Send
                  </button>
                  <button onClick={() => {
                    // cleanup and reset to record again
                    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
                    if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null; }
                    setPreviewVideoUrl('');
                    setTranscript('');
                    setAudioBlob(null);
                    setRecordingTime(0);
                  }} className="py-4 bg-white/20 text-white font-bold rounded-xl"> Re-record </button>
                </div>
              </div>
            ) : !audioBlob ?
            ( 
              <div className="text-center">
                <div className={`w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-pink-500 to-purple-600'}`}>
                  {isRecording ? <Square
                    onClick={stopRecording}
                    className="w-12 h-12 text-white cursor-pointer"
                  /> : <Mic
                    onClick={startRecording}
                    className="w-12 h-12 text-white cursor-pointer"
                  />}
                </div>
                <p className="text-2xl font-bold text-white mb-2">
                  {isRecording ? 'Recording...' : 'Tap to Record'}
                </p>
                <p className="text-xl text-gray-300 mb-6">
                  {formatTime(recordingTime)}
                </p>
                {transcript && <p className="text-lg text-white italic px-4 mt-4">"{transcript}"</p>}
                {!isRecording && audioBlob && (
                  <button onClick={() => setAudioBlob(null)} className="mt-4 px-4 py-2 text-sm text-white/70 hover:text-white transition">
                    Clear Recording
                  </button>
                )}
              </div>
            ) : processing ? (
              <div className="text-center py-10 space-y-6">
                <div className="flex justify-center items-center space-x-2">
                  <div className="w-4 h-4 bg-pink-500 rounded-full animate-bounce"></div>
                  <div className="w-4 h-4 bg-purple-500 rounded-full animate-bounce delay-150"></div>
                  <div className="w-4 h-4 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
                </div>
                <p className="text-xl text-white">Generating your video...</p>
              </div>
            ) : (
              <button onClick={generatePreview} className="w-full py-5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xl">
                Generate Preview
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        <div className="text-center">
          <CheckCircle className="w-32 h-32 mx-auto text-green-400 mb-8" />
          <h1 className="text-5xl font-bold text-white mb-6">Message Sent!</h1>
          <p className="text-2xl text-gray-300 mb-12">
            Your animated video has been delivered to @{targetUsername}
          </p>
          <button onClick={() => { setView('record'); setAudioBlob(null); setTranscript(''); setPreviewVideoUrl(''); setRecordingTime(0); }} className="px-12 py-5 bg-white text-purple-900 font-bold rounded-full text-xl hover:bg-gray-100 transition">
            Send Another Message
          </button>
        </div>
      </div>
    );
  }
}
