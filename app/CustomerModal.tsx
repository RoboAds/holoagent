"use client";
import React, { useState } from "react";

interface CustomerModalProps {
  onSubmit: (customerId: string) => void;
}

const CustomerModal: React.FC<CustomerModalProps> = ({ onSubmit }) => {
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId.trim()) {
      setError("Please enter a customer ID");
      return;
    }
    setError("");
    onSubmit(customerId.trim());
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50">
      <div className="bg-dark-300 text-black rounded-lg shadow-xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Enter Customer ID</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="e.g., 35456-64634-5634563456-363456"
            className="w-full p-2 border rounded mb-4 text-black"
          />
          {error && <p className="text-red-500 mb-2">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition"
          >
            Submit
          </button>
        </form>
      </div>
    </div>
  );
};

export default CustomerModal;