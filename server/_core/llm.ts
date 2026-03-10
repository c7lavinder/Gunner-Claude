import { ENV } from "./env";

const OPENAI_BASE = "https://api.openai.com/v1";

export async function chatCompletion(params: {
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: params.model ?? "gpt-4o",
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${error}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<string> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(audioBuffer)]),
    filename
  );
  formData.append("model", "whisper-1");
  formData.append("response_format", "text");

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.openaiApiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Whisper API error: ${res.status} ${error}`);
  }

  return res.text();
}
