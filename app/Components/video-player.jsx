import React, { useState, useRef, useEffect } from "react";

const VideoPopupPlayer = ({ videoName, onClose }) => {
  const videoRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // Determine video source type
  const getVideoSource = (url) => {
    if (url.endsWith(".mp4") || url.endsWith(".mov")) {
      return { type: "s3", url };
    }
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const videoId = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
      if (videoId) {
        return { type: "youtube", url: `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1` };
      }
    }
    if (url.includes("vimeo.com")) {
      const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
      if (videoId) {
        return { type: "vimeo", url: `https://player.vimeo.com/video/${videoId}?autoplay=1` };
      }
    }
    // Instagram videos typically require authentication or specific handling
    // For simplicity, assume a direct embed URL is provided
    if (url.includes("instagram.com")) {
      return { type: "instagram", url };
    }
    return { type: "unknown", url };
  };

  useEffect(() => {
    if (videoName) {
      setIsVisible(true);
      if (videoRef.current && getVideoSource(videoName).type === "s3") {
        videoRef.current.play().catch((err) => {
          console.warn("Autoplay failed:", err);
        });
      }
    } else {
      setIsVisible(false);
    }
  }, [videoName]);

  const handleClose = () => {
    setIsVisible(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    onClose();
  };

  if (!videoName) return null;

  const videoSource = getVideoSource(videoName);
  const isS3Video = videoSource.type === "s3";

  return (
    <>
      <style>
        {`
          .animate-in {
            animation: slideIn 0.5s ease-out forwards;
          }
          .animate-out {
            animation: slideOut 0.5s ease-in forwards;
          }
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: scale(0.8);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          @keyframes slideOut {
            from {
              opacity: 1;
              transform: scale(1);
            }
            to {
              opacity: 0;
              transform: scale(0.8);
            }
          }
        `}
      </style>
      {isVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 transition-opacity duration-500">
          <div
            className={`relative w-full h-full ${isVisible ? "animate-in" : "animate-out"}`}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-2xl font-bold text-white bg-red-500 hover:bg-red-600 rounded-full w-10 h-10 flex items-center justify-center z-50 transition-transform duration-300 hover:scale-110"
            >
              ×
            </button>
            {isS3Video ? (
              <video
                ref={videoRef}
                src={videoSource.url}
                controls={!isS3Video}
                autoPlay
                playsInline
                className="w-full h-full object-contain rounded-none"
                onEnded={handleClose}
              />
            ) : (
              <iframe
                src={videoSource.url}
                className="w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
                title="Video Player"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default VideoPopupPlayer;
