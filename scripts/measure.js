'use strict';

// Measure how the local model behaves through Wraith's grounding check.
//   node scripts/measure.js [runs-per-event]      (needs Ollama running with the model)
// Prints the acceptance rate, latency and why lines were rejected. Nothing is guessed: every number comes from this run.

const os = require('node:os');
const { echoFor } = require('../lib/whisper');
const { buildFacts } = require('../lib/facts');
const { health, modelName } = require('../lib/ollama');

const EVENTS = [
  { command: 'npm test', exit: 1, seconds: 4, streak: 1, hour: 14 },
  { command: 'npm test', exit: 1, seconds: 4, streak: 3, hour: 3 },
  { command: 'gti status', exit: 127, seconds: 0, hour: 22 },
  { command: 'cargo build --release', exit: 0, seconds: 74, hour: 11 },
  { command: 'git reset --hard HEAD~2', exit: 0, seconds: 0, hour: 16 },
  { command: 'python train.py', exit: 137, seconds: 310, hour: 2 },
  { command: './deploy.sh', exit: 126, seconds: 0, hour: 9 },
  { command: 'sleep 600', exit: 130, seconds: 12, hour: 15 },
  { command: 'ls -la', exit: 0, seconds: 0, hour: 2 },
  { command: 'docker build -t app .', exit: 1, seconds: 52, streak: 2, hour: 23 },
];

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function main() {
  const runs = Number(process.argv[2]) || 3;
  const status = await health();
  if (!status.ok) {
    console.error(`Cannot measure: ${status.message}`);
    process.exit(1);
  }

  // The first request may have to load the model, which is a different cost from a whisper. Measure it apart.
  const warmStart = Date.now();
  await echoFor(buildFacts(EVENTS[0]), { attempts: 1, timeoutMs: 60000 });
  const warmupMs = Date.now() - warmStart;

  let accepted = 0;
  let total = 0;
  let firstTryRejected = 0;
  const latencies = [];
  const reasons = {};
  const examples = [];

  for (const event of EVENTS) {
    for (let run = 0; run < runs; run++) {
      const facts = buildFacts(event);
      const started = Date.now();
      const result = await echoFor(facts, { attempts: 2, timeoutMs: 30000 });
      latencies.push(Date.now() - started);
      total += 1;
      if (result.detail.length) firstTryRejected += 1;
      for (const note of result.detail) {
        const key = note.split(':')[0];
        reasons[key] = (reasons[key] || 0) + 1;
      }
      if (result.text) {
        accepted += 1;
        if (examples.length < 12) examples.push(`  [${facts.situation}] ${facts.command}  ->  ${result.text}`);
      } else {
        reasons[`gave up: ${result.reason}`] = (reasons[`gave up: ${result.reason}`] || 0) + 1;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const cpu = os.cpus()[0] ? os.cpus()[0].model : 'unknown cpu';
  console.log(`Model: ${modelName()}   Machine: ${cpu}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${process.platform}`);
  console.log(`First request of the session (includes any model load): ${warmupMs} ms`);
  console.log(`Events: ${EVENTS.length} x ${runs} runs = ${total}`);
  console.log(`Lines accepted by the grounding check: ${accepted} of ${total}`);
  console.log(`Needed a second try (first line rejected): ${firstTryRejected} of ${total}`);
  console.log(`Latency per whisper, including retries: median ${percentile(latencies, 0.5)} ms, p90 ${percentile(latencies, 0.9)} ms, max ${latencies[latencies.length - 1]} ms`);
  console.log('Rejections by kind:', JSON.stringify(reasons));
  console.log('Examples:');
  console.log(examples.join('\n'));
}

main();
