import React, { useState, useRef, useEffect } from "react";

const VideoPopupPlayer = ({ videoName }) => {
  const [showPopup, setShowPopup] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (showPopup && videoRef.current) {
      const video = videoRef.current;
      video.play().catch((err) => {
        console.warn("Autoplay failed:", err);
      });
    }
  }, [showPopup]);

  const openPopup = () => {
    setShowPopup(true);
  };

  const closePopup = () => {
    setShowPopup(false);
  };

  return (
    <div>
      <button onClick={openPopup} className="p-2 bg-blue-600 text-white rounded">
        Play Video
      </button>

      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-xl relative">
            <button
              onClick={closePopup}
              className="absolute top-2 right-2 text-xl font-bold text-red-500"
            >
              &times;
            </button>
            <video
              ref={videoRef}
              src={`/videos/${videoName}.mp4`}
              controls
              autoPlay
              muted
              playsInline
              className="w-full h-auto rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPopupPlayer;
