import { ENV } from "./env";
import { Client as LangSmithClient } from "langsmith";
import { randomUUID } from "crypto";

// LangSmith client — only active when LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY set
const lsEnabled =
  process.env.LANGCHAIN_TRACING_V2 === "true" && !!process.env.LANGCHAIN_API_KEY;
const lsClient = lsEnabled ? new LangSmithClient() : null;

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

const assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff in ms

function isRetryableError(status: number): boolean {
  // Retry on rate limits (429), server errors (500-599), and timeouts (408)
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  // LangSmith: create a run to trace this LLM call
  const runId = randomUUID();
  const runStartTime = Date.now();
  if (lsClient) {
    try {
      await lsClient.createRun({
        id: runId,
        name: "invokeLLM",
        run_type: "llm",
        project_name: process.env.LANGCHAIN_PROJECT ?? "gunner",
        inputs: { messages: params.messages },
        start_time: runStartTime,
      });
    } catch {
      // Non-blocking: tracing failure must never break the app
    }
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768
  payload.thinking = {
    "budget_tokens": 1024
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        if (isRetryableError(response.status) && attempt < MAX_RETRIES) {
          console.warn(`[LLM] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${response.status}), retrying in ${RETRY_DELAYS[attempt]}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }
        throw new Error(
          `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
        );
      }

      const result = (await response.json()) as InvokeResult;

      // Validate that we got a meaningful response
      const content = result.choices?.[0]?.message?.content;
      if (!content && !result.choices?.[0]?.message?.tool_calls) {
        if (attempt < MAX_RETRIES) {
          console.warn(`[LLM] Attempt ${attempt + 1}/${MAX_RETRIES + 1} returned empty content, retrying...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }
      }

      // LangSmith: end run on success
      if (lsClient) {
        try {
          await lsClient.updateRun(runId, {
            outputs: { choices: result.choices },
            end_time: Date.now(),
          });
        } catch {
          // Non-blocking
        }
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES && !lastError.message.includes('LLM invoke failed:')) {
        // Network errors, timeouts, etc. — retry
        console.warn(`[LLM] Attempt ${attempt + 1}/${MAX_RETRIES + 1} threw error: ${lastError.message}, retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        continue;
      }
      // LangSmith: end run on error
      if (lsClient) {
        try {
          await lsClient.updateRun(runId, {
            error: lastError.message,
            end_time: Date.now(),
          });
        } catch {
          // Non-blocking
        }
      }
      throw lastError;
    }
  }

  throw lastError || new Error('LLM invoke failed after all retries');
}
