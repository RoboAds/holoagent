import React, { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeClient } from "@openai/realtime-api-beta";
import { SimliClient } from "simli-client";
import VideoBox from "./Components/VideoBox";
import VideoPopupPlayer from "./Components/video-player";
import cn from "./utils/TailwindMergeAndClsx";
import IconExit from "@/media/IconExit";
import IconSparkleLoader from "@/media/IconSparkleLoader";

interface SimliOpenAIPushToTalkProps {
  simli_faceid: string;
  openai_voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse";
  openai_model: string;
  initialPrompt: string;
  openai_api_key: string;
  userId: string;
  onStart: () => void;
  onClose: () => void;
  showDottedFace: boolean;
}

const simliClient = new SimliClient();

const SimliOpenAIPushToTalk: React.FC<SimliOpenAIPushToTalkProps> = ({
  simli_faceid,
  openai_voice,
  openai_model,
  initialPrompt,
  openai_api_key,
  userId,
  onStart,
  onClose,
  showDottedFace,
}) => {
  // State management
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAvatarVisible, setIsAvatarVisible] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [userMessage, setUserMessage] = useState<string>("...");
  const [videoName, setVideoName] = useState<string | null>(null);
  const [useFullscreenVideo] = useState<boolean>(true);
  const [avatarPosition, setAvatarPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isButtonDisabled, setIsButtonDisabled] = useState<boolean>(false);

  // Refs for various components and states
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const openAIClientRef = useRef<RealtimeClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunkQueueRef = useRef<Int16Array[]>([]);
  const isProcessingChunkRef = useRef<boolean>(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isSpacePressedRef = useRef<boolean>(false);

  /**
   * Initializes the Simli client with the provided configuration.
   */
  const initializeSimliClient = useCallback(() => {
    if (videoRef.current && audioRef.current) {
      const SimliConfig = {
        apiKey: process.env.NEXT_PUBLIC_SIMLI_API_KEY,
        faceID: simli_faceid,
        handleSilence: true,
        maxSessionLength: 30600,
        maxIdleTime: 30600,
        videoRef: videoRef.current,
        audioRef: audioRef.current,
        enableConsoleLogs: true,
      };

      simliClient.Initialize(SimliConfig as any);
      console.log("Simli Client initialized");
    }
  }, [simli_faceid]);

  /**
   * Initializes the OpenAI client, sets up event listeners, and connects to the API.
   */
  const initializeOpenAIClient = useCallback(async () => {
    try {
      console.log("Initializing OpenAI client...");
      openAIClientRef.current = new RealtimeClient({
        model: openai_model,
        apiKey: openai_api_key,
        dangerouslyAllowAPIKeyInBrowser: true,
      });

      await openAIClientRef.current.updateSession({
        instructions: initialPrompt,
        voice: openai_voice,
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
      });

      openAIClientRef.current.addTool(
        {
          name: "get_product_details",
          description:
            "retrieves product details from knowledge base about the product like price, features, and description",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "This is the question about the product that user needs from knowledge base",
              },
              userid: {
                type: "string",
                description: "This the user id that this llm will send to knowledge base llm. Send the current user id",
              },
            },
            required: ["query", "userid"],
          },
        },
        async ({ query, userid }: { query: string; userid: string }) => {
          try {
            const result = await fetch("https://app.holoagent.ai/query", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query, userid }),
            });
            if (!result.ok) throw new Error("Failed to fetch product details");
            return await result.json();
          } catch (err) {
            console.error("Error fetching product details:", err);
            return { error: "Failed to retrieve product details" };
          }
        }
      );

      openAIClientRef.current.addTool(
        {
          name: "play_product_video",
          description:
            "Plays a video based on the provided video_url or fetches a video URL from the knowledge base. Supports S3 URLs (.mp4, .mov) and external URLs (YouTube, Vimeo, etc.).",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "The query about the product video to send to the knowledge base if video_url is not provided.",
              },
              video_url: {
                type: "string",
                description:
                  "The video URL to play. Can be an S3 URL (.mp4, .mov) or an external URL (YouTube, Vimeo, etc.). If not provided, the video will be fetched using the query.",
              },
              userid: {
                type: "string",
                description: "The user ID to send to the knowledge base.",
              },
            },
            required: ["query", "userid"],
            additionalProperties: false,
          },
        },
        async ({ query, video_url, userid }: { query: string; video_url?: string; userid: string }) => {
          console.log("play_product_video tool called with parameters:", {
            query,
            video_url,
            userid,
          });

          try {
            if (video_url) {
              const isS3Video = video_url.endsWith(".mp4") || video_url.endsWith(".mov");
              const isExternalVideo = video_url.includes("youtube.com") || video_url.includes("vimeo.com") || video_url.includes("instagram.com");
              if (isS3Video || isExternalVideo) {
                console.log("Valid video_url provided, setting videoName:", video_url);
                setVideoName(video_url);
                return { message: "Playing video from provided URL", video_url };
              } else {
                console.log("Invalid video_url provided:", video_url);
                throw new Error("Invalid video URL format");
              }
            }

            console.log("No valid video_url provided, fetching from API...");
            const requestPayload = { query, userid: simli_faceid };
            console.log("API request payload:", requestPayload);

            const result = await fetch("https://app.holoagent.ai/video", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestPayload),
            });

            console.log("API response status:", result.status, result.statusText);
            if (!result.ok) {
              throw new Error(`Failed to fetch video: ${result.statusText}`);
            }

            const responseData = await result.json();
            console.log("Raw API response:", responseData);

            if (
              responseData &&
              responseData.response &&
              typeof responseData.response === "string"
            ) {
              const videoUrl = responseData.response;
              const isS3Video = videoUrl.endsWith(".mp4") || videoUrl.endsWith(".mov");
              const isExternalVideo = videoUrl.includes("youtube.com") || videoUrl.includes("vimeo.com") || videoUrl.includes("instagram.com");
              if (isS3Video || isExternalVideo) {
                console.log("Valid video URL received from API, setting videoName:", videoUrl);
                setVideoName(videoUrl);
                setAvatarPosition({ x: 0, y: 0 });
                return { message: "Video fetched and playing", video_url: videoUrl };
              } else {
                console.log("Invalid video URL in response:", responseData);
                throw new Error("Invalid video URL in response");
              }
            } else {
              console.log("Missing video URL in response:", responseData);
              throw new Error("Missing video URL in response");
            }
          } catch (err) {
            console.error("Error in play_product_video:", err);
            setError(`Failed to fetch or play video: ${(err as Error).message}`);
            return { error: "Failed to fetch or play video", details: (err as Error).message };
          }
        }
      );

      openAIClientRef.current.on("conversation.updated", handleConversationUpdate);
      openAIClientRef.current.on("conversation.interrupted", interruptConversation);
      openAIClientRef.current.on("input_audio_buffer.speech_stopped", handleSpeechStopped);

      await openAIClientRef.current.connect();
      console.log("OpenAI Client connected successfully");
      openAIClientRef.current?.createResponse();

      setIsAvatarVisible(true);
    } catch (error) {
      console.error("Error initializing OpenAI client:", error);
      setError(`Failed to initialize OpenAI client: ${(error as Error).message}`);
    }
  }, [initialPrompt, openai_model, openai_voice, openai_api_key]);

  /**
   * Handles conversation updates, including user and assistant messages.
   */
  const handleConversationUpdate = useCallback((event: any) => {
    console.log("Conversation updated:", event);
    const { item, delta } = event;

    if (item.type === "message" && item.role === "assistant") {
      console.log("Assistant message detected");
      if (delta && delta.audio) {
        const downsampledAudio = downsampleAudio(delta.audio, 24000, 16000);
        audioChunkQueueRef.current.push(downsampledAudio);
        if (!isProcessingChunkRef.current) {
          processNextAudioChunk();
        }
      }
    } else if (item.type === "message" && item.role === "user") {
      setUserMessage(item.content[0].transcript || "...");
    }
  }, []);

  /**
   * Handles interruptions in the conversation flow.
   */
  const interruptConversation = () => {
    console.warn("User interrupted the conversation");
    simliClient?.ClearBuffer();
    openAIClientRef.current?.cancelResponse("");
  };

  /**
   * Processes the next audio chunk in the queue.
   */
  const processNextAudioChunk = useCallback(() => {
    if (audioChunkQueueRef.current.length > 0 && !isProcessingChunkRef.current) {
      isProcessingChunkRef.current = true;
      const audioChunk = audioChunkQueueRef.current.shift();
      if (audioChunk) {
        const chunkDurationMs = (audioChunk.length / 16000) * 1000;
        const uint8Array = new Uint8Array(audioChunk.buffer);
        simliClient?.sendAudioData(uint8Array);
        console.log(
          "Sent audio chunk to Simli: Duration:",
          chunkDurationMs.toFixed(2),
          "ms"
        );
        isProcessingChunkRef.current = false;
        processNextAudioChunk();
      }
    }
  }, []);

  /**
   * Handles the end of user speech.
   */
  const handleSpeechStopped = useCallback((event: any) => {
    console.log("Speech stopped event received", event);
    // Trigger OpenAI response creation after speech stops
    if (!isRecording) {
      openAIClientRef.current?.createResponse();
    }
  }, [isRecording]);

  /**
   * Applies a simple low-pass filter to prevent aliasing of audio
   */
  const applyLowPassFilter = (data: Int16Array, cutoffFreq: number, sampleRate: number): Int16Array => {
    const numberOfTaps = 31;
    const coefficients = new Float32Array(numberOfTaps);
    const fc = cutoffFreq / sampleRate;
    const middle = (numberOfTaps - 1) / 2;

    for (let i = 0; i < numberOfTaps; i++) {
      if (i === middle) {
        coefficients[i] = 2 * Math.PI * fc;
      } else {
        const x = 2 * Math.PI * fc * (i - middle);
        coefficients[i] = Math.sin(x) / (i - middle);
      }
      coefficients[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (numberOfTaps - 1));
    }

    const sum = coefficients.reduce((acc, val) => acc + val, 0);
    coefficients.forEach((_, i) => (coefficients[i] /= sum));

    const result = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < numberOfTaps; j++) {
        const idx = i - j + middle;
        if (idx >= 0 && idx < data.length) {
          sum += coefficients[j] * data[idx];
        }
      }
      result[i] = Math.round(sum);
    }

    return result;
  };

  /**
   * Downsamples audio data from one sample rate to another using linear interpolation
   */
  const downsampleAudio = (audioData: Int16Array, inputSampleRate: number, outputSampleRate: number): Int16Array => {
    if (inputSampleRate === outputSampleRate) {
      return audioData;
    }

    if (inputSampleRate < outputSampleRate) {
      throw new Error("Upsampling is not supported");
    }

    const filteredData = applyLowPassFilter(audioData, outputSampleRate * 0.45, inputSampleRate);

    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.floor(audioData.length / ratio);
    const result = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;

      if (index + 1 < filteredData.length) {
        const a = filteredData[index];
        const b = filteredData[index + 1];
        result[i] = Math.round(a + fraction * (b - a));
      } else {
        result[i] = filteredData[index];
      }
    }

    return result;
  };

  /**
   * Starts audio recording from the user's microphone.
   */
  const startRecording = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    try {
      console.log("Starting audio recording...");
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      processorRef.current = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      processorRef.current.onaudioprocess = (e: AudioProcessingEvent) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          audioData[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768)));
        }

        openAIClientRef.current?.appendInputAudio(audioData);
      };

      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      setIsRecording(true);
      console.log("Audio recording started");
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Error accessing microphone. Please check your permissions.");
    }
  }, []);

  /**
   * Stops audio recording from the user's microphone
   */
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    console.log("Audio recording stopped");
    // Trigger response creation after stopping recording
    openAIClientRef.current?.createResponse();
  }, []);

  /**
   * Handles the start of the interaction, initializing clients and starting recording.
   */
  const handleStart = useCallback(async () => {
    setIsLoading(true);
    setError("");
    onStart();

    try {
      console.log("Starting...");
      initializeSimliClient();
      await simliClient?.start();
      eventListenerSimli();
    } catch (error) {
      console.error("Error starting interaction:", error);
      setError(`Error starting interaction: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [onStart, initializeSimliClient]);

  /**
   * Handles stopping the interaction, cleaning up resources and resetting states.
   */
  const handleStop = useCallback(() => {
    console.log("Stopping interaction...");
    setIsLoading(false);
    setError("");
    stopRecording();
    setIsAvatarVisible(false);
    setVideoName(null);
    setAvatarPosition({ x: 0, y: 0 });
    simliClient?.close();
    openAIClientRef.current?.disconnect();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    onClose();
    console.log("Interaction stopped");
  }, [stopRecording, onClose]);

  /**
   * Push-to-talk button handlers
   */
  const handlePushToTalkStart = useCallback(() => {
    if (!isButtonDisabled && !isRecording) {
      setIsButtonDisabled(true);
      startRecording();
      simliClient?.ClearBuffer();
      openAIClientRef.current?.cancelResponse("");
    }
  }, [startRecording, isButtonDisabled, isRecording]);

  const handlePushToTalkEnd = useCallback(() => {
    setTimeout(() => {
      stopRecording();
      setIsButtonDisabled(false);
    }, 500);
  }, [stopRecording]);

  /**
   * Keyboard event handlers for Space key
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === "Space" && !isSpacePressedRef.current && isAvatarVisible && !isButtonDisabled) {
        e.preventDefault(); // Prevent default behavior (e.g., scrolling)
        isSpacePressedRef.current = true;
        handlePushToTalkStart();
      }
    },
    [handlePushToTalkStart, isAvatarVisible, isButtonDisabled]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === "Space" && isSpacePressedRef.current) {
        e.preventDefault();
        isSpacePressedRef.current = false;
        handlePushToTalkEnd();
      }
    },
    [handlePushToTalkEnd]
  );

  /**
   * Simli Event listeners
   */
  const eventListenerSimli = useCallback(() => {
    if (simliClient) {
      simliClient.on("connected", () => {
        console.log("SimliClient connected");
        initializeOpenAIClient();
      });

      simliClient.on("disconnected", () => {
        console.log("SimliClient disconnected");
        openAIClientRef.current?.disconnect();
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
      });
    }
  }, [initializeOpenAIClient]);

  /**
   * Handles video close event
   */
  const handleVideoClose = useCallback(() => {
    setVideoName(null);
    setAvatarPosition({ x: 0, y: 0 });
  }, []);

  /**
   * Draggable avatar handlers
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoName && useFullscreenVideo) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - avatarPosition.x,
        y: e.clientY - avatarPosition.y,
      };
      e.preventDefault();
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      setAvatarPosition({ x: newX, y: newY });
    }
  }, [isDragging]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  /**
   * Visualize mic audio
   */
  const AudioVisualizer = () => {
    const [volume, setVolume] = useState(0);

    useEffect(() => {
      const interval = setInterval(() => {
        setVolume(Math.random() * 100);
      }, 100);

      return () => clearInterval(interval);
    }, []);

    return (
      <div className="flex items-end justify-center space-x-1 h-5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="w-2 bg-black transition-all duration-300 ease-in-out"
            style={{
              height: `${Math.min(100, volume + Math.random() * 20)}%`,
            }}
          />
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove]);

  // Add keyboard event listeners for Space key
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <>
      <style>
        {`
          .gradient-button {
            background: linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
            background-size: 200% 200%;
            animation: gradientAnimation 8s ease infinite;
          }
          @keyframes gradientAnimation {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .avatar-slide-in {
            animation: avatarSlideIn 0.5s ease-out forwards;
          }
          .avatar-slide-out {
            animation: avatarSlideOut 0.5s ease-in forwards;
          }
          @keyframes avatarSlideIn {
            from {
              transform: translateY(100%) scale(0.7);
              opacity: 0.8;
            }
            to {
              transform: translateY(0) scale(1);
              opacity: 1;
            }
          }
          @keyframes avatarSlideOut {
            from {
              transform: translateY(0) scale(1);
              opacity: 1;
            }
            to {
              transform: translateY(100%) scale(0.7);
              opacity: 0.8;
            }
          }
          .animate-hide {
            animation: hide 0.3s ease-in forwards;
          }
          @keyframes hide {
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

      {/* Video Popup Player */}
      <VideoPopupPlayer videoName={videoName} onClose={handleVideoClose} />

      {/* Main Content */}
      <div className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Avatar Wrapper - Centered or Draggable Bottom-Right */}
        <div
          ref={avatarRef}
          onMouseDown={handleMouseDown}
          className={cn(
            "transition-all duration-500 z-50 flex justify-center items-center",
            showDottedFace ? "h-0 overflow-hidden" : "h-auto",
            isAvatarVisible && videoName && useFullscreenVideo
              ? "fixed w-[300px] h-[300px] bg-black/20 rounded-xl overflow-hidden shadow-2xl avatar-slide-in cursor-move"
              : isAvatarVisible
              ? "w-full max-w-[800px] relative"
              : "hidden"
          )}
          style={
            isAvatarVisible && videoName && useFullscreenVideo
              ? {
                  left: `calc(100% - 320px + ${avatarPosition.x}px)`,
                  top: `calc(100% - 320px + ${avatarPosition.y}px)`,
                }
              : {}
          }
        >
          <div
            className={cn(
              "transition-transform duration-700 ease-in-out",
              isAvatarVisible && videoName && useFullscreenVideo ? "scale-75 origin-center" : "scale-100"
            )}
          >
            <VideoBox video={videoRef} audio={audioRef} />
          </div>
        </div>

        {/* Interaction Buttons and GIF */}
        <div
          className={cn(
            "flex flex-col items-center justify-center z-50 w-full max-w-[800px]",
            isAvatarVisible ? "animate-hide" : "opacity-100"
          )}
        >
          {!isAvatarVisible ? (
            <div className="flex flex-col items-center justify-center space-y-8">
              {/* GIF Animation - Shown when interaction is not started */}
              <img
                src="https://faceaqses.s3.us-east-1.amazonaws.com/holoagent/project-images/holoagent1234567.gif"
                alt="Holoagent Animation"
                width="350"
                height="350"
                className="mx-auto"
              />
              {/* Gradient Button */}
              <button
                onClick={handleStart}
                disabled={isLoading}
                className={cn(
                  "gradient-button inline-flex text-white px-6 py-3 rounded-[100px] transition-all duration-300 hover:rounded-sm hover:shadow-lg hover:scale-105 items-center justify-center",
                  isLoading ? "opacity-50 cursor-not-allowed" : ""
                )}
              >
                {isLoading ? (
                  <IconSparkleLoader className="h-[20px] animate-loader" />
                ) : (
                  <span className="font-abc-repro-mono font-bold">Talk To Agent</span>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4 w-full">
              <button
                onMouseDown={handlePushToTalkStart}
                onTouchStart={handlePushToTalkStart}
                onMouseUp={handlePushToTalkEnd}
                onTouchEnd={handlePushToTalkEnd}
                onMouseLeave={handlePushToTalkEnd}
                disabled={isButtonDisabled}
                className={cn(
                  "mt-4 text-white flex-grow bg-blue-500 hover:rounded-sm hover:bg-opacity-70 h-[52px] px-6 rounded-[100px] transition-all duration-300",
                  isRecording && "bg-[#1B1B1B] rounded-sm hover:bg-opacity-100",
                  isButtonDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="font-abc-repro-mono font-bold w-[164px]">
                  {isRecording ? "Release to Stop" : "Push & hold to talk (or Space)"}
                </span>
              </button>
              <button
                onClick={handleStop}
                className={cn(
                  "group w-[52px] h-[52px] flex items-center mt-4 bg-red-500 text-white justify-center rounded-[100px] backdrop-blur transition-all duration-300 hover:bg-white hover:text-black hover:rounded-sm"
                )}
              >
                <IconExit className="group-hover:invert-0 group-hover:brightness-0 transition-all duration-300" />
              </button>
              {isRecording && <AudioVisualizer />}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-500 text-center mt-4 font-abc-repro-mono absolute bottom-4">
            {error}
          </div>
        )}
      </div>
    </>
  );
};

export default SimliOpenAIPushToTalk;
