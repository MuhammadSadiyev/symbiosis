#!/usr/bin/env node

const { Command } = require('commander');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

require('dotenv').config();

const program = new Command();
const CONFIG_PATH = path.join(os.homedir(), '.symbiosis_config.json');

// Default API URL (can be overridden by environment or config)
let API_URL = process.env.SYMBIOSIS_API_URL || 'http://localhost:3000';

// Load local configuration (JWT tokens, agent keys)
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      return {};
    }
  }
  return {};
}

// Save configuration
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// Helper to prompt for user input in terminal
function askQuestion(query, isPassword = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    
    if (isPassword) {
      // Mask password input on screen
      rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (rl.line.length > 0 && stringToWrite !== '\r' && stringToWrite !== '\n' && stringToWrite !== '\r\n') {
          rl.output.write('*');
        } else {
          rl.output.write(stringToWrite);
        }
      };
    }
  });
}

// Resolve current API URL
const config = loadConfig();
if (config.api_url) {
  API_URL = config.api_url;
}

program
  .name('symbiosis')
  .description('Developer CLI tool for the Symbiosis (sbio.cloud) AI Agent registry')
  .version('1.0.0');

// ---------------- COMMAND: CONFIG ----------------
program
  .command('config')
  .description('Configure the CLI tool settings')
  .option('--url <url>', 'Set the Symbiosis registry API URL')
  .action((options) => {
    const currentConfig = loadConfig();
    if (options.url) {
      currentConfig.api_url = options.url;
      saveConfig(currentConfig);
      console.log(`✅ API URL successfully configured to: ${options.url}`);
    } else {
      console.log(`Current settings:`);
      console.log(`- API URL: ${API_URL}`);
      console.log(`- Logged in email: ${currentConfig.email || 'Not logged in'}`);
      console.log(`- Config location: ${CONFIG_PATH}`);
    }
  });

// ---------------- COMMAND: SIGNUP ----------------
program
  .command('signup')
  .description('Create a developer account on sbio.cloud')
  .action(async () => {
    console.log('=== Create Developer Account ===');
    const name = await askQuestion('Full Name: ');
    const email = await askQuestion('Email Address: ');
    const password = await askQuestion('Password: ', true);
    console.log(''); // New line after password masking

    if (!email || !password) {
      console.error('❌ Error: Email and password are required.');
      process.exit(1);
    }

    try {
      console.log(`Connecting to ${API_URL}...`);
      const response = await axios.post(`${API_URL}/api/auth/signup`, {
        name,
        email,
        password
      });

      const currentConfig = loadConfig();
      currentConfig.token = response.data.token;
      currentConfig.email = response.data.user.email;
      saveConfig(currentConfig);

      console.log(`\n🎉 Registration successful! Logged in as ${response.data.user.email}`);
    } catch (err) {
      console.error('❌ Registration failed:', err.response?.data?.error || err.message);
    }
  });

// ---------------- COMMAND: LOGIN ----------------
program
  .command('login')
  .description('Login to your developer account')
  .action(async () => {
    console.log('=== Developer Login ===');
    const email = await askQuestion('Email Address: ');
    const password = await askQuestion('Password: ', true);
    console.log(''); // New line after password masking

    try {
      console.log(`Authenticating with ${API_URL}...`);
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password
      });

      const currentConfig = loadConfig();
      currentConfig.token = response.data.token;
      currentConfig.email = response.data.user.email;
      saveConfig(currentConfig);

      console.log(`\n✅ Login successful! Logged in as ${response.data.user.email}`);
    } catch (err) {
      console.error('❌ Login failed:', err.response?.data?.error || err.message);
    }
  });

