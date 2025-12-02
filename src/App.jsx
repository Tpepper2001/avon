import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');

    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        fetchMessages(user.username);
        setAuthView('');
      }
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
    setAuthView('');
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
    setAuthView('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map(r => r[0].transcript)
            .join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied. Please allow microphone in your browser settings.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
  };

  const sendMessageWithRoboticVoice = async () => {
    if (!transcript.trim()) {
      alert('No speech detected. Please speak clearly and wait for transcription.');
      return;
    }

    const recipient = recipientUsername.trim();
    if (!recipient) {
      alert('Recipient username is missing');
      return;
    }

    setLoading(true);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: transcript,
        audio_url: null,
        video_url: null
      })
      .select()
      .single();

    if (error) {
      alert('Failed to send message: ' + error.message);
      setLoading(false);
      return;
    }

    generateRoboticVideo(transcript, message.id);

    const utter = new SpeechSynthesisUtterance("Your anonymous robotic message has been sent!");
    utter.rate = 0.7;
    utter.pitch = 0.3;
    utter.volume = 0.9;
    utter.onend = () => {
      alert(`Robotic voice sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRecordingTime(0);
      setLoading(false);

      if (currentUser && recipient === currentUser.username) {
        setTimeout(() => fetchMessages(currentUser.username), 4000);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  const generateRoboticVideo = async (text, messageId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.7;
    utterance.pitch = 0.3;
    utterance.volume = 1;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    const videoStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const mimeType = 'video/webm;codecs=vp9,opus';
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const fileName = `robot-${messageId}-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error('Video upload failed:', uploadError);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('voices')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('messages')
        .update({ video_url: publicUrl })
        .eq('id', messageId);

      if (updateError) {
        console.error('Update failed:', updateError);
      } else if (currentUser) {
        fetchMessages(currentUser.username);
      }
    };

    recorder.start();

    const animate = () => {
      const intensity = Math.abs(Math.sin(Date.now() * 0.006)) * 0.8 + 0.3;

      const gradient = ctx.createLinearGradient(0, 0, 400, 400);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 100, 200, 200);

      const blink = Math.random() < 0.02;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(130, 150, 30, blink ? 5 : 30 + intensity * 15);
      ctx.fillRect(240, 150, 30, blink ? 5 : 30 + intensity * 15);

      const mouthW = 80 + intensity * 70;
      const mouthH = 15 + intensity * 40;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(200 - mouthW / 2, 240, mouthW, mouthH);

      const glow = ctx.createRadialGradient(200, 70, 0, 200, 70, 30 + intensity * 20);
      glow.addColorStop(0, '#a78bfa');
      glow.addColorStop(1, '#667eea');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(200, 70, 30 + intensity * 20, 0, Math.PI * 2);
      ctx.fill();

      if (recorder.state === 'recording') {
        requestAnimationFrame(animate);
      }
    };
    animate();

    utterance.onend = () => {
      setTimeout(() => recorder.stop(), 1500);
    };
    utterance.onerror = () => recorder.stop();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const copyLink = () => {
    const link = `${window.location.origin}?send_to=${currentUser.username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse">
            <Sparkles className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVox
          </h1>
          <p className="text-gray-600 text-lg mb-10 leading-relaxed">
            Send & receive anonymous voice messages<br />
            with <span className="font-bold text-purple-600">robotic avatar playback</span>
          </p>
          <div className="space-y-4">
            <button onClick={() => setAuthView('signup')} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-6 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition active:scale-95">
              Create Account
            </button>
            <button onClick={() => setAuthView('login')} className="w-full bg-gray-100 text-gray-800 py-6 rounded-2xl font-bold text-xl hover:bg-gray-200 transition active:scale-95">
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username (3-20 chars)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleSignup} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleLogin} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Logging In...' : 'Log In'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center">
            <h1 className="text-5xl font-black mb-6 bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
              Send to @{recipientUsername}
            </h1>
            <p className="text-gray-600 text-xl mb-10">Record your anonymous voice message</p>

            {!audioBlob ? (
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-72 h-72 rounded-full shadow-2xl flex items-center justify-center transition-all ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? <Square className="w-40 h-40 text-white" /> : <Mic className="w-40 h-40 text-white" />}
              </button>
            ) : (
              <div className="space-y-10">
                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-3xl p-12 shadow-xl">
                  <p className="text-3xl font-bold text-purple-800 mb-6">Ready to Send!</p>
                  <p className="text-2xl text-gray-700 leading-relaxed">"{transcript || 'Voice recorded successfully'}"</p>
                  <p className="text-sm text-gray-500 mt-4">Duration: {formatTime(recordingTime)}</p>
                </div>
                <div className="flex gap-6">
                  <button onClick={sendMessageWithRoboticVoice} disabled={loading} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-8 rounded-3xl font-black text-3xl hover:scale-105 transition disabled:opacity-70">
                    {loading ? 'Sending...' : 'Send as Robot'}
                  </button>
                  <button onClick={cancelRecording} className="flex-1 bg-gray-200 py-8 rounded-3xl font-black text-2xl hover:bg-gray-300 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="mt-12">
                <div className="text-7xl font-black text-red-500 mb-4">{formatTime(recordingTime)}</div>
                <p className="text-3xl text-gray-700">Recording... Tap to stop</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-10 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <User className="w-16 h-16" />
                <h1 className="text-5xl font-black">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-6">
                <button onClick={copyLink} className="bg-white/20 px-10 py-5 rounded-2xl hover:bg-white/30 flex items-center gap-4 text-2xl font-bold backdrop-blur">
                  {copied ? <Check className="w-10 h-10" /> : <Share2 className="w-10 h-10" />}
                  {copied ? 'Copied!' : 'Share Link'}
                </button>
                <button onClick={handleLogout} className="bg-white/20 p-5 rounded-2xl hover:bg-white/30 backdrop-blur">
                  <LogOut className="w-10 h-10" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-12">
            <h2 className="text-5xl font-black text-gray-800 mb-12 text-center">Your Robotic Voice Inbox</h2>

            {messages.length === 0 ? (
              <div className="text-center py-32 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-40 h-40 mx-auto text-gray-300 mb-10" />
                <p className="text-4xl font-black text-gray-600 mb-8">No messages yet</p>
                <p className="text-2xl text-purple-600 font-mono bg-white px-10 py-6 rounded-2xl inline-block shadow-2xl break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-10 shadow-2xl">
                    {msg.video_url ? (
                      <video
                        controls
                        src={msg.video_url}
                        className="w-full rounded-3xl shadow-2xl border-8 border-purple-300"
                        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23667eea' width='400' height='400'/%3E%3Ctext x='50%' y='50%' font-size='36' text-anchor='middle' dy='.3em' fill='white' font-weight='bold'%3ERobot Voice%3C/text%3E%3C/svg%3E"
                      />
                    ) : (
                      <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-20 text-center border-8 border-dashed border-purple-400">
                        <Sparkles className="w-32 h-32 mx-auto text-purple-600 mb-8 animate-pulse" />
                        <p className="text-5xl font-black text-purple-700 mb-4">Generating Robot Video...</p>
                        <p className="text-3xl text-purple-600">Please wait 10–25 seconds</p>
                        <div className="mt-8 flex justify-center">
                          <div className="animate-spin rounded-full h-20 w-20 border-8 border-purple-600 border-t-transparent"></div>
                        </div>
                      </div>
                    )}
                    <p className="text-right text-lg text-gray-600 mt-8 font-medium">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');

    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        fetchMessages(user.username);
        setAuthView('');
      }
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
    setAuthView('');
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
    setAuthView('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map(r => r[0].transcript)
            .join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied. Please allow microphone in your browser settings.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
  };

  const sendMessageWithRoboticVoice = async () => {
    if (!transcript.trim()) {
      alert('No speech detected. Please speak clearly and wait for transcription.');
      return;
    }

    const recipient = recipientUsername.trim();
    if (!recipient) {
      alert('Recipient username is missing');
      return;
    }

    setLoading(true);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: transcript,
        audio_url: null,
        video_url: null
      })
      .select()
      .single();

    if (error) {
      alert('Failed to send message: ' + error.message);
      setLoading(false);
      return;
    }

    generateRoboticVideo(transcript, message.id);

    const utter = new SpeechSynthesisUtterance("Your anonymous robotic message has been sent!");
    utter.rate = 0.7;
    utter.pitch = 0.3;
    utter.volume = 0.9;
    utter.onend = () => {
      alert(`Robotic voice sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRecordingTime(0);
      setLoading(false);

      if (currentUser && recipient === currentUser.username) {
        setTimeout(() => fetchMessages(currentUser.username), 4000);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  const generateRoboticVideo = async (text, messageId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.7;
    utterance.pitch = 0.3;
    utterance.volume = 1;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    const videoStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const mimeType = 'video/webm;codecs=vp9,opus';
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const fileName = `robot-${messageId}-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error('Video upload failed:', uploadError);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('voices')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('messages')
        .update({ video_url: publicUrl })
        .eq('id', messageId);

      if (updateError) {
        console.error('Update failed:', updateError);
      } else if (currentUser) {
        fetchMessages(currentUser.username);
      }
    };

    recorder.start();

    const animate = () => {
      const intensity = Math.abs(Math.sin(Date.now() * 0.006)) * 0.8 + 0.3;

      const gradient = ctx.createLinearGradient(0, 0, 400, 400);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 100, 200, 200);

      const blink = Math.random() < 0.02;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(130, 150, 30, blink ? 5 : 30 + intensity * 15);
      ctx.fillRect(240, 150, 30, blink ? 5 : 30 + intensity * 15);

      const mouthW = 80 + intensity * 70;
      const mouthH = 15 + intensity * 40;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(200 - mouthW / 2, 240, mouthW, mouthH);

      const glow = ctx.createRadialGradient(200, 70, 0, 200, 70, 30 + intensity * 20);
      glow.addColorStop(0, '#a78bfa');
      glow.addColorStop(1, '#667eea');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(200, 70, 30 + intensity * 20, 0, Math.PI * 2);
      ctx.fill();

      if (recorder.state === 'recording') {
        requestAnimationFrame(animate);
      }
    };
    animate();

    utterance.onend = () => {
      setTimeout(() => recorder.stop(), 1500);
    };
    utterance.onerror = () => recorder.stop();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const copyLink = () => {
    const link = `${window.location.origin}?send_to=${currentUser.username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse">
            <Sparkles className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVox
          </h1>
          <p className="text-gray-600 text-lg mb-10 leading-relaxed">
            Send & receive anonymous voice messages<br />
            with <span className="font-bold text-purple-600">robotic avatar playback</span>
          </p>
          <div className="space-y-4">
            <button onClick={() => setAuthView('signup')} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-6 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition active:scale-95">
              Create Account
            </button>
            <button onClick={() => setAuthView('login')} className="w-full bg-gray-100 text-gray-800 py-6 rounded-2xl font-bold text-xl hover:bg-gray-200 transition active:scale-95">
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username (3-20 chars)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleSignup} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleLogin} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Logging In...' : 'Log In'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center">
            <h1 className="text-5xl font-black mb-6 bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
              Send to @{recipientUsername}
            </h1>
            <p className="text-gray-600 text-xl mb-10">Record your anonymous voice message</p>

            {!audioBlob ? (
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-72 h-72 rounded-full shadow-2xl flex items-center justify-center transition-all ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? <Square className="w-40 h-40 text-white" /> : <Mic className="w-40 h-40 text-white" />}
              </button>
            ) : (
              <div className="space-y-10">
                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-3xl p-12 shadow-xl">
                  <p className="text-3xl font-bold text-purple-800 mb-6">Ready to Send!</p>
                  <p className="text-2xl text-gray-700 leading-relaxed">"{transcript || 'Voice recorded successfully'}"</p>
                  <p className="text-sm text-gray-500 mt-4">Duration: {formatTime(recordingTime)}</p>
                </div>
                <div className="flex gap-6">
                  <button onClick={sendMessageWithRoboticVoice} disabled={loading} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-8 rounded-3xl font-black text-3xl hover:scale-105 transition disabled:opacity-70">
                    {loading ? 'Sending...' : 'Send as Robot'}
                  </button>
                  <button onClick={cancelRecording} className="flex-1 bg-gray-200 py-8 rounded-3xl font-black text-2xl hover:bg-gray-300 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="mt-12">
                <div className="text-7xl font-black text-red-500 mb-4">{formatTime(recordingTime)}</div>
                <p className="text-3xl text-gray-700">Recording... Tap to stop</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-10 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <User className="w-16 h-16" />
                <h1 className="text-5xl font-black">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-6">
                <button onClick={copyLink} className="bg-white/20 px-10 py-5 rounded-2xl hover:bg-white/30 flex items-center gap-4 text-2xl font-bold backdrop-blur">
                  {copied ? <Check className="w-10 h-10" /> : <Share2 className="w-10 h-10" />}
                  {copied ? 'Copied!' : 'Share Link'}
                </button>
                <button onClick={handleLogout} className="bg-white/20 p-5 rounded-2xl hover:bg-white/30 backdrop-blur">
                  <LogOut className="w-10 h-10" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-12">
            <h2 className="text-5xl font-black text-gray-800 mb-12 text-center">Your Robotic Voice Inbox</h2>

            {messages.length === 0 ? (
              <div className="text-center py-32 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-40 h-40 mx-auto text-gray-300 mb-10" />
                <p className="text-4xl font-black text-gray-600 mb-8">No messages yet</p>
                <p className="text-2xl text-purple-600 font-mono bg-white px-10 py-6 rounded-2xl inline-block shadow-2xl break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-10 shadow-2xl">
                    {msg.video_url ? (
                      <video
                        controls
                        src={msg.video_url}
                        className="w-full rounded-3xl shadow-2xl border-8 border-purple-300"
                        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23667eea' width='400' height='400'/%3E%3Ctext x='50%' y='50%' font-size='36' text-anchor='middle' dy='.3em' fill='white' font-weight='bold'%3ERobot Voice%3C/text%3E%3C/svg%3E"
                      />
                    ) : (
                      <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-20 text-center border-8 border-dashed border-purple-400">
                        <Sparkles className="w-32 h-32 mx-auto text-purple-600 mb-8 animate-pulse" />
                        <p className="text-5xl font-black text-purple-700 mb-4">Generating Robot Video...</p>
                        <p className="text-3xl text-purple-600">Please wait 10–25 seconds</p>
                        <div className="mt-8 flex justify-center">
                          <div className="animate-spin rounded-full h-20 w-20 border-8 border-purple-600 border-t-transparent"></div>
                        </div>
                      </div>
                    )}
                    <p className="text-right text-lg text-gray-600 mt-8 font-medium">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');

    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        fetchMessages(user.username);
        setAuthView('');
      }
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
    setAuthView('');
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
    setAuthView('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map(r => r[0].transcript)
            .join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied. Please allow microphone in your browser settings.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
  };

  const sendMessageWithRoboticVoice = async () => {
    if (!transcript.trim()) {
      alert('No speech detected. Please speak clearly and wait for transcription.');
      return;
    }

    const recipient = recipientUsername.trim();
    if (!recipient) {
      alert('Recipient username is missing');
      return;
    }

    setLoading(true);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: transcript,
        audio_url: null,
        video_url: null
      })
      .select()
      .single();

    if (error) {
      alert('Failed to send message: ' + error.message);
      setLoading(false);
      return;
    }

    generateRoboticVideo(transcript, message.id);

    const utter = new SpeechSynthesisUtterance("Your anonymous robotic message has been sent!");
    utter.rate = 0.7;
    utter.pitch = 0.3;
    utter.volume = 0.9;
    utter.onend = () => {
      alert(`Robotic voice sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRecordingTime(0);
      setLoading(false);

      if (currentUser && recipient === currentUser.username) {
        setTimeout(() => fetchMessages(currentUser.username), 4000);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  const generateRoboticVideo = async (text, messageId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.7;
    utterance.pitch = 0.3;
    utterance.volume = 1;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    const videoStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const mimeType = 'video/webm;codecs=vp9,opus';
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const fileName = `robot-${messageId}-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error('Video upload failed:', uploadError);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('voices')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('messages')
        .update({ video_url: publicUrl })
        .eq('id', messageId);

      if (updateError) {
        console.error('Update failed:', updateError);
      } else if (currentUser) {
        fetchMessages(currentUser.username);
      }
    };

    recorder.start();

    const animate = () => {
      const intensity = Math.abs(Math.sin(Date.now() * 0.006)) * 0.8 + 0.3;

      const gradient = ctx.createLinearGradient(0, 0, 400, 400);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 100, 200, 200);

      const blink = Math.random() < 0.02;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(130, 150, 30, blink ? 5 : 30 + intensity * 15);
      ctx.fillRect(240, 150, 30, blink ? 5 : 30 + intensity * 15);

      const mouthW = 80 + intensity * 70;
      const mouthH = 15 + intensity * 40;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(200 - mouthW / 2, 240, mouthW, mouthH);

      const glow = ctx.createRadialGradient(200, 70, 0, 200, 70, 30 + intensity * 20);
      glow.addColorStop(0, '#a78bfa');
      glow.addColorStop(1, '#667eea');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(200, 70, 30 + intensity * 20, 0, Math.PI * 2);
      ctx.fill();

      if (recorder.state === 'recording') {
        requestAnimationFrame(animate);
      }
    };
    animate();

    utterance.onend = () => {
      setTimeout(() => recorder.stop(), 1500);
    };
    utterance.onerror = () => recorder.stop();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const copyLink = () => {
    const link = `${window.location.origin}?send_to=${currentUser.username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse">
            <Sparkles className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVox
          </h1>
          <p className="text-gray-600 text-lg mb-10 leading-relaxed">
            Send & receive anonymous voice messages<br />
            with <span className="font-bold text-purple-600">robotic avatar playback</span>
          </p>
          <div className="space-y-4">
            <button onClick={() => setAuthView('signup')} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-6 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition active:scale-95">
              Create Account
            </button>
            <button onClick={() => setAuthView('login')} className="w-full bg-gray-100 text-gray-800 py-6 rounded-2xl font-bold text-xl hover:bg-gray-200 transition active:scale-95">
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username (3-20 chars)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleSignup} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleLogin} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Logging In...' : 'Log In'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center">
            <h1 className="text-5xl font-black mb-6 bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
              Send to @{recipientUsername}
            </h1>
            <p className="text-gray-600 text-xl mb-10">Record your anonymous voice message</p>

            {!audioBlob ? (
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-72 h-72 rounded-full shadow-2xl flex items-center justify-center transition-all ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? <Square className="w-40 h-40 text-white" /> : <Mic className="w-40 h-40 text-white" />}
              </button>
            ) : (
              <div className="space-y-10">
                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-3xl p-12 shadow-xl">
                  <p className="text-3xl font-bold text-purple-800 mb-6">Ready to Send!</p>
                  <p className="text-2xl text-gray-700 leading-relaxed">"{transcript || 'Voice recorded successfully'}"</p>
                  <p className="text-sm text-gray-500 mt-4">Duration: {formatTime(recordingTime)}</p>
                </div>
                <div className="flex gap-6">
                  <button onClick={sendMessageWithRoboticVoice} disabled={loading} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-8 rounded-3xl font-black text-3xl hover:scale-105 transition disabled:opacity-70">
                    {loading ? 'Sending...' : 'Send as Robot'}
                  </button>
                  <button onClick={cancelRecording} className="flex-1 bg-gray-200 py-8 rounded-3xl font-black text-2xl hover:bg-gray-300 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="mt-12">
                <div className="text-7xl font-black text-red-500 mb-4">{formatTime(recordingTime)}</div>
                <p className="text-3xl text-gray-700">Recording... Tap to stop</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-10 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <User className="w-16 h-16" />
                <h1 className="text-5xl font-black">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-6">
                <button onClick={copyLink} className="bg-white/20 px-10 py-5 rounded-2xl hover:bg-white/30 flex items-center gap-4 text-2xl font-bold backdrop-blur">
                  {copied ? <Check className="w-10 h-10" /> : <Share2 className="w-10 h-10" />}
                  {copied ? 'Copied!' : 'Share Link'}
                </button>
                <button onClick={handleLogout} className="bg-white/20 p-5 rounded-2xl hover:bg-white/30 backdrop-blur">
                  <LogOut className="w-10 h-10" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-12">
            <h2 className="text-5xl font-black text-gray-800 mb-12 text-center">Your Robotic Voice Inbox</h2>

            {messages.length === 0 ? (
              <div className="text-center py-32 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-40 h-40 mx-auto text-gray-300 mb-10" />
                <p className="text-4xl font-black text-gray-600 mb-8">No messages yet</p>
                <p className="text-2xl text-purple-600 font-mono bg-white px-10 py-6 rounded-2xl inline-block shadow-2xl break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-10 shadow-2xl">
                    {msg.video_url ? (
                      <video
                        controls
                        src={msg.video_url}
                        className="w-full rounded-3xl shadow-2xl border-8 border-purple-300"
                        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23667eea' width='400' height='400'/%3E%3Ctext x='50%' y='50%' font-size='36' text-anchor='middle' dy='.3em' fill='white' font-weight='bold'%3ERobot Voice%3C/text%3E%3C/svg%3E"
                      />
                    ) : (
                      <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-20 text-center border-8 border-dashed border-purple-400">
                        <Sparkles className="w-32 h-32 mx-auto text-purple-600 mb-8 animate-pulse" />
                        <p className="text-5xl font-black text-purple-700 mb-4">Generating Robot Video...</p>
                        <p className="text-3xl text-purple-600">Please wait 10–25 seconds</p>
                        <div className="mt-8 flex justify-center">
                          <div className="animate-spin rounded-full h-20 w-20 border-8 border-purple-600 border-t-transparent"></div>
                        </div>
                      </div>
                    )}
                    <p className="text-right text-lg text-gray-600 mt-8 font-medium">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');

    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        fetchMessages(user.username);
        setAuthView('');
      }
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
    setAuthView('');
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
    setAuthView('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map(r => r[0].transcript)
            .join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied. Please allow microphone in your browser settings.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
  };

  const sendMessageWithRoboticVoice = async () => {
    if (!transcript.trim()) {
      alert('No speech detected. Please speak clearly and wait for transcription.');
      return;
    }

    const recipient = recipientUsername.trim();
    if (!recipient) {
      alert('Recipient username is missing');
      return;
    }

    setLoading(true);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: transcript,
        audio_url: null,
        video_url: null
      })
      .select()
      .single();

    if (error) {
      alert('Failed to send message: ' + error.message);
      setLoading(false);
      return;
    }

    generateRoboticVideo(transcript, message.id);

    const utter = new SpeechSynthesisUtterance("Your anonymous robotic message has been sent!");
    utter.rate = 0.7;
    utter.pitch = 0.3;
    utter.volume = 0.9;
    utter.onend = () => {
      alert(`Robotic voice sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRecordingTime(0);
      setLoading(false);

      if (currentUser && recipient === currentUser.username) {
        setTimeout(() => fetchMessages(currentUser.username), 4000);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  const generateRoboticVideo = async (text, messageId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.7;
    utterance.pitch = 0.3;
    utterance.volume = 1;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    const videoStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const mimeType = 'video/webm;codecs=vp9,opus';
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const fileName = `robot-${messageId}-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error('Video upload failed:', uploadError);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('voices')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('messages')
        .update({ video_url: publicUrl })
        .eq('id', messageId);

      if (updateError) {
        console.error('Update failed:', updateError);
      } else if (currentUser) {
        fetchMessages(currentUser.username);
      }
    };

    recorder.start();

    const animate = () => {
      const intensity = Math.abs(Math.sin(Date.now() * 0.006)) * 0.8 + 0.3;

      const gradient = ctx.createLinearGradient(0, 0, 400, 400);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 100, 200, 200);

      const blink = Math.random() < 0.02;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(130, 150, 30, blink ? 5 : 30 + intensity * 15);
      ctx.fillRect(240, 150, 30, blink ? 5 : 30 + intensity * 15);

      const mouthW = 80 + intensity * 70;
      const mouthH = 15 + intensity * 40;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(200 - mouthW / 2, 240, mouthW, mouthH);

      const glow = ctx.createRadialGradient(200, 70, 0, 200, 70, 30 + intensity * 20);
      glow.addColorStop(0, '#a78bfa');
      glow.addColorStop(1, '#667eea');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(200, 70, 30 + intensity * 20, 0, Math.PI * 2);
      ctx.fill();

      if (recorder.state === 'recording') {
        requestAnimationFrame(animate);
      }
    };
    animate();

    utterance.onend = () => {
      setTimeout(() => recorder.stop(), 1500);
    };
    utterance.onerror = () => recorder.stop();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const copyLink = () => {
    const link = `${window.location.origin}?send_to=${currentUser.username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse">
            <Sparkles className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVox
          </h1>
          <p className="text-gray-600 text-lg mb-10 leading-relaxed">
            Send & receive anonymous voice messages<br />
            with <span className="font-bold text-purple-600">robotic avatar playback</span>
          </p>
          <div className="space-y-4">
            <button onClick={() => setAuthView('signup')} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-6 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition active:scale-95">
              Create Account
            </button>
            <button onClick={() => setAuthView('login')} className="w-full bg-gray-100 text-gray-800 py-6 rounded-2xl font-bold text-xl hover:bg-gray-200 transition active:scale-95">
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username (3-20 chars)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleSignup} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleLogin} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Logging In...' : 'Log In'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center">
            <h1 className="text-5xl font-black mb-6 bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
              Send to @{recipientUsername}
            </h1>
            <p className="text-gray-600 text-xl mb-10">Record your anonymous voice message</p>

            {!audioBlob ? (
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-72 h-72 rounded-full shadow-2xl flex items-center justify-center transition-all ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? <Square className="w-40 h-40 text-white" /> : <Mic className="w-40 h-40 text-white" />}
              </button>
            ) : (
              <div className="space-y-10">
                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-3xl p-12 shadow-xl">
                  <p className="text-3xl font-bold text-purple-800 mb-6">Ready to Send!</p>
                  <p className="text-2xl text-gray-700 leading-relaxed">"{transcript || 'Voice recorded successfully'}"</p>
                  <p className="text-sm text-gray-500 mt-4">Duration: {formatTime(recordingTime)}</p>
                </div>
                <div className="flex gap-6">
                  <button onClick={sendMessageWithRoboticVoice} disabled={loading} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-8 rounded-3xl font-black text-3xl hover:scale-105 transition disabled:opacity-70">
                    {loading ? 'Sending...' : 'Send as Robot'}
                  </button>
                  <button onClick={cancelRecording} className="flex-1 bg-gray-200 py-8 rounded-3xl font-black text-2xl hover:bg-gray-300 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="mt-12">
                <div className="text-7xl font-black text-red-500 mb-4">{formatTime(recordingTime)}</div>
                <p className="text-3xl text-gray-700">Recording... Tap to stop</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-10 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <User className="w-16 h-16" />
                <h1 className="text-5xl font-black">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-6">
                <button onClick={copyLink} className="bg-white/20 px-10 py-5 rounded-2xl hover:bg-white/30 flex items-center gap-4 text-2xl font-bold backdrop-blur">
                  {copied ? <Check className="w-10 h-10" /> : <Share2 className="w-10 h-10" />}
                  {copied ? 'Copied!' : 'Share Link'}
                </button>
                <button onClick={handleLogout} className="bg-white/20 p-5 rounded-2xl hover:bg-white/30 backdrop-blur">
                  <LogOut className="w-10 h-10" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-12">
            <h2 className="text-5xl font-black text-gray-800 mb-12 text-center">Your Robotic Voice Inbox</h2>

            {messages.length === 0 ? (
              <div className="text-center py-32 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-40 h-40 mx-auto text-gray-300 mb-10" />
                <p className="text-4xl font-black text-gray-600 mb-8">No messages yet</p>
                <p className="text-2xl text-purple-600 font-mono bg-white px-10 py-6 rounded-2xl inline-block shadow-2xl break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-10 shadow-2xl">
                    {msg.video_url ? (
                      <video
                        controls
                        src={msg.video_url}
                        className="w-full rounded-3xl shadow-2xl border-8 border-purple-300"
                        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23667eea' width='400' height='400'/%3E%3Ctext x='50%' y='50%' font-size='36' text-anchor='middle' dy='.3em' fill='white' font-weight='bold'%3ERobot Voice%3C/text%3E%3C/svg%3E"
                      />
                    ) : (
                      <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-20 text-center border-8 border-dashed border-purple-400">
                        <Sparkles className="w-32 h-32 mx-auto text-purple-600 mb-8 animate-pulse" />
                        <p className="text-5xl font-black text-purple-700 mb-4">Generating Robot Video...</p>
                        <p className="text-3xl text-purple-600">Please wait 10–25 seconds</p>
                        <div className="mt-8 flex justify-center">
                          <div className="animate-spin rounded-full h-20 w-20 border-8 border-purple-600 border-t-transparent"></div>
                        </div>
                      </div>
                    )}
                    <p className="text-right text-lg text-gray-600 mt-8 font-medium">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');

    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        fetchMessages(user.username);
        setAuthView('');
      }
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
    setAuthView('');
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
    setAuthView('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map(r => r[0].transcript)
            .join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied. Please allow microphone in your browser settings.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
  };

  const sendMessageWithRoboticVoice = async () => {
    if (!transcript.trim()) {
      alert('No speech detected. Please speak clearly and wait for transcription.');
      return;
    }

    const recipient = recipientUsername.trim();
    if (!recipient) {
      alert('Recipient username is missing');
      return;
    }

    setLoading(true);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: transcript,
        audio_url: null,
        video_url: null
      })
      .select()
      .single();

    if (error) {
      alert('Failed to send message: ' + error.message);
      setLoading(false);
      return;
    }

    generateRoboticVideo(transcript, message.id);

    const utter = new SpeechSynthesisUtterance("Your anonymous robotic message has been sent!");
    utter.rate = 0.7;
    utter.pitch = 0.3;
    utter.volume = 0.9;
    utter.onend = () => {
      alert(`Robotic voice sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRecordingTime(0);
      setLoading(false);

      if (currentUser && recipient === currentUser.username) {
        setTimeout(() => fetchMessages(currentUser.username), 4000);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  const generateRoboticVideo = async (text, messageId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.7;
    utterance.pitch = 0.3;
    utterance.volume = 1;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    const videoStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const mimeType = 'video/webm;codecs=vp9,opus';
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const fileName = `robot-${messageId}-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error('Video upload failed:', uploadError);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('voices')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('messages')
        .update({ video_url: publicUrl })
        .eq('id', messageId);

      if (updateError) {
        console.error('Update failed:', updateError);
      } else if (currentUser) {
        fetchMessages(currentUser.username);
      }
    };

    recorder.start();

    const animate = () => {
      const intensity = Math.abs(Math.sin(Date.now() * 0.006)) * 0.8 + 0.3;

      const gradient = ctx.createLinearGradient(0, 0, 400, 400);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 100, 200, 200);

      const blink = Math.random() < 0.02;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(130, 150, 30, blink ? 5 : 30 + intensity * 15);
      ctx.fillRect(240, 150, 30, blink ? 5 : 30 + intensity * 15);

      const mouthW = 80 + intensity * 70;
      const mouthH = 15 + intensity * 40;
      ctx.fillStyle = '#667eea';
      ctx.fillRect(200 - mouthW / 2, 240, mouthW, mouthH);

      const glow = ctx.createRadialGradient(200, 70, 0, 200, 70, 30 + intensity * 20);
      glow.addColorStop(0, '#a78bfa');
      glow.addColorStop(1, '#667eea');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(200, 70, 30 + intensity * 20, 0, Math.PI * 2);
      ctx.fill();

      if (recorder.state === 'recording') {
        requestAnimationFrame(animate);
      }
    };
    animate();

    utterance.onend = () => {
      setTimeout(() => recorder.stop(), 1500);
    };
    utterance.onerror = () => recorder.stop();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const copyLink = () => {
    const link = `${window.location.origin}?send_to=${currentUser.username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse">
            <Sparkles className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVox
          </h1>
          <p className="text-gray-600 text-lg mb-10 leading-relaxed">
            Send & receive anonymous voice messages<br />
            with <span className="font-bold text-purple-600">robotic avatar playback</span>
          </p>
          <div className="space-y-4">
            <button onClick={() => setAuthView('signup')} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-6 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition active:scale-95">
              Create Account
            </button>
            <button onClick={() => setAuthView('login')} className="w-full bg-gray-100 text-gray-800 py-6 rounded-2xl font-bold text-xl hover:bg-gray-200 transition active:scale-95">
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username (3-20 chars)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6)" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleSignup} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (!currentUser && authView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-8 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 focus:border-purple-500 outline-none mb-4 text-lg" />
          {error && <p className="text-red-500 text-center mb-4 font-medium">{error}</p>}
          <button onClick={handleLogin} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl disabled:opacity-70">
            {loading ? 'Logging In...' : 'Log In'}
          </button>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-4 text-gray-600 hover:text-gray-800">← Back</button>
        </div>
      </div>
    );
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center">
            <h1 className="text-5xl font-black mb-6 bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
              Send to @{recipientUsername}
            </h1>
            <p className="text-gray-600 text-xl mb-10">Record your anonymous voice message</p>

            {!audioBlob ? (
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-72 h-72 rounded-full shadow-2xl flex items-center justify-center transition-all ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? <Square className="w-40 h-40 text-white" /> : <Mic className="w-40 h-40 text-white" />}
              </button>
            ) : (
              <div className="space-y-10">
                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-3xl p-12 shadow-xl">
                  <p className="text-3xl font-bold text-purple-800 mb-6">Ready to Send!</p>
                  <p className="text-2xl text-gray-700 leading-relaxed">"{transcript || 'Voice recorded successfully'}"</p>
                  <p className="text-sm text-gray-500 mt-4">Duration: {formatTime(recordingTime)}</p>
                </div>
                <div className="flex gap-6">
                  <button onClick={sendMessageWithRoboticVoice} disabled={loading} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-8 rounded-3xl font-black text-3xl hover:scale-105 transition disabled:opacity-70">
                    {loading ? 'Sending...' : 'Send as Robot'}
                  </button>
                  <button onClick={cancelRecording} className="flex-1 bg-gray-200 py-8 rounded-3xl font-black text-2xl hover:bg-gray-300 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="mt-12">
                <div className="text-7xl font-black text-red-500 mb-4">{formatTime(recordingTime)}</div>
                <p className="text-3xl text-gray-700">Recording... Tap to stop</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-10 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <User className="w-16 h-16" />
                <h1 className="text-5xl font-black">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-6">
                <button onClick={copyLink} className="bg-white/20 px-10 py-5 rounded-2xl hover:bg-white/30 flex items-center gap-4 text-2xl font-bold backdrop-blur">
                  {copied ? <Check className="w-10 h-10" /> : <Share2 className="w-10 h-10" />}
                  {copied ? 'Copied!' : 'Share Link'}
                </button>
                <button onClick={handleLogout} className="bg-white/20 p-5 rounded-2xl hover:bg-white/30 backdrop-blur">
                  <LogOut className="w-10 h-10" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-12">
            <h2 className="text-5xl font-black text-gray-800 mb-12 text-center">Your Robotic Voice Inbox</h2>

            {messages.length === 0 ? (
              <div className="text-center py-32 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-40 h-40 mx-auto text-gray-300 mb-10" />
                <p className="text-4xl font-black text-gray-600 mb-8">No messages yet</p>
                <p className="text-2xl text-purple-600 font-mono bg-white px-10 py-6 rounded-2xl inline-block shadow-2xl break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-10 shadow-2xl">
                    {msg.video_url ? (
                      <video
                        controls
                        src={msg.video_url}
                        className="w-full rounded-3xl shadow-2xl border-8 border-purple-300"
                        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23667eea' width='400' height='400'/%3E%3Ctext x='50%' y='50%' font-size='36' text-anchor='middle' dy='.3em' fill='white' font-weight='bold'%3ERobot Voice%3C/text%3E%3C/svg%3E"
                      />
                    ) : (
                      <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-20 text-center border-8 border-dashed border-purple-400">
                        <Sparkles className="w-32 h-32 mx-auto text-purple-600 mb-8 animate-pulse" />
                        <p className="text-5xl font-black text-purple-700 mb-4">Generating Robot Video...</p>
                        <p className="text-3xl text-purple-600">Please wait 10–25 seconds</p>
                        <div className="mt-8 flex justify-center">
                          <div className="animate-spin rounded-full h-20 w-20 border-8 border-purple-600 border-t-transparent"></div>
                        </div>
                      </div>
                    )}
                    <p className="text-right text-lg text-gray-600 mt-8 font-medium">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
