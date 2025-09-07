import { Agent, run, setDefaultOpenAIKey } from "@openai/agents";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import * as fs from "fs";
import dotenv from "dotenv";

// load the api key from environment; load instructions
dotenv.config();
setDefaultOpenAIKey(process.env.OPENAI_API_KEY!);
const instructionPath: string = "./instructions.txt";
const instruction: string = fs.readFileSync(instructionPath, "utf-8");

const agent = new Agent({
  name: "Scrum Master",
  instructions: instruction,
  model: "o4-mini",
  modelSettings: {},
  tools: [],
});

async function main() {
  const rl = readline.createInterface({ input, output });

  // Graceful Ctrl+C
  rl.on("SIGINT", () => {
    console.log("\nTerminating Conversation");
    rl.close();
  });

  console.log("Type 'exit' to quit.\n");

  while (true) {
    const user = (await rl.question("User Input: ")).trim();
    if (!user) continue;
    if (/^(exit|quit|q)$/i.test(user)) break;

    try {
      const reply = await run(agent, user);
      console.log(`Agent: ${reply.finalOutput}\n`);
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
