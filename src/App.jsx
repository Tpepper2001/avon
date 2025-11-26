import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Download, Share2, Play, Pause, Copy, CheckCircle, MessageSquare, Users, TrendingUp, Settings, LogOut, Home, Inbox } from 'lucide-react';

// Mock Authentication (replace with Firebase in production)
const mockAuth = {
  currentUser: null,
  signIn: (email, password) => {
    const username = email.split('@')[0];
    mockAuth.currentUser = { email, username, uid: Date.now().toString() };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signUp: (email, password, username) => {
    mockAuth.currentUser = { email, username, uid: Date.now().toString() };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signOut: () => {
    mockAuth.currentUser = null;
    localStorage.removeItem('user');
    return Promise.resolve();
  },
  init: () => {
    const stored = localStorage.getItem('user');
    if (stored) mockAuth.currentUser = JSON.parse(stored);
  }
};

// Mock Database (replace with Firebase Firestore in production)
const mockDB = {
  saveMessage: (username, message) => {
    const messages = JSON.parse(localStorage.getItem(`messages_${username}`) || '[]');
    messages.unshift(message);
    localStorage.setItem(`messages_${username}`, JSON.stringify(messages));
    return Promise.resolve();
  },
  getMessages: (username) => {
    const messages = JSON.parse(localStorage.getItem(`messages_${username}`) || '[]');
    return Promise.resolve(messages);
  }
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
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      loadMessages(mockAuth.currentUser.username);
    }
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/u/')) {
      const username = path.split('/u/')[1];
      setTargetUsername(username);
      setView('record');
    }
  }, []);

  const loadMessages = async (username) => {
    const msgs = await mockDB.getMessages(username);
    setMessages(msgs);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied. Please allow microphone access to record.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const simulateTranscription = (blob) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const samples = [
          "I've been wanting to tell you this for a while... you're an amazing person.",
          "Your content always makes my day. Keep being awesome!",
          "Here's something I've never told anyone before...",
          "I think you're really talented and inspiring.",
          "Just wanted to say thank you for everything you do."
        ];
        resolve(samples[Math.floor(Math.random() * samples.length)]);
      }, 2000);
    });
  };

  const generateRoboticVoice = (text) => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 0.8;
        utterance.onend = () => resolve();
        window.speechSynthesis.speak(utterance);
      }
      setTimeout(resolve, 3000);
    });
  };

  const processMessage = async () => {
    if (!audioBlob) return;

    setProcessing(true);
    try {
      const text = await simulateTranscription(audioBlob);
      setTranscript(text);
      await generateRoboticVoice(text);

      const message = {
        id: Date.now().toString(),
        text,
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoUrl: URL.createObjectURL(audioBlob)
      };

      await mockDB.saveMessage(targetUsername, message);
      
      setProcessing(false);
      setView('success');
    } catch (err) {
      setProcessing(false);
      alert('Error processing message. Please try again.');
    }
  };

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');

  const handleAuth = async (isSignUp) => {
    if (!authEmail || !authPassword || (isSignUp && !authUsername)) return;

    try {
      const user = isSignUp 
        ? await mockAuth.signUp(authEmail, authPassword, authUsername)
        : await mockAuth.signIn(authEmail, authPassword);
      setUser(user);
      setView('dashboard');
      loadMessages(user.username);
    } catch (err) {
      alert('Authentication failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await mockAuth.signOut();
    setUser(null);
    setView('landing');
  };

  const copyLink = () => {
    const link = `${window.location.origin}/u/${user.username}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shareToSocial = (platform) => {
    const link = `${window.location.origin}/u/${user.username}`;
    const text = "Send me an anonymous voice message! 🎤";
    const urls = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text + ' ' + link)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
    };
    window.open(urls[platform], '_blank');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Landing Page
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <nav className="flex justify-between items-center mb-16">
            <div className="text-2xl font-bold flex items-center gap-2">
              <Mic className="w-8 h-8" />
              VoiceAnon
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
              Receive authentic voice notes transformed into AI-powered videos. Share your link, get anonymous messages, and spread them across social media.
            </p>
            
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                <Mic className="w-12 h-12 mb-4 mx-auto text-pink-300" />
                <h3 className="text-xl font-bold mb-3">Speak Freely</h3>
                <p className="text-gray-300">Record authentic voice messages with all the emotion text can't capture</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                <Users className="w-12 h-12 mb-4 mx-auto text-purple-300" />
                <h3 className="text-xl font-bold mb-3">Stay Anonymous</h3>
                <p className="text-gray-300">AI transforms your voice into a robotic tone while keeping your message intact</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                <Share2 className="w-12 h-12 mb-4 mx-auto text-indigo-300" />
                <h3 className="text-xl font-bold mb-3">Go Viral</h3>
                <p className="text-gray-300">Share AI-generated videos instantly to WhatsApp, Instagram, TikTok and more</p>
              </div>
            </div>

            <button onClick={() => setView('signup')} className="px-12 py-4 text-xl rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-bold hover:shadow-2xl hover:scale-105 transition transform">
              Create Your Link Free
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sign In
  if (view === 'signin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">Welcome Back</h2>
          <form onSubmit={(e) => handleAuth(e, false)} className="space-y-4">
            <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <input type="password" name="password" placeholder="Password" required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-bold text-white hover:shadow-xl transition">
              Sign In
            </button>
          </form>
          <p className="text-center text-white/60 mt-4">
            Don't have an account?{' '}
            <button onClick={() => setView('signup')} className="text-pink-300 hover:underline">Sign Up</button>
          </p>
        </div>
      </div>
    );
  }

  // Sign Up
  if (view === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">Create Account</h2>
          <form onSubmit={(e) => handleAuth(e, true)} className="space-y-4">
            <input type="text" name="username" placeholder="Username" required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <input type="password" name="password" placeholder="Password" required className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60" />
            <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-bold text-white hover:shadow-xl transition">
              Create Account
            </button>
          </form>
          <p className="text-center text-white/60 mt-4">
            Already have an account?{' '}
            <button onClick={() => setView('signin')} className="text-pink-300 hover:underline">Sign In</button>
          </p>
        </div>
      </div>
    );
  }

  // Dashboard
  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
        <nav className="bg-white/10 backdrop-blur-lg border-b border-white/20">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              <Mic className="w-8 h-8" />
              VoiceAnon
            </div>
            <div className="flex gap-4">
              <button onClick={() => setView('dashboard')} className="px-4 py-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition flex items-center gap-2">
                <Home className="w-5 h-5" />
                Dashboard
              </button>
              <button onClick={() => setView('inbox')} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-2">
                <Inbox className="w-5 h-5" />
                Inbox ({messages.length})
              </button>
              <button onClick={handleSignOut} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-2">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>

        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-4xl font-bold text-white mb-8 text-center">Your Personal Link</h1>
            
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 bg-white/20 rounded-xl px-4 py-3 text-white font-mono">
                  {window.location.origin}/u/{user.username}
                </div>
                <button onClick={copyLink} className="px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold hover:shadow-xl transition flex items-center gap-2">
                  {linkCopied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {linkCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => shareToSocial('whatsapp')} className="px-4 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition">
                  Share to WhatsApp
                </button>
                <button onClick={() => shareToSocial('facebook')} className="px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition">
                  Share to Facebook
                </button>
                <button onClick={() => shareToSocial('twitter')} className="px-4 py-3 rounded-xl bg-sky-500 text-white font-semibold hover:bg-sky-600 transition">
                  Share to X
                </button>
                <button onClick={() => shareToSocial('telegram')} className="px-4 py-3 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600 transition">
                  Share to Telegram
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-pink-300" />
                <div className="text-3xl font-bold text-white mb-1">{messages.length}</div>
                <div className="text-gray-300">Messages</div>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-center">
                <Users className="w-10 h-10 mx-auto mb-3 text-purple-300" />
                <div className="text-3xl font-bold text-white mb-1">0</div>
                <div className="text-gray-300">Link Views</div>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-center">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 text-indigo-300" />
                <div className="text-3xl font-bold text-white mb-1">0%</div>
                <div className="text-gray-300">Growth</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inbox
  if (view === 'inbox') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
        <nav className="bg-white/10 backdrop-blur-lg border-b border-white/20">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              <Mic className="w-8 h-8" />
              VoiceAnon
            </div>
            <div className="flex gap-4">
              <button onClick={() => setView('dashboard')} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-2">
                <Home className="w-5 h-5" />
                Dashboard
              </button>
              <button onClick={() => setView('inbox')} className="px-4 py-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition flex items-center gap-2">
                <Inbox className="w-5 h-5" />
                Inbox ({messages.length})
              </button>
              <button onClick={handleSignOut} className="px-4 py-2 rounded-lg text-white hover:bg-white/10 transition flex items-center gap-2">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>

        <div className="container mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">Your Messages</h1>
          
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-white/40" />
                <p className="text-xl text-white/60">No messages yet. Share your link to start receiving voice notes!</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 hover:bg-white/20 transition">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <p className="text-white text-lg mb-2">{msg.text}</p>
                      <p className="text-gray-400 text-sm">
                        {new Date(msg.timestamp).toLocaleString()} • {formatTime(msg.duration)}
                      </p>
                    </div>
                    <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold hover:shadow-xl transition flex items-center gap-2">
                      <Play className="w-4 h-4" />
                      Play
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition flex items-center gap-2 text-sm">
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                    <button className="px-4 py-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition flex items-center gap-2 text-sm">
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Recording Interface
  if (view === 'record') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">Send Anonymous Message</h1>
            <p className="text-xl text-gray-300">to @{targetUsername}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8">
            {!audioBlob ? (
              <div className="text-center">
                <div className={`w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-pink-500 to-purple-600'}`}>
                  {isRecording ? (
                    <Square className="w-16 h-16 text-white" />
                  ) : (
                    <Mic className="w-16 h-16 text-white" />
                  )}
                </div>
                
                {isRecording && (
                  <div className="text-3xl font-bold text-white mb-6">
                    {formatTime(recordingTime)}
                  </div>
                )}

                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-full py-4 rounded-xl font-bold text-white text-lg transition ${
                    isRecording 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-gradient-to-r from-pink-500 to-purple-600 hover:shadow-xl'
                  }`}
                >
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>

                <p className="text-gray-400 text-sm mt-4">
                  Your voice will be transformed into AI robotic audio
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle className="w-16 h-16 text-white" />
                </div>

                <h3 className="text-2xl font-bold text-white mb-2">Recording Complete!</h3>
                <p className="text-gray-300 mb-6">Duration: {formatTime(recordingTime)}</p>

                {processing ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 text-white">
                      <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                      <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                      <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                    </div>
                    <p className="text-white">Processing your message...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={processMessage}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold hover:shadow-xl transition flex items-center justify-center gap-2"
                    >
                      <Send className="w-5 h-5" />
                      Send Message
                    </button>
                    <button
                      onClick={() => {
                        setAudioBlob(null);
                        setRecordingTime(0);
                      }}
                      className="w-full py-3 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"
                    >
                      Re-record
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Success View
  if (view === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle className="w-16 h-16 text-white" />
          </div>
          
          <h1 className="text-4xl font-bold text-white mb-4">Message Sent!</h1>
          <p className="text-xl text-gray-300 mb-8">
            Your anonymous voice note has been delivered to @{targetUsername}
          </p>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8">
            <p className="text-white italic">"{transcript}"</p>
          </div>

          <button
            onClick={() => {
              setView('record');
              setAudioBlob(null);
              setTranscript('');
              setRecordingTime(0);
            }}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold hover:shadow-xl transition"
          >
            Send Another Message
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
