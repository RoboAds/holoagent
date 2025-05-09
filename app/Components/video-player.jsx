import React, { useRef, useEffect, FC } from "react";

interface VideoPopupPlayerProps {
  videoName: string;
  onClose: () => void;
}

const VideoPopupPlayer: FC<VideoPopupPlayerProps> = ({ videoName, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      video.play().catch((err) => {
        console.warn("Autoplay failed:", err);
      });
    }
  }, [videoName]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg max-w-xl relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-xl font-bold text-red-500"
        >
          ×
        </button>
        <video
          ref={videoRef}
          src={videoName}
          controls
          autoPlay
          muted
          playsInline
          className="w-full h-auto rounded"
        />
      </div>
    </div>
  );
};

export default VideoPopupPlayer;
