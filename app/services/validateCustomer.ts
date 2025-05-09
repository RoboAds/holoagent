import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://holoagent.ai/api";

export interface ValidationResponse {
  status: number;
  message: string;
  is_duration_valid?: 0 | 1;
  data?: {
    face_id: string;
    voice_id: string;
    openai_model?: string;
    initialPrompt?: string;
    openai_api_key?: string;
    logo_url?: string;
  };
}

export const validateCustomer = async (
  customerId: string
): Promise<ValidationResponse> => {
  const response = await axios.get<ValidationResponse>(
    `${API_BASE_URL}/simli/validate-customer`,
    { params: { customer_id: customerId } }
  );
  return response.data;
};
