import { invokeLLM } from "./_core/llm";

/**
 * Detects if a message has significant typos/spelling errors
 * and cleans it up using LLM before parsing intent.
 */
const TYPO_WORDS = new Set([
  "adn", "ehy", "teh", "hte", "taht", "waht", "losed", "jsut",
  "dont", "wont", "cant", "didnt", "doesnt", "isnt", "wasnt",
  "werent", "havent", "hasnt", "hadnt", "shouldnt", "wouldnt",
  "couldnt", "woudl", "shoudl", "coudl", "thier", "recieve",
  "beleive", "acheive", "occured", "seperate", "definately",
  "accomodate", "occurence", "wierd", "freind", "untill",
  "tommorow", "tomarrow", "tommorrow", "tomorow", "becuase",
  "beacuse", "becasue", "wich", "whcih", "hwo", "whn", "thn",
  "abt", "aobut", "abotu"
]);

export function hasSignificantTypos(message: string): boolean {
  const words = message.toLowerCase().split(/\s+/);
  let typoCount = 0;
  for (const word of words) {
    // Strip punctuation for matching
    const clean = word.replace(/[^a-z]/g, "");
    if (TYPO_WORDS.has(clean)) {
      typoCount++;
    }
  }
  // Also check for garbled sequences: 3+ short words in a row that look like typos
  // e.g., "adn ehy denan" — three 2-5 letter words that don't form coherent English
  if (typoCount >= 1) return true;

  // Check for repeated/garbled name patterns (e.g., "Deanna Jonker adn ehy denan")
  const garbledPattern = /[a-z]{2,5}\s+[a-z]{2,3}\s+[a-z]{2,5}/i;
  const matches = message.match(garbledPattern);
  if (matches) {
    // Only flag if the short words aren't common English
    const commonShort = new Set(["and", "the", "for", "but", "not", "you", "are", "was", "has", "had", "his", "her", "its", "our", "can", "did", "get", "got", "let", "may", "say", "she", "too", "use", "way", "who", "how", "now", "new", "old", "any", "all", "few", "big", "own", "try", "ask", "hey", "yes", "yet"]);
    const parts = matches[0].toLowerCase().split(/\s+/);
    const unknownCount = parts.filter(p => !commonShort.has(p) && p.length <= 3).length;
    if (unknownCount >= 2) return true;
  }

  return false;
}

export async function cleanupMessage(message: string): Promise<string> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a text cleanup assistant. Fix typos and spelling errors in the user's message while preserving the EXACT meaning, names, and intent. Do NOT add or remove content. Do NOT change the action being requested. Do NOT add pleasantries or formality. Just fix spelling and grammar. Return ONLY the cleaned message text, nothing else.`
        },
        { role: "user", content: message }
      ]
    });
    const cleaned = response.choices?.[0]?.message?.content;
    if (cleaned && typeof cleaned === "string" && cleaned.trim().length > 0) {
      console.log(`[parseIntent] Cleaned sloppy input: "${message}" -> "${cleaned.trim()}"`);
      return cleaned.trim();
    }
  } catch (e) {
    console.error("[parseIntent] Message cleanup failed, using original:", e);
  }
  return message;
}
