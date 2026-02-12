#!/usr/bin/env node

/**
 * Test script for Google People API searchContacts
 * Tests searching for "Chethana" to debug contact lookup
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { google } = require('googleapis');
require('dotenv').config();

const CONFIG_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'pm-os', 'config.json');

function readStore() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (error) {
    console.error('Error reading store:', error);
  }
  return {};
}

async function testContactSearch(query) {
  console.log(`\n🔍 Testing Google People API searchContacts for: "${query}"\n`);

  const storeData = readStore();
  const accessToken = storeData.google_access_token;
  const refreshToken = storeData.google_refresh_token;
  const expiresAt = storeData.google_expires_at;

  if (!refreshToken) {
    console.error('❌ No Google refresh token found. Please connect Google in PM-OS settings.');
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in environment');
    return;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiresAt,
  });

  const people = google.people({ version: 'v1', auth: oauth2Client });

  try {
    // First check token info to see granted scopes
    console.log('🔐 Checking OAuth token scopes...\n');
    try {
      const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
      console.log('   Granted scopes:', tokenInfo.scopes.join(', '));
      console.log('');
    } catch (e) {
      console.log('   Could not fetch token info:', e.message);
    }

    console.log('📡 Calling people.searchContacts...\n');

    const contactsResponse = await people.people.searchContacts({
      query: query,
      readMask: 'names,emailAddresses,organizations',
      pageSize: 10,
    });

    const contactResults = contactsResponse.data.results || [];

    console.log('📡 Calling people.searchDirectoryPeople (org directory)...\n');

    const directoryResponse = await people.people.searchDirectoryPeople({
      query: query,
      readMask: 'names,emailAddresses,organizations',
      pageSize: 10,
      sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
    });

    const directoryResults = directoryResponse.data.people || [];

    console.log(`   Personal contacts: ${contactResults.length} results`);
    console.log(`   Org directory: ${directoryResults.length} results\n`);

    // Combine results
    const results = [
      ...contactResults,
      ...directoryResults.map(person => ({ person }))
    ];

    console.log(`✅ API Response received:`);
    console.log(`   Total results: ${results.length}\n`);

    if (results.length === 0) {
      console.log('⚠️  No contacts found.');
      console.log('\nTrying alternative: people.connections.list with search...\n');

      // Try the old way for comparison
      const listResponse = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'names,emailAddresses',
      });

      const allContacts = listResponse.data.connections || [];
      console.log(`   Total contacts in connections.list: ${allContacts.length}`);

      // Search manually
      const matches = allContacts.filter(person => {
        const displayName = person.names?.[0]?.displayName || '';
        const givenName = person.names?.[0]?.givenName || '';
        return displayName.toLowerCase().includes(query.toLowerCase()) ||
               givenName.toLowerCase().includes(query.toLowerCase());
      });

      console.log(`   Manual matches found: ${matches.length}\n`);

      if (matches.length > 0) {
        console.log('📋 Manual matches:');
        matches.forEach((person, i) => {
          const name = person.names?.[0]?.displayName || 'Unknown';
          const email = person.emailAddresses?.[0]?.value || 'No email';
          console.log(`   ${i + 1}. ${name} - ${email}`);
        });
      }
    } else {
      console.log('📋 Results:\n');
      results.forEach((result, i) => {
        const person = result.person;
        const name = person.names?.[0]?.displayName || 'Unknown';
        const email = person.emailAddresses?.[0]?.value || 'No email';
        const org = person.organizations?.[0]?.name || '';

        console.log(`   ${i + 1}. ${name}`);
        console.log(`      Email: ${email}`);
        if (org) console.log(`      Organization: ${org}`);
        console.log('');
      });
    }

    // Also show raw response for debugging
    console.log('\n📄 Raw API Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ Error calling API:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Test with "Chethana"
const query = process.argv[2] || 'Chethana';
testContactSearch(query);
