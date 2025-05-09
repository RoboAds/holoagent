import React, { useState, useRef, useEffect } from "react";

const VideoPopupPlayer = ({ videoName, onClose }) => {
  const videoRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (videoName) {
      setIsVisible(true);
      if (videoRef.current) {
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
    onClose();
  };

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
      {isVisible && videoName && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 transition-opacity duration-500">
          <div
            className={`relative w-full h-full animate-in ${
              isVisible ? "animate-in" : "animate-out"
            }`}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-2xl font-bold text-white bg-red-500 hover:bg-red-600 rounded-full w-10 h-10 flex items-center justify-center z-50 transition-transform duration-300 hover:scale-110"
            >
              ×
            </button>
            <video
              ref={videoRef}
              src={videoName}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain rounded-none"
              onEnded={handleClose}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default VideoPopupPlayer;
