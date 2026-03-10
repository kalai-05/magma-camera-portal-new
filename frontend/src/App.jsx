import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Camera, 
  Power, 
  Mic, 
  Settings, 
  Activity, 
  Image as ImageIcon,
  Video,
  Volume2,
  Maximize
} from 'lucide-react';

const API_PROXY = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
const DEVICE_UUID = '144E782F-B379-C44C-A76D-85439144CD66';

function App() {
  const [cameraStatus, setCameraStatus] = useState('Sleep');
  const [isWaking, setIsWaking] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [streamError, setStreamError] = useState(null);
  
  const videoIntervalRef = useRef(null);

  useEffect(() => {
    // Initial status check could go here if there was a status API
    // Assuming sleep by default as per analysis
  }, []);

  const wakeUpCamera = async (isManual = true) => {
    try {
      if (isManual) setIsWaking(true);
      setStreamError(null);
      await axios.put(`${API_PROXY}/ISAPI/System/wakeUp?format=json&devIndex=${DEVICE_UUID}`);
      if (isManual) toast.success("Wake up command sent successfully!");
      setCameraStatus('Online');
    } catch (error) {
      console.error("Failed to wake up camera", error);
      if (isManual) {
         toast.error("Failed to wake up the camera.");
      } else {
         // If a heartbeat fails, the camera might have gone to sleep
         setCameraStatus('Sleep');
      }
    } finally {
      if (isManual) setIsWaking(false);
    }
  };

  // Keep-alive heartbeat when the camera is Online
  useEffect(() => {
    let keepAliveInterval;
    if (cameraStatus === 'Online') {
      // Hikvision battery cameras typically go to sleep after ~60s of inactivity.
      // Sending a wakeUp or status check command every 30 seconds keeps it active.
      keepAliveInterval = setInterval(() => {
        console.log("Sending keep-alive heartbeat to prevent camera sleep...");
        wakeUpCamera(false);
      }, 30000);
    }
    return () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
    };
  }, [cameraStatus]);


  const manualCapture = async (isAuto = false) => {
    if (cameraStatus === 'Sleep') {
      if (!isAuto) toast((t) => (
         <span className="font-medium text-gray-800">Please wake up the camera first.</span>
      ), { icon: '⚠️' });
      return;
    }
    try {
      // 1. Fetch the picture metadata which contains the actual gateway storage URL
      const response = await axios.get(
        `${API_PROXY}/ISAPI/Streaming/channels/1/picture?format=json&devIndex=${DEVICE_UUID}`
      );
      
      let finalUrl = null;
      
      // Some cameras might return direct binary stream, but gateway usually returns JSON
      if (response.data && response.data.PictureData && response.data.PictureData.url) {
         // 2. Fetch the actual image binary using the provided URL
         const imgResponse = await axios.get(
           `${API_PROXY}${response.data.PictureData.url}`,
           { responseType: 'blob' }
         );
         finalUrl = URL.createObjectURL(imgResponse.data);
      } else if (response.data instanceof Blob) {
         // Fallback if the camera behaves differently
         finalUrl = URL.createObjectURL(response.data);
      }
      
      if (finalUrl) {
         setSnapshotUrl(finalUrl);
      } else {
         throw new Error("Invalid picture format returned");
      }
      
    } catch (error) {
      console.error("Failed to capture image", error);
      if (!isAuto) toast.error("Camera might still be waking up.");
    }
  };

  const [rtspUrl, setRtspUrl] = useState(null);
  const isStreamActiveRef = useRef(false);

  const toggleStream = async () => {
    if (cameraStatus === 'Sleep') {
      toast((t) => (
         <span className="font-medium text-gray-800">Please wake up the camera first.</span>
      ), { icon: '⚠️' });
      return;
    }
    
    if (isStreaming) {
      setIsStreaming(false);
      setRtspUrl(null);
      isStreamActiveRef.current = false;
    } else {
      setIsStreaming(true);
      isStreamActiveRef.current = true;
      
      try {
        // Fetch RTSP URL for display context
        const response = await axios.post(
          `${API_PROXY}/ISAPI/System/streamMedia?format=json&devIndex=${DEVICE_UUID}`,
          {
            StreamInfo: { id: "1", streamType: "main", method: "preview" }
          }
        );
        if (response.data?.MediaAccessInfo) {
          setRtspUrl(response.data.MediaAccessInfo.URL);
        }
      } catch (error) {
        console.error("Failed to fetch RTSP stream URL", error);
      }

      // Start the seamless 'Live Video' loop via rapid snapshot polling
      const liveFrameLoop = async () => {
        if (!isStreamActiveRef.current) return;
        
        try {
          // Fetch the picture invisibly for the video stream
          await manualCapture(true);
        } catch(e) { /* Ignore background frame drops */ }
        
        // As soon as the frame loads (or fails), schedule the next frame 
        // using requestAnimationFrame for smoothness, with a small delay to prevent overload
        if (isStreamActiveRef.current) {
           setTimeout(() => requestAnimationFrame(liveFrameLoop), 500); // ~2 FPS stream
        }
      };
      
      liveFrameLoop();
    }
  };

  const toggleAudio = async () => {
    if (cameraStatus === 'Sleep') {
      toast((t) => (
         <span className="font-medium text-gray-800">Please wake up the camera first.</span>
      ), { icon: '⚠️' });
      return;
    }
    
    try {
      if (!isAudioActive) {
        // Start two-way audio session
        await axios.get(`${API_PROXY}/ISAPI/System/TwoWayAudio/channels/1?format=json&devIndex=${DEVICE_UUID}`);
        setIsAudioActive(true);
        toast.success("Two-way audio connection established.");
      } else {
        // Stop audio
        setIsAudioActive(false);
        toast.success("Two-way audio closed.");
      }
    } catch(err) {
       console.error(err);
       toast.error("Failed to connect audio channel.");
    }
  };

  useEffect(() => {
    return () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-dark-950 text-gray-100 flex flex-col font-sans">
      <Toaster 
        position="bottom-center" 
        toastOptions={{
          style: {
            borderRadius: '9999px',
            background: '#ffffff',
            color: '#1f2937',
            fontWeight: '600',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
          },
        }}
      />
      
      {/* Top Navigation */}
      <nav className="border-b border-dark-900/50 bg-dark-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-magma-500 to-magma-700 flex items-center justify-center shadow-lg shadow-magma-500/20">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
              MagmaPortal
            </h1>
            <p className="text-xs text-gray-400 font-medium">Device Gateway Interface</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-dark-800/80 px-4 py-2 rounded-full ring-1 ring-dark-800">
            <div className={`w-2.5 h-2.5 rounded-full ${cameraStatus === 'Online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
            <span className="text-sm font-medium text-gray-300">Status: {cameraStatus}</span>
          </div>
          <button className="p-2.5 hover:bg-dark-800 rounded-full transition-colors text-gray-400 hover:text-white">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Video Feed */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl relative group aspect-video bg-dark-900 border border-dark-800 flex items-center justify-center">
            
            {/* The Video Source / Snapshot */}
            {snapshotUrl ? (
              <img src={snapshotUrl} alt="Camera Feed" className="w-full h-full object-contain bg-black" />
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-500">
                <Video className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">No Feed Available</p>
                <p className="text-sm">Wake up the camera and start the stream</p>
              </div>
            )}
            
            {/* Stream Error Overlay */}
            {streamError && (
              <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center">
                <div className="text-center text-red-400 bg-red-950/30 px-6 py-4 rounded-xl border border-red-900/50">
                  <p>{streamError}</p>
                </div>
              </div>
            )}

            {/* Live Indicator */}
            {isStreaming && (
              <div className="absolute top-4 left-4 bg-dark-950/60 backdrop-blur px-3 py-1.5 rounded-lg flex items-center gap-2 border border-dark-800">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-gray-200">LIVE FEED</span>
              </div>
            )}
            


            {/* Video Overlays (Controls that appear on hover) */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-dark-950/90 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end pb-4 pt-16">
              <div className="flex items-center gap-4">
                <button 
                  onClick={toggleStream}
                  className="bg-magma-600 hover:bg-magma-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all shadow-lg shadow-magma-600/20"
                >
                  {isStreaming ? "Stop Live View" : "Start Live View"}
                </button>
              </div>
              <button className="text-gray-300 hover:text-white transition-colors bg-dark-800/80 p-2 rounded-lg backdrop-blur">
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
              <h3 className="text-gray-400 text-sm font-medium mb-1">Device Model</h3>
              <p className="text-lg font-semibold text-gray-100">DS-2DE2C400IWG-K</p>
            </div>
            <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
              <h3 className="text-gray-400 text-sm font-medium mb-1">Network</h3>
              <p className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Good Signal
              </p>
            </div>
            <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between col-span-2">
              <h3 className="text-gray-400 text-sm font-medium mb-1">Device ID</h3>
              <p className="text-lg font-semibold text-gray-100 truncate">{DEVICE_UUID}</p>
            </div>
          </div>
        </div>

        {/* Right Side: Control Dashboard */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel rounded-3xl p-6 lg:p-8 flex flex-col gap-8 h-full">
            <div>
              <h2 className="text-xl font-bold mb-2">Device Controls</h2>
              <p className="text-sm text-gray-400">Manage camera state and actions</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 flex-1">
              {/* Wake Up Button */}
              <button 
                onClick={wakeUpCamera}
                disabled={isWaking || cameraStatus === 'Online'}
                className="group relative overflow-hidden rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-all duration-300 border border-dark-700 bg-dark-800/50 hover:bg-dark-800 hover:border-magma-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${cameraStatus === 'Online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20'}`}>
                  {isWaking ? (
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Power className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200">Wake Up Device</h3>
                  <p className="text-xs text-gray-500 mt-1">Exit from sleep mode</p>
                </div>
              </button>

              {/* Snapshot Button */}
              <button 
                onClick={() => manualCapture(false)}
                className="group relative overflow-hidden rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-all duration-300 border border-dark-700 bg-dark-800/50 hover:bg-dark-800 hover:border-blue-500/50"
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center transition-colors bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20">
                  <ImageIcon className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200">Manual Capture</h3>
                  <p className="text-xs text-gray-500 mt-1">Take an instant photo</p>
                </div>
              </button>

              {/* Two-Way Audio Button */}
              <button 
                onClick={toggleAudio}
                className={`group relative overflow-hidden rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-all duration-300 border  ${isAudioActive ? 'border-magma-500 bg-magma-500/10 shadow-[0_0_30px_rgba(244,63,94,0.15)] ring-1 ring-magma-500/50' : 'border-dark-700 bg-dark-800/50 hover:bg-dark-800 mt-0 hover:border-purple-500/50'}`}
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 ${isAudioActive ? 'bg-magma-500 text-white shadow-lg shadow-magma-500/40 animate-pulse' : 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20'}`}>
                  {isAudioActive ? <Volume2 className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                </div>
                <div>
                  <h3 className={`font-semibold ${isAudioActive ? 'text-magma-400' : 'text-gray-200'}`}>
                    {isAudioActive ? "Audio Active (Speak Now)" : "Two-Way Audio"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Start microphone channel</p>
                </div>
                
                {/* Audio waves animation when active */}
                {isAudioActive && (
                  <div className="absolute top-4 right-4 flex gap-1 items-end h-4 opacity-70">
                    <div className="w-1 bg-magma-500 rounded-full animate-[bounce_1s_infinite] h-2"></div>
                    <div className="w-1 bg-magma-500 rounded-full animate-[bounce_1.2s_infinite] h-4"></div>
                    <div className="w-1 bg-magma-500 rounded-full animate-[bounce_0.8s_infinite] h-3"></div>
                  </div>
                )}
              </button>
            </div>
            
            <div className="mt-auto pt-6 border-t border-dark-800 text-center">
              <p className="text-xs text-gray-600">ISAPI Protocol via Secure Gateway</p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
