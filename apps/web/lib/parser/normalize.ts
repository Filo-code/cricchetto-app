export function splitCommandText(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\" && text[index + 1] === quote) {
        current += quote;
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function commandKeyword(input: string): string {
  const keyword = input.trim().toUpperCase();
  if (keyword === "RICERCA") return "CERCA";
  if (keyword === "AIUTO" || keyword === "HELP" || keyword === "COMANDI") return "COMANDO";
  return keyword;
}
