/**
 * Test Script for Context Assembly Integration
 *
 * This script can be run to test the context assembly system
 */

// Set up environment for testing
if (typeof global !== "undefined") {
  // Node.js environment setup for testing
  global.window = global.window || {};
  global.fetch =
    global.fetch ||
    ((() =>
      Promise.resolve({
        json: () => Promise.resolve({}),
      })) as any);
}

import {
  runAllSystemChecks,
  runMinimalCheck,
} from "./lib/context/integration/run-system-check";

async function testContextIntegration() {
  console.log("🔍 Testing Context Assembly Integration...\n");

  try {
    // Run minimal check first
    console.log("📋 Running minimal system check...");
    const minimalResult = await runMinimalCheck();

    console.log("\n📊 Minimal Check Results:");
    console.log(
      `  Health Status: ${minimalResult.healthy ? "✅ Healthy" : "❌ Issues Found"}`,
    );

    if (minimalResult.details) {
      console.log("  Component Status:");
      console.log(
        `    Context System: ${minimalResult.details.contextSystem ? "✅" : "❌"}`,
      );
      console.log(
        `    Embedding System: ${minimalResult.details.embeddingSystem ? "✅" : "❌"}`,
      );
      console.log(
        `    Document System: ${minimalResult.details.documentSystem ? "✅" : "❌"}`,
      );
      console.log(
        `    Chat Integration: ${minimalResult.details.chatIntegration ? "✅" : "❌"}`,
      );
    }

    if (minimalResult.criticalFailures.length > 0) {
      console.log("\n⚠️ Critical Failures:");
      minimalResult.criticalFailures.forEach((failure: string) => {
        console.log(`  - ${failure}`);
      });
    }

    // If minimal check passes, run full check
    if (minimalResult.healthy) {
      console.log("\n🔬 Running comprehensive system check...");
      const fullResult = await runAllSystemChecks();

      console.log("\n📈 Comprehensive Check Results:");
      console.log(`  Overall Health: ${fullResult.summary.overallHealth}`);
      console.log(
        `  Deployment Ready: ${fullResult.summary.deploymentReady ? "✅" : "❌"}`,
      );

      console.log("\n🎯 Summary:");
      console.log(
        `  Context Assembly System: ${fullResult.summary.contextSystemReady ? "Ready" : "Not Ready"}`,
      );
      console.log(
        `  Embedding Generation: ${fullResult.summary.embeddingSystemReady ? "Ready" : "Not Ready"}`,
      );
      console.log(
        `  Document Integration: ${fullResult.summary.documentSystemReady ? "Ready" : "Not Ready"}`,
      );
      console.log(
        `  Chat Integration: ${fullResult.summary.chatIntegrationReady ? "Ready" : "Not Ready"}`,
      );

      if (fullResult.deploymentCheck.blockers.length > 0) {
        console.log("\n🚫 Deployment Blockers:");
        fullResult.deploymentCheck.blockers.forEach((blocker: string) => {
          console.log(`  - ${blocker}`);
        });
      }
    } else {
      console.log("\n⏭️ Skipping comprehensive check due to critical failures");
    }
  } catch (error) {
    console.error("\n❌ Test execution failed:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testContextIntegration()
    .then(() => {
      console.log("\n✅ Context integration test completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Context integration test failed:", error);
      process.exit(1);
    });
}

export { testContextIntegration };
