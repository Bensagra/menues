const model = process.argv[2];
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Decí hola." }] }], generationConfig: { maxOutputTokens: 200 } }) });
const j = await res.json();
console.log(model, res.status, res.ok ? "ok" : JSON.stringify(j.error?.details ?? j.error?.message).slice(0, 500));
