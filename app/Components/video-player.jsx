import React, { useRef, useEffect } from "react";
import IconExit from "@/media/IconExit";

interface VideoPopupPlayerProps {
  videoName: string;
  showPopup: boolean;
  onClose: () => void;
}

const VideoPopupPlayer: React.FC<VideoPopupPlayerProps> = ({ videoName, showPopup, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (showPopup && videoRef.current) {
      const video = videoRef.current;
      video.play().catch((err) => {
        console.warn("Autoplay failed:", err);
      });
    }
  }, [showPopup]);

  if (!showPopup) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg max-w-xl relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-white"
        >
          <IconExit className="h-6 w-6" />
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
  );
};

export default VideoPopupPlayer;
