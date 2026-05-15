#!/usr/bin/env node

require("./load-env");

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_URL = process.env.OPENROUTER_URL || "https://api.openrouter.ai/v1/chat/completions";

async function testOpenRouter() {
  console.log("\n🧪 Testing OpenRouter Configuration\n");
  console.log("━".repeat(60));

  if (!OPENROUTER_KEY) {
    console.log("❌ OPENROUTER_API_KEY is not set in .env");
    console.log("   Please add: OPENROUTER_API_KEY=sk-or-v1-...");
    return;
  }

  console.log("✅ API Key found (hidden)");
  console.log(`📍 URL: ${OPENROUTER_URL}`);
  console.log(`🤖 Test Model: gpt-4o-mini (free tier)\n`);
  console.log("━".repeat(60));

  try {
    console.log("\n📤 Sending test request to OpenRouter...\n");

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Respond with exactly: OpenRouter is working",
          },
        ],
        temperature: 0.2,
        max_tokens: 50,
      }),
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("\n❌ OpenRouter Request Failed\n");
      console.log("Response:", errorText);

      if (response.status === 401) {
        console.log("\n🔑 Issue: Invalid API Key");
        console.log("   Check your OPENROUTER_API_KEY in .env");
      } else if (response.status === 429) {
        console.log("\n⏱️  Issue: Rate limit exceeded");
        console.log("   Wait a moment and try again");
      } else if (response.status === 400) {
        console.log("\n⚠️  Issue: Bad request");
        console.log("   Model or parameters may be invalid");
      }
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    console.log("✅ OpenRouter is WORKING!\n");
    console.log("━".repeat(60));
    console.log("📝 Response from OpenRouter:");
    console.log(`"${content}"`);
    console.log("━".repeat(60));

    console.log("\n✨ Status: OPERATIONAL\n");
    console.log("Your P backend (OpenRouter) is ready to use!\n");

  } catch (error) {
    console.log("❌ Connection Error\n");
    console.log(`Error: ${error.message}`);
    console.log(`Code: ${error.code}`);
    if (error.cause) {
      console.log(`Cause: ${error.cause.message || error.cause}`);
    }
    console.log("\nDiagnostics:");
    console.log("  • Testing DNS resolution...");
    
    const dns = require("dns").promises;
    try {
      const addresses = await dns.resolve4("api.openrouter.ai");
      console.log(`  ✅ DNS resolves to: ${addresses[0]}`);
    } catch (dnsErr) {
      console.log(`  ❌ DNS failed: ${dnsErr.message}`);
    }

    console.log("\nPossible causes:");
    console.log("  • Network connectivity issue (firewall/proxy)");
    console.log("  • OpenRouter API is temporarily down");
    console.log("  • Invalid API key format");
    console.log("  • ISP blocking or VPN required");
  }
}

testOpenRouter();
