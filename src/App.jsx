import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ==================== SUPABASE CONFIG ====================
const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==================== MAIN APP COMPONENT ====================
export default function AnonymousVoiceApp() {
  // ==================== STATE ====================
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
  const [isPlaying, setIsPlaying] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [generatingVideo, setGeneratingVideo] = useState(null);

  // ==================== REFS ====================
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const animationFrameRef = useRef(null);

  // ==================== INITIAL LOAD ====================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');

    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          fetchMessages(user.username);
          setAuthView('');
        } catch (e) {
          localStorage.removeItem('anon-voice-user');
        }
      }
    }
  }, []);

  // ==================== FETCH MESSAGES ====================
  const fetchMessages = async (user) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('username', user)
        .order('created_at', { ascending: false });
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch messages error:', err);
    }
  };

  // ==================== AUTH HANDLERS ====================
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

    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) {
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
    setRecipientUsername('');
  };

  // ==================== RECORDING LOGIC ====================
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
      alert('Microphone access denied. Please allow microphone permission.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setTimeout(async () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setLoading(true);
          const text = await transcribeAudioWithAssemblyAI(blob);
          if (text) setTranscript(text);
          setLoading(false);
        }
      }, 300);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const cancelRecording = () => {
    if (isRecording) stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  // ==================== ASSEMBLYAI TRANSCRIPTION ====================
  const transcribeAudioWithAssemblyAI = async (audioBlob) => {
    try {
      const ASSEMBLY_AI_API_KEY = 'e923129f7dec495081e757c6fe82ea8b';
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY },
        body: audioBlob,
      });
      const uploadData = await uploadResponse.json();
      const audioUrl = uploadData.upload_url;

      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLY_AI_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ audio_url: audioUrl }),
      });
      const transcriptData = await transcriptResponse.json();
      const transcriptId = transcriptData.id;

      const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollingResponse = await fetch(pollingEndpoint, {
          headers: { 'authorization': ASSEMBLY_AI_API_KEY },
        });
        const result = await pollingResponse.json();

        if (result.status === 'completed') return result.text;
        if (result.status === 'error') throw new Error(result.error);
      }
      return null;
    } catch (error) {
      console.error('AssemblyAI error:', error);
      return null;
    }
  };

  // ==================== SEND MESSAGE ====================
  const sendMessageWithRoboticVoice = async () => {
    if (!audioBlob) {
      alert('Please record a voice message first');
      return;
    }
    const recipient = recipientUsername.trim();
    if (!recipient) {
      alert('Please enter a recipient username');
      return;
    }

    setLoading(true);
    let savedAudioUrl = null;

    if (audioBlob) {
      const fileName = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, audioBlob, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        alert('Upload failed: ' + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);
      savedAudioUrl = publicUrl;
    }

    const messageText = transcript || '[Voice message]';

    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: messageText,
        audio_url: savedAudioUrl,
      });

    if (insertError) {
      alert('Send failed: ' + insertError.message);
      setLoading(false);
      return;
    }

    if (transcript) {
      const utterance = new SpeechSynthesisUtterance(transcript);
      utterance.rate = 0.7;
      utterance.pitch = 0.3;
      utterance.volume = 0.9;
      utterance.onend = () => {
        alert(`Anonymous robotic voice sent to @${recipient}!`);
        setAudioBlob(null);
        setAudioUrl(null);
        setTranscript('');
        setRecordingTime(0);
        if (currentUser && recipient === currentUser.username) {
          fetchMessages(currentUser.username);
        }
        setLoading(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      alert(`Voice sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRecordingTime(0);
      if (currentUser && recipient === currentUser.username) {
        fetchMessages(currentUser.username);
      }
      setLoading(false);
    }
  };

  // ==================== FIXED: GENERATE AVATAR VIDEO WITH SOUND ====================
  const generateAvatarVideo = async (text, messageId) => {
    setGeneratingVideo(messageId);

    try {
      const message = messages.find(m => m.id === messageId);
      if (!message || !message.audio_url) {
        alert('Original audio not found.');
        setGeneratingVideo(null);
        return;
      }

      const audioResponse = await fetch(message.audio_url);
      const audioBlob = await audioResponse.blob();
      const audioElement = document.createElement('audio');
      const audioUrl = URL.createObjectURL(audioBlob);
      audioElement.src = audioUrl;

      await new Promise((resolve, reject) => {
        audioElement.onloadedmetadata = resolve;
        audioElement.onerror = reject;
      });

      const audioDuration = audioElement.duration || 10;
      const totalFrames = Math.ceil(audioDuration * 30);

      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      const videoStream = canvas.captureStream(30);

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(audioElement);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const mimeType = 'video/webm;codecs=vp8,opus';
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const fileName = `avatar-${messageId}-${Date.now()}.webm`;
          const { error: uploadError } = await supabase.storage
            .from('voices')
            .upload(fileName, blob, { contentType: mimeType });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);

          await supabase
            .from('messages')
            .update({ video_url: publicUrl })
            .eq('id', messageId);

          if (currentUser) fetchMessages(currentUser.username);
          URL.revokeObjectURL(audioUrl);
          setGeneratingVideo(null);
        } catch (err) {
          console.error(err);
          alert('Video upload failed');
          setGeneratingVideo(null);
        }
      };

      mediaRecorder.start(100);

      // CRITICAL FIX: Delay play to ensure audio track is active in recorder
      setTimeout(() => {
        audioElement.play().catch(() => console.log('Play blocked'));

        let frame = 0;
        const animate = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const intensity = Math.min(avg / 60, 1);

          const gradient = ctx.createLinearGradient(0, 0, 400, 400);
          gradient.addColorStop(0, '#667eea');
          gradient.addColorStop(1, '#764ba2');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 400, 400);

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(100, 100, 200, 200);

          const eyeHeight = (Math.floor(frame / 15) % 20 === 0) ? 5 : 20 + intensity * 10;
          ctx.fillStyle = '#667eea';
          ctx.fillRect(130, 150, 30, eyeHeight);
          ctx.fillRect(240, 150, 30, eyeHeight);

          if (avg > 15) {
            const w = 80 + intensity * 50;
            const h = 10 + intensity * 40;
            ctx.fillRect(200 - w/2, 230, w, h);
          } else {
            ctx.fillRect(160, 240, 80, 8);
          }

          const glow = ctx.createRadialGradient(200, 70, 0, 200, 70, 20 + intensity * 15);
          glow.addColorStop(0, '#a78bfa');
          glow.addColorStop(1, '#667eea');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(200, 70, 20 + intensity * 15, 0, Math.PI * 2);
          ctx.fill();

          frame++;
          if (frame < totalFrames && !audioElement.ended) {
            animationFrameRef.current = requestAnimationFrame(animate);
          } else {
            setTimeout(() => mediaRecorder.stop(), 500);
          }
        };

        animate();
      }, 250);

      audioElement.onended = () => {
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') mediaRecorder.stop();
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }, 500);
      };

    } catch (error) {
      console.error('Video generation failed:', error);
      alert('Failed to generate video');
      setGeneratingVideo(null);
    }
  };

  // ==================== UTILITIES ====================
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ==================== RENDER: LANDING ====================
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
            with <span className="font-bold text-purple-600">robotic playback</span>
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

  // ==================== RENDER: SIGNUP ====================
  if (!currentUser && authView === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-2 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <p className="text-gray-500 text-center mb-8">Get your anonymous voice inbox</p>
          <div className="space-y-6">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a unique username" className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg" />
            {error && <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>}
            <button onClick={handleSignup} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition disabled:opacity-70">
              {loading ? 'Creating...' : 'Sign Up'}
            </button>
          </div>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-6 text-gray-600 hover:text-gray-800 font-medium">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ==================== RENDER: LOGIN ====================
  if (!currentUser && authView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full">
          <h2 className="text-4xl font-black mb-2 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <p className="text-gray-500 text-center mb-8">Log in to your voice inbox</p>
          <div className="space-y-6">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your username" className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg" />
            {error && <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>}
            <button onClick={handleLogin} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition disabled:opacity-70">
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
          <button onClick={() => { setAuthView('landing'); setError(''); }} className="w-full mt-6 text-gray-600 hover:text-gray-800 font-medium">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ==================== RENDER: ANONYMOUS SEND ====================
  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden p-10">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Send to @{recipientUsername}
              </h1>
              <p className="text-gray-600 text-lg">Record an anonymous voice note</p>
            </div>

            {!audioBlob ? (
              <div className="text-center">
                <button
                  onClick={toggleRecording}
                  disabled={loading}
                  className={`w-56 h-56 rounded-full shadow-2xl mx-auto flex items-center justify-center transition-all ${
                    isRecording ? 'bg-red-500 animate-pulse' : loading ? 'bg-gray-400' : 'bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-105 active:scale-95'
                  }`}
                >
                  {loading ? (
                    <div className="text-white text-center">
                      <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-white mx-auto mb-2"></div>
                      <p className="text-sm">Transcribing...</p>
                    </div>
                  ) : isRecording ? (
                    <Square className="w-28 h-28 text-white" />
                  ) : (
                    <Mic className="w-28 h-28 text-white" />
                  )}
                </button>

                {isRecording && (
                  <div className="mt-6 text-center">
                    <div className="text-4xl font-bold text-red-500 mb-2">{formatTime(recordingTime)}</div>
                    <p className="text-xl text-gray-700 font-medium">Recording... Tap to stop</p>
                  </div>
                )}

                {!isRecording && !loading && (
                  <p className="mt-8 text-2xl text-gray-700 font-medium">Tap to start recording</p>
                )}
              </div>
            ) : (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                <div className="bg-white rounded-xl p-6 mb-6 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse">
                      <Mic className="w-10 h-10 text-white" />
                    </div>
                    <p className="text-gray-600 font-medium">Voice recorded - Ready to send</p>
                    <p className="text-sm text-gray-400 mt-2">{formatTime(recordingTime)}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={sendMessageWithRoboticVoice}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 hover:scale-105 transition"
                  >
                    <Send className="w-7 h-7" />
                    {loading ? 'Sending…' : 'Send as Robotic Voice'}
                  </button>
                  <button
                    onClick={cancelRecording}
                    className="w-full bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition"
                  >
                    <Trash2 className="w-6 h-6" />
                    Discard & Re-record
                  </button>
                </div>
              </div>
            )}

            <div className="text-center mt-8">
              <button onClick={() => setAuthView('signup')} className="text-purple-600 hover:text-purple-700 font-medium">
                Want your own inbox? Create an account →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER: INBOX ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8" />
                <h1 className="text-4xl font-bold">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-3">
                <button onClick={copyLink} className="flex items-center gap-2 bg-white/20 px-5 py-3 rounded-xl hover:bg-white/30 transition">
                  {copied ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
                  <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
                </button>
                <button onClick={handleLogout} className="bg-white/20 px-5 py-3 rounded-xl hover:bg-white/30 transition">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-10">
            <h2 className="text-3xl font-bold text-gray-800 mb-8">Your Anonymous Voice Inbox</h2>

            {messages.length === 0 ? (
              <div className="text-center py-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-24 h-24 text-gray-300 mx-auto mb-6" />
                <p className="text-2xl mb-4 text-gray-600 font-medium">No messages yet</p>
                <p className="text-gray-500 mb-6">Share your link to receive voice notes:</p>
                <div className="bg-white px-6 py-4 rounded-xl inline-block shadow-md">
                  <p className="font-mono text-purple-600 font-bold break-all">
                    {window.location.origin}?send_to={currentUser.username}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                    {msg.video_url ? (
                      <video controls src={msg.video_url} className="w-full rounded-xl shadow-md mb-6" />
                    ) : (
                      <div className="bg-white rounded-xl p-6 mb-6 flex justify-center">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                            <Mic className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-gray-500 text-sm mt-2">Anonymous Voice Message</p>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                      <div className="flex gap-2">
                        {!msg.video_url && msg.text && (
                          <button
                            onClick={() => generateAvatarVideo(msg.text, msg.id)}
                            disabled={generatingVideo === msg.id}
                            className="bg-gradient-to-r from-green-500 to-teal-500 text-white px-5 py-3 rounded-xl flex items-center gap-2 hover:scale-105 transition font-bold"
                          >
                            {generatingVideo === msg.id ? 'Creating...' : 'Generate Video'}
                            <Sparkles className="w-4 h-4" />
                          </button>
                        )}
                        {msg.text && (
                          <button
                            onClick={() => playRobotic(msg.text, msg.id)}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-5 py-3 rounded-xl flex items-center gap-2 hover:scale-105 transition font-bold"
                          >
                            <Play className="w-4 h-4" />
                            Play
                          </button>
                        )}
                      </div>
                    </div>
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
