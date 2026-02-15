import { useEffect, useRef, useState, useCallback } from 'react';
import { calculateMetrics, type SkinMetrics } from '@/utils/ageCalculation';

type FaceMeshResults = {
  multiFaceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
};

const getFaceMesh = (): any => (window as any).FaceMesh;
const getCamera = (): any => (window as any).Camera;

// Face mesh tessellation for right half
const RIGHT_FACE_INDICES = [
  // Right cheek region
  234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454,
  323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172,
  58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
  // Right forehead
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  // Right jaw
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93
];

// Key facial landmark indices for annotations
const ANNOTATION_POINTS = {
  forehead: { index: 10, label: 'پیشانی', metric: 'wrinkles' },
  rightEye: { index: 33, label: 'دور چشم', metric: 'eyeAging' },
  rightCheek: { index: 234, label: 'گونه', metric: 'texture' },
  jawline: { index: 172, label: 'خط فک', metric: 'volume' },
  nose: { index: 4, label: 'تون پوست', metric: 'skinTone' },
};

const FaceScanner = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [metrics, setMetrics] = useState<SkinMetrics | null>(null);
  const [smoothedMetrics, setSmoothedMetrics] = useState<SkinMetrics | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initRetryKey, setInitRetryKey] = useState(0);
  const [noFaceHint, setNoFaceHint] = useState(false);
  const faceMeshRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const metricsHistoryRef = useRef<SkinMetrics[]>([]);
  const lockedMetricsRef = useRef<SkinMetrics | null>(null);
  const lockFrameCount = useRef(0);
  const LOCK_THRESHOLD = 30; // Lock after ~1 second of stable data

  // Smooth metrics and lock once stable
  const smoothMetrics = useCallback((newMetrics: SkinMetrics): SkinMetrics => {
    // If already locked, check if face changed significantly (different person)
    if (lockedMetricsRef.current) {
      const locked = lockedMetricsRef.current;
      const ageDiff = Math.abs(newMetrics.estimatedAge - locked.estimatedAge);
      // Only unlock if age differs by >8 consistently (new person)
      if (ageDiff > 8) {
        lockFrameCount.current++;
        if (lockFrameCount.current > 20) {
          // New face detected, reset
          lockedMetricsRef.current = null;
          metricsHistoryRef.current = [];
          lockFrameCount.current = 0;
        }
      } else {
        lockFrameCount.current = 0;
      }
      return lockedMetricsRef.current || newMetrics;
    }

    const history = metricsHistoryRef.current;
    history.push(newMetrics);
    if (history.length > 90) history.shift();
    if (history.length < LOCK_THRESHOLD) return newMetrics;

    // Calculate stable age via trimmed mean
    const sortedAges = [...history].map(m => m.estimatedAge).sort((a, b) => a - b);
    const trimStart = Math.floor(history.length * 0.2);
    const trimEnd = Math.ceil(history.length * 0.8);
    const trimmedAges = sortedAges.slice(trimStart, trimEnd);
    const stableAge = Math.round(trimmedAges.reduce((s, a) => s + a, 0) / trimmedAges.length);

    const avg = {
      wrinkles: Math.round(history.reduce((s, m) => s + m.wrinkles, 0) / history.length),
      texture: Math.round(history.reduce((s, m) => s + m.texture, 0) / history.length),
      volume: Math.round(history.reduce((s, m) => s + m.volume, 0) / history.length),
      eyeAging: Math.round(history.reduce((s, m) => s + m.eyeAging, 0) / history.length),
      skinTone: Math.round(history.reduce((s, m) => s + m.skinTone, 0) / history.length),
      estimatedAge: stableAge,
    };

    // Lock it!
    lockedMetricsRef.current = avg;
    return avg;
  }, []);

  // Draw the mesh overlay on the right half of the face (mesh only, no text)
  const drawOverlay = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: FaceMeshResults['multiFaceLandmarks'][0],
    width: number,
    height: number
  ) => {
    ctx.clearRect(0, 0, width, height);

    // Find face center for splitting left/right
    const noseTip = landmarks[4];
    const faceCenterX = noseTip.x * width;

    // Draw semi-transparent mesh on right half
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 0.5;

    // Draw mesh triangles on right side
    const rightLandmarks = landmarks.filter((_, i) => 
      RIGHT_FACE_INDICES.includes(i) || landmarks[i].x * width > faceCenterX - 20
    );

    // Draw grid pattern
    for (let i = 0; i < rightLandmarks.length - 1; i++) {
      const p1 = rightLandmarks[i];
      const p2 = rightLandmarks[(i + 1) % rightLandmarks.length];
      
      if (p1.x * width > faceCenterX - 10) {
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
      }
    }

    // Draw vertical and horizontal grid lines on right side
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < landmarks.length; i += 3) {
      const p = landmarks[i];
      if (p.x * width > faceCenterX) {
        ctx.beginPath();
        ctx.moveTo(faceCenterX, p.y * height);
        ctx.lineTo(p.x * width + 20, p.y * height);
        ctx.stroke();
      }
    }

    // Draw orange points on face landmarks
    ctx.globalAlpha = 1;
    Object.entries(ANNOTATION_POINTS).forEach(([key, point]) => {
      const landmark = landmarks[point.index];
      const x = landmark.x * width;
      const y = landmark.y * height;

      if (x >= faceCenterX - 30) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }, []);

  // Initialize MediaPipe Face Mesh with retry logic
  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 5;

    const initFaceMesh = async (): Promise<boolean> => {
      try {
        const FaceMeshClass = getFaceMesh();
        if (!FaceMeshClass) throw new Error('FaceMesh not loaded from CDN');
        const faceMesh = new FaceMeshClass({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
          },
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });

        faceMesh.onResults((results) => {
          if (!isMounted) return;
          
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            setFaceDetected(true);
            setIsScanning(true);
            
            const newMetrics = calculateMetrics(landmarks);
            setMetrics(newMetrics);
            
            // Apply smoothing for stable display
            const smoothed = smoothMetrics(newMetrics);
            setSmoothedMetrics(smoothed);

            if (canvasRef.current && videoRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              if (ctx) {
                drawOverlay(
                  ctx, 
                  landmarks, 
                  canvasRef.current.width, 
                  canvasRef.current.height
                );
              }
            }
          } else {
            setFaceDetected(false);
            if (canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              }
            }
          }
        });

        // Wait for FaceMesh to initialize
        await faceMesh.initialize();
        
        if (isMounted) {
          faceMeshRef.current = faceMesh;
        }
        return true;
      } catch (error) {
        console.warn(`FaceMesh init attempt ${retryCount + 1} failed:`, error);
        return false;
      }
    };

    const initWithRetry = async () => {
      while (retryCount < maxRetries && isMounted) {
        const success = await initFaceMesh();
        if (success) {
          console.log('FaceMesh initialized successfully');
          return;
        }
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1500 * retryCount));
        }
      }

      if (isMounted && retryCount >= maxRetries) {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          setCameraError('برای استفاده از دوربین، لطفاً سایت را با HTTPS باز کنید.');
        } else {
          setCameraError('خطا در بارگذاری. دکمهٔ «دوباره تلاش کنید» را بزنید یا صفحه را رفرش کنید.');
        }
      }
    };

    initWithRetry();

    return () => {
      isMounted = false;
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
    };
  }, [calculateMetrics, drawOverlay, smoothMetrics, initRetryKey]);

  // Show hint if no face detected for a while
  useEffect(() => {
    if (!faceDetected) {
      const t = setTimeout(() => setNoFaceHint(true), 6000);
      return () => clearTimeout(t);
    }
    setNoFaceHint(false);
  }, [faceDetected]);

  // Start camera immediately so user sees video right away (FaceMesh loads in parallel)
  useEffect(() => {
    let cancelled = false;
    const startCamera = async () => {
      if (!videoRef.current) {
        if (!cancelled) setTimeout(startCamera, 30);
        return;
      }
      try {
        const CameraClass = getCamera();
        if (!CameraClass) throw new Error('Camera not loaded from CDN');
        const camera = new CameraClass(videoRef.current, {
          onFrame: async () => {
            const video = videoRef.current;
            if (!faceMeshRef.current || !video) return;
            if (video.readyState < 2 || video.videoWidth === 0) return;
            try {
              await faceMeshRef.current.send({ image: video });
            } catch (err) {
              // Silently handle frame processing errors
            }
          },
          width: 1280,
          height: 720,
        });
        if (cancelled) return;
        cameraRef.current = camera;
        await camera.start();
      } catch (error) {
        if (!cancelled) {
          console.error('Camera error:', error);
          setCameraError('دسترسی به دوربین امکان‌پذیر نیست');
        }
      }
    };

    const t = setTimeout(() => startCamera(), 30);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
    };
  }, [initRetryKey]);

  // Convert number to Persian numerals
  const toPersianNumber = (num: number): string => {
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return num.toString().split('').map(d => persianDigits[parseInt(d)] || d).join('');
  };

  if (cameraError) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6 p-6">
        <p className="text-xl text-muted-foreground font-vazir text-center max-w-md">{cameraError}</p>
        <button
          type="button"
          onClick={() => {
            setCameraError(null);
            setInitRetryKey((k) => k + 1);
          }}
          className="font-vazir px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          دوباره تلاش کنید
        </button>
      </div>
    );
  }

  // Get display metrics (smoothed for stability)
  const displayMetrics = smoothedMetrics || metrics;

  return (
    <div className="fixed inset-0 bg-background overflow-hidden" dir="rtl">
      {/* Video feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        playsInline
        muted
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Canvas overlay for mesh only (mirrored with video) */}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Persian labels overlay - NOT mirrored, positioned on right side */}
      {displayMetrics && faceDetected && (
        <div className="absolute top-16 right-4 md:right-8 space-y-3 md:space-y-4 font-vazir text-right max-w-[280px] md:max-w-none">
          <div className="flex items-center gap-2 text-white text-xs md:text-sm bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"></span>
            <span>خطوط ریز و چروک‌ها: {toPersianNumber(displayMetrics.wrinkles)}٪</span>
          </div>
          <div className="flex items-center gap-2 text-white text-xs md:text-sm bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"></span>
            <span>بافت و الاستیسیته پوست: {toPersianNumber(displayMetrics.texture)}٪</span>
          </div>
          <div className="flex items-center gap-2 text-white text-xs md:text-sm bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"></span>
            <span>حجم صورت و افتادگی: {toPersianNumber(displayMetrics.volume)}٪</span>
          </div>
          <div className="flex items-center gap-2 text-white text-xs md:text-sm bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"></span>
            <span>نشانه‌های پیری اطراف چشم: {toPersianNumber(displayMetrics.eyeAging)}٪</span>
          </div>
          <div className="flex items-center gap-2 text-white text-xs md:text-sm bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"></span>
            <span>تون پوست و لکه‌های رنگدانه‌ای: {toPersianNumber(displayMetrics.skinTone)}٪</span>
          </div>
        </div>
      )}

      {/* Scanning indicator */}
      {!faceDetected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center fade-in">
            <div className="w-24 h-24 border-2 border-scanner-glow rounded-full mx-auto mb-4 scanner-pulse" />
            <p className="text-lg text-muted-foreground font-vazir">در حال جستجوی چهره...</p>
            {noFaceHint && (
              <p className="text-sm text-muted-foreground/80 font-vazir mt-3 max-w-xs mx-auto">
                صورت را در مرکز قرار دهید و نور کافی بدهید. اگر با آدرس http (بدون s) باز کرده‌اید، با https یا از مرورگر موبایل امتحان کنید.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Skin age result - centered at bottom */}
      {displayMetrics && faceDetected && (
        <div className="absolute bottom-0 left-0 right-0 pb-8 md:pb-12 pt-6 bg-gradient-to-t from-background via-background/80 to-transparent">
          <div className="text-center fade-in">
            <p className="text-2xl md:text-4xl font-bold text-foreground font-vazir tracking-wide">
              سن تخمینی پوست: {toPersianNumber(displayMetrics.estimatedAge)} سال
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-2 font-vazir">
              تحلیل زیبایی‌شناختی • غیرپزشکی
            </p>
          </div>
        </div>
      )}

      {/* Scanning frame corners */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-8 left-8 w-12 md:w-16 h-12 md:h-16 border-l-2 border-t-2 border-scanner-glow opacity-50" />
        <div className="absolute top-8 right-8 w-12 md:w-16 h-12 md:h-16 border-r-2 border-t-2 border-scanner-glow opacity-50" />
        <div className="absolute bottom-28 md:bottom-32 left-8 w-12 md:w-16 h-12 md:h-16 border-l-2 border-b-2 border-scanner-glow opacity-50" />
        <div className="absolute bottom-28 md:bottom-32 right-8 w-12 md:w-16 h-12 md:h-16 border-r-2 border-b-2 border-scanner-glow opacity-50" />
      </div>

      {/* Vignette overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)'
        }}
      />
    </div>
  );
};

export default FaceScanner;