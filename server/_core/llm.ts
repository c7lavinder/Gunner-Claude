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

export async function chatCompletionStream(params: {
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError?: (error: Error) => void;
}): Promise<void> {
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
      stream: true,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    const err = new Error(`OpenAI API error: ${res.status} ${error}`);
    params.onError?.(err);
    throw err;
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        params.onDone(fullText);
        return;
      }
      try {
        const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const chunk = parsed.choices?.[0]?.delta?.content ?? "";
        if (chunk) {
          fullText += chunk;
          params.onChunk(chunk);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }
  params.onDone(fullText);
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
