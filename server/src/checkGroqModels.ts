import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function checkModels() {
  try {
    const models = await groq.models.list();
    console.log("Available Groq Models:");
    for (const model of models.data) {
      console.log(`- ${model.id}`);
    }
  } catch (err) {
    console.error("Error fetching models:", err);
  }
}

checkModels();
