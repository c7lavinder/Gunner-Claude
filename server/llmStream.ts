import { ENV } from "./_core/env";

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

export async function invokeLLMStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void
): Promise<void> {
  if (!ENV.forgeApiKey) {
    onError(new Error("API key not configured"));
    return;
  }

  const payload = {
    model: "gemini-2.5-flash",
    messages,
    stream: true,
    max_tokens: 32768,
    thinking: { budget_tokens: 128 },
  };

  try {
    const response = await fetch(resolveApiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      onError(new Error(`LLM stream failed: ${response.status} – ${errorText}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError(new Error("No response body"));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            onChunk(delta);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    onDone();
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}
