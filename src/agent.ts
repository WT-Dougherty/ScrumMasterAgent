import { Agent, run, setDefaultOpenAIKey, tool } from "@openai/agents";
import type { AgentInputItem, AssistantMessageItem } from "@openai/agents";
import { stdin as input, stdout as output } from "node:process";
import z from "zod";
import * as readline from "node:readline/promises";
import { ZepClient } from "@getzep/zep-cloud";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import dotenv from "dotenv";

// for local message storage and eventual conversion to zep message type
interface Message {
  name?: string;
  role: string;
  content: string;
}
const convertToZepMessages = (chatHistory: any[]) => {
  return chatHistory.map((msg) => ({
    role: msg.role,
    name: msg.name || null,
    content: msg.content,
  }));
};

// load environment variables
dotenv.config();

// define agent tools
const threadMessages: Message[] = [];
const getTimeTool = tool({
  name: "get time",
  description:
    "get the current time; use this to monitor user progress accross sessions",
  parameters: z.object({}),
  execute() {
    return new Date().toDateString();
  },
});

// agent and user info
const bot_name = "Scrum Master";

// CHANGE ID HERE ------------------------------------------------------------
const user_id = "Wille7d9";
// CHANGE ID HERE ------------------------------------------------------------

let userName = "";

// set up new conversation thread
const thread_id = uuidv4();
const ZEP_API_KEY: string = process.env.ZEP_API_KEY!;
const zep = new ZepClient({
  apiKey: ZEP_API_KEY,
});

zep.user
  .get(user_id)
  .then((user) => {
    userName = user.firstName ?? "";
  })
  .catch((error) => {
    console.log("Error Fetching User: ", error);
    process.exit(0);
  });
await zep.thread.create({
  userId: user_id,
  threadId: thread_id,
});

// memory management
const agentInput: AgentInputItem[] = [];
async function getLongTermMemory(threadID: string): Promise<AgentInputItem> {
  // NOTE: change mode for alternative long-term memory settings
  const memory = await zep.thread.getUserContext(threadID, { mode: "summary" });
  const mem: AgentInputItem = {
    role: "system",
    content: memory.context ?? "",
  };
  return mem;
}

// load the agent api key from environment; load instructions
setDefaultOpenAIKey(process.env.OPENAI_API_KEY!);
const instructionPath: string = "./instructions.txt";
const instruction: string = fs.readFileSync(instructionPath, "utf-8");

// create the agent
const agent = new Agent({
  name: bot_name,
  instructions: instruction,
  model: "o4-mini",
  modelSettings: { maxTokens: 8000 },
  tools: [getTimeTool],
});

// main chat interface function
async function main() {
  const rl = readline.createInterface({ input, output });

  // Graceful Ctrl+C
  rl.on("SIGINT", async () => {
    console.log("\nTerminating Conversation");
    rl.close();
  });
  console.log("Type 'exit' to quit.\n");

  while (true) {
    const user = (await rl.question("User Input: ")).trim();
    console.log("\n-------------------------------------");

    // add new message to memory arrays
    threadMessages.push({ name: userName, role: "user", content: user });
    agentInput.push({ role: "user", content: user, type: "message" });

    // user exit condition
    if (!user) continue;
    if (/^(exit|quit|q)$/i.test(user)) {
      break;
    }

    try {
      // fetch summary for agent
      const mem = await getLongTermMemory(thread_id);
      const newInput: AgentInputItem[] = agentInput.slice(-12);
      newInput.unshift(mem);

      // I feed the system summary and the previous 6 messages (as a zep processing buffer) to the agent
      const reply = await run(agent, newInput, { stream: true });
      reply
        .toTextStream({ compatibleWithNodeStreams: true })
        .pipe(process.stdout);
      await reply.completed;

      // push model response to message history
      threadMessages.push({
        name: "Scrum Master",
        role: "assistant",
        content: reply.finalOutput ?? "",
      });

      // remove last round's mem from the input to agent
      agentInput.splice(0, 1);

      // push model response to agentInput array
      agentInput.push({
        role: "assistant",
        status: "completed",
        type: "message",
        content: [{ type: "output_text", text: reply.finalOutput ?? "" }],
      } satisfies AssistantMessageItem as AgentInputItem);

      await zep.thread.addMessages(thread_id, {
        messages: convertToZepMessages(threadMessages.slice(-2)),
      });
      console.log("\n-------------------------------------");
    } catch (err) {
      console.error("Agent error:", err, "\n");
    }
  }

  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
