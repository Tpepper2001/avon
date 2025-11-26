import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, Square, Send, Download, Share2, Play, Copy, CheckCircle, 
  MessageSquare, Users, TrendingUp, LogOut, Home, Inbox 
} from 'lucide-react';

// Mock Auth & DB
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
  init: () => { const u = localStorage.getItem('user'); if (u) mockAuth.currentUser = JSON.parse(u); }
};

const mockDB = {
  saveMessage: (username, msg) => {
    const key = `messages_${username}`;
    const msgs = JSON.parse(localStorage.getItem(key) || '[]');
    msgs.unshift(msg);
    localStorage.setItem(key, JSON.stringify(msgs));
  },
  getMessages: (username) => JSON.parse(localStorage.getItem(`messages_${username}`) || '[]')
};

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  const [finalVideoUrl, setFinalVideoUrl] = useState('');

  // Auth form
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRecorderRef = useRef(null);

  useEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(mockDB.getMessages(mockAuth.currentUser.username));
      setView('dashboard');
    }
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = e => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { alert('Microphone access denied'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const processMessage = async () => {
    if (!audioBlob || !canvasRef.current) return;
    setProcessing(true);

    const canvas = canvasRef.current;
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    const canvasStream = canvas.captureStream(30);
    const videoChunks = [];
    videoRecorderRef.current = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp9' });
    videoRecorderRef.current.ondataavailable = e => e.data.size > 0 && videoChunks.push(e.data);
    videoRecorderRef.current.start();

    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = '';
    recognition.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' ';
        else interim = t;
      }
      setTranscript(finalText + interim);
    };

    recognition.onend = () => {
      if (!finalText.trim()) finalText = "You're amazing! Keep being you!";
      setTranscript(finalText.trim());

      const utterance = new SpeechSynthesisUtterance(finalText.trim());
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find(v => v.name.includes('Google') || v.name.includes('Daniel')) || voices[0];
      utterance.rate = 0.9;
      utterance.pitch = 0.3;

      const words = finalText.trim().split(' ');
      const startTime = Date.now();

      const draw = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const wordIndex = Math.min(Math.floor(elapsed * 2.5), words.length);

        // Gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, 1920);
        grad.addColorStop(0, '#667eea');
        grad.addColorStop(1, '#764ba2');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Robot avatar
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 60;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(540, 400, 180, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing eyes
        const pulse = 50 + Math.sin(elapsed * 8) * 25;
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(470, 380, pulse, 0, Math.PI * 2);
        ctx.arc(610, 380, pulse, 0, Math.PI * 2);
        ctx.fill();

        // Subtitles
        ctx.shadowBlur = 0;
        ctx.font = 'bold 80px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        const displayed = words.slice(0, wordIndex).join(' ') + (wordIndex < words.length ? ' █' : '');
        const lines = displayed.match(/.{1,16}(\s|$)/g) || [];
        lines.forEach((line, i) => {
          ctx.fillText(line.trim(), 540, 1000 + i * 100);
        });

        ctx.font = '42px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Sent anonymously via VoiceAnon', 540, 1700);

        if (wordIndex < words.length || elapsed < words.length / 2.5 + 4) {
          requestAnimationFrame(draw);
        }
      };

      utterance.onend = () => setTimeout(() => videoRecorderRef.current?.stop(), 2500);
      draw();
      speechSynthesis.speak(utterance);
    };

    videoRecorderRef.current.onstop = () => {
      const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(videoBlob);
      setFinalVideoUrl(videoUrl);

      const message = {
        id: Date.now().toString(),
        text: finalText.trim(),
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoUrl,
        audioUrl: URL.createObjectURL(audioBlob)
      };

      mockDB.saveMessage(targetUsername, message);
      setView('success');
      setProcessing(false);
    };

    recognition.start();
  };

  const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${user.username}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };
  const shareVideo = (url) => {
    if (navigator.share && navigator.canShare?.({ files: [new File([], 'test')] })) {
      fetch(url).then(r => r.blob()).then(blob => {
        const file = new File([blob], 'voiceanon.mp4', { type: 'video/webm' });
        navigator.share({ files: [file], title: 'Anonymous Message' });
      });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'voiceanon.mp4';
      a.click();
    }
  };

  // ==================== VIEWS ====================

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
              Anonymous Voice Messages, Reimagined
            </h1>
            <p className="text-2xl mb-12 text-gray-300">
              Record a voice note → AI turns it into a stunning animated video with robotic voice & subtitles
            </p>
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                <Mic className="w-12 h-12 mb-4 mx-auto text-pink-300" />
                <h3 className="text-xl font-bold mb-3">Speak Freely</h3>
                <p className="text-gray-300">Your real voice, full emotion</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                <Users className="w-12 h-12 mb-4 mx-auto text-purple-300" />
                <h3 className="text-xl font-bold mb-3">100% Anonymous</h3>
                <p className="text-gray-300">Turned into robotic AI video</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                <Share2 className="w-12 h-12 mb-4 mx-auto text-indigo-300" />
                <h3 className="text-xl font-bold mb-3">Go Viral</h3>
                <p className="text-gray-300">Share instantly to TikTok & WhatsApp</p>
              </div>
            </div>
            <button onClick={() => setView('signup')} className="px-12 py-4 text-xl rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-bold hover:shadow-2xl hover:scale-105 transition">
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
            <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-bold text-white hover:shadow-xl transition">
              Sign In
            </button>
          </form>
          <p className="text-center text-white/60 mt-4">
            No account? <button onClick={() => setView('signup')} className="text-pink-300 hover:underline">Sign Up</button>
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
            <input type="text" placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
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
              <button onClick={() => setView('inbox')} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-2">
                <Inbox className="w-5 h-5" /> Inbox ({messages.length})
              </button>
              <button onClick={() => { mockAuth.signOut(); setUser(null); setView('landing'); }} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-2">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-4xl font-bold text-white mb-8">Your Link</h1>
          <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-lg rounded-2xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 bg-white/20 rounded-xl px-4 py-3 text-white font-mono break-all">
                {window.location.origin}/u/{user?.username}
              </div>
              <button onClick={copyLink} className="px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold flex items-center gap-2">
                {linkCopied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'inbox') {
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
                <video controls src={m.videoUrl} className="w-full rounded-2xl shadow-2xl" />
                <p className="text-xl text-white/90 mt-6 italic text-center">"{m.text}"</p>
                <div className="flex gap-4 mt-6">
                  <button onClick={() => shareVideo(m.videoUrl)} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-3">
                    <Share2 className="w-6 h-6" /> Share to TikTok / WhatsApp
                  </button>
                  <a href={m.videoUrl} download={`voiceanon_${m.id}.webm`} className="flex-1 bg-white/20 py-4 rounded-xl font-bold text-white text-center">
                    <Download className="w-6 h-6 inline mr-2" /> Download
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (view === 'record') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        <canvas ref={canvasRef} className="hidden" />
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">Send Anonymous Message</h1>
            <p className="text-xl text-gray-300">to @{targetUsername}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8">
            {!audioBlob ? (
              <div className="text-center">
                <div className={`w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-pink-500 to-purple-600'}`}>
                  {isRecording ? <Square className="w-16 h-16 text-white" /> : <Mic className="w-16 h-16 text-white" />}
                </div>
                {isRecording && <div className="text-4xl font-bold text-white mb-8">{formatTime(recordingTime)}</div>}
                <button onClick={isRecording ? stopRecording : startRecording} className={`w-full py-5 rounded-xl font-bold text-xl transition ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-gradient-to-r from-pink-500 to-purple-600 hover:shadow-2xl'}`}>
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
                <p className="text-gray-400 text-sm mt-4">Your voice will be turned into an animated video</p>
              </div>
            ) : (
              <div className="text-center">
                <CheckCircle className="w-32 h-32 mx-auto text-green-400 mb-6" />
                <h3 className="text-2xl font-bold text-white mb-4">Recording Complete!</h3>
                <p className="text-gray-300 mb-8">Duration: {formatTime(recordingTime)}</p>
                {processing ? (
                  <div className="space-y-6">
                    <div className="flex justify-center gap-4">
                      <div className="w-4 h-4 bg-pink-500 rounded-full animate-bounce"></div>
                      <div className="w-4 h-4 bg-purple-500 rounded-full animate-bounce delay-100"></div>
                      <div className="w-4 h-4 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
                    </div>
                    <p className="text-xl text-white">Generating your animated video...</p>
                  </div>
                ) : (
                  <button onClick={processMessage} className="w-full py-5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xl flex items-center justify-center gap-3">
                    <Send className="w-6 h-6" /> Send Animated Video
                  </button>
                )}
              </div>
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
          <button onClick={() => { setView('record'); setAudioBlob(null); setTranscript(''); setFinalVideoUrl(''); }} className="px-12 py-5 bg-white text-purple-900 rounded-full text-xl font-bold">
            Send Another Message
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
