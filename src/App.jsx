import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Put your own keys here
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
  const [view, setView] = useState('create');
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [generatingVideo, setGeneratingVideo] = useState(null);
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
    setView('create');
    setAuthView('landing');
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
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
      setRecordingTime(0);
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
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
      alert('Microphone access denied. Please enable microphone permissions.');
    }
  };

  const transcribeAudioWithAssemblyAI = async (audioBlob) => {
    try {
      const ASSEMBLY_AI_API_KEY = 'e923129f7dec495081e757c6fe82ea8b';
     
      // Step 1: Upload audio to AssemblyAI
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLY_AI_API_KEY,
        },
        body: audioBlob,
      });
     
      const uploadData = await uploadResponse.json();
      const audioUrl = uploadData.upload_url;
     
      // Step 2: Request transcription
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLY_AI_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
        }),
      });
     
      const transcriptData = await transcriptResponse.json();
      const transcriptId = transcriptData.id;
     
      // Step 3: Poll for transcription result
      const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;
     
      while (true) {
        const pollingResponse = await fetch(pollingEndpoint, {
          headers: {
            'authorization': ASSEMBLY_AI_API_KEY,
          },
        });
       
        const result = await pollingResponse.json();
       
        if (result.status === 'completed') {
          return result.text;
        } else if (result.status === 'error') {
          throw new Error('Transcription failed: ' + result.error);
        } else {
          // Wait 3 seconds before polling again
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    } catch (error) {
      console.error('AssemblyAI transcription error:', error);
      return null;
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
     
      // Stop browser speech recognition
      if (recognitionRef.current) recognitionRef.current.stop();
     
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
     
      // Wait for audio blob to be created, then transcribe with AssemblyAI
      setTimeout(async () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
         
          // Show loading indicator
          setLoading(true);
         
          // Try AssemblyAI transcription
          const transcribedText = await transcribeAudioWithAssemblyAI(blob);
         
          if (transcribedText) {
            setTranscript(transcribedText);
          }
         
          setLoading(false);
        }
      }, 100);
    }
  };

  const cancelRecording = () => {
    if (isRecording) {
      stopRecording();
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
  };

  // FIXED VERSION — uploads audio and saves real audio_url
  const sendMessageWithRoboticVoice = async () => {
    if (!transcript && !audioBlob) {
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

    // Upload audio if we have a blob
    if (audioBlob) {
      const fileName = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, audioBlob, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Failed to upload audio: ' + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('voices')
        .getPublicUrl(fileName);

      savedAudioUrl = publicUrl;
    }

    const messageText = transcript || '[Voice message - transcription unavailable]';

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

    // Preview robotic voice for sender
    if (transcript) {
      window.speechSynthesis.cancel();
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
      alert(`Anonymous voice sent to @${recipient}!`);
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

  const generateAvatarVideo = async (text, messageId) => {
    setGeneratingVideo(messageId);
   
    try {
      const message = messages.find(m => m.id === messageId);
     
      if (!message || !message.audio_url) {
        alert('Original audio not found. Cannot generate video.');
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
     
      const audioDuration = audioElement.duration;
      const totalFrames = Math.ceil(audioDuration * 30);

      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
     
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audioElement);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);
     
      const videoStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);
     
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp8,opus'
      });
      const chunks = [];
     
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
     
      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: 'video/webm' });
         
          const fileName = `avatar-${messageId}-${Date.now()}.webm`;
          const { error: uploadError } = await supabase.storage
            .from('voices')
            .upload(fileName, blob, { contentType: 'video/webm', upsert: false });
         
          if (uploadError) {
            console.error('Upload error:', uploadError);
            alert('Failed to upload video: ' + uploadError.message);
            setGeneratingVideo(null);
            return;
          }
         
          const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);
         
          const { error: updateError } = await supabase
            .from('messages')
            .update({ video_url: publicUrl })
            .eq('id', messageId);
         
          if (updateError) {
            console.error('Update error:', updateError);
          }
         
          if (currentUser) {
            await fetchMessages(currentUser.username);
          }
         
          URL.revokeObjectURL(audioUrl);
          setGeneratingVideo(null);
        } catch (err) {
          console.error('Error in onstop:', err);
          setGeneratingVideo(null);
          alert('Failed to process video: ' + err.message);
        }
      };
     
      mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setGeneratingVideo(null);
        alert('Recording error occurred');
      };
     
      const analyser = audioCtx.createAnalyser();
      source.connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
     
      mediaRecorder.start(100);
      audioElement.play();
     
      let frame = 0;
      let animationId = null;
     
      const animate = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const isSpeaking = average > 10;
        const intensity = Math.min(average / 50, 1);
       
        const gradient = ctx.createLinearGradient(0, 0, 400, 400);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 400);
       
        const time = frame / 30;
       
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
       
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(100, 100, 200, 200);
       
        ctx.shadowColor = 'transparent';
       
        const shouldBlink = Math.floor(time * 2) % 10 === 0 && (time % 0.5) < 0.1;
        const eyeHeight = shouldBlink ? 5 : 20 + intensity * 5;
       
        ctx.fillStyle = '#667eea';
        ctx.fillRect(130, 150, 30, eyeHeight);
        ctx.fillRect(240, 150, 30, eyeHeight);
       
        if (isSpeaking) {
          const mouthWidth = 100 + intensity * 30;
          const mouthHeight = 5 + intensity * 30;
          ctx.fillStyle = '#667eea';
          ctx.fillRect(200 - mouthWidth/2, 230, mouthWidth, mouthHeight);
        } else {
          ctx.fillStyle = '#667eea';
          ctx.fillRect(160, 240, 80, 8);
        }
       
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(195, 80, 10, 30);
       
        const glowSize = 15 + intensity * 8;
        const glowGradient = ctx.createRadialGradient(200, 70, 0, 200, 70, glowSize);
        glowGradient.addColorStop(0, '#ffffff');
        glowGradient.addColorStop(0.5, '#a78bfa');
        glowGradient.addColorStop(1, '#667eea');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(200, 70, glowSize, 0, Math.PI * 2);
        ctx.fill();
       
        frame++;
       
        if (frame < totalFrames && !audioElement.ended) {
          animationId = requestAnimationFrame(animate);
        } else {
          setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
            audioCtx.close();
          }, 500);
        }
      };
     
      animate();
     
      audioElement.onended = () => {
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          if (animationId) {
            cancelAnimationFrame(animationId);
          }
          audioCtx.close();
        }, 500);
      };
     
    } catch (error) {
      console.error('Video generation error:', error);
      setGeneratingVideo(null);
      alert('Failed to generate video: ' + error.message);
    }
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ════════════════════════════════════════ LANDING PAGE ════════════════════════════════════════
  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center">
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full mx-auto mb-6 sm:mb-8 flex items-center justify-center animate-pulse">
            <Sparkles className="w-12 h-12 sm:w-16 sm:h-16 text-white" />
          </div>
          <h1 className="text-5xl sm:text-6xl font-black mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVox
          </h1>
          <p className="text-gray-600 text-base sm:text-lg mb-8 sm:mb-10 leading-relaxed">
            Send & receive anonymous voice messages<br />
            with <span className="font-bold text-purple-600">robotic playback</span>
          </p>
          <div className="space-y-3 sm:space-y-4">
            <button
              onClick={() => setAuthView('signup')}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 sm:py-6 rounded-2xl font-bold text-lg sm:text-xl shadow-xl hover:scale-105 transition-transform active:scale-95"
            >
              Create Account
            </button>
            <button
              onClick={() => setAuthView('login')}
              className="w-full bg-gray-100 text-gray-800 py-4 sm:py-6 rounded-2xl font-bold text-lg sm:text-xl hover:bg-gray-200 transition active:scale-95"
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full">
          <h2 className="text-3xl sm:text-4xl font-black mb-2 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Create Account
          </h2>
          <p className="text-gray-500 text-center mb-6 sm:mb-8">Get your anonymous voice inbox</p>
         
          <div className="space-y-4 sm:space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleSignup)}
                placeholder="Choose a unique username"
                className="w-full px-4 sm:px-6 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-base sm:text-lg"
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
                className="w-full px-4 sm:px-6 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-base sm:text-lg"
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
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 sm:py-5 rounded-2xl font-bold text-lg sm:text-xl shadow-xl hover:scale-105 transition-transform disabled:opacity-70 disabled:scale-100 active:scale-95"
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full">
          <h2 className="text-3xl sm:text-4xl font-black mb-2 text-center bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <p className="text-gray-500 text-center mb-6 sm:mb-8">Log in to your voice inbox</p>
         
          <div className="space-y-4 sm:space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleLogin)}
                placeholder="Your username"
                className="w-full px-4 sm:px-6 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-base sm:text-lg"
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
                className="w-full px-4 sm:px-6 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-base sm:text-lg"
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
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 sm:py-5 rounded-2xl font-bold text-lg sm:text-xl shadow-xl hover:scale-105 transition-transform disabled:opacity-70 disabled:scale-100 active:scale-95"
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

  // ════════════════════════════════════════ ANONYMOUS SEND PAGE ════════════════════════════════════════
  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-10">
            <div className="text-center mb-6 sm:mb-8">
              <h1 className="text-3xl sm:text-5xl font-black mb-3 sm:mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Send to @{recipientUsername}
              </h1>
              <p className="text-gray-600 text-base sm:text-lg">
                Record an anonymous voice note
              </p>
            </div>
            <div className="max-w-lg mx-auto">
              {!audioBlob ? (
                <div className="text-center">
                  <button
                    onClick={toggleRecording}
                    disabled={loading}
                    className={`w-48 h-48 sm:w-56 sm:h-56 rounded-full shadow-2xl transition-all mx-auto flex items-center justify-center ${
                      isRecording
                        ? 'bg-red-500 animate-pulse'
                        : loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-105 active:scale-95'
                    }`}
                  >
                    {loading ? (
                      <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-white mx-auto mb-2"></div>
                        <p className="text-sm">Transcribing...</p>
                      </div>
                    ) : isRecording ? (
                      <Square className="w-20 h-20 sm:w-28 sm:h-28 text-white" />
                    ) : (
                      <Mic className="w-20 h-20 sm:w-28 sm:h-28 text-white" />
                    )}
                  </button>
                 
                  {isRecording && (
                    <div className="mt-6 text-center">
                      <div className="text-3xl sm:text-4xl font-bold text-red-500 mb-2">{formatTime(recordingTime)}</div>
                      <p className="text-lg sm:text-xl text-gray-700 font-medium">Recording... Tap to stop</p>
                    </div>
                  )}
                 
                  {!isRecording && !loading && (
                    <p className="mt-6 sm:mt-8 text-xl sm:text-2xl text-gray-700 font-medium">
                      Tap to start recording
                    </p>
                  )}
                 
                  {loading && (
                    <p className="mt-6 text-lg text-purple-600 font-medium">
                      Converting to text for robotic voice...
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-6 sm:p-8 shadow-lg">
                  <div className="bg-white rounded-xl p-6 mb-6 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse">
                        <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                      </div>
                      <p className="text-gray-600 font-medium text-sm sm:text-base">Voice recorded - Ready to send</p>
                      <p className="text-xs sm:text-sm text-gray-400 mt-2">{formatTime(recordingTime)}</p>
                      {!transcript && (
                        <p className="text-xs text-orange-500 mt-2">Warning: Transcription unavailable on this browser</p>
                      )}
                    </div>
                  </div>
                 
                  <div className="space-y-3">
                    <button
                      onClick={sendMessageWithRoboticVoice}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 sm:py-5 rounded-2xl font-bold text-lg sm:text-xl flex items-center justify-center gap-3 disabled:opacity-70 hover:scale-105 transition-transform active:scale-95"
                    >
                      <Send className="w-6 h-6 sm:w-7 sm:h-7" />
                      {loading ? 'Sending…' : 'Send as Robotic Voice'}
                    </button>
                   
                    <button
                      onClick={cancelRecording}
                      className="w-full bg-gray-100 text-gray-700 py-3 sm:py-4 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 hover:bg-gray-200 transition active:scale-95"
                    >
                      <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
                      Discard & Re-record
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="text-center mt-6 sm:mt-8">
              <button
                onClick={() => setAuthView('signup')}
                className="text-purple-600 hover:text-purple-700 font-medium text-sm sm:text-base"
              >
                Want your own inbox? Create an account →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════ LOGGED IN MAIN APP ════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 sm:p-8 text-white">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <User className="w-6 h-6 sm:w-8 sm:h-8" />
                <h1 className="text-2xl sm:text-4xl font-bold">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 bg-white/20 px-3 sm:px-5 py-2 sm:py-3 rounded-xl hover:bg-white/30 transition active:scale-95"
                >
                  {copied ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                  <span className="font-medium hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-white/20 px-3 sm:px-5 py-2 sm:py-3 rounded-xl hover:bg-white/30 transition active:scale-95"
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </div>
          {/* Main Content - INBOX */}
          <div className="p-4 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 sm:mb-8">Your Anonymous Voice Inbox</h2>
            {messages.length === 0 ? (
              <div className="text-center py-12 sm:py-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl px-4">
                <Inbox className="w-16 h-16 sm:w-24 sm:h-24 text-gray-300 mx-auto mb-4 sm:mb-6" />
                <p className="text-xl sm:text-2xl mb-3 sm:mb-4 text-gray-600 font-medium">No messages yet</p>
                <p className="text-gray-500 mb-4 sm:mb-6 text-sm sm:text-base">Share your link to receive voice notes:</p>
                <div className="bg-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl inline-block shadow-md max-w-full">
                  <p className="font-mono text-purple-600 font-bold break-all text-xs sm:text-base">
                    {window.location.origin}?send_to={currentUser.username}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-3xl p-4 sm:p-8 shadow-lg hover:shadow-xl transition-shadow">
                    {msg.video_url ? (
                      <div className="mb-4 sm:mb-6">
                        <video
                          controls
                          src={msg.video_url}
                          className="w-full rounded-xl shadow-md"
                          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23667eea' width='400' height='400'/%3E%3C/svg%3E"
                        />
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 shadow-md flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full mx-auto mb-2 sm:mb-3 flex items-center justify-center">
                            <Mic className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                          </div>
                          <p className="text-gray-500 text-xs sm:text-sm">Anonymous Voice Message</p>
                        </div>
                      </div>
                    )}
                   
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                      <span className="text-xs sm:text-sm text-gray-500 font-medium">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                     
                      <div className="flex gap-2 w-full sm:w-auto">
                        {msg.text && !msg.video_url && (
                          <button
                            onClick={() => generateAvatarVideo(msg.text, msg.id)}
                            disabled={generatingVideo === msg.id}
                            className="flex-1 sm:flex-none bg-gradient-to-r from-green-500 to-teal-500 text-white px-4 sm:px-5 py-2 sm:py-3 rounded-xl flex items-center justify-center gap-2 hover:scale-105 transition-transform disabled:opacity-60 disabled:scale-100 font-bold shadow-lg active:scale-95 text-sm"
                          >
                            {generatingVideo === msg.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Creating...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                <span>Generate Video</span>
                              </>
                            )}
                          </button>
                        )}
                       
                        {msg.text && (
                          <button
                            onClick={() => playRobotic(msg.text, msg.id)}
                            disabled={isPlaying === msg.id}
                            className="flex-1 sm:flex-none bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 sm:px-5 py-2 sm:py-3 rounded-xl flex items-center justify-center gap-2 hover:scale-105 transition-transform disabled:opacity-60 disabled:scale-100 font-bold shadow-lg active:scale-95 text-sm"
                          >
                            <Play className="w-4 h-4" />
                            <span className="text-xs sm:text-sm">{isPlaying === msg.id ? 'Playing...' : 'Play'}</span>
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
