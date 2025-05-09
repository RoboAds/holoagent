import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://holoagent.ai/api";

export interface UpdateDurationResponse {
  status: number;
  message: string;
  is_duration_valid: 0 | 1;
  data?: {
    total_duration: number;
  };
}

export const updateDuration = async (
  face_id: string,
  customer_id: string,
  added_seconds: number
): Promise<UpdateDurationResponse> => {
  const res = await axios.post<UpdateDurationResponse>(
    `${API_BASE_URL}/simli/update-duration`,
    { face_id, customer_id, added_seconds }
  );
  return res.data;
};
