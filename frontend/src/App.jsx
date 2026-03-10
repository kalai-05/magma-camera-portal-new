import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
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
  const videoContainerRef = useRef(null);

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
         setCameraStatus('Sleep');
      }
    } finally {
      if (isManual) setIsWaking(false);
    }
  };

  useEffect(() => {
    let keepAliveInterval;
    if (cameraStatus === 'Online') {
      keepAliveInterval = setInterval(() => {
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
      const response = await axios.get(
        `${API_PROXY}/ISAPI/Streaming/channels/1/picture?format=json&devIndex=${DEVICE_UUID}`
      );
      
      let finalUrl = null;
      if (response.data && response.data.PictureData && response.data.PictureData.url) {
         const imgResponse = await axios.get(
           `${API_PROXY}${response.data.PictureData.url}`,
           { responseType: 'blob' }
         );
         finalUrl = URL.createObjectURL(imgResponse.data);
      } else if (response.data instanceof Blob) {
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

      const liveFrameLoop = async () => {
        if (!isStreamActiveRef.current) return;
        try {
          await manualCapture(true);
        } catch(e) {}
        if (isStreamActiveRef.current) {
           setTimeout(() => requestAnimationFrame(liveFrameLoop), 500);
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
        await axios.get(`${API_PROXY}/ISAPI/System/TwoWayAudio/channels/1?format=json&devIndex=${DEVICE_UUID}`);
        setIsAudioActive(true);
        toast.success("Two-way audio connection established.");
      } else {
        setIsAudioActive(false);
        toast.success("Two-way audio closed.");
      }
    } catch(err) {
       console.error(err);
       toast.error("Failed to connect audio channel.");
    }
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      if (videoContainerRef.current.requestFullscreen) {
        videoContainerRef.current.requestFullscreen();
      } else if (videoContainerRef.current.webkitRequestFullscreen) {
        videoContainerRef.current.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const cursorX = useSpring(mouseX, { damping: 40, stiffness: 200 });
  const cursorY = useSpring(mouseY, { damping: 40, stiffness: 200 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        mouseX.set(e.touches[0].clientX);
        mouseY.set(e.touches[0].clientY);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [mouseX, mouseY]);

  return (
    <div className="min-h-screen bg-dark-950 text-gray-100 flex flex-col font-sans overflow-x-hidden relative">
      <motion.div 
        style={{ x: cursorX, y: cursorY, translateX: '-50%', translateY: '-50%' }}
        className="fixed top-0 left-0 w-[600px] h-[600px] bg-magma-600/10 rounded-full blur-[140px] pointer-events-none z-0 opacity-50 sm:opacity-80"
      />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,63,94,0.05),transparent_50%)] pointer-events-none" />
      
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
      
      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-dark-900/50 bg-dark-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50"
      >
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ rotate: 15 }}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-magma-500 to-magma-700 flex items-center justify-center shadow-lg shadow-magma-500/20"
          >
            <Camera className="w-5 h-5 text-white" />
          </motion.div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
              MagmaPortal
            </h1>
            <p className="text-xs text-gray-400 font-medium tracking-wide">SECURE DEVICE INTERFACE</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <motion.div 
            layout
            className="flex items-center gap-2 bg-dark-800/80 px-4 py-2 rounded-full ring-1 ring-dark-800 shadow-lg"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${cameraStatus === 'Online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
            <span className="text-sm font-semibold text-gray-300 uppercase leading-none">{cameraStatus}</span>
          </motion.div>
          <motion.button 
            whileHover={{ scale: 1.1, rotate: 15 }}
            whileTap={{ scale: 0.9 }}
            className="p-2.5 hover:bg-dark-800 rounded-full transition-colors text-gray-400 hover:text-white"
          >
            <Settings className="w-5 h-5" />
          </motion.button>
        </div>
      </motion.nav>

      <main className="flex-1 p-4 lg:p-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 overflow-y-auto">
        <motion.div 
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-8 flex flex-col gap-6"
        >
          <div 
            ref={videoContainerRef}
            className="glass-panel rounded-3xl overflow-hidden shadow-2xl relative group aspect-video bg-dark-900 border border-dark-800 flex items-center justify-center"
          >
            <AnimatePresence mode="wait">
              {snapshotUrl ? (
                <motion.img 
                  key={snapshotUrl}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  src={snapshotUrl} 
                  alt="Camera Feed" 
                  className="w-full h-full object-contain bg-black shadow-inner" 
                />
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center justify-center text-gray-500"
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
                    transition={{ duration: 4, repeat: Infinity }}
                  >
                    <Video className="w-20 h-20 mb-4" />
                  </motion.div>
                  <p className="text-xl font-bold text-gray-400">Offline</p>
                  <p className="text-sm text-gray-500 mt-2">Activate camera to initialize feed</p>
                </motion.div>
              )}
            </AnimatePresence>

            {isStreaming && (
              <motion.div 
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-[3px] bg-magma-500/20 shadow-[0_0_20px_rgba(244,63,94,0.4)] z-10 pointer-events-none"
              />
            )}
            
            <AnimatePresence>
              {streamError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute inset-0 bg-dark-950/80 backdrop-blur-md flex items-center justify-center z-20"
                >
                  <div className="text-center text-red-400 bg-red-950/20 px-8 py-6 rounded-3xl border border-red-900/30">
                    <p className="font-bold text-lg mb-1">Stream Error</p>
                    <p className="text-red-400/80">{streamError}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isStreaming && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute top-6 left-6 bg-dark-950/70 backdrop-blur-lg px-4 py-2 rounded-xl flex items-center gap-3 border border-magma-500/30 z-30 shadow-2xl"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                <span className="text-sm font-bold text-gray-100 uppercase tracking-widest">Live View</span>
              </motion.div>
            )}

            <motion.div 
              className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-dark-950/95 to-transparent p-8 opacity-0 group-hover:opacity-100 transition-all duration-500 flex justify-between items-end z-30 transform translate-y-4 group-hover:translate-y-0"
            >
              <motion.button 
                whileHover={{ scale: 1.05, backgroundColor: '#f43f5e' }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleStream}
                className="bg-magma-600 text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-3 transition-colors shadow-2xl shadow-magma-600/40"
              >
                {isStreaming ? "Terminate Stream" : "Establish Live Feed"}
              </motion.button>
              
              <motion.button 
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(31, 41, 55, 0.9)', rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleFullscreen}
                className="text-gray-300 transition-colors bg-dark-800/60 p-3 rounded-2xl backdrop-blur-xl border border-dark-700/50"
              >
                <Maximize className="w-6 h-6" />
              </motion.button>
            </motion.div>
          </div>
          
          <motion.div 
            initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {[
              { label: 'Device Model', value: 'DS-2DE2C400IWG-K' },
              { label: 'Network', value: 'Excellent', icon: Activity, color: 'text-emerald-400' },
              { label: 'Device ID', value: DEVICE_UUID, span: 'sm:col-span-2' }
            ].map((item, idx) => (
              <motion.div 
                key={idx}
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                className={`glass-panel p-6 rounded-3xl flex flex-col justify-between hover:bg-dark-800/40 transition-colors border border-dark-800/50 shadow-xl ${item.span || ""}`}
              >
                <h3 className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">{item.label}</h3>
                <p className={`text-base font-black ${item.color || "text-gray-200"} truncate flex items-center gap-2`}>
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {item.value}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div 
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-4 flex flex-col gap-8 lg:order-2"
        >
          <div className="glass-panel rounded-3xl p-8 flex flex-col gap-10 h-full border border-dark-800/50 bg-dark-900/40 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
            <div>
              <h2 className="text-2xl font-black mb-3">Control Center</h2>
              <div className="h-1.5 w-12 bg-magma-600 rounded-full mb-4 shadow-[0_0_15px_rgba(244,63,94,0.6)]" />
              <p className="text-sm text-gray-500 leading-relaxed font-medium">Coordinate device state and hardware peripherals</p>
            </div>
            
            <motion.div 
              initial="hidden" animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1, delayChildren: 0.6 } } }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5"
            >
              {[
                { 
                  id: 'wake', onClick: wakeUpCamera, disabled: isWaking || cameraStatus === 'Online',
                  icon: Power, label: 'Initialize Camera', desc: 'Exit idle low-power mode',
                  active: cameraStatus === 'Online', loading: isWaking,
                  color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/40'
                },
                {
                  id: 'capture', onClick: () => manualCapture(false), icon: ImageIcon,
                  label: 'Instant Capture', desc: 'Save current frame to disk',
                  color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/40'
                },
                {
                  id: 'audio', onClick: toggleAudio, icon: isAudioActive ? Volume2 : Mic,
                  label: isAudioActive ? "Stream Audio active" : "Global Mic Input",
                  desc: 'Activate two-way channel', active: isAudioActive,
                  color: 'text-magma-500', bg: 'bg-magma-500/10', border: 'hover:border-magma-500/40'
                }
              ].map((btn) => (
                <motion.button 
                  key={btn.id}
                  variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
                  whileHover={{ x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                  className={`group relative overflow-hidden rounded-3xl p-6 flex flex-col items-center justify-center text-center gap-4 transition-all duration-300 border ${
                    btn.active 
                      ? 'border-magma-500 bg-magma-600/10 shadow-[0_0_40px_rgba(244,63,94,0.1)]' 
                      : 'border-dark-700 bg-dark-800/40 ' + btn.border
                  } disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed`}
                >
                  <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-500 transform group-hover:scale-110 ${
                    btn.active ? 'bg-magma-600 text-white shadow-magma-600/40 shadow-2xl pulse-custom' : btn.bg + ' ' + btn.color
                  }`}>
                    {btn.loading ? (
                      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <btn.icon className="w-8 h-8" />
                    )}
                  </div>
                  <div>
                    <h3 className={`font-black text-lg ${btn.active ? 'text-magma-500' : 'text-gray-200'}`}>{btn.label}</h3>
                    <p className="text-xs text-gray-500 mt-2 font-bold uppercase tracking-tighter opacity-70">{btn.desc}</p>
                  </div>
                  
                  {btn.id === 'audio' && btn.active && (
                    <div className="absolute top-6 right-8 flex gap-1 items-end h-6 opacity-80">
                      {[0.8, 1.2, 0.5, 1.1, 0.9].map((d, i) => (
                        <motion.div 
                          key={i}
                          animate={{ height: [4, 16, 4] }}
                          transition={{ duration: d, repeat: Infinity }}
                          className="w-1.5 bg-magma-600 rounded-full"
                        />
                      ))}
                    </div>
                  )}
                </motion.button>
              ))}
            </motion.div>
            
            <div className="mt-auto pt-8 border-t border-dark-900 text-center flex items-center justify-center gap-2 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
              <Camera className="w-4 h-4" />
              <p className="text-[10px] font-black tracking-widest uppercase">Encryption: ISAPI-SSL enabled</p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

export default App;
