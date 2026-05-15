#!/usr/bin/env node

const dns = require("dns").promises;
const https = require("https");
const http = require("http");

async function testNetwork() {
  console.log("\n🔍 Network & DNS Diagnostics\n");
  console.log("━".repeat(60));

  // Test 1: DNS Servers
  console.log("\n1️⃣  System DNS Servers:");
  const dnsServers = dns.getServers?.() || dns.resolveSrv?.() || [];
  if (Array.isArray(dnsServers) && dnsServers.length > 0) {
    dnsServers.forEach(server => console.log(`   ${server}`));
  } else {
    console.log("   Using default system DNS");
  }

  // Test 2: Resolve api.openrouter.ai
  console.log("\n2️⃣  Resolving api.openrouter.ai:");
  try {
    const addresses = await dns.resolve4("api.openrouter.ai");
    console.log(`   ✅ Resolved to: ${addresses.join(", ")}`);
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
  }

  // Test 3: Resolve openrouter.ai (without api subdomain)
  console.log("\n3️⃣  Resolving openrouter.ai:");
  try {
    const addresses = await dns.resolve4("openrouter.ai");
    console.log(`   ✅ Resolved to: ${addresses.join(", ")}`);
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
  }

  // Test 4: Resolve google.com (sanity check)
  console.log("\n4️⃣  Resolving google.com (sanity check):");
  try {
    const addresses = await dns.resolve4("google.com");
    console.log(`   ✅ Resolved to: ${addresses[0]}`);
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
  }

  // Test 5: Detailed DNS lookup
  console.log("\n5️⃣  Detailed DNS lookup for api.openrouter.ai:");
  try {
    const result = await dns.lookup("api.openrouter.ai");
    console.log(`   ✅ Address: ${result.address}`);
    console.log(`   ✅ Family: IPv${result.family}`);
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
  }

  // Test 6: Try HTTPS connection directly
  console.log("\n6️⃣  Testing HTTPS connection to api.openrouter.ai:");
  testHttpsConnection();
}

function testHttpsConnection() {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.openrouter.ai",
      port: 443,
      path: "/v1/models",
      method: "GET",
      timeout: 5000,
      headers: {
        "User-Agent": "Node.js-Test"
      }
    };

    const req = https.request(options, (res) => {
      console.log(`   ✅ Connected! Status: ${res.statusCode}`);
      res.on("data", () => {}); // consume data
      res.on("end", () => resolve());
    });

    req.on("error", (err) => {
      console.log(`   ❌ Connection failed: ${err.message}`);
      resolve();
    });

    req.on("timeout", () => {
      console.log(`   ⏱️  Connection timeout`);
      req.destroy();
      resolve();
    });

    req.end();
  });
}

testNetwork().then(() => {
  console.log("\n" + "━".repeat(60));
  console.log("\n📋 Summary:");
  console.log("If DNS resolution fails but browser works:");
  console.log("  → Your firewall/ISP may be blocking Node.js DNS");
  console.log("  → Try using OpenDNS or Google DNS (8.8.8.8)");
  console.log("  → Or configure your network proxy settings");
  console.log("\nIf HTTPS connection succeeds:");
  console.log("  → Firewall allows the connection");
  console.log("  → Problem is likely DNS-specific\n");
});
