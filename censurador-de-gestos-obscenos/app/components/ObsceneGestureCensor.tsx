"use client";

import { useEffect, useRef, useState } from "react";
import { Hands, Results, NormalizedLandmark } from "@mediapipe/hands";

export default function ObsceneGestureCensor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detectedGesture, setDetectedGesture] = useState<string | null>(null);

  // Threshold for finger extension detection
  const EXTENSION_THRESHOLD = 0.02;

  // Helper to check if a finger is extended (pointing up)
  const isFingerExtended = (tip: NormalizedLandmark, pip: NormalizedLandmark) => {
    return tip.y < pip.y - EXTENSION_THRESHOLD;
  };

  // Helper to check if thumb is pointing down
  const isThumbDown = (tip: NormalizedLandmark, ip: NormalizedLandmark) => {
    // y increases downwards, so tip.y > ip.y means pointing down
    return tip.y > ip.y + EXTENSION_THRESHOLD;
  };

  // Helper to calculate distance between two landmarks
  const getDistance = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  };

  // Helper to check if a finger is open (extended) based on distance ratio
  // If distance(TIP, MCP) is large compared to distance(PIP, MCP), it's open.
  const isFingerOpen = (tip: NormalizedLandmark, pip: NormalizedLandmark, mcp: NormalizedLandmark) => {
    const distTipMCP = getDistance(tip, mcp);
    const distPIPMCP = getDistance(pip, mcp);
    // Tip should be significantly further from MCP than PIP is.
    // A ratio of > 1.6 usually indicates extension.
    return distTipMCP > distPIPMCP * 1.6;
  };

  // Detect gesture type
  const detectGesture = (landmarks: NormalizedLandmark[]): string | null => {
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const thumbMCP = landmarks[2];
    
    const indexTip = landmarks[8];
    const indexPIP = landmarks[6];
    const indexMCP = landmarks[5];
    
    const middleTip = landmarks[12];
    const middlePIP = landmarks[10];
    const middleMCP = landmarks[9];
    
    const ringTip = landmarks[16];
    const ringPIP = landmarks[14];
    const ringMCP = landmarks[13];
    
    const pinkyTip = landmarks[20];
    const pinkyPIP = landmarks[18];
    const pinkyMCP = landmarks[17];

    // Check openness of fingers
    const indexOpen = isFingerOpen(indexTip, indexPIP, indexMCP);
    const middleOpen = isFingerOpen(middleTip, middlePIP, middleMCP);
    const ringOpen = isFingerOpen(ringTip, ringPIP, ringMCP);
    const pinkyOpen = isFingerOpen(pinkyTip, pinkyPIP, pinkyMCP);

    // Thumb is special. Check if it's extended away from palm/index.
    // Simple check: Thumb tip is far from Index MCP
    const thumbOpen = getDistance(thumbTip, indexMCP) > 0.15;
    
    // Directional checks (still useful for orientation)
    const isThumbUp = thumbTip.y < thumbIP.y; // y decreases upwards
    const isThumbDown = thumbTip.y > thumbIP.y;

    // 1. Middle Finger (Dedo do meio)
    // Middle open, others closed
    if (middleOpen && !indexOpen && !ringOpen && !pinkyOpen) {
      return "MIDDLE_FINGER";
    }

    // 2. OK Gesture
    // Index and Thumb tips close, others open
    const pinchDistance = getDistance(thumbTip, indexTip);
    if (pinchDistance < 0.08 && middleOpen && ringOpen && pinkyOpen) {
      return "OK";
    }

    // 3. Gun Gesture (Arma)
    // Thumb Open/Up, Index Open, others Closed
    if (thumbOpen && indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
        // Additional check: Thumb should be roughly up
        if (isThumbUp) return "GUN";
    }

    // 4. Thumbs Down (Dislike)
    // All fingers closed, Thumb Open & Down
    if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
       if (thumbOpen && isThumbDown) {
         return "THUMBS_DOWN";
       }
    }
    
    // 5. Thumbs Up (Joia) - Not censored, but logic helps differentiate
    // All fingers closed, Thumb Open & Up
    // This block is implicitly handled because it won't match GUN (index is closed)
    // and won't match others.

    return null;
  };

  // Calculate bounding box for the hand
  const getHandBoundingBox = (landmarks: NormalizedLandmark[], width: number, height: number) => {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;

    landmarks.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    // Add some padding
    const padding = 0.05;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(1, maxX + padding);
    maxY = Math.min(1, maxY + padding);

    return {
      x: minX * width,
      y: minY * height,
      w: (maxX - minX) * width,
      h: (maxY - minY) * height,
    };
  };

  useEffect(() => {
    let hands: Hands | null = null;
    let animationFrameId: number;
    let isMounted = true;

    const init = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;
      const ctx = canvasElement.getContext("2d");

      if (!ctx) {
        setError("Não foi possível obter o contexto do canvas.");
        return;
      }

      try {
        // 1. Setup MediaPipe Hands
        hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          },
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        hands.onResults((results: Results) => {
          if (!isMounted) return;
          
          // Clear canvas
          ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

          let currentGesture: string | null = null;

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const gesture = detectGesture(landmarks);
            currentGesture = gesture;
            
            if (gesture) {
              const box = getHandBoundingBox(landmarks, canvasElement.width, canvasElement.height);
              
              // 1. Apply Blur Effect
              ctx.save();
              ctx.beginPath();
              ctx.rect(box.x, box.y, box.w, box.h);
              ctx.clip();
              ctx.filter = "blur(30px)";
              // Draw the current video frame into the clipped region to create the blur
              ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
              ctx.restore();
            }
          }
          setDetectedGesture(currentGesture);
          setLoading(false);
        });

        // 2. Setup Camera manually
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve) => {
          videoElement.onloadedmetadata = () => {
            resolve();
          };
        });
        
        await videoElement.play();

        // 3. Start processing loop
        const processFrame = async () => {
          if (!isMounted) return;
          
          if (hands && videoElement.readyState >= 2) { // HAVE_CURRENT_DATA
            await hands.send({ image: videoElement });
          }
          
          animationFrameId = requestAnimationFrame(processFrame);
        };
        
        processFrame();

      } catch (err: any) {
        console.error("Error initializing:", err);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setError("Permissão de câmera negada. Por favor, permita o acesso.");
        } else {
          setError("Erro ao acessar a câmera ou carregar o modelo: " + err.message);
        }
        setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
      if (hands) {
        hands.close();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Handle resize to match canvas to video
  useEffect(() => {
    const handleResize = () => {
      if (videoRef.current && canvasRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
      }
    };

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.addEventListener("loadedmetadata", handleResize);
      videoEl.addEventListener("resize", handleResize);
    }

    return () => {
      if (videoEl) {
        videoEl.removeEventListener("loadedmetadata", handleResize);
        videoEl.removeEventListener("resize", handleResize);
      }
    };
  }, []);

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column",
      justifyContent: "center", 
      alignItems: "center", 
      minHeight: "100vh", 
      backgroundColor: "#121212", // Darker, more modern background
      padding: "20px",
      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    }}>
      <div style={{
        textAlign: "center",
        marginBottom: "2rem"
      }}>
        <h1 style={{ 
          color: "#ffffff", 
          marginBottom: "0.5rem", 
          fontSize: "2.5rem",
          fontWeight: "700",
          letterSpacing: "-0.02em"
        }}>
          Detector de Gestos Obscenos
        </h1>
      </div>

      <div style={{ 
        position: "relative", 
        width: "100%", 
        maxWidth: "800px", 
        borderRadius: "24px", // More rounded corners
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0,0,0,0.6)", // Deeper shadow
        backgroundColor: "#000",
        lineHeight: 0,
        border: "1px solid rgba(255,255,255,0.1)" // Subtle border
      }}>
        {loading && (
          <div style={{ 
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)",
            color: "white", zIndex: 20
          }}>
            <div style={{ 
              width: "40px", height: "40px", 
              border: "3px solid rgba(255,255,255,0.3)", 
              borderTopColor: "#fff", 
              borderRadius: "50%", 
              animation: "spin 1s linear infinite",
              marginBottom: "1rem"
            }} />
            <span style={{ fontSize: "1.1rem", fontWeight: "500" }}>Carregando modelo...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        
        {error && (
          <div style={{ 
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", 
            color: "#ff4d4d", backgroundColor: "rgba(40, 10, 10, 0.95)", 
            padding: "24px 32px", borderRadius: "16px", zIndex: 30,
            textAlign: "center", border: "1px solid rgba(255, 77, 77, 0.3)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            maxWidth: "90%"
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "10px" }}>⚠️</div>
            <div style={{ fontWeight: "600" }}>{error}</div>
          </div>
        )}

        <video
          ref={videoRef}
          style={{ display: "block", width: "100%", height: "auto", transform: "scaleX(-1)" }} // Mirror effect for better UX
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transform: "scaleX(-1)" }} // Mirror canvas too
        />
      </div>

      <div style={{ 
        marginTop: "2rem",
        backgroundColor: "rgba(255,255,255,0.05)", 
        padding: "24px", 
        borderRadius: "20px",
        width: "100%",
        maxWidth: "800px",
        border: "1px solid rgba(255,255,255,0.05)",
        backdropFilter: "blur(10px)"
      }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          marginBottom: "16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          paddingBottom: "12px"
        }}>
          <span style={{ fontSize: "1.2rem", marginRight: "10px" }}>🚫</span>
          <span style={{ color: "white", fontWeight: "600", fontSize: "1.1rem" }}>Gestos Proibidos</span>
        </div>
        
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", 
          gap: "12px" 
        }}>
          {[
            { id: "MIDDLE_FINGER", icon: "🖕", label: "Dedo do meio", color: "#ff4d4d" },
            { id: "THUMBS_DOWN", icon: "👎", label: "Dislike", color: "#ffad33" },
            { id: "OK", icon: "👌", label: "OK", color: "#33cc33" },
            { id: "GUN", icon: "🔫", label: "Arma", color: "#ff4d4d" }
          ].map((item) => {
            const isActive = detectedGesture === item.id;
            return (
              <div key={item.id} style={{ 
                display: "flex", 
                alignItems: "center", 
                backgroundColor: isActive ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.2)", 
                padding: "12px 16px", 
                borderRadius: "12px",
                borderLeft: `4px solid ${item.color}`,
                transform: isActive ? "scale(1.05)" : "scale(1)",
                boxShadow: isActive ? `0 0 20px ${item.color}40` : "none",
                transition: "all 0.2s ease-in-out",
                border: isActive ? `1px solid ${item.color}80` : "1px solid transparent"
              }}>
                <span style={{ fontSize: "1.5rem", marginRight: "12px" }}>{item.icon}</span>
                <span style={{ 
                  color: isActive ? "#fff" : "#e0e0e0", 
                  fontSize: "0.95rem", 
                  fontWeight: isActive ? "700" : "500" 
                }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
