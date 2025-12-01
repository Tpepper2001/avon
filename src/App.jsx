import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Put your own keys here
const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing'); // 'landing', 'signup', 'login'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [view, setView] = useState('create'); // 'create' or 'inbox'
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);

  // Check for recipient in URL or load current user
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    
    if (sendTo) {
      setRecipientUsername(sendTo);
      setView('create');
    }

    // Check if user is logged in
    const savedUser = localStorage.getItem('anon-voice-user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      fetchMessages(user.username);
    }
  }, []);

  const fetchMessages = async (user) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('username', user)
      .order('created_at', { ascending: false });

    setMessages(data || []);
  };

  const handleSignup = async () => {
    setError('');
    
    if (!username.match(/^[a-zA-Z0-9_-]{3,20}$/)) {
      setError('Username must be 3-20 characters (letters, numbers, - or _)');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    // Check if username exists
    const { data: existing } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existing) {
      setError('Username already taken');
      setLoading(false);
      return;
    }

    // Create user
    const { error: insertError } = await supabase
      .from('users')
      .insert({ username, password });

    if (insertError) {
      setError('Signup failed: ' + insertError.message);
      setLoading(false);
      return;
    }

    const user = { username };
    setCurrentUser(user);
    localStorage.setItem('anon-voice-user', JSON.stringify(user));
    setLoading(false);
    setUsername('');
    setPassword('');
  };

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    const { data, error: loginError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (loginError || !data) {
      setError('Invalid username or password');
      setLoading(false);
      return;
    }

    const user = { username: data.username };
    setCurrentUser(user);
    localStorage.setItem('anon-voice-user', JSON.stringify(user));
    fetchMessages(user.username);
    setLoading(false);
    setUsername('');
    setPassword('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setView('create');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Live transcription
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map((r) => r[0].transcript)
            .join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  const sendMessage = async () => {
    if (!audioBlob) return;

    setLoading(true);
    const recipient = recipientUsername || currentUser?.username;

    if (!recipient) {
      alert('Please enter a recipient username');
      setLoading(false);
      return;
    }

    // Upload audio
    const fileName = `voice-${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('voices')
      .upload(fileName, audioBlob, { contentType: 'audio/webm', upsert: false });

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message);
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);

    // Save message
    const { error } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: transcript || null,
        audio_url: publicUrl,
      });

    if (error) {
      alert('Send failed: ' + error.message);
    } else {
      alert(`🎤 Voice note sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRecipientUsername('');
      if (recipient === currentUser?.username) fetchMessages(currentUser.username);
    }
    setLoading(false);
  };

  const playRobotic = (text, id) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.7;
    u.pitch = 0.3;
    u.volume = 0.9;
    u.onstart = () => setIsPlaying(id);
    u.onend = () => setIsPlaying(null);
    window.speechSynthesis.speak(u);
  };

  const copyLink = () => {
    const link = `${window.location.origin}?send_to=${currentUser.username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  // ════════════════════════════════════════ LANDING PAGE ════════════════════════════════════════

  if (!currentUser && authView === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse">
            <Sparkles className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVox
          </h1>
          <p className="text-gray-600 text-lg mb-10 leading-relaxed">
            Send anonymous voice messages<br />
            with <span className="font-bold text-purple-600">robotic playback</span> 🤖
          </p>
          <div className="space-y-4">
            <button
              onClick={() => setAuthView('signup')}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-6 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition-transform"
            >
              Create Account
            </button>
            <button
              onClick={() => setAuthView('login')}
              className="w-full bg-gray-100 text-gray-800 py-6 rounded-2xl font-bold text-xl hover:bg-gray-200 transition"
            >
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════ SIGNUP PAGE ════════════════════════════════════════

  if (!currentUser && authView === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-2 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <p className="text-gray-500 text-center mb-8">Get your anonymous voice inbox</p>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleSignup)}
                placeholder="Choose a unique username"
                className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleSignup)}
                placeholder="At least 6 characters"
                className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg"
              />
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSignup}
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition-transform disabled:opacity-70 disabled:scale-100"
            >
              {loading ? 'Creating...' : 'Sign Up'}
            </button>
          </div>

          <button
            onClick={() => { setAuthView('landing'); setError(''); }}
            className="w-full mt-6 text-gray-600 hover:text-gray-800 font-medium"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════ LOGIN PAGE ════════════════════════════════════════

  if (!currentUser && authView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-2 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <p className="text-gray-500 text-center mb-8">Log in to your voice inbox</p>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleLogin)}
                placeholder="Your username"
                className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleLogin)}
                placeholder="Your password"
                className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg"
              />
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition-transform disabled:opacity-70 disabled:scale-100"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </div>

          <button
            onClick={() => { setAuthView('landing'); setError(''); }}
            className="w-full mt-6 text-gray-600 hover:text-gray-800 font-medium"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════ MAIN APP ════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8" />
                <h1 className="text-4xl font-bold">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 bg-white/20 px-5 py-3 rounded-xl hover:bg-white/30 transition"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
                  <span className="font-medium">{copied ? 'Copied!' : 'Share'}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-white/20 px-5 py-3 rounded-xl hover:bg-white/30 transition"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setView('create')}
                className={`px-8 py-4 rounded-xl font-bold transition-all ${
                  view === 'create' ? 'bg-white text-purple-600 shadow-lg scale-105' : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                📤 Send Voice
              </button>
              <button
                onClick={() => { setView('inbox'); fetchMessages(currentUser.username); }}
                className={`px-8 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${
                  view === 'inbox' ? 'bg-white text-purple-600 shadow-lg scale-105' : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                <Inbox className="w-6 h-6" />
                Inbox ({messages.length})
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-10">
            {view === 'create' ? (
              <div className="max-w-lg mx-auto text-center">
                <h2 className="text-3xl font-bold text-gray-800 mb-4">Send Anonymous Voice Note</h2>
                
                <input
                  type="text"
                  value={recipientUsername}
                  onChange={(e) => setRecipientUsername(e.target.value)}
                  placeholder="Recipient username (optional - defaults to yourself)"
                  className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg mb-8"
                />

                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={`w-56 h-56 rounded-full shadow-2xl transition-all ${
                    isRecording
                      ? 'bg-red-500 animate-pulse scale-110'
                      : 'bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-110'
                  } flex items-center justify-center`}
                >
                  <Mic className="w-28 h-28 text-white" />
                </button>
                <p className="mt-8 text-2xl text-gray-700 font-medium">
                  {isRecording ? '🎤 Recording… Release to stop' : '👆 Hold to record'}
                </p>

                {(audioUrl || transcript) && (
                  <div className="mt-10 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                    {audioUrl && <audio controls src={audioUrl} className="w-full mb-6 rounded-xl" />}
                    {transcript && (
                      <div className="bg-white rounded-xl p-6 mb-6">
                        <p className="text-sm text-gray-500 mb-2 font-bold">Transcription:</p>
                        <p className="text-left text-gray-800 font-medium">"{transcript}"</p>
                      </div>
                    )}
                    <button
                      onClick={sendMessage}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 disabled:opacity-70 hover:scale-105 transition-transform"
                    >
                      <Send className="w-7 h-7" />
                      {loading ? 'Sending…' : 'Send Voice Note 🚀'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h2 className="text-3xl font-bold text-gray-800 mb-8">🤖 Your Anonymous Voice Inbox</h2>
                {messages.length === 0 ? (
                  <div className="text-center py-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                    <Inbox className="w-24 h-24 text-gray-300 mx-auto mb-6" />
                    <p className="text-2xl mb-4 text-gray-600 font-medium">No messages yet</p>
                    <p className="text-gray-500 mb-6">Share your link to receive voice notes:</p>
                    <p className="font-mono bg-white px-6 py-4 rounded-xl inline-block text-purple-600 font-bold shadow-md">
                      {window.location.origin}?send_to={currentUser.username}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map((msg) => (
                      <div key={msg.id} className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
                        {msg.audio_url && <audio controls src={msg.audio_url} className="w-full mb-6 rounded-xl" />}
                        {msg.text && (
                          <div className="bg-white rounded-xl p-6 mb-6 shadow-md">
                            <p className="text-xl text-gray-800 font-medium">"{msg.text}"</p>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500 font-medium">
                            📅 {new Date(msg.created_at).toLocaleString()}
                          </span>
                          {msg.text && (
                            <button
                              onClick={() => playRobotic(msg.text, msg.id)}
                              disabled={isPlaying === msg.id}
                              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl flex items-center gap-3 hover:scale-105 transition-transform disabled:opacity-60 disabled:scale-100 font-bold shadow-lg"
                            >
                              <Play className="w-5 h-5" />
                              {isPlaying === msg.id ? '🤖 Playing...' : '🤖 Robotic Voice'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
