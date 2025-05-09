"use client";

import React, { useState, useEffect, useRef } from "react";
import SimliOpenAI from "./SimliOpenAI";
import { validateCustomer, ValidationResponse } from "./services/validateCustomer";
import { updateDuration, UpdateDurationResponse } from "./services/updateDuration";

// Extend the validation response to include the time-limit flag
declare module "./services/validateCustomer" {
  export interface ValidationResponse {
    is_duration_valid?: 0 | 1;
  }
}

// Config type for SimliOpenAI
interface CustomerConfig {
  simli_faceid: string;
  openai_voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse";
  openai_model: string;
  openai_api_key: string;
  initialPrompt: string;
  logo_url?: string;
}

const validVoices = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

const DynamicInteractionPage: React.FC = () => {
  const [customerValid, setCustomerValid] = useState(false);
  const [config, setConfig] = useState<CustomerConfig | null>(null);
  const [error, setError] = useState("");
  const [showLimitModal, setShowLimitModal] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Validate token and fetch config
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    tokenRef.current = token;

    if (!token) {
      setError("No token provided in the URL.");
      return;
    }

    (async () => {
      try {
        const resp = (await validateCustomer(token)) as ValidationResponse & { is_duration_valid?: 0 | 1 };

        // If the time limit is already expired, show modal right away
        if (resp.is_duration_valid === 0) {
          setShowLimitModal(true);
          return;
        }

        if (resp.status !== 1 || !resp.data) {
          setError("Invalid token. Please provide a valid token in the URL.");
          return;
        }

        // Choose a valid voice or default to 'echo'
        let voice: CustomerConfig["openai_voice"] = "echo";
        if (resp.data.voice_id && validVoices.includes(resp.data.voice_id as any)) {
          voice = resp.data.voice_id as CustomerConfig["openai_voice"];
        }

        // Set up config
        setConfig({
          simli_faceid: resp.data.face_id,
          openai_voice: voice,
          openai_api_key: resp.data.openai_api_key || "",
          openai_model: resp.data.openai_model || "gpt-4o-mini-realtime-preview-2024-12-17",
          initialPrompt: resp.data.initialPrompt || "Your default prompt here",
          logo_url: resp.data.logo_url || "",
        });

        setCustomerValid(true);
        setError("");
      } catch (err) {
        setError("Error validating token. Please try again.");
      }
    })();
  }, []);

  // Start timing on interaction open
  const handleStart = () => {
    startTimeRef.current = Date.now();
  };

  // Flush elapsed seconds to backend on interaction close
  const flushDuration = async () => {
    if (!startTimeRef.current || !config || !tokenRef.current) return;
    const elapsedSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
    startTimeRef.current = null;

    try {
      const result = (await updateDuration(
        config.simli_faceid,
        tokenRef.current,
        elapsedSec
      )) as UpdateDurationResponse & { is_duration_valid: 0 | 1 };

      if (result.is_duration_valid === 0) {
        setShowLimitModal(true);
      }
    } catch (err) {
      console.error("Failed to update duration", err);
    }
  };

  // On page refresh/close, send leftover time via sendBeacon
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!startTimeRef.current || !config || !tokenRef.current) return;
      const elapsedSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const payload = JSON.stringify({
        face_id: config.simli_faceid,
        customer_id: tokenRef.current,
        added_seconds: elapsedSec,
      });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(
        `${process.env.NEXT_PUBLIC_API_URL}/simli/update-duration`,
        blob
      );
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [config]);

  return (
    <div className="bg-black min-h-screen flex flex-col items-center justify-center font-abc-repro text-sm text-white p-8">

      {/* Popup Modal for expired session */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 rounded-xl p-6 max-w-sm w-full text-center">
            <h2 className="text-lg font-bold mb-3 text-white">Session Expired</h2>
            <p className="mb-4 text-gray-300">
              You’ve reached your conversation limit. Please upgrade your plan to continue.
            </p>
            <a
              href="https://holoagent.ai/index/wallet"
              className="inline-block px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            >
              Go to Payment
            </a>
          </div>
        </div>
      )}

      {/* Logo (if any) */}
      {config?.logo_url && !showLimitModal && (
        <div className="absolute top-5 right-5">
          <img
            src={config.logo_url}
            alt="Logo"
            className="h-24 object-contain"
          />
        </div>
      )}

      {/* Error message */}
      {!customerValid && !showLimitModal && error && (
        <div className="bg-red-100 text-red-800 p-4 rounded mb-4">
          {error}
        </div>
      )}

      {/* Interaction widget */}
      {customerValid && !showLimitModal && config && (
        <div className="flex flex-col items-center gap-6 bg-effect15White p-6 pb-[40px] rounded-xl w-full">
          <SimliOpenAI
            simli_faceid={config.simli_faceid}
            openai_voice={config.openai_voice}
            openai_model={config.openai_model}
            openai_api_key={config.openai_api_key}
            initialPrompt={config.initialPrompt}
            onStart={handleStart}
            onClose={flushDuration}
            showDottedFace={false}
          />
        </div>
      )}
    </div>
  );
};

export default DynamicInteractionPage;
