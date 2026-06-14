const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.SYMBIOSIS_API_URL || 'http://localhost:3000';

async function runConcurrencyTest() {
  console.log('⚡ STARTING CONCURRENCY & SCALABILITY STRESS TEST...');
  
  // Setup credentials & agent
  const devEmail = `loaddev-${Date.now()}@scale.com`;
  const agentId = `scale-test/bot-${Date.now()}`;
  let devToken = '';
  let agentToken = '';

  try {
    // 1. Create Developer
    const signup = await axios.post(`${API_URL}/api/auth/signup`, {
      email: devEmail,
      password: 'scale-password',
      name: 'Load Test Developer'
    });
    devToken = signup.data.token;

    // 2. Register Agent
    const reg = await axios.post(
      `${API_URL}/api/agents`,
      {
        id: agentId,
        name: 'Scale Runner Bot',
        endpoint: 'http://localhost:4000/scale',
        skills: ['speed', 'scale']
      },
      { headers: { 'Authorization': `Bearer ${devToken}` } }
    );
    agentToken = reg.data.token;
    console.log(`✅ Scale Dev and Agent (${agentId}) registered. Starting logging concurrency...\n`);
  } catch (err) {
    console.error('❌ Setup failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 3. Pump Logs Concurrently
  const logCount = 200; // Sending 200 requests concurrently
  const logPromises = [];
  const startTime = Date.now();

  console.log(`Sending ${logCount} telemetry logs concurrently...`);

  for (let i = 0; i < logCount; i++) {
    const promise = axios.post(
      `${API_URL}/api/logs`,
      {
        message: `Concurrency thread check index ${i}. System status online.`,
        type: i % 10 === 0 ? 'error' : 'call',
        payload: { thread_id: i, load_test: true }
      },
      {
        headers: { 'x-agent-token': agentToken }
      }
    ).catch(err => {
      return { error: true, status: err.response?.status, message: err.message };
    });
    
    logPromises.push(promise);
  }

  const results = await Promise.all(logPromises);
  const duration = Date.now() - startTime;
  
  const successful = results.filter(r => r.status === 201 || (r.data && !r.error)).length;
  const failed = results.filter(r => r.error).length;

  console.log(`\n================ SCALE RESULTS ================`);
  console.log(`⏱️  Total Duration:  ${duration} ms`);
  console.log(`🚀 Avg Request Time: ${(duration / logCount).toFixed(2)} ms/req`);
  console.log(`✅ Successful Logs:  ${successful} / ${logCount}`);
  console.log(`❌ Failed Logs:      ${failed} / ${logCount}`);
  console.log(`===============================================`);

  if (failed > 0) {
    console.warn(`⚠️ Warning: ${failed} logs failed to transmit. Check rate limits or DB connection pool limits.`);
  } else {
    console.log(`🌟 Concurrency performance test passed successfully with 100% transmission rate.`);
  }
}

runConcurrencyTest();
