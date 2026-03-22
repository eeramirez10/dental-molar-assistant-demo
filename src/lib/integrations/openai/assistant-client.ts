import OpenAI from 'openai';

export class AssistantClient {
  readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createAssistant(params: {
    name: string;
    instructions: string;
    tools?: Array<Record<string, unknown>>;
    model?: string;
  }) {
    return this.client.beta.assistants.create({
      name: params.name,
      instructions: params.instructions,
      tools: params.tools as OpenAI.Beta.AssistantTool[] | undefined,
      model: params.model ?? 'gpt-4.1-mini',
    });
  }

  async createThread() {
    return this.client.beta.threads.create();
  }

  async appendUserMessage(threadId: string, input: string) {
    return this.client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: input,
    });
  }

  async createRun(threadId: string, assistantId: string) {
    return this.client.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
  }

  async retrieveRun(threadId: string, runId: string) {
    return this.client.beta.threads.runs.retrieve(runId, {
      thread_id: threadId,
    });
  }

  async submitToolOutputs(params: {
    threadId: string;
    runId: string;
    toolOutputs: Array<{ tool_call_id: string; output: string }>;
  }) {
    return this.client.beta.threads.runs.submitToolOutputs(params.runId, {
      thread_id: params.threadId,
      tool_outputs: params.toolOutputs,
    });
  }

  async listMessages(threadId: string) {
    return this.client.beta.threads.messages.list(threadId, {
      order: 'desc',
      limit: 20,
    });
  }
}
