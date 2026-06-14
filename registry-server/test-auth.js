const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.SYMBIOSIS_API_URL || 'http://localhost:3000';

async function runTests() {
  console.log('🧪 STARTING SYMBIOSIS INTEGRATION TESTS...\n');

  let dev1Token = '';
  let dev2Token = '';
  let agentToken = '';
  const testAgentId = 'test-namespace/financial-bot';

  // Test credentials
  const dev1 = { email: `dev1-${Date.now()}@test.com`, password: 'password123', name: 'Developer One' };
  const dev2 = { email: `dev2-${Date.now()}@test.com`, password: 'password123', name: 'Developer Two' };

  // 1. Signup Developer 1
  try {
    console.log(`1. Testing Developer 1 Registration (${dev1.email})...`);
    const signupRes = await axios.post(`${API_URL}/api/auth/signup`, dev1);
    dev1Token = signupRes.data.token;
    console.log('✅ Developer 1 signup passed.');
  } catch (err) {
    console.error('❌ Developer 1 signup failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 2. Signup Developer 2
  try {
    console.log(`2. Testing Developer 2 Registration (${dev2.email})...`);
    const signupRes = await axios.post(`${API_URL}/api/auth/signup`, dev2);
    dev2Token = signupRes.data.token;
    console.log('✅ Developer 2 signup passed.');
  } catch (err) {
    console.error('❌ Developer 2 signup failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 3. Register Agent as Developer 1
  try {
    console.log(`3. Registering Agent "${testAgentId}" as Developer 1...`);
    const regRes = await axios.post(
      `${API_URL}/api/agents`,
      {
        id: testAgentId,
        name: 'Finance Bot',
        endpoint: 'http://localhost:8080/finance',
        description: 'Parses finance documents',
        skills: ['parsing', 'forecasting']
      },
      {
        headers: { 'Authorization': `Bearer ${dev1Token}` }
      }
    );
    agentToken = regRes.data.token;
    console.log('✅ Agent registered successfully.');
    console.log(`🔑 Generated Agent Token: ${agentToken}`);
  } catch (err) {
    console.error('❌ Agent registration failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 4. Test Authorization: Dev 2 trying to hijack Dev 1's Agent
  try {
    console.log(`4. Testing Hijacking Protection (Dev 2 trying to edit Dev 1's Agent)...`);
    await axios.post(
      `${API_URL}/api/agents`,
      {
        id: testAgentId,
        name: 'Hijacked Finance Bot',
        endpoint: 'http://localhost:9999/hijack'
      },
      {
        headers: { 'Authorization': `Bearer ${dev2Token}` }
      }
    );
    console.error('❌ Security check FAILED: Dev 2 was allowed to modify Dev 1\'s agent.');
    process.exit(1);
  } catch (err) {
    if (err.response && err.response.status === 403) {
      console.log('✅ Security check passed: Dev 2 request was correctly rejected with 403 Forbidden.');
    } else {
      console.error('❌ Security check failed unexpectedly:', err.response?.status, err.response?.data || err.message);
      process.exit(1);
    }
  }

  // 5. Test Telemetry Logging with Agent Token
  try {
    console.log(`5. Pushing Telemetry Log via Agent Token...`);
    const logRes = await axios.post(
      `${API_URL}/api/logs`,
      {
        message: 'Successfully processed stock audit batch #45.',
        type: 'info',
        payload: { batch_size: 45, duration_ms: 120 }
      },
      {
        headers: { 'x-agent-token': agentToken }
      }
    );
    console.log('✅ Telemetry log accepted by server.');
  } catch (err) {
    console.error('❌ Telemetry logging failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 6. Test Telemetry Logging with Invalid Token
  try {
    console.log(`6. Pushing Telemetry Log with INVALID token...`);
    await axios.post(
      `${API_URL}/api/logs`,
      { message: 'This should fail.' },
      { headers: { 'x-agent-token': 'sbio_tkn_fake_token_123' } }
    );
    console.error('❌ Security check FAILED: Log accepted with invalid token.');
    process.exit(1);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.log('✅ Security check passed: Log with fake token correctly rejected with 401 Unauthorized.');
    } else {
      console.error('❌ Security check failed unexpectedly:', err.response?.status, err.response?.data || err.message);
      process.exit(1);
    }
  }

  // 7. Verify Log appears in Global Logs Feed
  try {
    console.log(`7. Verifying logs fetch...`);
    const logsFeed = await axios.get(`${API_URL}/api/logs`);
    const logs = logsFeed.data.logs;
    const testLog = logs.find(l => l.agent_id === testAgentId);
    if (testLog) {
      console.log(`✅ Log verified. Found: "${testLog.message}"`);
    } else {
      console.error('❌ Log verification failed: Sent log not found in global feed.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Log fetch failed:', err.response?.data || err.message);
    process.exit(1);
  }

  console.log('\n🌟 ALL INTEGRATION SECURITY TESTS COMPLETED SUCCESSFULLY! 🌟');
}

runTests();
