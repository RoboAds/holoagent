import React, { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeClient } from "@openai/realtime-api-beta";
import { SimliClient } from "simli-client";
import VideoBox from "./Components/VideoBox";
import VideoPopupPlayer from "./Components/video-player";
import cn from "./utils/TailwindMergeAndClsx";
import IconExit from "@/media/IconExit";
import IconSparkleLoader from "@/media/IconSparkleLoader";

interface SimliOpenAIProps {
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

const SimliOpenAI: React.FC<SimliOpenAIProps> = ({
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
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarVisible, setIsAvatarVisible] = useState(false);
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [userMessage, setUserMessage] = useState("...");
  const [videoName, setVideoName] = useState<string | null>(null);
  const [useFullscreenVideo, setUseFullscreenVideo] = useState(false); // Toggle for fullscreen vs popup video

  // Refs for various components and states
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const openAIClientRef = useRef<RealtimeClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunkQueueRef = useRef<Int16Array[]>([]);
  const isProcessingChunkRef = useRef(false);

  /**
   * Initializes the Simli client with the provided configuration.
   */
  const initializeSimliClient = useCallback(() => {
    if (videoRef.current && audioRef.current) {
      const SimliConfig = {
        apiKey: process.env.NEXT_PUBLIC_SIMLI_API_KEY,
        faceID: simli_faceid,
        handleSilence: true,
        maxSessionLength: 30600, // in seconds
        maxIdleTime: 30600, // in seconds
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

      // Add tool for getting product details
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

      // Add tool for playing product video
      openAIClientRef.current.addTool(
        {
          name: "play_product_video",
          description:
            "plays the video of the product that user needs from the memory. If the video is not in memory, it will call the knowledge base to fetch the video. If the video link is not available, or if it looks invalid, it will call the knowledge base to fetch the video",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "This is the video about the product that user needs from knowledge base. This is the request that this llm will send to knowledge base llm",
              },
              video_url: {
                type: "string",
                description:
                  "This is the video url that user needs to play from knowledge base. If the video is not in memory, it will call the knowledge base with query to fetch the video and play it. This is just the video URL without any other text. Ends with .mp4",
              },
              userid: {
                type: "string",
                description: "This the user id that this llm will send to knowledge base llm. Send the current user id",
              },
            },
            required: ["query", "video_url", "userid"],
          },
        },
        async ({
          query,
          video_url,
          userid,
        }: {
          query: string;
          video_url: string;
          userid: string;
        }) => {
          try {
            const result = await fetch("https://app.holoagent.ai/video", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query, userid }),
            });
            if (!result.ok) throw new Error("Failed to fetch video");
            const json = await result.json();
            if (video_url) setVideoName(video_url);
            return json;
          } catch (err) {
            console.error("Error fetching video:", err);
            return { error: "Failed to retrieve video" };
          }
        }
      );

      // Set up event listeners
      openAIClientRef.current.on("conversation.updated", handleConversationUpdate);
      openAIClientRef.current.on("conversation.interrupted", interruptConversation);
      openAIClientRef.current.on("input_audio_buffer.speech_stopped", handleSpeechStopped);

      await openAIClientRef.current.connect();
      console.log("OpenAI Client connected successfully");
      openAIClientRef.current?.createResponse();
      startRecording();

      setIsAvatarVisible(true);
    } catch (error: any) {
      console.error("Error initializing OpenAI client:", error);
      setError(`Failed to initialize OpenAI client: ${error.message}`);
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
        simliClient?.sendAudioData(audioChunk as any);
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
  }, []);

  /**
   * Applies a simple low-pass filter to prevent aliasing of audio
   */
  const applyLowPassFilter = (
    data: Int16Array,
    cutoffFreq: number,
    sampleRate: number
  ): Int16Array => {
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
      coefficients[i] *=
        0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (numberOfTaps - 1));
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
   * and anti-aliasing filter.
   */
  const downsampleAudio = (
    audioData: Int16Array,
    inputSampleRate: number,
    outputSampleRate: number
  ): Int16Array => {
    if (inputSampleRate === outputSampleRate) {
      return audioData;
    }

    if (inputSampleRate < outputSampleRate) {
      throw new Error("Upsampling is not supported");
    }

    const filteredData = applyLowPassFilter(
      audioData,
      outputSampleRate * 0.45,
      inputSampleRate
    );

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

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]));
          audioData[i] = Math.floor(sample * 32767);
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
    } catch (error: any) {
      console.error("Error starting interaction:", error);
      setError(`Error starting interaction: ${error.message}`);
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
        `}
      </style>
      {/* Fullscreen Background Video Layer */}
      {isAvatarVisible && videoName && useFullscreenVideo && (
        <video
          src={videoName}
          autoPlay
          onEnded={() => setVideoName(null)}
          className="fixed inset-0 z-40 w-full h-full object-cover transition-all duration-700 ease-in-out"
        />
      )}

      {/* Popup Video Player (Default) */}
      {isAvatarVisible && videoName && !useFullscreenVideo && <VideoPopupPlayer videoName={videoName} />}

      {/* Main Content */}
      <div className="relative min-h-screen">
        {/* Avatar Wrapper - Responsive Stage */}
        <div
          className={cn(
            "transition-all duration-300 z-50",
            showDottedFace ? "h-0 overflow-hidden" : "h-auto",
            isAvatarVisible && videoName && useFullscreenVideo
              ? "fixed bottom-4 right-4 w-[400px] h-[400px] bg-black/10 rounded-xl flex items-center justify-center overflow-hidden shadow-xl"
              : "flex justify-center items-center h-[calc(100vh-150px)] w-full relative"
          )}
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

        {/* Close Button for Fullscreen Video */}
        {isAvatarVisible && videoName && useFullscreenVideo && (
          <button
            onClick={() => setVideoName(null)}
            className="fixed top-4 right-4 text-white bg-black/50 hover:bg-black rounded-full px-3 py-1 text-xl z-50 transition-all duration-300"
          >
            ✕
          </button>
        )}

        {/* Interaction Buttons */}
        <div className="flex flex-col items-center z-50 relative">
          {!isAvatarVisible ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-8">
              {/* GIF Animation */}
              <img
                src="https://faceaqses.s3.us-east-1.amazonaws.com/holoagent/project-images/holoagent1234567.gif"
                alt="Holoagent Animation"
                width="350"
                height="350"
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
            <div className="flex items-center gap-4 w-full mt-4">
              <button
                onClick={handleStop}
                className={cn(
                  "group text-white flex-grow bg-red hover:rounded-sm hover:bg-white h-[52px] px-6 rounded-[100px] transition-all duration-300"
                )}
              >
                <span className="font-abc-repro-mono group-hover:text-black font-bold w-[164px] transition-all duration-300">
                  Stop Interaction
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SimliOpenAI;
