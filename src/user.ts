import { ZepClient } from "@getzep/zep-cloud";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const user_name = "Will";
const user_id = user_name + uuidv4().substring(0, 4);

const ZEP_API_KEY: string = process.env.ZEP_API_KEY!;
const zep = new ZepClient({
  apiKey: ZEP_API_KEY,
});
await zep.user.add({
  userId: user_id,
  firstName: user_name,
});

console.log("Your userID is:", user_id);