// ---------------- COMMAND: REGISTER AGENT ----------------
program
  .command('register')
  .description('Register a new AI Agent or update an existing one')
  .action(async () => {
    const currentConfig = loadConfig();
    if (!currentConfig.token) {
      console.error('❌ Error: You must be logged in to register agents. Run "symbiosis login" first.');
      process.exit(1);
    }

    console.log('=== AI Agent Registration Wizard ===');
    const id = await askQuestion('Unique Agent ID (e.g. vertex/finance-assistant): ');
    const name = await askQuestion('Friendly Name (e.g. Stock Analysis Agent): ');
    const endpoint = await askQuestion('Endpoint URL (e.g. https://api.mysite.com/agent): ');
    const description = await askQuestion('Description: ');
    const skillsInput = await askQuestion('Skills (comma-separated, e.g. stock-parse, prediction): ');
    const tagsInput = await askQuestion('Tags (comma-separated): ');

    const skills = skillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

    // Default basic JSON Schemas
    const schema_in = {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or request description" }
      },
      required: ["query"]
    };

    const schema_out = {
      type: "object",
      properties: {
        response: { type: "string", description: "Agent execution output" }
      }
    };

    try {
      console.log(`Sending registration request to ${API_URL}...`);
      const response = await axios.post(
        `${API_URL}/api/agents`,
        {
          id,
          name,
          endpoint,
          description,
          skills,
          tags,
          schema_in,
          schema_out
        },
        {
          headers: {
            'Authorization': `Bearer ${currentConfig.token}`
          }
        }
      );

      console.log(`\n🎉 Agent "${id}" registered successfully!`);
      
      // Save the agent token if returned
      if (response.data.token) {
        if (!currentConfig.agent_keys) currentConfig.agent_keys = {};
        currentConfig.agent_keys[id] = response.data.token;
        saveConfig(currentConfig);
        
        console.log(`🔑 Secure Agent Token generated: ${response.data.token}`);
        console.log(`⚠️  Keep this key safe. It has been stored in your local configuration for sending telemetry.`);
      } else {
        console.log(`ℹ️  Agent updated. Existing token retained.`);
      }
    } catch (err) {
      console.error('❌ Registration failed:', err.response?.data?.error || err.message);
    }
  });

// ---------------- COMMAND: LIST AGENTS ----------------
program
  .command('list')
  .description('List all registered active agents')
  .action(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/agents`);
      const agents = response.data.agents;

      console.log(`=== Symbiosis Registry Catalog (${agents.length} agents) ===\n`);
      agents.forEach(agent => {
        console.log(`🤖 ${agent.name} (${agent.id})`);
        console.log(`   🔗 Endpoint: ${agent.endpoint}`);
        console.log(`   🧠 Skills:   ${agent.skills.join(', ') || 'None'}`);
        console.log(`   📝 Desc:     ${agent.description || 'No description'}`);
        console.log('-'.repeat(50));
      });
    } catch (err) {
      console.error('❌ Failed to fetch agents:', err.response?.data?.error || err.message);
    }
  });

// ---------------- COMMAND: SEND LOG ----------------
program
  .command('log <agentId> <message>')
  .description('Send telemetry log for an agent')
  .option('--type <type>', 'Type of log: info, call, error', 'info')
  .option('--caller <callerId>', 'Agent ID of the caller (for transaction tracing)')
  .option('--payload <jsonString>', 'JSON string payload data')
  .action(async (agentId, message, options) => {
    const currentConfig = loadConfig();
    
    // Look for agent token in config
    let token = currentConfig.agent_keys?.[agentId];
    
    // Fallback to env variable
    if (!token && process.env.SYMBIOSIS_AGENT_TOKEN) {
      token = process.env.SYMBIOSIS_AGENT_TOKEN;
    }

    if (!token) {
      console.error(`❌ Error: No access token found for agent "${agentId}".`);
      console.error(`Please register the agent via this CLI first, or set the SYMBIOSIS_AGENT_TOKEN environment variable.`);
      process.exit(1);
    }

    let parsedPayload = {};
    if (options.payload) {
      try {
        parsedPayload = JSON.parse(options.payload);
      } catch (err) {
        console.error('❌ Error: --payload option must be a valid JSON string.');
        process.exit(1);
      }
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/logs`,
        {
          message,
          type: options.type,
          caller_agent_id: options.caller,
          payload: parsedPayload
        },
        {
          headers: {
            'x-agent-token': token
          }
        }
      );

      console.log(`✅ Telemetry log logged successfully for "${agentId}"`);
    } catch (err) {
      console.error('❌ Logging failed:', err.response?.data?.error || err.message);
    }
  });

// Run command line parser
program.parse(process.argv);
